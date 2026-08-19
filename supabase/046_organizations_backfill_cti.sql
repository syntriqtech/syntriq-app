-- Step 1b: backfill. Creates a single organization for California Tile
-- Installers, adds Jason as its owner, and points every existing row (in
-- every table touched by 045) at that one organization.
--
-- IMPORTANT — before running: set v_owner_email below to the exact email
-- address you log into Syntriq with. I don't have database access in this
-- environment, so I can't look that up myself and confirm it — if it's
-- wrong or misspelled, the script raises an exception and changes nothing
-- (see the guard below), rather than silently doing nothing or backfilling
-- the wrong account.
--
-- Judgment call: the backfill UPDATEs are scoped to `where user_id =
-- v_owner_id` on every table, not "every row unconditionally." In practice
-- that's the same thing today since this has been a single-user app, but
-- scoping it explicitly means if a stray trial/test signup already created
-- any rows under a different user_id, this won't mis-attribute their data
-- to CTI's organization.
--
-- Safe to re-run: looks up the org/membership by name/uniqueness before
-- inserting, so running this twice won't create a duplicate organization
-- or membership row.

do $$
declare
  v_owner_email text := 'REPLACE_WITH_YOUR_LOGIN_EMAIL@example.com';
  v_owner_id    uuid;
  v_org_id      uuid;
begin
  select id into v_owner_id from auth.users where email = v_owner_email;

  if v_owner_id is null then
    raise exception 'No auth.users row found for email %. Edit v_owner_email at the top of this migration before running.', v_owner_email;
  end if;

  select id into v_org_id from organizations where name = 'California Tile Installers';

  if v_org_id is null then
    insert into organizations (name) values ('California Tile Installers')
    returning id into v_org_id;
  end if;

  insert into organization_members (organization_id, user_id, role)
  values (v_org_id, v_owner_id, 'owner')
  on conflict (organization_id, user_id) do nothing;

  update jobs                           set organization_id = v_org_id where user_id = v_owner_id and organization_id is null;
  update sov_line_items                 set organization_id = v_org_id where user_id = v_owner_id and organization_id is null;
  update pay_applications               set organization_id = v_org_id where user_id = v_owner_id and organization_id is null;
  update pay_app_payments               set organization_id = v_org_id where user_id = v_owner_id and organization_id is null;
  update change_orders                  set organization_id = v_org_id where user_id = v_owner_id and organization_id is null;
  update retention_releases             set organization_id = v_org_id where user_id = v_owner_id and organization_id is null;
  update billing_checkins               set organization_id = v_org_id where user_id = v_owner_id and organization_id is null;
  update lien_waivers                   set organization_id = v_org_id where user_id = v_owner_id and organization_id is null;
  update general_contractors            set organization_id = v_org_id where user_id = v_owner_id and organization_id is null;
  update pay_application_certifications set organization_id = v_org_id where user_id = v_owner_id and organization_id is null;
  update company_profile                set organization_id = v_org_id where user_id = v_owner_id and organization_id is null;
  update billing_platforms              set organization_id = v_org_id where user_id = v_owner_id and organization_id is null;
end $$;

-- Verification — run this and paste the results back. Each row should show
-- 0 in still_null if that table has any data at all for your account.
select 'jobs' as table_name,
       count(*) filter (where organization_id is not null) as backfilled,
       count(*) filter (where organization_id is null)     as still_null
  from jobs
union all
select 'sov_line_items', count(*) filter (where organization_id is not null), count(*) filter (where organization_id is null) from sov_line_items
union all
select 'pay_applications', count(*) filter (where organization_id is not null), count(*) filter (where organization_id is null) from pay_applications
union all
select 'pay_app_payments', count(*) filter (where organization_id is not null), count(*) filter (where organization_id is null) from pay_app_payments
union all
select 'change_orders', count(*) filter (where organization_id is not null), count(*) filter (where organization_id is null) from change_orders
union all
select 'retention_releases', count(*) filter (where organization_id is not null), count(*) filter (where organization_id is null) from retention_releases
union all
select 'billing_checkins', count(*) filter (where organization_id is not null), count(*) filter (where organization_id is null) from billing_checkins
union all
select 'lien_waivers', count(*) filter (where organization_id is not null), count(*) filter (where organization_id is null) from lien_waivers
union all
select 'general_contractors', count(*) filter (where organization_id is not null), count(*) filter (where organization_id is null) from general_contractors
union all
select 'pay_application_certifications', count(*) filter (where organization_id is not null), count(*) filter (where organization_id is null) from pay_application_certifications
union all
select 'company_profile', count(*) filter (where organization_id is not null), count(*) filter (where organization_id is null) from company_profile
union all
select 'billing_platforms', count(*) filter (where organization_id is not null), count(*) filter (where organization_id is null) from billing_platforms
order by table_name;
