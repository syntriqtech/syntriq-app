import { createClient } from "@/lib/supabase/client";
import { autoMarkBillingThisMonthIfCurrent } from "@/lib/billingCheckinDb";

export type PayApplicationStatus = "draft" | "submitted" | "revised" | "certified" | "paid";

export type PayApplication = {
  id: string;
  jobId: string;
  applicationNumber: string;
  applicationDate: string;
  periodTo: string;
  amountBilled: number;
  currentPaymentDue: number;
  pdfUrl: string | null;
  deletedAt: string | null;
  createdAt: string;
  revisionNumber: number;
  status: PayApplicationStatus;
  revisionReason: string | null;
  supersededByRevisionId: string | null;
  isCurrentRevision: boolean;
  certifiedDate: string | null;
};

type PayApplicationRow = {
  id: string;
  job_id: string;
  application_number: string;
  application_date: string;
  period_to: string;
  amount_billed: number;
  current_payment_due: number;
  pdf_url: string | null;
  deleted_at: string | null;
  created_at: string;
  revision_number: number;
  status: PayApplicationStatus;
  revision_reason: string | null;
  superseded_by_revision_id: string | null;
  is_current_revision: boolean;
  certified_date: string | null;
};

function rowToPayApplication(row: PayApplicationRow): PayApplication {
  return {
    id: row.id,
    jobId: row.job_id,
    applicationNumber: row.application_number,
    applicationDate: row.application_date,
    periodTo: row.period_to,
    amountBilled: Number(row.amount_billed),
    currentPaymentDue: Number(row.current_payment_due),
    pdfUrl: row.pdf_url ?? null,
    deletedAt: row.deleted_at ?? null,
    createdAt: row.created_at,
    revisionNumber: row.revision_number,
    status: row.status,
    revisionReason: row.revision_reason ?? null,
    supersededByRevisionId: row.superseded_by_revision_id ?? null,
    isCurrentRevision: row.is_current_revision,
    certifiedDate: row.certified_date ?? null,
  };
}

export async function markApplicationBilled(
  jobId: string,
  applicationNumber: string,
  applicationDate: string,
  periodTo: string,
  amountBilled: number,
  currentPaymentDue: number = amountBilled
): Promise<PayApplication> {
  const supabase = createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const userId = userData.user?.id;
  if (!userId) throw new Error("Not signed in.");

  const { data, error } = await supabase
    .from("pay_applications")
    .insert({
      job_id: jobId,
      user_id: userId,
      application_number: applicationNumber,
      application_date: applicationDate,
      period_to: periodTo,
      amount_billed: amountBilled,
      current_payment_due: currentPaymentDue,
      status: amountBilled > 0 ? "submitted" : "draft",
    })
    .select()
    .single();
  if (error) throw error;
  const result = rowToPayApplication(data);
  // Billing this application (not just saving a $0 draft) is the sub's own
  // answer to "are you billing this job this month" — sync Billing
  // Check-in rather than making them answer it again separately.
  if (amountBilled > 0) {
    autoMarkBillingThisMonthIfCurrent(result.jobId, applicationDate).catch(() => {});
  }
  return result;
}

export async function fetchPayApplicationsByJob(jobId: string): Promise<PayApplication[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("pay_applications")
    .select("*")
    .eq("job_id", jobId)
    .eq("is_current_revision", true)
    .is("deleted_at", null)
    .order("application_number", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToPayApplication);
}

export async function fetchAllPayApplications(): Promise<PayApplication[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("pay_applications")
    .select("*")
    .eq("is_current_revision", true)
    .is("deleted_at", null)
    .order("application_date", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToPayApplication);
}

// Full revision history for a single application number, most recent first —
// deliberately NOT filtered by is_current_revision, since this is the one
// place superseded rows are meant to surface (audit trail on the bubble card).
export async function fetchPayApplicationRevisions(
  jobId: string,
  applicationNumber: string
): Promise<PayApplication[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("pay_applications")
    .select("*")
    .eq("job_id", jobId)
    .eq("application_number", applicationNumber)
    .is("deleted_at", null)
    .order("revision_number", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToPayApplication);
}

export async function fetchPayApplicationById(id: string): Promise<PayApplication> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("pay_applications")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return rowToPayApplication(data);
}

export async function findPayApplication(
  jobId: string,
  applicationNumber: string
): Promise<PayApplication | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("pay_applications")
    .select("*")
    .eq("job_id", jobId)
    .eq("application_number", applicationNumber)
    .eq("is_current_revision", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToPayApplication(data) : null;
}

