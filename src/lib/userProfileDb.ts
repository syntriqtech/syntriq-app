import { createClient } from "@/lib/supabase/client";

export type UserProfile = {
  fullName: string;
  roleTitle: string;
  signatureData: string;
};

export async function fetchUserProfile(): Promise<UserProfile | null> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data, error } = await supabase
    .from("user_profiles")
    .select("full_name, role_title, signature_data")
    .eq("user_id", userData.user.id)
    .single();

  if (error && error.code !== "PGRST116") throw new Error(error.message);
  if (!data) return null;

  return { fullName: data.full_name, roleTitle: data.role_title, signatureData: data.signature_data ?? "" };
}

export async function saveUserProfile(fullName: string, roleTitle: string): Promise<void> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Not signed in.");

  const { error } = await supabase
    .from("user_profiles")
    .upsert(
      { user_id: userData.user.id, full_name: fullName, role_title: roleTitle, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );

  if (error) throw new Error(error.message);
}

export async function saveUserSignature(signatureData: string): Promise<void> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Not signed in.");

  const { error } = await supabase
    .from("user_profiles")
    .upsert(
      { user_id: userData.user.id, signature_data: signatureData, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );

  if (error) throw new Error(error.message);
}

/** Returns "Full Name, Role Title" for prefilling combined signer fields. */
export function formatSignerLine(profile: UserProfile | null): string {
  if (!profile) return "";
  const { fullName, roleTitle } = profile;
  if (fullName && roleTitle) return `${fullName}, ${roleTitle}`;
  return fullName || roleTitle || "";
}
