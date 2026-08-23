import { createClient } from "@/lib/supabase/client";
import { getCurrentUserContext } from "@/lib/currentUserContext";
import { logActivity } from "@/lib/activityLogDb";

export type CompanyProfile = {
  id: string;
  organizationId: string;
  companyName: string;
  companyAddress: string; // composed from parts — used by PDFs
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  logoUrl?: string;
  companySetupCompleted: boolean;
  createdAt: string;
  updatedAt: string;
};

type CompanyProfileRow = {
  id: string;
  organization_id: string;
  company_name: string;
  company_address: string;
  company_street: string;
  company_city: string;
  company_state: string;
  company_zip: string;
  company_country: string;
  contact_name: string;
  contact_email: string;
  contact_phone?: string;
  logo_url?: string;
  company_setup_completed: boolean;
  created_at: string;
  updated_at: string;
};

function composeAddress(street: string, city: string, state: string, zip: string): string {
  const cityStateZip = [city, state && zip ? `${state} ${zip}` : state || zip]
    .filter(Boolean)
    .join(", ");
  return [street, cityStateZip].filter(Boolean).join(", ");
}

function rowToCompanyProfile(row: CompanyProfileRow): CompanyProfile {
  const streetAddress = row.company_street || "";
  const city = row.company_city || "";
  const state = row.company_state || "";
  const zipCode = row.company_zip || "";
  const country = row.company_country || "USA";

  // Use composed address from new fields; fall back to legacy company_address
  const composed = composeAddress(streetAddress, city, state, zipCode);
  const companyAddress = composed || row.company_address || "";

  return {
    id: row.id,
    organizationId: row.organization_id,
    companyName: row.company_name,
    companyAddress,
    streetAddress,
    city,
    state,
    zipCode,
    country,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    logoUrl: row.logo_url ?? undefined,
    companySetupCompleted: row.company_setup_completed,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const LOGO_BUCKET = "company-logos";

// One row per organization (supabase/060) — every member can read it,
// but only the owner can write it (enforced by RLS; the page itself also
// locks the form for non-owners so this is a backstop, not the only gate).
export async function fetchCompanyProfile(): Promise<CompanyProfile | null> {
  const supabase = createClient();
  const { organizationId } = await getCurrentUserContext();
  if (!organizationId) return null;

  const { data, error } = await supabase
    .from("company_profile")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? rowToCompanyProfile(data) : null;
}

export async function saveCompanyLogo(file: File): Promise<string> {
  const supabase = createClient();
  const existing = await fetchCompanyProfile();
  if (!existing) throw new Error("Save your company profile before uploading a logo.");
  const organizationId = existing.organizationId;

  // Remove any previous logo (both extensions) so switching PNG↔JPG doesn't leave orphans
  await supabase.storage.from(LOGO_BUCKET).remove([`${organizationId}/logo.png`, `${organizationId}/logo.jpg`]);

  const ext = file.type.includes("png") ? "png" : "jpg";
  const path = `${organizationId}/logo.${ext}`;
  const buffer = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from(LOGO_BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: true });
  if (uploadError) throw new Error(uploadError.message);

  const { data: urlData } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path);
  const logoUrl = urlData.publicUrl;

  const { error: updateError } = await supabase
    .from("company_profile")
    .update({ logo_url: logoUrl, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId);
  if (updateError) throw new Error(updateError.message);

  return logoUrl;
}

export async function removeCompanyLogo(): Promise<void> {
  const supabase = createClient();
  const existing = await fetchCompanyProfile();
  if (!existing) throw new Error("Save your company profile before removing a logo.");
  const organizationId = existing.organizationId;

  const { error: updateError } = await supabase
    .from("company_profile")
    .update({ logo_url: null, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId);
  if (updateError) throw new Error(updateError.message);

  await supabase.storage.from(LOGO_BUCKET).remove([`${organizationId}/logo.png`, `${organizationId}/logo.jpg`]);
}

export async function saveCompanyProfile(
  companyName: string,
  streetAddress: string,
  city: string,
  state: string,
  zipCode: string,
  country: string,
  contactName: string,
  contactEmail: string,
  contactPhone?: string
): Promise<CompanyProfile> {
  const supabase = createClient();
  const { userId } = await getCurrentUserContext();

  const companyAddress = composeAddress(streetAddress, city, state, zipCode);

  // Matches the fields the company setup form actually marks as required —
  // address/phone/country are optional there.
  const companySetupCompleted = Boolean(
    companyName.trim() && contactName.trim() && contactEmail.trim()
  );

  const payload = {
    company_name: companyName,
    company_address: companyAddress,
    company_street: streetAddress,
    company_city: city,
    company_state: state,
    company_zip: zipCode,
    company_country: country,
    contact_name: contactName,
    contact_email: contactEmail,
    contact_phone: contactPhone || null,
    company_setup_completed: companySetupCompleted,
    updated_at: new Date().toISOString(),
  };

  const existing = await fetchCompanyProfile();

  if (existing) {
    // RLS (company_profile_update_owner_only, supabase/060) rejects this
    // for anyone but the org owner — the settings page itself locks the
    // form for non-owners, so hitting that RLS error here would mean the
    // UI guard was bypassed, not a normal user flow.
    const { data, error } = await supabase
      .from("company_profile")
      .update(payload)
      .eq("organization_id", existing.organizationId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return rowToCompanyProfile(data);
  } else {
    // First-ever save for this account — this is also the one guaranteed
    // choke point every signup passes through (see src/proxy.ts's
    // company_setup_completed gate), so it's where a brand-new account
    // gets its organization created for the first time.
    const { data: organizationId, error: bootstrapError } = await supabase.rpc(
      "bootstrap_organization",
      { p_name: companyName }
    );
    if (bootstrapError) throw new Error(bootstrapError.message);

    const { data, error } = await supabase
      .from("company_profile")
      .insert({ user_id: userId, organization_id: organizationId, ...payload })
      .select()
      .single();

    if (error) throw new Error(error.message);
    logActivity("company.setup_completed", "organization", organizationId, companyName).catch(() => {});

    // Turns a redeemed trial key (see src/app/api/trial/provision/route.ts)
    // into real billing state on the org that just got created — a no-op
    // if this account didn't sign up with one. Awaited so it happens
    // before the caller navigates away, but never blocks company setup
    // itself from succeeding if it fails for some reason.
    await fetch("/api/trial/provision", { method: "POST" }).catch(() => {});

    return rowToCompanyProfile(data);
  }
}
