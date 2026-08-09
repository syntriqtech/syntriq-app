-- Run in Supabase Dashboard SQL Editor after 007_pay_app_payments.sql
-- Also create a Storage bucket named "co-documents" (public: false, file size limit: 10MB)

create table if not exists change_orders (
  id                    uuid primary key default gen_random_uuid(),
  job_id                uuid not null references jobs(id) on delete cascade,
  user_id               uuid not null references auth.users(id) on delete cascade,
  co_number             text,
  pco_number            text,
  description           text not null default '',
  amount                numeric not null default 0,
  status                text not null
                          check (status in ('pending','submitted','approved','rejected','void'))
                          default 'pending',
  date_submitted        date,
  date_approved         date,
  gc_approval_reference text not null default '',
  approval_doc_url      text,
  retention_applies     boolean not null default true,
  retention_rate_override numeric,
  sov_impact_type       text not null
                          check (sov_impact_type in ('new_line_item','existing_line_item'))
                          default 'new_line_item',
  sov_line_item_id      uuid references sov_line_items(id) on delete set null,
  time_impact_days      integer,
  applied_at            timestamptz,
  created_sov_item_id   uuid,
  deleted_at            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table change_orders enable row level security;

create policy "Users manage their own change orders"
  on change_orders for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists change_orders_job_id_idx     on change_orders(job_id);
create index if not exists change_orders_status_idx     on change_orders(status);
create index if not exists change_orders_deleted_at_idx on change_orders(deleted_at);
