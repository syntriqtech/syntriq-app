-- Run this in the Supabase Dashboard SQL Editor.
-- Tracks payments received against specific pay applications.
-- This replaces the old job-level payments tracking for pay app workflows.

create table if not exists pay_app_payments (
  id uuid primary key default gen_random_uuid(),
  pay_app_id uuid not null references pay_applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  payment_date date not null,
  amount_paid numeric not null default 0,
  reference_number text not null default '',
  notes text not null default '',
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table pay_app_payments enable row level security;

create policy "Users manage their own pay app payments"
  on pay_app_payments
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists pay_app_payments_pay_app_id_idx on pay_app_payments(pay_app_id);
create index if not exists pay_app_payments_created_at_idx on pay_app_payments(created_at);
