import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/adminEmails";

export type GcLibraryInput = {
  name: string;
  billingAddress?: string;
  paymentTerms?: string;
  defaultRetentionPct?: number | null;
  billingPlatform?: string;
  phone?: string;
  fax?: string;
  pmName?: string;
  pmEmail?: string;
  pmMobile?: string;
};

export function gcLibraryInputToRow(input: GcLibraryInput) {
  return {
    name: input.name.trim(),
    billing_address: input.billingAddress?.trim() ?? "",
    payment_terms: input.paymentTerms?.trim() ?? "",
    default_retention_pct: input.defaultRetentionPct ?? null,
    billing_platform: input.billingPlatform?.trim() ?? "",
    phone: input.phone?.trim() ?? "",
    fax: input.fax?.trim() ?? "",
    pm_name: input.pmName?.trim() ?? "",
    pm_email: input.pmEmail?.trim() ?? "",
    pm_mobile: input.pmMobile?.trim() ?? "",
  };
}

export async function requireAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return isAdminEmail(user?.email);
}
