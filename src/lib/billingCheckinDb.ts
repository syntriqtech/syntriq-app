import { createClient } from "@/lib/supabase/client";

export type BillingCheckin = {
  id: string;
  jobId: string;
  month: string;
  decision: "yes" | "no";
  createdAt: string;
};

type CheckinRow = {
  id: string;
  job_id: string;
  month: string;
  decision: "yes" | "no";
  created_at: string;
};

function rowToCheckin(row: CheckinRow): BillingCheckin {
  return {
    id: row.id,
    jobId: row.job_id,
    month: row.month,
    decision: row.decision,
    createdAt: row.created_at,
  };
}

export async function fetchCheckinsByMonth(month: string): Promise<BillingCheckin[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("billing_checkins")
    .select("*")
    .eq("month", month);
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToCheckin);
}

export async function upsertCheckin(
  jobId: string,
  month: string,
  decision: "yes" | "no"
): Promise<void> {
  const supabase = createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(userError.message);
  const userId = userData.user?.id;
  if (!userId) throw new Error("Not signed in.");

  const { error } = await supabase
    .from("billing_checkins")
    .upsert(
      { job_id: jobId, user_id: userId, month, decision },
      { onConflict: "job_id,month" }
    );
  if (error) throw new Error(error.message);
}

export async function deleteCheckin(jobId: string, month: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("billing_checkins")
    .delete()
    .eq("job_id", jobId)
    .eq("month", month);
  if (error) throw new Error(error.message);
}

export async function advanceCheckinMonth(jobId: string, newMonth: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("jobs")
    .update({ billing_checkin_month: newMonth })
    .eq("id", jobId);
  if (error) throw new Error(error.message);
}

// Lightweight count for the sidebar badge
export async function fetchBillingCheckinPendingCount(currentMonth: string): Promise<number> {
  const supabase = createClient();

  const [{ data: jobs, error: jobsErr }, { data: responses, error: respErr }] = await Promise.all([
    supabase
      .from("jobs")
      .select("id")
      .is("deleted_at", null)
      .is("archived_at", null)
      .lte("billing_checkin_month", currentMonth)
      .neq("billing_checkin_month", ""),
    supabase
      .from("billing_checkins")
      .select("job_id")
      .eq("month", currentMonth),
  ]);

  if (jobsErr || respErr || !jobs) return 0;

  const answered = new Set((responses ?? []).map((r) => r.job_id));
  return jobs.filter((j) => !answered.has(j.id)).length;
}
