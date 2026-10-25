import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { isAdminEmail } from "@/lib/adminEmails";

// Platform admin only: lists every signed-up user across every company,
// with their organization, role, and trial/subscription status. Needs the
// service-role client since this deliberately reads across all
// organizations (RLS scopes everything else in the app to one org).
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isAdminEmail(user?.email)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const serviceRole = createServiceRoleClient();

  const [{ data: authData, error: authError }, { data: members, error: membersError }] = await Promise.all([
    serviceRole.auth.admin.listUsers({ perPage: 1000 }),
    serviceRole
      .from("organization_members")
      .select(
        "user_id, role, organization_id, organizations(id, name, plan, subscription_status, current_period_end, billing_interval)"
      ),
  ]);

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 });
  }
  if (membersError) {
    return NextResponse.json({ error: membersError.message }, { status: 500 });
  }

  type MembershipRow = {
    user_id: string;
    role: string;
    organization_id: string;
    organizations: {
      id: string;
      name: string;
      plan: string | null;
      subscription_status: string | null;
      current_period_end: string | null;
      billing_interval: string | null;
    } | null;
  };

  const membershipsByUser = new Map<string, MembershipRow[]>();
  for (const row of (members ?? []) as unknown as MembershipRow[]) {
    const list = membershipsByUser.get(row.user_id) ?? [];
    list.push(row);
    membershipsByUser.set(row.user_id, list);
  }

  const users = (authData?.users ?? [])
    .map((authUser) => ({
      id: authUser.id,
      email: authUser.email ?? "",
      createdAt: authUser.created_at,
      lastSignInAt: authUser.last_sign_in_at ?? null,
      memberships: (membershipsByUser.get(authUser.id) ?? []).map((m) => ({
        role: m.role,
        organizationId: m.organization_id,
        organizationName: m.organizations?.name ?? "Unknown",
        plan: m.organizations?.plan ?? null,
        subscriptionStatus: m.organizations?.subscription_status ?? null,
        currentPeriodEnd: m.organizations?.current_period_end ?? null,
        billingInterval: m.organizations?.billing_interval ?? null,
      })),
    }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return NextResponse.json({ users });
}
