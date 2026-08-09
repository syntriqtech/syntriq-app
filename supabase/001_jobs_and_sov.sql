-- Jobs (one row per project, owned by the logged-in user)
create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_number text not null,
  customer text not null default '',
  customer_address text not null default '',
  owner text not null default '',
  owner_address text not null default '',
  job_address text not null default '',
  architect text not null default '',
  architect_address text not null default '',
  architect_project_number text not null default '',
  contract_for text not null default '',
  contract_value numeric not null default 0,
  contract_date date,
  start_date date,
  end_date date,
  retention_rate_cw numeric not null default 0,
  retention_rate_sm numeric not null default 0,
  created_at timestamptz not null default now()
);

alter table jobs enable row level security;

create policy "Users manage their own jobs"
  on jobs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Schedule of Values line items (both regular lines and change orders)
create table if not exists sov_line_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('line', 'change_order')),
  item text not null default '',
  description text not null default '',
  scheduled_value numeric not null default 0,
  previous_applications numeric not null default 0,
  this_period numeric not null default 0,
  stored_materials numeric not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table sov_line_items enable row level security;

create policy "Users manage their own SOV line items"
  on sov_line_items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists sov_line_items_job_id_idx on sov_line_items(job_id);
