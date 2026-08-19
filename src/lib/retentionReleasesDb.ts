import { createClient } from "@/lib/supabase/client";
import { getCurrentUserContext } from "@/lib/currentUserContext";
import { autoMarkBillingThisMonthIfCurrent } from "@/lib/billingCheckinDb";

export type RetentionReleaseStatus = "draft" | "billed" | "paid";

// The invoice number as shown on the retention release's own cover PDF:
// {jobNumber}-RET-{releaseNumber}, e.g. "7314-RET-1". Mirrors how the pay
// application invoice cover formats its own INVOICE field
// ({jobNumber}-{applicationNumber}) — job-number prefixing is reserved for
// the actual invoice document field; every other in-app reference to a
// release (tables, tooltips, confirmation text) stays the bare "RET-#",
// matching how pay application numbers are shown everywhere except their
// own invoice cover. releaseNumber itself (the per-job sequence) is
// unaffected — this only changes how it's displayed, never renumbers it.
export function formatRetentionInvoiceNumber(jobNumber: string, releaseNumber: number): string {
  return `${jobNumber}-RET-${releaseNumber}`;
}

export type ParsedRetentionAuditLine = {
  item: string;
  description: string;
  retentionHeld: number;
  releaseAmount: number;
  pctComplete: number;
};

// The Retention Release Wizard embeds a JSON snapshot (waiver kind + the
// per-line retention basis it computed at billing time) in the release's
// notes field, appended after any free-text note the user typed, separated
// by "\n---\n". Parsing it back out lets a release's invoice be regenerated
// later using the SAME basis it was originally billed against, rather than
// recomputing from today's (possibly since-changed) SOV data. Returns null
// for releases with no such snapshot (created before the wizard tracked
// this, or with plain-text-only notes).
export function parseRetentionReleaseAudit(
  notes: string
): { waiverKind: string; lines: ParsedRetentionAuditLine[] } | null {
  try {
    const parsed = JSON.parse(notes.split("---")[1]?.trim() ?? notes);
    if (parsed?.wizard === "v1" && Array.isArray(parsed.lines)) {
      return {
        waiverKind: parsed.waiverKind ?? "",
        lines: parsed.lines.map((l: Partial<ParsedRetentionAuditLine>) => ({
          item: l.item ?? "",
          description: l.description ?? "",
          retentionHeld: Number(l.retentionHeld ?? 0),
          releaseAmount: Number(l.releaseAmount ?? 0),
          pctComplete: Number(l.pctComplete ?? 0),
        })),
      };
    }
  } catch {
    // notes doesn't contain the wizard's JSON snapshot — not an error
  }
  return null;
}

