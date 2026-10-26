import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { requireAdmin } from "@/lib/adminGcLibraryShared";

// Toggles a single org's billing form template on/off — the same switch
// company-profile's own Custom Billing Forms section has, just reachable
// without signing in as that account.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }
  const { id } = await params;

  const { enabled } = await req.json().catch(() => ({}));
  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "enabled (boolean) is required." }, { status: 400 });
  }

  const serviceRole = createServiceRoleClient();

  if (enabled) {
    const { data: existing, error: fetchError } = await serviceRole
      .from("billing_form_templates")
      .select("file_path, field_mapping")
      .eq("id", id)
      .single();
    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }
    if (!existing.file_path || !existing.field_mapping) {
      return NextResponse.json({ error: "This template has no file or field mapping configured yet." }, { status: 400 });
    }
  }

  const { data, error } = await serviceRole
    .from("billing_form_templates")
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, enabled")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ template: data });
}
