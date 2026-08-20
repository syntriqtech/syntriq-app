import { createClient } from "@/lib/supabase/client";
import { logActivity } from "@/lib/activityLogDb";

export type MemberRole = "owner" | "project_manager" | "project_accountant";

export type OrganizationMember = {
  userId: string;
  email: string;
  fullName: string;
  role: MemberRole;
  joinedAt: string;
};

type MemberRow = {
  user_id: string;
  email: string;
  full_name: string;
  role: MemberRole;
  joined_at: string;
};

function rowToMember(row: MemberRow): OrganizationMember {
  return {
    userId: row.user_id,
    email: row.email,
    fullName: row.full_name ?? "",
    role: row.role,
    joinedAt: row.joined_at,
  };
}

export async function fetchOrganizationMembers(): Promise<OrganizationMember[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("list_organization_members");
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToMember);
}

// project_manager/project_accountant only — promoting someone to co-owner
// isn't exposed in this UI (see add_organization_member(), which also
// enforces this server-side).
export async function addOrganizationMember(
  email: string,
  role: "project_manager" | "project_accountant"
): Promise<void> {
  const trimmed = email.trim();
  if (!trimmed) throw new Error("Email is required.");

  const supabase = createClient();
  const { error } = await supabase.rpc("add_organization_member", {
    p_email: trimmed,
    p_role: role,
  });
  if (error) throw new Error(error.message);
  logActivity("team_member.added", "organization_member", null, `${trimmed} — ${role.replace("_", " ")}`).catch(() => {});
}

// Relies entirely on RLS (organization_members_update_owner_only) plus the
// self-demotion trigger for enforcement — the UI disables this on the
// caller's own row proactively so that trigger's exception is a backstop,
// not something a normal user ever hits. memberLabel is the display
// name/email already available at the call site, passed through purely
// for a readable activity log entry.
export async function updateMemberRole(
  userId: string,
  role: "project_manager" | "project_accountant",
  memberLabel: string
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("organization_members")
    .update({ role })
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  logActivity("team_member.role_changed", "organization_member", userId, `${memberLabel} → ${role.replace("_", " ")}`).catch(
    () => {}
  );
}

// Same as above — RLS (organization_members_delete_owner_only) plus the
// self-removal trigger are the real enforcement; the UI just disables this
// on the caller's own row so that trigger is a backstop.
export async function removeMember(userId: string, memberLabel: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("organization_members").delete().eq("user_id", userId);
  if (error) throw new Error(error.message);
  logActivity("team_member.removed", "organization_member", userId, memberLabel).catch(() => {});
}