export type RetentionRelease = {
  id: string;
  jobId: string;
  releaseNumber: number;
  releaseDate: string;
  amountReleased: number;
  isFinal: boolean;
  notes: string;
  status: RetentionReleaseStatus;
  paymentDate: string | null;
  amountPaid: number;
  paymentReference: string;
  // Amount released minus amount paid — always derived (a Postgres
  // generated column), never a value the user enters directly. Positive =
  // underpaid, negative = overpaid, zero = exact match. Only meaningful once
  // status is "paid"; for a billed-but-unpaid release this just equals
  // amountReleased, which isn't a real discrepancy yet.
  discrepancy: number;
  discrepancyNote: string;
  // The period this release covers (like a pay application's "period to"),
  // distinct from releaseDate (when it was billed). Null for releases
  // created before this field was tracked.
  releasedThrough: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ReleaseRow = {
  id: string;
  job_id: string;
  release_number: number;
  release_date: string;
  amount_released: string | number;
  is_final: boolean;
  notes: string;
  status: RetentionReleaseStatus;
  payment_date: string | null;
  amount_paid: string | number;
  payment_reference: string;
  discrepancy: string | number;
  discrepancy_note: string;
  released_through: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

function rowToRelease(row: ReleaseRow): RetentionRelease {
  return {
    id: row.id,
    jobId: row.job_id,
    releaseNumber: row.release_number,
    releaseDate: row.release_date,
    amountReleased: Number(row.amount_released),
    isFinal: row.is_final,
    notes: row.notes,
    status: row.status,
    paymentDate: row.payment_date,
    amountPaid: Number(row.amount_paid),
    paymentReference: row.payment_reference ?? "",
    discrepancy: Number(row.discrepancy ?? 0),
    discrepancyNote: row.discrepancy_note ?? "",
    releasedThrough: row.released_through ?? null,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchRetentionReleases(jobId: string): Promise<RetentionRelease[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("retention_releases")
    .select("*")
    .eq("job_id", jobId)
    .is("deleted_at", null)
    .order("release_number", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToRelease);
}

export async function fetchAllRetentionReleases(): Promise<RetentionRelease[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("retention_releases")
    .select("*")
    .is("deleted_at", null)
    .order("release_date", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToRelease);
}

async function getNextReleaseNumber(jobId: string): Promise<number> {
  const supabase = createClient();
  const { data } = await supabase
    .from("retention_releases")
    .select("release_number")
    .eq("job_id", jobId)
    .is("deleted_at", null)
    .order("release_number", { ascending: false })
    .limit(1);
  if (!data || data.length === 0) return 1;
  return (data[0].release_number ?? 0) + 1;
}

export type CreateReleaseInput = {
  jobId: string;
  releaseDate: string;
  amountReleased: number;
  isFinal: boolean;
  notes?: string;
  status?: RetentionReleaseStatus;
  releasedThrough?: string;
};

export async function createRetentionRelease(input: CreateReleaseInput): Promise<RetentionRelease> {
  const supabase = createClient();
  const { userId, organizationId } = await getCurrentUserContext();

  const releaseNumber = await getNextReleaseNumber(input.jobId);

  const { data, error } = await supabase
    .from("retention_releases")
    .insert({
      job_id: input.jobId,
      user_id: userId,
      organization_id: organizationId,
      release_number: releaseNumber,
      release_date: input.releaseDate,
      amount_released: input.amountReleased,
      is_final: input.isFinal,
      notes: input.notes ?? "",
      status: input.status ?? "billed",
      released_through: input.releasedThrough ?? input.releaseDate,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToRelease(data);
}

export async function recordRetentionPayment(
  id: string,
  amountPaid: number,
  paymentDate: string,
  paymentReference?: string,
  overrideNote?: string,
  discrepancyNote?: string
): Promise<RetentionRelease> {
  const supabase = createClient();

  const { data: current, error: fetchErr } = await supabase
    .from("retention_releases")
    .select("amount_released, notes")
    .eq("id", id)
    .single();
  if (fetchErr) throw new Error(fetchErr.message);

  const fullyPaid = amountPaid >= Number(current.amount_released) - 0.01;

  // Append override audit entry to notes when the user bypassed the outstanding-payments gate
  let finalNotes = current.notes ?? "";
  if (overrideNote) {
    const auditEntry = JSON.stringify({
      override: "outstanding_payments_bypassed",
      at: new Date().toISOString(),
      detail: overrideNote,
    });
    finalNotes = [finalNotes.trim(), auditEntry].filter(Boolean).join("\n---\n");
  }

  const updateFields: Record<string, unknown> = {
    amount_paid: amountPaid,
    payment_date: paymentDate,
    payment_reference: paymentReference?.trim() ?? "",
    // Only ever set when there's an actual discrepancy (page.tsx clears the
    // field and doesn't pass this when the amount matches exactly) — this
    // just guards against a stale note surviving a discrepancy-free payment.
    discrepancy_note: discrepancyNote?.trim() ?? "",
    status: fullyPaid ? "paid" : "billed",
    updated_at: new Date().toISOString(),
  };
  if (overrideNote) updateFields.notes = finalNotes;

  const { data, error } = await supabase
    .from("retention_releases")
    .update(updateFields)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  const result = rowToRelease(data);
  // Only the actual payment counts as "billing this month" — a billed-but-
  // unpaid release can still be cancelled (see Cancel flow), so it shouldn't
  // answer the check-in question until it's actually paid in full.
  if (fullyPaid) {
    autoMarkBillingThisMonthIfCurrent(result.jobId, paymentDate).catch(() => {});
  }
  return result;
}

export async function undoRetentionPayment(id: string): Promise<RetentionRelease> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("retention_releases")
    .update({
      amount_paid: 0,
      payment_date: null,
      // The discrepancy note explained a specific payment that no longer
      // exists once undone — clear it so it doesn't linger on a release
      // that's back to "billed, awaiting payment".
      discrepancy_note: "",
      status: "billed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToRelease(data);
}

export async function softDeleteRetentionRelease(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("retention_releases")
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function fetchDeletedRetentionReleases(jobId: string): Promise<RetentionRelease[]> {
  const supabase = createClient();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const { data, error } = await supabase
    .from("retention_releases")
    .select("*")
    .eq("job_id", jobId)
    .not("deleted_at", "is", null)
    .gte("deleted_at", thirtyDaysAgo.toISOString())
    .order("deleted_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToRelease);
}

export async function restoreRetentionRelease(id: string): Promise<RetentionRelease> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("retention_releases")
    .update({ deleted_at: null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToRelease(data);
}

export async function permanentlyDeleteRetentionRelease(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("retention_releases")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}
