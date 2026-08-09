import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { fetchUserProfile, createUserProfileFromSignup } from "@/lib/userProfileDb";
import { redeemActivationKey } from "@/lib/activationKeyDb";

type PendingSignupMetadata = {
  activation_key?: string;
  first_name?: string;
  last_name?: string;
};

/**
 * Finishes account setup for a user who signed up while Supabase's "Confirm
 * email" setting was on, so signUp() returned no session and the activation
 * key couldn't be redeemed yet (redemption needs auth.uid(), which requires
 * a session). The pending key/name are stashed in the user's auth metadata
 * at signup time and consumed here on first login. Safe to call on every
 * login — it no-ops once the metadata is cleared below.
 */
export async function finalizeAccountFromMetadata(user: User): Promise<void> {
  const metadata = user.user_metadata as PendingSignupMetadata | undefined;
  const pendingKey = metadata?.activation_key;
  if (!pendingKey) return;

  const existingProfile = await fetchUserProfile().catch(() => null);
  if (!existingProfile) {
    await redeemActivationKey(pendingKey).catch(() => {});
    await createUserProfileFromSignup(user.id, metadata?.first_name ?? "", metadata?.last_name ?? "").catch(
      () => {}
    );
  }

  const supabase = createClient();
  await supabase.auth
    .updateUser({ data: { activation_key: null, first_name: null, last_name: null } })
    .catch(() => {});
}
