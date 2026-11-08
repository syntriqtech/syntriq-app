// One-off setup script: adds (or refreshes) "CTI Billing Form PDF" next to
// "CTI Billing Form" in every organization's Custom Billing Forms.
//
// It is the same workbook and the same cell mapping as the Excel form — the
// only difference is field_mapping.kind = "pdf-cti", which tells Download
// Package to fill the workbook and then hand back a PDF of its Invoice Cover,
// Payment Application and Schedule of Values sheets instead of the .xlsx.
//
// (Claimant titles on the 4 waiver sheets are mapped to signer.title separately.)
// Usage: node --env-file=.env.local scripts/setup-cti-pdf-billing-template.mjs

import { createClient } from "@supabase/supabase-js";

const NAME = "CTI Billing Form PDF";
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: rows, error } = await supabase
  .from("billing_form_templates")
  .select("id, organization_id, name, file_path, file_name, field_mapping");
if (error) throw error;

for (const src of rows.filter((r) => r.name.toLowerCase() === "cti billing form")) {
  const fieldMapping = { ...src.field_mapping, kind: "pdf-cti" };
  const existing = rows.find((r) => r.organization_id === src.organization_id && r.name === NAME);
  const values = { file_path: src.file_path, file_name: src.file_name, field_mapping: fieldMapping, enabled: true };
  const { error: writeError } = existing
    ? await supabase.from("billing_form_templates").update(values).eq("id", existing.id)
    : await supabase.from("billing_form_templates").insert({ organization_id: src.organization_id, name: NAME, ...values });
  console.log(src.organization_id.slice(0, 8), writeError ? `FAILED: ${writeError.message}` : `${existing ? "updated" : "added"} ${NAME}`);
}
