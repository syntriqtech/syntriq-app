import { createClient } from "@/lib/supabase/client";
import { getCurrentUserContext } from "@/lib/currentUserContext";

// A library of templates per organization (supabase/064 + 065) — an org can
// hold several (e.g. its own billing form AND a GC-specific one like a COBE
// spreadsheet) and pick which one to use per job on Download Package. Any
// org member can read the list; only the owner can add/enable/delete
// (RLS-enforced; the settings page also locks these controls for
// non-owners as a backstop).
export type BillingFormTemplate = {
  id: string;
  organizationId: string;
  name: string;
  enabled: boolean;
  filePath: string | null;
  fileName: string | null;
  // Cell-mapping JSON (see chat/plan) — hand-configured per template via a
  // one-off SQL update, never edited through this app's UI. Opaque here;
  // the fill generator (src/lib/billingWorkbookFill.ts) is what interprets it.
  fieldMapping: Record<string, unknown> | null;
};

type BillingFormTemplateRow = {
  id: string;
  organization_id: string;
  name: string;
  enabled: boolean;
  file_path: string | null;
  file_name: string | null;
  field_mapping: Record<string, unknown> | null;
};

function rowToTemplate(row: BillingFormTemplateRow): BillingFormTemplate {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    enabled: row.enabled,
    filePath: row.file_path,
    fileName: row.file_name,
    fieldMapping: row.field_mapping,
  };
}

const TEMPLATE_BUCKET = "billing-form-templates";

export async function fetchBillingFormTemplates(): Promise<BillingFormTemplate[]> {
  const supabase = createClient();
  const { organizationId } = await getCurrentUserContext();
  if (!organizationId) return [];

  const { data, error } = await supabase
    .from("billing_form_templates")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToTemplate);
}

// Each template gets its own storage path ({orgId}/{templateId}.xlsx), so
// the id is generated up front rather than left to the DB default — the
// upload and the row insert both need to agree on it.
export async function createBillingFormTemplate(name: string, file: File): Promise<BillingFormTemplate> {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("Template name is required.");

  const supabase = createClient();
  const { organizationId } = await getCurrentUserContext();
  if (!organizationId) throw new Error("Your account has no organization yet.");

  const id = crypto.randomUUID();
  const path = `${organizationId}/${id}.xlsx`;
  const buffer = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from(TEMPLATE_BUCKET)
    .upload(path, buffer, {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  if (uploadError) throw new Error(uploadError.message);

  const { data, error } = await supabase
    .from("billing_form_templates")
    .insert({ id, organization_id: organizationId, name: trimmedName, file_path: path, file_name: file.name })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToTemplate(data);
}

export async function renameBillingFormTemplate(templateId: string, name: string): Promise<BillingFormTemplate> {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("Template name is required.");

  const supabase = createClient();
  const { data, error } = await supabase
    .from("billing_form_templates")
    .update({ name: trimmedName, updated_at: new Date().toISOString() })
    .eq("id", templateId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToTemplate(data);
}

// Rejected by RLS unless the caller is the org owner AND field_mapping is
// already set — the mapping can only be set by hand (see chat/plan), so this
// double-checks client-side too rather than letting the UI offer a toggle
// that would just fail confusingly for a half-configured template.
export async function setBillingFormTemplateEnabled(templateId: string, enabled: boolean): Promise<BillingFormTemplate> {
  const supabase = createClient();

  const { data: existing, error: fetchError } = await supabase
    .from("billing_form_templates")
    .select("*")
    .eq("id", templateId)
    .single();
  if (fetchError) throw new Error(fetchError.message);
  if (!existing.file_path || !existing.field_mapping) {
    throw new Error("Upload a template and finish field-mapping setup before enabling it.");
  }

  const { data, error } = await supabase
    .from("billing_form_templates")
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq("id", templateId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToTemplate(data);
}

export async function deleteBillingFormTemplate(templateId: string, filePath: string | null): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("billing_form_templates").delete().eq("id", templateId);
  if (error) throw new Error(error.message);

  if (filePath) {
    await supabase.storage.from(TEMPLATE_BUCKET).remove([filePath]);
  }
}

export async function downloadBillingFormTemplateFile(filePath: string): Promise<ArrayBuffer> {
  const supabase = createClient();
  const { data, error } = await supabase.storage.from(TEMPLATE_BUCKET).download(filePath);
  if (error) throw new Error(error.message);
  return data.arrayBuffer();
}
