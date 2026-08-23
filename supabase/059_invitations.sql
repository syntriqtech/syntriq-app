-- Replaces the account-lookup "Add team member" flow (051) with real email
-- invitations. The old flow required the invitee to already have a Syntriq
-- account (and, before that, an activation key just to get one) — a bad
-- two-step process for something that should be a single email link.
--
-- Same SECURITY DEFINER chicken-and-egg pattern already used everywhere else
-- in this schema (redeem_activation_key(), bootstrap_organization()): a
-- brand-new member can't insert their own organization_members row under
-- normal RLS, since organization_members_insert_owner_only requires the
-- caller to already be an owner.
--
-- NOTE on roles: the original ask mentioned 'read_only' as an invitable
-- role, but that role was removed from the schema entirely in migration 048
-- (never used) — organization_members.role only allows owner/
-- project_manager/project_accountant today. Invitations follow suit:
-- project_manager/project_accountant only, same as add_organization_member().

-- ── 1. invitations ────────────────────────────────────────────────────────
create table if not exists invitations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  email           text not null,
  role            text not null check (role in ('project_manager', 'project_accountant')),
  invited_by      uuid not null references auth.users(id),
  token           text not null,
  status          text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  accepted_at     timestamptz
);

alter table invitations enable row level security;

create unique index if not exists invitations_token_idx on invitations (token);

-- Enforced here AND in create_invitation() below — the partial unique index
-- is the real backstop against a race between two concurrent invite
-- submissions; create_invitation()'s own lookup is what gives a friendly
-- "resend instead of erroring" experience in the common (non-racing) case.
create unique index if not exists invitations_org_email_pending_idx
  on invitations (organization_id, lower(email))
  where status = 'pending';

create index if not exists invitations_organization_id_idx on invitations (organization_id);

