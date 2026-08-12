-- Run this in the Supabase Dashboard SQL Editor.
-- Blocks certifying a pay application with a $0.00 (or negative) Current
-- Payment Due — a $0 billing has nothing to certify and shouldn't be sent
-- to a GC. This is the same rule now enforced client-side in
-- src/app/(app)/pay-applications/[id]/page.tsx (handleMarkCertified);
-- this is the server-side backstop, recreating certify_pay_application()
-- from 027_pay_application_revisions.sql with one added check. Does not
-- affect draft saving — only the certify RPC itself.

create or replace function certify_pay_application(
  p_pay_app_id     uuid,
  p_certified_date date default current_date
)
returns pay_applications
language plpgsql
as $$
declare
  row_out pay_applications%rowtype;
begin
  select * into row_out
  from pay_applications
  where id = p_pay_app_id
  for update;

  if not found then
    raise exception 'Pay application % not found.', p_pay_app_id;
  end if;

  if row_out.deleted_at is not null or not row_out.is_current_revision then
    raise exception 'Only the current revision of a pay application can be certified.';
  end if;

  if row_out.status not in ('submitted', 'revised') then
    raise exception 'Only a submitted or revised application can be marked certified (current status: %).', row_out.status;
  end if;

  if row_out.current_payment_due <= 0 then
    raise exception 'This pay application totals $0.00 — add billing amounts before certifying.';
  end if;

  update pay_applications
  set status = 'certified',
      certified_date = p_certified_date
  where id = p_pay_app_id
  returning * into row_out;

  return row_out;
end;
$$;
