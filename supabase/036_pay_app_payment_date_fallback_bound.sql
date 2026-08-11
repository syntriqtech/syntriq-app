-- Run this in the Supabase Dashboard SQL Editor.
-- Tightens validate_pay_app_payment_date() (introduced in
-- 035_pay_app_payments_guards.sql): when a job has no start_date on record,
-- the old version only rejected years outside 2000..(this year + 1), which
-- is far looser than intended. Replace that with a 5-year fallback window,
-- matching the app's client-side default when a job start date is missing.
-- Safe to run whether or not 035 has already been applied — this recreates
-- the function and its trigger from scratch.

create or replace function validate_pay_app_payment_date()
returns trigger
language plpgsql
as $$
declare
  v_job_start date;
  v_fallback_min date := current_date - interval '5 years';
begin
  -- Skip re-validating a date that isn't changing (e.g. a soft-delete or
  -- restore, which only touches deleted_at).
  if tg_op = 'UPDATE' and new.payment_date = old.payment_date then
    return new;
  end if;

  if new.payment_date is null then
    raise exception 'Payment date is required.';
  end if;

  if new.payment_date > (current_date + interval '1 day') then
    raise exception 'Payment date cannot be in the future.';
  end if;

  select j.start_date into v_job_start
  from pay_applications pa
  join jobs j on j.id = pa.job_id
  where pa.id = new.pay_app_id;

  if v_job_start is not null then
    if new.payment_date < v_job_start then
      raise exception 'Payment date cannot be before the job start date (%).', v_job_start;
    end if;
  elsif new.payment_date < v_fallback_min then
    raise exception 'Payment date cannot be before % (no job start date on record).', v_fallback_min;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_pay_app_payment_date on pay_app_payments;
create trigger trg_validate_pay_app_payment_date
  before insert or update on pay_app_payments
  for each row execute function validate_pay_app_payment_date();
