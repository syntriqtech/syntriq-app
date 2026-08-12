import { createClient } from "@/lib/supabase/client";

// Canonical month helpers — also used by the Billing Check-in page itself,
// so there's one definition of "current month" / "next month" shared by
// manual check-ins and the automatic sync below.
export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export function nextMonth(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

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

// Called when a Pay Application is submitted or a retention release
// payment is recorded — that billing action IS the answer to "are you
// billing this month," so this stands in for the user clicking "Yes,
// billing this month" themselves. Only fires when dateStr's own month
// matches the real current calendar month (a pay app dated for a past or
// future period shouldn't retroactively or preemptively mark check-in for
// a month it doesn't belong to). upsertCheckin overwrites any existing
// decision for that job+month on conflict, so this also overrides a prior
// "No, defer" for the same month, per spec — the real billing action wins.
export async function autoMarkBillingThisMonthIfCurrent(jobId: string, dateStr: string): Promise<void> {
  if (!dateStr) return;
  const nowMonth = currentMonth();
  if (dateStr.slice(0, 7) !== nowMonth) return;

  await upsertCheckin(jobId, nowMonth, "yes");
  await advanceCheckinMonth(jobId, nextMonth(nowMonth));

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("syntriq:billing-checkin-updated"));
  }
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
