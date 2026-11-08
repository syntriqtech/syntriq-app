// One-off setup script: adds (or refreshes) "CTI Billing Form PDF" and
// "Cahill Billing Form PDF" next to their Excel forms in every organization's
// Custom Billing Forms.
//
// It is the same workbook and the same cell mapping as the Excel form — the
// only difference is field_mapping.kind ("pdf-cti" / "pdf-cahill"), which tells
// Download Package to fill the workbook and hand back a PDF of its sheets
// instead of the .xlsx.
//
// (Claimant titles on the 4 waiver sheets are mapped to signer.title separately.)
// Usage: node --env-file=.env.local scripts/setup-cti-pdf-billing-template.mjs

import { createClient } from "@supabase/supabase-js";

const FORMS = [
  { source: "cti billing form", name: "CTI Billing Form PDF", kind: "pdf-cti" },
  { source: "cahill billing form", name: "Cahill Billing Form PDF", kind: "pdf-cahill" },
];
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: rows, error } = await supabase
  .from("billing_form_templates")
  .select("id, organization_id, name, file_path, file_name, field_mapping");
if (error) throw error;

for (const { source, name: NAME, kind } of FORMS)
for (const src of rows.filter((r) => r.name.toLowerCase() === source)) {
  const fieldMapping = { ...src.field_mapping, kind };
  const existing = rows.find((r) => r.organization_id === src.organization_id && r.name === NAME);
  const values = { file_path: src.file_path, file_name: src.file_name, field_mapping: fieldMapping, enabled: true };
  const { error: writeError } = existing
    ? await supabase.from("billing_form_templates").update(values).eq("id", existing.id)
    : await supabase.from("billing_form_templates").insert({ organization_id: src.organization_id, name: NAME, ...values });
  console.log(src.organization_id.slice(0, 8), writeError ? `FAILED: ${writeError.message}` : `${existing ? "updated" : "added"} ${NAME}`);
}
