import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { requireAdmin } from "@/lib/adminGcLibraryShared";

// Platform admin only: every Custom Billing Form row across every
// organization, so the Syntriq team can see at a glance which accounts
// have which GC-specific form enabled, and copy an already-configured one
// (file + hand-authored field mapping) into another account instead of
// re-running a one-off provisioning script.
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const serviceRole = createServiceRoleClient();
  const { data, error } = await serviceRole
    .from("billing_form_templates")
    .select("id, organization_id, name, enabled, file_path, file_name, field_mapping, organizations(name)")
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ templates: data });
}
