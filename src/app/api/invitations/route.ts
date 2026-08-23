import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";
import { buildInviteEmail } from "@/lib/inviteEmailTemplate";

const resend = new Resend(process.env.RESEND_API_KEY);

// A server route (not a raw client insert) so the seat-cap and
// duplicate-pending checks in create_invitation() run before the email
// goes out, and so RESEND_API_KEY never touches the client.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { email, role } = await req.json().catch(() => ({}));
  if (!email || !role) {
    return NextResponse.json({ error: "Email and role are required." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("create_invitation", { p_email: email, p_role: role });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const row = data?.[0];
  if (!row) {
    return NextResponse.json({ error: "Could not create this invite." }, { status: 500 });
  }

  const [{ data: orgId }, { data: profile }] = await Promise.all([
    supabase.rpc("get_my_organization_id"),
    supabase.from("user_profiles").select("full_name").eq("user_id", user.id).maybeSingle(),
  ]);

  const { data: org } = await supabase.from("organizations").select("name").eq("id", orgId).maybeSingle();

  const { subject, html } = buildInviteEmail({
    inviterName: profile?.full_name || user.email || "A teammate",
    organizationName: org?.name || "your organization",
    role,
    acceptUrl: `${req.nextUrl.origin}/accept-invite?token=${row.token}`,
  });

  const { error: sendError } = await resend.emails.send({
    from: "Syntriq <onboarding@resend.dev>",
    to: email,
    subject,
    html,
  });

  if (sendError) {
    console.error("Resend error:", sendError);
    return NextResponse.json(
      { error: "The invite was saved but the email failed to send. Try Resend from the Team & Users page." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, isResend: row.is_resend });
}
