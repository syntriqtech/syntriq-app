-- Run this in the Supabase Dashboard SQL Editor.
-- Two safety checks on pay_app_payments, enforced in the database so no
-- client (this app or otherwise) can bypass them:
--
-- 1. Payment dates must be realistic: a sane calendar year, not in the
--    future, and not before the job's start date. Only checked when the
--    date is actually being set/changed, so existing bad rows can still be
--    soft-deleted or restored without getting stuck.
-- 2. A payment can't be inserted or restored (deleted_at set back to null)
--    if doing so would push the pay application's total paid above its
--    current_payment_due.

create or replace function validate_pay_app_payment_date()
returns trigger
language plpgsql
as $$
declare
  v_job_start date;
begin
  -- Skip re-validating a date that isn't changing (e.g. a soft-delete or
  -- restore, which only touches deleted_at).
  if tg_op = 'UPDATE' and new.payment_date = old.payment_date then
    return new;
  end if;

  if new.payment_date is null then
    raise exception 'Payment date is required.';
  end if;

  if extract(year from new.payment_date) < 2000
     or extract(year from new.payment_date) > extract(year from now()) + 1 then
    raise exception 'Payment date must have a realistic year.';
  end if;

  if new.payment_date > (current_date + interval '1 day') then
    raise exception 'Payment date cannot be in the future.';
  end if;

  select j.start_date into v_job_start
  from pay_applications pa
  join jobs j on j.id = pa.job_id
  where pa.id = new.pay_app_id;

  if v_job_start is not null and new.payment_date < v_job_start then
    raise exception 'Payment date cannot be before the job start date (%).', v_job_start;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_pay_app_payment_date on pay_app_payments;
create trigger trg_validate_pay_app_payment_date
  before insert or update on pay_app_payments
  for each row execute function validate_pay_app_payment_date();


create or replace function enforce_pay_app_payment_not_overpaid()
returns trigger
language plpgsql
as $$
declare
  v_due             numeric;
  v_total_paid_excl numeric;
begin
  -- A row that's (staying) soft-deleted can't overpay anything.
  if new.deleted_at is not null then
    return new;
  end if;

  select current_payment_due into v_due
  from pay_applications
  where id = new.pay_app_id
  for update;

  select coalesce(sum(amount_paid), 0) into v_total_paid_excl
  from pay_app_payments
  where pay_app_id = new.pay_app_id
    and deleted_at is null
    and id <> new.id;

  if v_due is not null and (v_total_paid_excl + new.amount_paid) > v_due + 0.01 then
    raise exception
      'This payment would overpay the application. Amount due is %, already paid (excluding this payment) is %.',
      to_char(v_due, 'FM999999999.00'), to_char(v_total_paid_excl, 'FM999999999.00');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_pay_app_payment_not_overpaid on pay_app_payments;
create trigger trg_enforce_pay_app_payment_not_overpaid
  before insert or update on pay_app_payments
  for each row execute function enforce_pay_app_payment_not_overpaid();
