-- Run in Supabase Dashboard SQL Editor after 008_change_orders.sql

create table if not exists retention_releases (
  id              uuid primary key default gen_random_uuid(),
  job_id          uuid not null references jobs(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  release_number  integer not null,
  release_date    date not null,
  amount_released numeric not null check (amount_released > 0),
  is_final        boolean not null default false,
  notes           text not null default '',
  status          text not null
                    check (status in ('draft','billed','paid'))
                    default 'billed',
  payment_date    date,
  amount_paid     numeric not null default 0,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table retention_releases enable row level security;

create policy "Users manage their own retention releases"
  on retention_releases for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists retention_releases_job_id_idx     on retention_releases(job_id);
create index if not exists retention_releases_status_idx     on retention_releases(status);
create index if not exists retention_releases_deleted_at_idx on retention_releases(deleted_at);
