-- Run this in the Supabase Dashboard SQL Editor.
-- Blocks deleting a general_contractors (GC/customer) record while jobs are
-- still linked to it. Without this, jobs.gc_id's ON DELETE SET NULL would
-- silently let the delete through and just null out those jobs' gc_id —
-- this makes "reassign the jobs first" an enforced rule, not just app-level
-- convention, matching the app's own delete flow (which reassigns jobs to
-- another GC before calling delete).

create or replace function enforce_gc_no_jobs_on_delete()
returns trigger
language plpgsql
as $$
declare
  v_job_count integer;
begin
  select count(*) into v_job_count
  from jobs
  where gc_id = old.id and deleted_at is null;

  if v_job_count > 0 then
    raise exception 'Cannot delete this customer — % job(s) are still linked. Reassign them to another customer first.', v_job_count;
  end if;

  return old;
end;
$$;

drop trigger if exists trg_enforce_gc_no_jobs_on_delete on general_contractors;
create trigger trg_enforce_gc_no_jobs_on_delete
  before delete on general_contractors
  for each row execute function enforce_gc_no_jobs_on_delete();
