import { createClient } from "@/lib/supabase/client";

export type RetentionReleaseStatus = "draft" | "billed" | "paid";

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
};

export async function createRetentionRelease(input: CreateReleaseInput): Promise<RetentionRelease> {
  const supabase = createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(userError.message);
  const userId = userData.user?.id;
  if (!userId) throw new Error("Not signed in.");

  const releaseNumber = await getNextReleaseNumber(input.jobId);

  const { data, error } = await supabase
    .from("retention_releases")
    .insert({
      job_id: input.jobId,
      user_id: userId,
      release_number: releaseNumber,
      release_date: input.releaseDate,
      amount_released: input.amountReleased,
      is_final: input.isFinal,
      notes: input.notes ?? "",
      status: input.status ?? "billed",
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
  overrideNote?: string
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
  return rowToRelease(data);
}

export async function undoRetentionPayment(id: string): Promise<RetentionRelease> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("retention_releases")
    .update({
      amount_paid: 0,
      payment_date: null,
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
