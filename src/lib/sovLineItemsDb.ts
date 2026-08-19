import { createClient } from "@/lib/supabase/client";
import { getCurrentUserContext } from "@/lib/currentUserContext";
import { SOVLineItem } from "@/lib/sovData";
import { computeLine, sumLines, previousCertificates } from "@/lib/payAppMath";
import {
  createPayApplicationRevision,
  findPayApplication,
  markApplicationBilled,
  softDeletePayApplication,
  updatePayApplicationAmount,
} from "@/lib/payApplicationsDb";

export type SovRevisionInput = {
  payAppId: string;
  reason: string;
};

type SOVRow = {
  kind: "line" | "change_order";
  item: string;
  description: string;
  scheduled_value: number;
  previous_applications: number;
  this_period: number;
  stored_materials: number;
};

export type SovApplicationOption = {
  applicationNumber: string;
  applicationDate: string;
  periodTo: string;
};

function rowToLineItem(row: SOVRow): SOVLineItem {
  return {
    item: row.item,
    description: row.description,
    scheduledValue: Number(row.scheduled_value),
    previousApplications: Number(row.previous_applications),
    thisPeriod: Number(row.this_period),
    storedMaterials: Number(row.stored_materials),
  };
}

function sortApplicationNumbers(a: string, b: string) {
  const numA = Number(a);
  const numB = Number(b);
  if (!Number.isNaN(numA) && !Number.isNaN(numB)) return numA - numB;
  return a.localeCompare(b);
}

// Removes an application: hard-deletes the line items (no deleted_at on sov_line_items),
// then soft-deletes the pay_applications record so the financial summary is preserved.
export async function deletePayApplicationWithItems(
  jobId: string,
  applicationNumber: string,
  payAppId: string
): Promise<void> {
  const supabase = createClient();

  const { error: lineItemsError } = await supabase
    .from("sov_line_items")
    .delete()
    .eq("job_id", jobId)
    .eq("application_number", applicationNumber);
  if (lineItemsError) throw new Error(`Failed to remove line items: ${lineItemsError.message}`);

  await softDeletePayApplication(payAppId);
}

export async function fetchApplicationOptions(jobId: string): Promise<SovApplicationOption[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sov_line_items")
    .select("application_number, application_date, period_to")
    .eq("job_id", jobId);
  if (error) throw new Error(error.message);

  const byNumber = new Map<string, SovApplicationOption>();
  for (const row of data ?? []) {
    byNumber.set(row.application_number, {
      applicationNumber: row.application_number,
      applicationDate: row.application_date,
      periodTo: row.period_to,
    });
  }
  return Array.from(byNumber.values()).sort((a, b) => sortApplicationNumbers(a.applicationNumber, b.applicationNumber));
}

export async function fetchSovItems(jobId: string, applicationNumber: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sov_line_items")
    .select("kind, item, description, scheduled_value, previous_applications, this_period, stored_materials")
    .eq("job_id", jobId)
    .eq("application_number", applicationNumber)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  return {
    lines: rows.filter((r) => r.kind === "line").map(rowToLineItem),
    changeOrders: rows.filter((r) => r.kind === "change_order").map(rowToLineItem),
  };
}

export async function saveSovItems(
  jobId: string,
  applicationNumber: string,
  applicationDate: string,
  periodTo: string,
  lines: SOVLineItem[],
  changeOrders: SOVLineItem[],
  revision?: SovRevisionInput
) {
  const supabase = createClient();
  const { userId, organizationId } = await getCurrentUserContext();

  const { error: deleteError } = await supabase
    .from("sov_line_items")
    .delete()
    .eq("job_id", jobId)
    .eq("application_number", applicationNumber);
  if (deleteError) throw new Error(`Delete failed: ${deleteError.message}`);

  const rows = [
    ...lines.map((line, index) => ({ ...line, kind: "line" as const, sort_order: index })),
    ...changeOrders.map((co, index) => ({ ...co, kind: "change_order" as const, sort_order: index })),
  ].map((entry) => ({
    job_id: jobId,
    user_id: userId,
    organization_id: organizationId,
    application_number: applicationNumber,
    application_date: applicationDate,
    period_to: periodTo,
    kind: entry.kind,
    item: entry.item,
    description: entry.description,
    scheduled_value: entry.scheduledValue,
    previous_applications: entry.previousApplications,
    this_period: entry.thisPeriod,
    stored_materials: entry.storedMaterials,
    sort_order: entry.sort_order,
  }));

  if (rows.length === 0) return;

  const { error: insertError } = await supabase.from("sov_line_items").insert(rows);
  if (insertError) throw new Error(`Insert failed: ${insertError.message}`);

  // Auto-generate or update pay application
  const job = await supabase.from("jobs").select("retention_rate_cw, retention_rate_sm").eq("id", jobId).single();
  if (job.error) throw new Error(job.error.message);

  const cwRate = (Number(job.data.retention_rate_cw) ?? 0) / 100;
  const smRate = (Number(job.data.retention_rate_sm) ?? 0) / 100;
  const allItems = [...lines, ...changeOrders];
  const computed = allItems.map((item) => computeLine(item, cwRate, smRate));
  const totals = sumLines(computed);
  const amountBilled = totals.totalCompleted;

  // Calculate current payment due (earned less retainage minus previous certificates)
  const earnedLessRetainage = totals.totalCompleted - totals.retention;
  const prevCerts = previousCertificates(allItems, cwRate);
  const currentPaymentDue = Math.max(0, earnedLessRetainage - prevCerts);

  if (revision) {
    await createPayApplicationRevision(
      revision.payAppId,
      amountBilled,
      currentPaymentDue,
      applicationDate,
      periodTo,
      revision.reason
    );
    return;
  }

  const existing = await findPayApplication(jobId, applicationNumber);
  if (existing) {
    await updatePayApplicationAmount(
      jobId,
      applicationNumber,
      amountBilled,
      currentPaymentDue,
      applicationDate,
      periodTo,
      existing.status === "draft"
    );
  } else {
    await markApplicationBilled(jobId, applicationNumber, applicationDate, periodTo, amountBilled, currentPaymentDue);
  }
}
