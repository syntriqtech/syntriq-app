import { createClient } from "@/lib/supabase/client";

export type CurrentUserContext = {
  userId: string;
  organizationId: string | null;
};

/** organizationId is null for a user with no organization_members row (not yet possible for
 * anyone but a future org-less signup — see get_my_organization_id() in Supabase). */
export async function getCurrentUserContext(): Promise<CurrentUserContext> {
  const supabase = createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(userError.message);
  const userId = userData.user?.id;
  if (!userId) throw new Error("Not signed in.");

  const { data: organizationId, error: orgError } = await supabase.rpc("get_my_organization_id");
  if (orgError) throw new Error(orgError.message);

  return { userId, organizationId: organizationId ?? null };
}
