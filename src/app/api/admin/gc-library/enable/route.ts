import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { requireAdmin } from "@/lib/adminGcLibraryShared";

// Copies a GC Library profile into one or more organizations' own
// general_contractors list (the same table the Customers page reads/writes)
// so it shows up for them exactly like a GC they typed in themselves — from
// then on it's a normal, independently editable row for that org, not a
// link back to the library entry. Skips an org that already has a GC with
// the same name rather than creating a duplicate.
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const { libraryId, organizationIds } = await req.json().catch(() => ({}));
  if (!libraryId || !Array.isArray(organizationIds) || organizationIds.length === 0) {
    return NextResponse.json({ error: "libraryId and at least one organizationId are required." }, { status: 400 });
  }

  const serviceRole = createServiceRoleClient();

  const { data: libraryGc, error: libraryError } = await serviceRole
    .from("gc_library")
    .select("*")
    .eq("id", libraryId)
    .single();
  if (libraryError || !libraryGc) {
    return NextResponse.json({ error: libraryError?.message ?? "GC not found in the library." }, { status: 404 });
  }

  const enabled: string[] = [];
  const skipped: { organizationId: string; reason: string }[] = [];

  for (const organizationId of organizationIds as string[]) {
    const [{ data: owner }, { data: existing }, { data: org }] = await Promise.all([
      serviceRole
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", organizationId)
        .eq("role", "owner")
        .limit(1)
        .maybeSingle(),
      serviceRole
        .from("general_contractors")
        .select("id")
        .eq("organization_id", organizationId)
        .ilike("name", libraryGc.name)
        .maybeSingle(),
      serviceRole.from("organizations").select("name").eq("id", organizationId).maybeSingle(),
    ]);

    const orgLabel = org?.name ?? organizationId;

    if (existing) {
      skipped.push({ organizationId: orgLabel, reason: "already has a GC with this name" });
      continue;
    }
    if (!owner) {
      skipped.push({ organizationId: orgLabel, reason: "no owner found for this account" });
      continue;
    }

    const { error: insertError } = await serviceRole.from("general_contractors").insert({
      organization_id: organizationId,
      user_id: owner.user_id,
      name: libraryGc.name,
      billing_address: libraryGc.billing_address,
      payment_terms: libraryGc.payment_terms,
      default_retention_pct: libraryGc.default_retention_pct,
      billing_platform: libraryGc.billing_platform,
      phone: libraryGc.phone,
      fax: libraryGc.fax,
      pm_name: libraryGc.pm_name,
      pm_email: libraryGc.pm_email,
      pm_mobile: libraryGc.pm_mobile,
    });

    if (insertError) {
      skipped.push({ organizationId: orgLabel, reason: insertError.message });
      continue;
    }
    enabled.push(orgLabel);
  }

  return NextResponse.json({ enabled, skipped });
}
