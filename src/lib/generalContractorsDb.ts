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
