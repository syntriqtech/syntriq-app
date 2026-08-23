import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { fetchUserProfile, createUserProfileFromSignup } from "@/lib/userProfileDb";
import { redeemActivationKey } from "@/lib/activationKeyDb";

type PendingSignupMetadata = {
  activation_key?: string;
  invite_token?: string;
  first_name?: string;
  last_name?: string;
};

/**
 * Finishes account setup for a user who signed up while Supabase's "Confirm
 * email" setting was on, so signUp() returned no session and the activation
 * key/invite couldn't be redeemed yet (both need auth.uid(), which requires
 * a session). The pending key/invite/name are stashed in the user's auth
 * metadata at signup time and consumed here on first login. Safe to call on
 * every login — it no-ops once the metadata is cleared below.
 *
 * Returns the pending invite token, if this login just consumed one, so the
 * caller (the login handler in src/app/page.tsx) can route to
 * /accept-invite instead of straight to /dashboard.
 */
export async function finalizeAccountFromMetadata(user: User): Promise<{ inviteToken: string | null }> {
  const metadata = user.user_metadata as PendingSignupMetadata | undefined;
  const pendingKey = metadata?.activation_key;
  const pendingInviteToken = metadata?.invite_token;
  if (!pendingKey && !pendingInviteToken) return { inviteToken: null };

  const existingProfile = await fetchUserProfile().catch(() => null);
  if (!existingProfile) {
    if (pendingKey) {
      await redeemActivationKey(pendingKey).catch(() => {});
    }
    await createUserProfileFromSignup(user.id, metadata?.first_name ?? "", metadata?.last_name ?? "").catch(
      () => {}
    );
  }

  const supabase = createClient();
  await supabase.auth
    .updateUser({ data: { activation_key: null, invite_token: null, first_name: null, last_name: null } })
    .catch(() => {});

  return { inviteToken: pendingInviteToken ?? null };
}
