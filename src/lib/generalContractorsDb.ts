import { createClient } from "@/lib/supabase/client";

export type GeneralContractor = {
  id: string;
  name: string;
  billingAddress: string;
  paymentTerms: string;
  defaultRetentionPct: number | null;
  billingPlatform: string;
};

type GcRow = {
  id: string;
  name: string;
  billing_address: string;
  payment_terms: string;
  default_retention_pct: number | null;
  billing_platform: string;
};

function rowToGc(row: GcRow): GeneralContractor {
  return {
    id: row.id,
    name: row.name,
    billingAddress: row.billing_address ?? "",
    paymentTerms: row.payment_terms ?? "",
    defaultRetentionPct: row.default_retention_pct != null ? Number(row.default_retention_pct) : null,
    billingPlatform: row.billing_platform ?? "",
  };
}

export async function fetchGeneralContractors(): Promise<GeneralContractor[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("general_contractors")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToGc);
}

export type NewGeneralContractor = {
  name: string;
  billingAddress?: string;
  paymentTerms?: string;
  defaultRetentionPct?: number | null;
  billingPlatform?: string;
};

export async function createGeneralContractor(gc: NewGeneralContractor): Promise<GeneralContractor> {
  const trimmedName = gc.name.trim();
  if (!trimmedName) throw new Error("GC name is required.");

  const supabase = createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(userError.message);
  const userId = userData.user?.id;
  if (!userId) throw new Error("Not signed in.");

  const { data, error } = await supabase
    .from("general_contractors")
    .insert({
      user_id: userId,
      name: trimmedName,
      billing_address: gc.billingAddress?.trim() ?? "",
      payment_terms: gc.paymentTerms?.trim() ?? "",
      default_retention_pct: gc.defaultRetentionPct ?? null,
      billing_platform: gc.billingPlatform?.trim() ?? "",
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToGc(data);
}

export type UpdateGeneralContractor = {
  name: string;
  billingAddress?: string;
  paymentTerms?: string;
  defaultRetentionPct?: number | null;
  billingPlatform?: string;
};

// Updates the canonical GC record only — does not touch any job's own
// customer/customerAddress/paymentTerms fields, since those were a one-time
// autofill snapshot at job-setup time and may have since been intentionally
// customized per job. Use reassignJobsToGc when you specifically want a
// job's displayed customer info corrected to match a GC record (e.g.
// resolving a duplicate).
export async function updateGeneralContractor(id: string, gc: UpdateGeneralContractor): Promise<GeneralContractor> {
  const trimmedName = gc.name.trim();
  if (!trimmedName) throw new Error("GC name is required.");

  const supabase = createClient();
  const { data, error } = await supabase
    .from("general_contractors")
    .update({
      name: trimmedName,
      billing_address: gc.billingAddress?.trim() ?? "",
      payment_terms: gc.paymentTerms?.trim() ?? "",
      default_retention_pct: gc.defaultRetentionPct ?? null,
      billing_platform: gc.billingPlatform?.trim() ?? "",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToGc(data);
}

// Job counts per GC, keyed by gc_id — matches exactly what the delete guard
// (both fetchJobsLinkedToGc below and the DB trigger) checks: all
// non-deleted jobs, including archived ones. Uses fetchJobs()'s narrower
// active-only filter here would under-count and could show "0 jobs" for a
// GC that's still blocked from deletion by an archived job.
export async function fetchJobCountsByGc(): Promise<Record<string, number>> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("jobs")
    .select("gc_id")
    .is("deleted_at", null)
    .not("gc_id", "is", null);
  if (error) throw new Error(error.message);
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const gcId = row.gc_id as string;
    counts[gcId] = (counts[gcId] ?? 0) + 1;
  }
  return counts;
}

export type LinkedJob = {
  id: string;
  jobNumber: string;
  jobName: string;
};

// Jobs currently linked to this GC (excluding soft-deleted ones — archived
// jobs are still included, since archiving doesn't remove the link).
export async function fetchJobsLinkedToGc(gcId: string): Promise<LinkedJob[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("jobs")
    .select("id, job_number, job_name")
    .eq("gc_id", gcId)
    .is("deleted_at", null)
    .order("job_number", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    jobNumber: row.job_number,
    jobName: row.job_name ?? "",
  }));
}

// Moves every job currently linked to fromGcId over to targetGc, and syncs
// those jobs' own customer/customerAddress/paymentTerms fields to match —
// billing, PDFs, and dashboards all read those free-text fields directly
// (not the GC record), so a duplicate isn't actually resolved unless this
// happens too, not just the gc_id link.
export async function reassignJobsToGc(fromGcId: string, targetGc: GeneralContractor): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("jobs")
    .update({
      gc_id: targetGc.id,
      customer: targetGc.name,
      customer_address: targetGc.billingAddress,
      payment_terms: targetGc.paymentTerms,
    })
    .eq("gc_id", fromGcId)
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
}

// The database also enforces this (a BEFORE DELETE trigger blocks deleting
// a GC with jobs still linked) — this check just gets a clear, specific
// error to the UI without a round trip to find out.
export async function deleteGeneralContractor(id: string): Promise<void> {
  const linked = await fetchJobsLinkedToGc(id);
  if (linked.length > 0) {
    throw new Error(
      `Cannot delete this customer — ${linked.length} job${linked.length === 1 ? " is" : "s are"} still linked. Reassign them first.`
    );
  }

  const supabase = createClient();
  const { error } = await supabase.from("general_contractors").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
