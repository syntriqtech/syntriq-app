import { createClient } from "@/lib/supabase/client";
import { JobBillingRow } from "@/lib/billingSummary";
import { RetentionRelease } from "@/lib/retentionReleasesDb";

export type RetentionStatus = "held" | "ready_to_bill" | "partial_released" | "fully_released";

export type RetentionRow = {
  jobId: string;
  jobName: string;
  jobNumber: string;
  customer: string;
  contractSum: number;
  retentionHeld: number;
  percentBilled: number;
  totalReleased: number;
  remaining: number;
  releases: RetentionRelease[];
  status: RetentionStatus;
};

export type RetentionSummary = {
  totalHeld: number;
  totalReleased: number;
  totalRemaining: number;
  readyToBillCount: number;
};

export function billingRowToRetentionRow(
  row: JobBillingRow,
  releases: RetentionRelease[]
): RetentionRow {
  const totalReleased = releases.reduce((sum, r) => sum + r.amountReleased, 0);
  const remaining = Math.max(0, row.retentionHeld - totalReleased);

  let status: RetentionStatus;
  if (remaining <= 0.01 && totalReleased > 0) {
    status = "fully_released";
  } else if (totalReleased > 0) {
    status = "partial_released";
  } else if (row.isReadyForRetention) {
    status = "ready_to_bill";
  } else {
    status = "held";
  }

  return {
    jobId: row.jobId,
    jobName: row.jobName,
    jobNumber: row.jobNumber,
    customer: row.customer,
    contractSum: row.revisedContractValue,
    retentionHeld: row.retentionHeld,
    percentBilled: row.percentBilled,
    totalReleased,
    remaining,
    releases,
    status,
  };
}

export function computeRetentionSummary(rows: RetentionRow[]): RetentionSummary {
  const totalHeld = rows.reduce((sum, r) => sum + r.retentionHeld, 0);
  const totalReleased = rows.reduce((sum, r) => sum + r.totalReleased, 0);
  return {
    totalHeld,
    totalReleased,
    totalRemaining: Math.max(0, totalHeld - totalReleased),
    readyToBillCount: rows.filter((r) => r.status === "ready_to_bill").length,
  };
}

// Lightweight 2-query version for the sidebar badge.
// Does not fetch pay_applications or payments — only SOV data.
export async function fetchRetentionSummaryLight(): Promise<{ totalHeld: number; readyToBillCount: number }> {
  const supabase = createClient();

  const [{ data: jobsData, error: jobsErr }, { data: sovData, error: sovErr }] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, retention_rate_cw, retention_rate_sm")
      .is("deleted_at", null)
      .is("archived_at", null),
    supabase
      .from("sov_line_items")
      .select("job_id, application_number, scheduled_value, previous_applications, this_period, stored_materials"),
  ]);

  if (jobsErr || sovErr || !jobsData) return { totalHeld: 0, readyToBillCount: 0 };

  const jobMap = new Map(jobsData.map((j) => [j.id, j]));

  const byJobApp = new Map<string, Map<string, typeof sovData>>();
  for (const row of sovData ?? []) {
    if (!byJobApp.has(row.job_id)) byJobApp.set(row.job_id, new Map());
    const appMap = byJobApp.get(row.job_id)!;
    const key = row.application_number;
    if (!appMap.has(key)) appMap.set(key, []);
    appMap.get(key)!.push(row);
  }

  let totalHeld = 0;
  let readyToBillCount = 0;

  for (const [jobId, appMap] of byJobApp) {
    const job = jobMap.get(jobId);
    if (!job) continue;

    const appNumbers = Array.from(appMap.keys()).sort((a, b) => {
      const na = Number(a), nb = Number(b);
      return !isNaN(na) && !isNaN(nb) ? na - nb : a.localeCompare(b);
    });
    const lines = appMap.get(appNumbers[appNumbers.length - 1]) ?? [];

    const cwRate = Number(job.retention_rate_cw) / 100;
    const smRate = Number(job.retention_rate_sm) / 100;

    let scheduledTotal = 0;
    let completedTotal = 0;
    let retentionTotal = 0;

    for (const line of lines) {
      const sv = Number(line.scheduled_value);
      const prev = Number(line.previous_applications);
      const tp = Number(line.this_period);
      const sm = Number(line.stored_materials);
      scheduledTotal += sv;
      completedTotal += prev + tp + sm;
      retentionTotal += cwRate * (prev + tp) + smRate * sm;
    }

    totalHeld += retentionTotal;
    if (scheduledTotal > 0 && completedTotal / scheduledTotal >= 0.999 && retentionTotal > 0) {
      readyToBillCount++;
    }
  }

  return { totalHeld, readyToBillCount };
}
