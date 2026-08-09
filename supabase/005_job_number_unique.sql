-- Run this in the Supabase Dashboard SQL Editor.
-- Prevents two active jobs from having the same job number for the same user.
-- Uses a partial index so that soft-deleted jobs don't block reuse of a number.

create unique index if not exists jobs_user_job_number_unique
  on jobs(user_id, job_number)
  where deleted_at is null;