-- ── 2. RLS ────────────────────────────────────────────────────────────────
-- Owner-only, matching the exact tier that already gates "Add member" today
-- (add_organization_member() rejects non-owners; the UI only shows the "Add
-- member" button to isOwner). INSERT is granted here too for completeness/
-- defense-in-depth, but the app never inserts directly — create_invitation()
-- below (SECURITY DEFINER) is the only real path in, since it has to run
-- the seat-cap and duplicate-pending checks atomically before a row exists.
create policy "invitations_select_owner"
  on invitations for select
  using (is_org_owner(organization_id));

create policy "invitations_insert_owner"
  on invitations for insert
  with check (is_org_owner(organization_id));

-- Covers revoke (status -> 'revoked') directly from the client under RLS —
-- no separate revoke_invitation() function needed, same reasoning the task
-- gave for "whichever is simpler."
create policy "invitations_update_owner"
  on invitations for update
  using (is_org_owner(organization_id))
  with check (is_org_owner(organization_id));

-- No DELETE policy — revoke is a status update, not a delete (matches spec).

-- ── 3. create_invitation() ───────────────────────────────────────────────
-- Owner-only. Creates a new pending invite, or — if one is already pending
-- for this org+email — resends it in place (bumps expires_at, refreshes
-- role) rather than creating a duplicate row. Returns the invitation id,
-- token (needed by the caller to build the email link), and whether this
-- was a resend, so the API route can adjust its email copy if it wants to.
create or replace function create_invitation(p_email text, p_role text)
returns table(invitation_id uuid, token text, is_resend boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_id     uuid := auth.uid();
  v_org_id        uuid;
  v_normalized    text := lower(btrim(p_email));
  v_plan          text;
  v_max_members   integer;
  v_member_count  integer;
  v_pending_count integer;
  v_existing_id   uuid;
  v_existing_token text;
  v_new_id        uuid;
  v_new_token     text;
begin
  if v_caller_id is null then
    raise exception 'Not signed in.';
  end if;

  select organization_id into v_org_id
  from organization_members
  where user_id = v_caller_id
  limit 1;

  if v_org_id is null then
    raise exception 'Your account has no organization yet.';
  end if;

  if not is_org_owner(v_org_id) then
    raise exception 'Only the account owner can invite team members.';
  end if;

  if p_role not in ('project_manager', 'project_accountant') then
    raise exception 'Invalid role for a new team member.';
  end if;

  if v_normalized = '' then
    raise exception 'Email is required.';
  end if;

  if exists (
    select 1 from organization_members om
    join auth.users u on u.id = om.user_id
    where om.organization_id = v_org_id and lower(u.email) = v_normalized
  ) then
    raise exception 'This person is already on your team.';
  end if;

  -- Resend path: an existing pending invite to this org+email wins over
  -- creating a duplicate. Doesn't need a fresh cap check — it doesn't add a
  -- new pending row, so the org's pending count is unchanged.
  -- Table-qualified: bare "token" would be ambiguous against this
  -- function's own "token" OUT parameter (returns table(..., token text, ...)).
  select i.id, i.token into v_existing_id, v_existing_token
  from invitations i
  where i.organization_id = v_org_id and lower(i.email) = v_normalized and i.status = 'pending';

  if v_existing_id is not null then
    update invitations
    set expires_at = greatest(expires_at, now() + interval '7 days'),
        role = p_role
    where id = v_existing_id;

    return query select v_existing_id, v_existing_token, true;
    return;
  end if;

  select plan into v_plan from organizations where id = v_org_id;
  v_max_members := case when v_plan = 'basic' then 2 else 6 end;

  select count(*) into v_member_count from organization_members where organization_id = v_org_id;
  select count(*) into v_pending_count from invitations where organization_id = v_org_id and status = 'pending';

  if (v_member_count + v_pending_count) >= v_max_members then
    raise exception 'Your % plan allows up to % team members. You''re at % member(s) and % pending invite(s) — cancel a pending invite or upgrade to add more.',
      coalesce(v_plan, 'current'), v_max_members, v_member_count, v_pending_count;
  end if;

  -- gen_random_uuid() rather than pgcrypto's gen_random_bytes() — the latter
  -- lives in the "extensions" schema on a default Supabase project, outside
  -- this function's narrowed search_path, while gen_random_uuid() is
  -- already proven to resolve bare everywhere else in this schema (every
  -- table's id default). Two concatenated UUIDs (both CSPRNG-backed) give a
  -- 64-hex-char token with negligible collision risk; the unique index on
  -- token is the real backstop regardless.
  v_new_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into invitations (organization_id, email, role, invited_by, token, expires_at)
  values (v_org_id, v_normalized, p_role, v_caller_id, v_new_token, now() + interval '7 days')
  returning id into v_new_id;

  return query select v_new_id, v_new_token, false;
end;
$$;

grant execute on function create_invitation(text, text) to authenticated;

-- ── 4. accept_invitation() ───────────────────────────────────────────────
-- Callable by any authenticated user. Returns a status/message pair rather
-- than raising, since every failure mode here (expired link, wrong email,
-- org at cap) is an expected outcome the accept-invite page needs to show
-- as a friendly message, not an exception to catch.
create or replace function accept_invitation(p_token text)
returns table(result_status text, message text, organization_name text, member_role text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_id    uuid := auth.uid();
  v_caller_email text;
  v_inv          invitations%rowtype;
  v_org_name     text;
  v_plan         text;
  v_max_members  integer;
  v_member_count integer;
begin
  if v_caller_id is null then
    return query select 'error'::text, 'You need to be signed in to accept this invite.'::text, null::text, null::text;
    return;
  end if;

  select email into v_caller_email from auth.users where id = v_caller_id;

  select * into v_inv
  from invitations
  where token = p_token and status = 'pending' and expires_at > now();

  if v_inv.id is null then
    return query select 'error'::text, 'This invite is invalid or has expired.'::text, null::text, null::text;
    return;
  end if;

  if lower(v_caller_email) <> lower(v_inv.email) then
    return query select 'error'::text, 'This invite was sent to a different email address.'::text, null::text, null::text;
    return;
  end if;

  select name into v_org_name from organizations where id = v_inv.organization_id;

  -- Idempotent: clicking an already-accepted invite's link again (e.g. a
  -- second tab) is a success no-op, not an error.
  if exists (
    select 1 from organization_members
    where organization_id = v_inv.organization_id and user_id = v_caller_id
  ) then
    update invitations set status = 'accepted', accepted_at = coalesce(accepted_at, now()) where id = v_inv.id;
    return query select 'ok'::text, format('You''re already a member of %s.', v_org_name), v_org_name, v_inv.role;
    return;
  end if;

  select plan into v_plan from organizations where id = v_inv.organization_id;
  v_max_members := case when v_plan = 'basic' then 2 else 6 end;

  select count(*) into v_member_count
  from organization_members
  where organization_id = v_inv.organization_id;

  -- Leaves the invitation pending (not burned) so the owner can free a seat
  -- or upgrade and the recipient can retry the exact same link.
  if v_member_count >= v_max_members then
    return query select
      'error'::text,
      format('%s is at its %s plan limit of %s team members. Ask the owner to free up a seat or upgrade, then use this link again.',
        v_org_name, coalesce(v_plan, 'current'), v_max_members),
      v_org_name,
      v_inv.role;
    return;
  end if;

  -- enforce_member_seat_cap (055) double-checks this same cap on insert as
  -- the real backstop, same as add_organization_member() relies on it.
  insert into organization_members (organization_id, user_id, role)
  values (v_inv.organization_id, v_caller_id, v_inv.role);

  update invitations set status = 'accepted', accepted_at = now() where id = v_inv.id;

  return query select 'ok'::text, format('You''ve joined %s.', v_org_name), v_org_name, v_inv.role;
end;
$$;

grant execute on function accept_invitation(text) to authenticated;

-- ── 5. get_invitation_preview() ──────────────────────────────────────────
-- Public-safe lookup for the accept-invite page's logged-out branch — just
-- enough to display "you're invited to join X as Y" and pre-fill signup,
-- not the full row (no invited_by, no id exposed).
create or replace function get_invitation_preview(p_token text)
returns table(email text, organization_name text, member_role text)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select i.email, o.name, i.role
  from invitations i
  join organizations o on o.id = i.organization_id
  where i.token = p_token and i.status = 'pending' and i.expires_at > now();
$$;

grant execute on function get_invitation_preview(text) to anon, authenticated;

-- ── 6. has_completed_company_setup() ─────────────────────────────────────
-- Fixes a gap the invite flow would otherwise fall straight into:
-- company_profile is one row per USER (not per org), and src/proxy.ts's
-- company-setup gate today checks only the signed-in user's own row
-- (company_profile.user_id = auth.uid()). An invited member who joins an
-- org that already has a completed profile would still get redirect-looped
-- into /company-setup forever under that check, since they'll never have
-- their own row. This checks at the org level too: true if EITHER the
-- caller's own row is complete OR any row for their organization is.
-- (Side benefit: this also fixes the same latent gap for any future team
-- member added the old add_organization_member() way, not just invited
-- ones — nobody has hit it yet since, per migration 055's comment, only one
-- organization_members row exists in production today.)
create or replace function has_completed_company_setup()
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from company_profile cp
    where cp.company_setup_completed = true
      and (
        cp.user_id = auth.uid()
        or cp.organization_id = (
          select organization_id from organization_members where user_id = auth.uid() limit 1
        )
      )
  );
$$;

grant execute on function has_completed_company_setup() to authenticated;

-- ── Verification ───────────────────────────────────────────────────────
select tablename, count(*) as policy_count
from pg_policies
where schemaname = 'public' and tablename = 'invitations'
group by tablename;

select proname from pg_proc
where proname in ('create_invitation', 'accept_invitation', 'get_invitation_preview', 'has_completed_company_setup');
