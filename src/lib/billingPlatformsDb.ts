import { createClient } from "@/lib/supabase/client";

// These five presets are always available without any DB entry.
// User-added platforms are stored in the billing_platforms table and merged in.
const PRESETS = ["Procore", "Billing form", "Email", "Textura", "GCPay"];

export async function fetchBillingPlatforms(): Promise<string[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("billing_platforms")
    .select("name")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);

  const custom = (data ?? []).map((r) => r.name as string);
  const all = [...PRESETS, ...custom.filter((c) => !PRESETS.includes(c))];
  return all;
}

export async function addBillingPlatform(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed || PRESETS.includes(trimmed)) return;

  const supabase = createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(userError.message);
  const userId = userData.user?.id;
  if (!userId) throw new Error("Not signed in.");

  const { error } = await supabase
    .from("billing_platforms")
    .upsert({ user_id: userId, name: trimmed }, { onConflict: "user_id,name" });
  if (error) throw new Error(error.message);
}
