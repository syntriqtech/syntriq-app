// One-off setup script for Axis Mechanical Inc's "Subcontractor Application
// for Payment" billing form — mirrors setup-cobe-billing-template.mjs, but
// simpler: Axis's 120 named AcroForm fields have no cross-page name
// collisions, so the source file is uploaded as-is (both pages kept, since
// page 2 — Axis's Change Order form — is wired up later). The fill/flatten
// step that drops page 2 from the *generated* output happens at fill time
// (src/lib/axisBillingPdfFill.ts), not here.
//
// Usage: node --env-file=.env.local scripts/setup-axis-billing-template.mjs <organizationId>

import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const organizationId = process.argv[2];
if (!organizationId) {
  console.error("Usage: node --env-file=.env.local scripts/setup-axis-billing-template.mjs <organizationId>");
  process.exit(1);
}

const SOURCE_PDF = "Axis_Mechanical_Pay_App_Template_Fillable.pdf";

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const bytes = fs.readFileSync(SOURCE_PDF);

  // Versioned filename rather than a fixed one — re-uploading to the same
  // path with upsert doesn't reliably bust Supabase's/edge caching for
  // everyone, so a fresh path avoids serving a stale download (same
  // reasoning as the COBE script).
  const filePath = `${organizationId}/axis-mechanical-billing-form-v1.pdf`;

  const { error: uploadError } = await supabase.storage
    .from("billing-form-templates")
    .upload(filePath, bytes, { contentType: "application/pdf", upsert: true });
  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
  console.log("Uploaded template to", filePath, `(${bytes.length} bytes)`);

  const row = {
    name: "Axis Mechanical — Pay Application",
    file_name: "Axis Mechanical Subcontractor Application for Payment.pdf",
    // Axis's field names are hardcoded in axisBillingPdfFill.ts (a fixed
    // GC-provided layout, not a per-org configurable mapping) — this JSON
    // only needs to carry the "kind" tag so Download Package's dispatch
    // and the enable-requires-mapping check both see a non-null mapping.
    field_mapping: { kind: "pdf-axis" },
  };

  const { data: existing } = await supabase
    .from("billing_form_templates")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("name", row.name)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("billing_form_templates")
      .update({ file_path: filePath, file_name: row.file_name, field_mapping: row.field_mapping, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) throw new Error(`Update failed: ${error.message}`);
    console.log("Updated row:", row.name, existing.id);
  } else {
    const { data, error } = await supabase
      .from("billing_form_templates")
      .insert({ organization_id: organizationId, enabled: true, file_path: filePath, ...row })
      .select("id, name")
      .single();
    if (error) throw new Error(`Insert failed: ${error.message}`);
    console.log("Inserted row:", data.name, data.id);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
