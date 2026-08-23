import { createClient } from "@/lib/supabase/client";
import { logActivity } from "@/lib/activityLogDb";

export type InvitationRole = "project_manager" | "project_accountant";

export type PendingInvitation = {
  id: string;
  email: string;
  role: InvitationRole;
  invitedAt: string;
  expiresAt: string;
};

type InvitationRow = {
  id: string;
  email: string;
  role: InvitationRole;
  created_at: string;
  expires_at: string;
};

function rowToInvitation(row: InvitationRow): PendingInvitation {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    invitedAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

// RLS (invitations_select_owner) already scopes this to the caller's own
// org — no explicit organization_id filter needed, same pattern as
// organization_members_select_members elsewhere in this codebase.
export async function fetchPendingInvitations(): Promise<PendingInvitation[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("invitations")
    .select("id, email, role, created_at, expires_at")
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToInvitation);
}

// Goes through /api/invitations rather than a raw client insert — creation
// needs the seat-cap/duplicate-pending check (create_invitation()) AND a
// server-side Resend send, and the cap check has to happen before the email
// goes out.
export async function createInvitation(email: string, role: InvitationRole): Promise<void> {
  const trimmed = email.trim();
  if (!trimmed) throw new Error("Email is required.");

  const res = await fetch("/api/invitations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: trimmed, role }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Could not send this invite.");
  logActivity("team_member.invited", "invitation", null, `${trimmed} — ${role.replace("_", " ")}`).catch(() => {});
}

export async function resendInvitation(id: string, email: string): Promise<void> {
  const res = await fetch(`/api/invitations/${id}/resend`, { method: "POST" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Could not resend this invite.");
  logActivity("team_member.invite_resent", "invitation", id, email).catch(() => {});
}

// Revoke is a plain status update under RLS (invitations_update_owner) —
// no server route needed since no email goes out.
export async function revokeInvitation(id: string, email: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("invitations").update({ status: "revoked" }).eq("id", id);
  if (error) throw new Error(error.message);
  logActivity("team_member.invite_revoked", "invitation", id, email).catch(() => {});
}

export type AcceptInvitationResult = {
  status: "ok" | "error";
  message: string;
  organizationName: string | null;
  role: InvitationRole | null;
};

export async function acceptInvitation(token: string): Promise<AcceptInvitationResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error) throw new Error(error.message);
  const row = data?.[0];
  if (!row) throw new Error("Could not process this invite.");
  return {
    status: row.result_status,
    message: row.message,
    organizationName: row.organization_name,
    role: row.member_role,
  };
}

export type InvitationPreview = {
  email: string;
  organizationName: string;
  role: InvitationRole;
} | null;

// Safe for a logged-out visitor — backed by get_invitation_preview(),
// granted to anon.
export async function getInvitationPreview(token: string): Promise<InvitationPreview> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_invitation_preview", { p_token: token });
  if (error) throw new Error(error.message);
  const row = data?.[0];
  if (!row) return null;
  return { email: row.email, organizationName: row.organization_name, role: row.member_role };
}
