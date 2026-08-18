import { createClient } from "@/lib/supabase/client";

export type TrialStatus = {
  keyType: "trial" | "standard";
  expiresAt: string | null;
  daysRemaining: number | null;
} | null;

export async function fetchTrialStatus(): Promise<TrialStatus> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_my_trial_status");
  if (error) throw new Error(error.message);

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  const daysRemaining = row.expires_at
    ? Math.ceil((new Date(row.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  return { keyType: row.key_type, expiresAt: row.expires_at, daysRemaining };
}
