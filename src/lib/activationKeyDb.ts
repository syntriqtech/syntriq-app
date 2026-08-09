import { createClient } from "@/lib/supabase/client";

export async function checkActivationKey(keyCode: string): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("check_activation_key", { p_key_code: keyCode });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function redeemActivationKey(keyCode: string): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("redeem_activation_key", { p_key_code: keyCode });
  if (error) throw new Error(error.message);
  return Boolean(data);
}
