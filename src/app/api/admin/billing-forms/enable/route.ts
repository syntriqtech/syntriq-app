import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { requireAdmin } from "@/lib/adminGcLibraryShared";

// Copies an already-configured billing form template (file_path + the
// hand-authored field_mapping — never re-derived here, just reused as-is)
// into one or more other organizations' own billing_form_templates list,
// enabled immediately. file_path points at the source org's folder in the
// (public) billing-form-templates bucket — reused directly rather than
// re-uploaded, since the stored PDF/workbook itself isn't org-specific.
// Skips an org that already has a template with the same name rather than
// creating a duplicate.
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const { sourceTemplateId, organizationIds } = await req.json().catch(() => ({}));
  if (!sourceTemplateId || !Array.isArray(organizationIds) || organizationIds.length === 0) {
    return NextResponse.json({ error: "sourceTemplateId and at least one organizationId are required." }, { status: 400 });
  }

  const serviceRole = createServiceRoleClient();

  const { data: source, error: sourceError } = await serviceRole
    .from("billing_form_templates")
    .select("name, file_path, file_name, field_mapping")
    .eq("id", sourceTemplateId)
    .single();
  if (sourceError || !source) {
    return NextResponse.json({ error: sourceError?.message ?? "Source template not found." }, { status: 404 });
  }
  if (!source.file_path || !source.field_mapping) {
    return NextResponse.json({ error: "This template has no file or field mapping configured yet." }, { status: 400 });
  }

  const enabled: string[] = [];
  const skipped: { organizationId: string; reason: string }[] = [];

  for (const organizationId of organizationIds as string[]) {
    const [{ data: existing }, { data: org }] = await Promise.all([
      serviceRole
        .from("billing_form_templates")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("name", source.name)
        .maybeSingle(),
      serviceRole.from("organizations").select("name").eq("id", organizationId).maybeSingle(),
    ]);

    const orgLabel = org?.name ?? organizationId;

    if (existing) {
      skipped.push({ organizationId: orgLabel, reason: "already has this form" });
      continue;
    }

    const { error: insertError } = await serviceRole.from("billing_form_templates").insert({
      organization_id: organizationId,
      name: source.name,
      file_path: source.file_path,
      file_name: source.file_name,
      field_mapping: source.field_mapping,
      enabled: true,
    });

    if (insertError) {
      skipped.push({ organizationId: orgLabel, reason: insertError.message });
      continue;
    }
    enabled.push(orgLabel);
  }

  return NextResponse.json({ enabled, skipped });
}
