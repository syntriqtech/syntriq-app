import { createClient } from "@/lib/supabase/client";

export type CompanyProfile = {
  id: string;
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
  user_id: string;
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

export async function fetchCompanyProfile(): Promise<CompanyProfile | null> {
  const supabase = createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(userError.message);
  const userId = userData.user?.id;
  if (!userId) throw new Error("Not signed in.");

  const { data, error } = await supabase
    .from("company_profile")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error && error.code !== "PGRST116") throw new Error(error.message);
  return data ? rowToCompanyProfile(data) : null;
}

export async function saveCompanyLogo(file: File): Promise<string> {
  const supabase = createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(userError.message);
  const userId = userData.user?.id;
  if (!userId) throw new Error("Not signed in.");

  const existing = await fetchCompanyProfile();
  if (!existing) throw new Error("Save your company profile before uploading a logo.");

  // Remove any previous logo (both extensions) so switching PNG↔JPG doesn't leave orphans
  await supabase.storage.from(LOGO_BUCKET).remove([`${userId}/logo.png`, `${userId}/logo.jpg`]);

  const ext = file.type.includes("png") ? "png" : "jpg";
  const path = `${userId}/logo.${ext}`;
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
    .eq("user_id", userId);
  if (updateError) throw new Error(updateError.message);

  return logoUrl;
}

export async function removeCompanyLogo(): Promise<void> {
  const supabase = createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(userError.message);
  const userId = userData.user?.id;
  if (!userId) throw new Error("Not signed in.");

  const { error: updateError } = await supabase
    .from("company_profile")
    .update({ logo_url: null, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (updateError) throw new Error(updateError.message);

  await supabase.storage.from(LOGO_BUCKET).remove([`${userId}/logo.png`, `${userId}/logo.jpg`]);
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
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(userError.message);
  const userId = userData.user?.id;
  if (!userId) throw new Error("Not signed in.");

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
    const { data, error } = await supabase
      .from("company_profile")
      .update(payload)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return rowToCompanyProfile(data);
  } else {
    const { data, error } = await supabase
      .from("company_profile")
      .insert({ user_id: userId, ...payload })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return rowToCompanyProfile(data);
  }
}
