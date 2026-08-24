import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";
import { buildInviteEmail } from "@/lib/inviteEmailTemplate";

const resend = new Resend(process.env.RESEND_API_KEY);

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// Re-sends the same email for the same token (no rotation) and bumps
// expires_at only if it's within ~2 days of expiring.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // RLS (invitations_select_owner) scopes this to the caller's own org —
  // a non-owner or a foreign invitation id just comes back as no row.
  const { data: invitation, error } = await supabase
    .from("invitations")
    .select("id, email, role, token, organization_id, expires_at, status")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!invitation || invitation.status !== "pending") {
    return NextResponse.json({ error: "This invite is no longer pending." }, { status: 400 });
  }

  const expiresAt = new Date(invitation.expires_at);
  if (expiresAt.getTime() - Date.now() < TWO_DAYS_MS) {
    const newExpiresAt = new Date(Date.now() + SEVEN_DAYS_MS).toISOString();
    await supabase.from("invitations").update({ expires_at: newExpiresAt }).eq("id", id);
  }

  const [{ data: org }, { data: profile }] = await Promise.all([
    supabase.from("organizations").select("name").eq("id", invitation.organization_id).maybeSingle(),
    supabase.from("user_profiles").select("full_name").eq("user_id", user.id).maybeSingle(),
  ]);

  const { subject, html } = buildInviteEmail({
    inviterName: profile?.full_name || user.email || "A teammate",
    organizationName: org?.name || "your organization",
    role: invitation.role,
    acceptUrl: `${req.nextUrl.origin}/accept-invite?token=${invitation.token}`,
  });

  const { error: sendError } = await resend.emails.send({
    from: "Syntriq <invites@mail.syntriqtech.com>",
    to: invitation.email,
    subject,
    html,
  });

  if (sendError) {
    console.error("Resend error:", sendError);
    return NextResponse.json({ error: "Failed to resend the invite email." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
