import { createClient } from "@/lib/supabase/client";
import { LienWaiverKind } from "@/lib/lienWaiverPdf";

export type LienWaiver = {
  id: string;
  jobId: string;
  applicationNumber: string;
  kind: LienWaiverKind;
  amountOfCheck: number;
  throughDate: string | null;
  signatureDate: string | null;
  generatedAgainstPayApplicationId: string | null;
  generatedAgainstRevisionNumber: number;
  stale: boolean;
  staleDetectedAt: string | null;
  generatedAt: string;
};

type LienWaiverRow = {
  id: string;
  job_id: string;
  application_number: string;
  kind: LienWaiverKind;
  amount_of_check: number;
  through_date: string | null;
  signature_date: string | null;
  generated_against_pay_application_id: string | null;
  generated_against_revision_number: number;
  stale: boolean;
  stale_detected_at: string | null;
  generated_at: string;
};

function rowToLienWaiver(row: LienWaiverRow): LienWaiver {
  return {
    id: row.id,
    jobId: row.job_id,
    applicationNumber: row.application_number,
    kind: row.kind,
    amountOfCheck: Number(row.amount_of_check),
    throughDate: row.through_date ?? null,
    signatureDate: row.signature_date ?? null,
    generatedAgainstPayApplicationId: row.generated_against_pay_application_id ?? null,
    generatedAgainstRevisionNumber: row.generated_against_revision_number,
    stale: row.stale,
    staleDetectedAt: row.stale_detected_at ?? null,
    generatedAt: row.generated_at,
  };
}

export async function recordLienWaiverGenerated(params: {
  jobId: string;
  applicationNumber: string;
  kind: LienWaiverKind;
  amountOfCheck: number;
  throughDate?: string;
  signatureDate?: string;
  payApplicationId?: string | null;
  revisionNumber?: number;
}): Promise<LienWaiver> {
  const supabase = createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(userError.message);
  const userId = userData.user?.id;
  if (!userId) throw new Error("Not signed in.");

  const { data, error } = await supabase
    .from("lien_waivers")
    .insert({
      job_id: params.jobId,
      user_id: userId,
      application_number: params.applicationNumber,
      kind: params.kind,
      amount_of_check: params.amountOfCheck,
      through_date: params.throughDate ?? null,
      signature_date: params.signatureDate ?? null,
      generated_against_pay_application_id: params.payApplicationId ?? null,
      generated_against_revision_number: params.revisionNumber ?? 1,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToLienWaiver(data);
}

export async function fetchLienWaiversForApplication(
  jobId: string,
  applicationNumber: string
): Promise<LienWaiver[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("lien_waivers")
    .select("*")
    .eq("job_id", jobId)
    .eq("application_number", applicationNumber)
    .is("deleted_at", null)
    .order("generated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToLienWaiver);
}

// Latest stale waiver per application number, for the job — used to show the
// "this application has since been revised" banner on the bubble cards
// without fetching every waiver for every application up front.
export async function fetchStaleLienWaiverSummaryByJob(
  jobId: string
): Promise<Map<string, LienWaiver>> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("lien_waivers")
    .select("*")
    .eq("job_id", jobId)
    .eq("stale", true)
    .is("deleted_at", null)
    .order("generated_at", { ascending: false });
  if (error) throw new Error(error.message);

  const byApplication = new Map<string, LienWaiver>();
  for (const row of (data ?? []) as LienWaiverRow[]) {
    if (!byApplication.has(row.application_number)) {
      byApplication.set(row.application_number, rowToLienWaiver(row));
    }
  }
  return byApplication;
}