export async function purgeDeletedPayApplications(jobId: string, applicationNumber: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("pay_applications")
    .delete()
    .eq("job_id", jobId)
    .eq("application_number", applicationNumber)
    .not("deleted_at", "is", null);
  if (error) throw new Error(error.message);
}

export async function softDeletePayApplication(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("pay_applications")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function updatePayApplicationAmount(
  jobId: string,
  applicationNumber: string,
  amountBilled: number,
  currentPaymentDue: number = amountBilled,
  applicationDate?: string,
  periodTo?: string,
  promoteFromDraft: boolean = false
): Promise<PayApplication> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("pay_applications")
    .update({
      amount_billed: amountBilled,
      current_payment_due: currentPaymentDue,
      ...(applicationDate ? { application_date: applicationDate } : {}),
      ...(periodTo       ? { period_to: periodTo }               : {}),
      ...(promoteFromDraft && amountBilled > 0 ? { status: "submitted" } : {}),
    })
    .eq("job_id", jobId)
    .eq("application_number", applicationNumber)
    .eq("is_current_revision", true)
    .is("deleted_at", null)
    .select()
    .single();
  if (error) throw new Error(error.message);
  const result = rowToPayApplication(data);
  // Same sync as markApplicationBilled, for the "fill in a previously-$0
  // draft" path: this is the promotion to "submitted", so it counts as the
  // real billing action. No explicit applicationDate means the date wasn't
  // being changed here — treat the promotion as happening today.
  if (promoteFromDraft && amountBilled > 0) {
    autoMarkBillingThisMonthIfCurrent(result.jobId, applicationDate ?? new Date().toISOString().slice(0, 10)).catch(() => {});
  }
  return result;
}

// Creates a new revision row via the create_pay_application_revision()
// Postgres function — atomic (row-locked) so a double-click can't create two
// competing revisions, and rejects server-side unless the current revision's
// status is 'submitted' or 'revised'.
export async function createPayApplicationRevision(
  payAppId: string,
  amountBilled: number,
  currentPaymentDue: number,
  applicationDate: string,
  periodTo: string,
  revisionReason: string
): Promise<PayApplication> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("create_pay_application_revision", {
    p_pay_app_id: payAppId,
    p_amount_billed: amountBilled,
    p_current_payment_due: currentPaymentDue,
    p_application_date: applicationDate,
    p_period_to: periodTo,
    p_revision_reason: revisionReason,
  });
  if (error) throw new Error(error.message);
  const result = rowToPayApplication(data);
  // A revision is a resubmission — always represents active billing on
  // this job, unlike the plain amount-edit path which only counts once it
  // actually promotes past draft.
  autoMarkBillingThisMonthIfCurrent(result.jobId, applicationDate).catch(() => {});
  return result;
}

// Marks the current revision certified via the certify_pay_application()
// Postgres function — rejects server-side unless status is 'submitted' or
// 'revised', and locks the row from further edits/revisions once certified.
export async function certifyPayApplication(payAppId: string): Promise<PayApplication> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("certify_pay_application", {
    p_pay_app_id: payAppId,
  });
  if (error) throw new Error(error.message);
  return rowToPayApplication(data);
}

export async function savePayApplicationPdf(
  jobId: string,
  applicationNumber: string,
  applicationDate: string,
  periodTo: string,
  amountBilled: number,
  currentPaymentDue: number,
  pdfBlob: Blob
): Promise<string> {
  const supabase = createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(userError.message);
  const userId = userData.user?.id;
  if (!userId) throw new Error("Not signed in.");

  // Find or create the pay application record
  let payApp = await findPayApplication(jobId, applicationNumber);
  if (!payApp) {
    payApp = await markApplicationBilled(
      jobId,
      applicationNumber,
      applicationDate,
      periodTo,
      amountBilled,
      currentPaymentDue
    );
  }

  // Upload to storage — upsert overwrites if file already exists
  const storagePath = `${userId}/${payApp.id}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from("pay-app-pdfs")
    .upload(storagePath, pdfBlob, { contentType: "application/pdf", upsert: true });
  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  const { data: urlData } = supabase.storage
    .from("pay-app-pdfs")
    .getPublicUrl(storagePath);
  const pdfUrl = urlData.publicUrl;

  // Store URL on the pay application record
  const { error: updateError } = await supabase
    .from("pay_applications")
    .update({ pdf_url: pdfUrl })
    .eq("id", payApp.id);
  if (updateError) throw new Error(`Could not update record: ${updateError.message}`);

  return pdfUrl;
}
