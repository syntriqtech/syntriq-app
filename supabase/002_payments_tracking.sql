-- Run this in the Supabase Dashboard SQL Editor (same place you ran 001_jobs_and_sov.sql).

create table if not exists pay_applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  application_number text not null,
  application_date date not null,
  period_to date not null,
  amount_billed numeric not null default 0,
  created_at timestamptz not null default now()
);

alter table pay_applications enable row level security;

create policy "Users manage their own pay applications"
  on pay_applications
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists pay_applications_job_id_idx on pay_applications(job_id);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric not null default 0,
  payment_date date not null,
  created_at timestamptz not null default now()
);

alter table payments enable row level security;

create policy "Users manage their own payments"
  on payments
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists payments_job_id_idx on payments(job_id);
