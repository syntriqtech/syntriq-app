import { createClient } from "@/lib/supabase/client";
import { JobSetup } from "@/lib/jobSetupData";

export type DbJob = JobSetup & { id: string; archivedAt: string | null };

type JobRow = {
  id: string;
  job_name: string;
  job_number: string;
  customer: string;
  customer_address: string;
  gc_id: string | null;
  payment_terms: string;
  owner: string;
  owner_address: string;
  job_address: string;
  architect: string;
  architect_address: string;
  architect_project_number: string;
  contract_for: string;
  contract_value: number;
  contract_date: string | null;
  start_date: string | null;
  retention_rate_cw: number;
  retention_rate_sm: number;
  cti_pm: string;
  retention_stepdown_threshold: number | null;
  retention_stepdown_rate_cw: number | null;
  archived_at: string | null;
  billing_due_day: number;
  billing_checkin_month: string;
  billing_platform: string;
  certified_payroll: boolean;
};

function rowToJob(row: JobRow): DbJob {
  return {
    id: row.id,
    jobName: row.job_name ?? "",
    jobNumber: row.job_number,
    customer: row.customer,
    customerAddress: row.customer_address,
    gcId: row.gc_id ?? null,
    paymentTerms: row.payment_terms ?? "",
    owner: row.owner,
    ownerAddress: row.owner_address,
    jobAddress: row.job_address,
    architect: row.architect,
    architectAddress: row.architect_address,
    architectProjectNumber: row.architect_project_number,
    contractFor: row.contract_for,
    contractValue: Number(row.contract_value),
    contractDate: row.contract_date ?? "",
    startDate: row.start_date ?? "",
    retentionRateCW: Number(row.retention_rate_cw),
    retentionRateSM: Number(row.retention_rate_sm),
    ctiPm: row.cti_pm,
    retentionStepdownThreshold: row.retention_stepdown_threshold ?? null,
    retentionStepdownRateCW: row.retention_stepdown_rate_cw ?? null,
    archivedAt: row.archived_at ?? null,
    billingDueDay: row.billing_due_day ?? 15,
    billingCheckinMonth: row.billing_checkin_month ?? "",
    billingPlatform: row.billing_platform ?? "",
    certifiedPayroll: row.certified_payroll ?? false,
  };
}

export async function fetchJobs(): Promise<DbJob[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .is("deleted_at", null)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToJob);
}

// Unlike fetchJobs()/fetchArchivedJobs(), this does NOT filter by archived_at
// — it's for callers that already have a specific job id and need to know
// its current archive status regardless of which list it'd normally appear in
// (e.g. checking if a job was archived before undoing a retention payment).
export async function fetchJobById(id: string): Promise<DbJob | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToJob(data) : null;
}

export async function fetchArchivedJobs(): Promise<DbJob[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .is("deleted_at", null)
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToJob);
}

export async function archiveJob(id: string): Promise<DbJob> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("jobs")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToJob(data);
}

export async function unarchiveJob(id: string): Promise<DbJob> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("jobs")
    .update({ archived_at: null })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToJob(data);
}

export async function fetchDeletedJobs(): Promise<DbJob[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToJob);
}

export async function softDeleteJob(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("jobs")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function restoreJob(id: string): Promise<DbJob> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("jobs")
    .update({ deleted_at: null })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToJob(data);
}

export async function permanentlyDeleteJob(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("jobs").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function createJob(job: JobSetup): Promise<DbJob> {
  const supabase = createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(userError.message);
  const userId = userData.user?.id;
  if (!userId) throw new Error("Not signed in.");

  const { data, error } = await supabase
    .from("jobs")
    .insert({
      user_id: userId,
      job_name: job.jobName,
      job_number: job.jobNumber,
      customer: job.customer,
      customer_address: job.customerAddress,
      gc_id: job.gcId,
      payment_terms: job.paymentTerms,
      owner: job.owner,
      owner_address: job.ownerAddress,
      job_address: job.jobAddress,
      architect: job.architect,
      architect_address: job.architectAddress,
      architect_project_number: job.architectProjectNumber,
      contract_for: job.contractFor,
      contract_value: job.contractValue,
      contract_date: job.contractDate || null,
      start_date: job.startDate || null,
      retention_rate_cw: job.retentionRateCW,
      retention_rate_sm: job.retentionRateSM,
      cti_pm: job.ctiPm,
      retention_stepdown_threshold: job.retentionStepdownThreshold ?? null,
      retention_stepdown_rate_cw: job.retentionStepdownRateCW ?? null,
      billing_due_day: job.billingDueDay,
      billing_checkin_month: job.billingCheckinMonth,
      billing_platform: job.billingPlatform,
      certified_payroll: job.certifiedPayroll,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToJob(data);
}

export async function updateJobContractPdf(id: string, contractPdfUrl: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("jobs")
    .update({ contract_pdf_url: contractPdfUrl })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function updateJob(id: string, job: JobSetup): Promise<DbJob> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("jobs")
    .update({
      job_name: job.jobName,
      job_number: job.jobNumber,
      customer: job.customer,
      customer_address: job.customerAddress,
      gc_id: job.gcId,
      payment_terms: job.paymentTerms,
      owner: job.owner,
      owner_address: job.ownerAddress,
      job_address: job.jobAddress,
      architect: job.architect,
      architect_address: job.architectAddress,
      architect_project_number: job.architectProjectNumber,
      contract_for: job.contractFor,
      contract_value: job.contractValue,
      contract_date: job.contractDate || null,
      start_date: job.startDate || null,
      retention_rate_cw: job.retentionRateCW,
      retention_rate_sm: job.retentionRateSM,
      cti_pm: job.ctiPm,
      retention_stepdown_threshold: job.retentionStepdownThreshold ?? null,
      retention_stepdown_rate_cw: job.retentionStepdownRateCW ?? null,
      billing_due_day: job.billingDueDay,
      billing_checkin_month: job.billingCheckinMonth,
      billing_platform: job.billingPlatform,
      certified_payroll: job.certifiedPayroll,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToJob(data);
}
