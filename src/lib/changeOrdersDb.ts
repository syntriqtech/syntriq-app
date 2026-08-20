import { createClient } from "@/lib/supabase/client";
import { getCurrentUserContext } from "@/lib/currentUserContext";
import { logActivity } from "@/lib/activityLogDb";

export type ChangeOrderStatus = "pending" | "submitted" | "approved" | "rejected" | "void";
export type SovImpactType = "new_line_item" | "existing_line_item";

export type ChangeOrder = {
  id: string;
  jobId: string;
  coNumber: string | null;
  pcoNumber: string | null;
  gcCoNumber: string | null;
  description: string;
  amount: number;
  materialsAmount: number | null;
  laborAmount: number | null;
  markupAmount: number | null;
  status: ChangeOrderStatus;
  dateSubmitted: string | null;
  dateApproved: string | null;
  gcApprovalReference: string;
  approvalDocUrl: string | null;
  retentionApplies: boolean;
  retentionRateOverride: number | null;
  sovImpactType: SovImpactType;
  sovLineItemId: string | null;
  timeImpactDays: number | null;
  appliedAt: string | null;
  createdSovItemId: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type CoRow = {
  id: string;
  job_id: string;
  co_number: string | null;
  pco_number: string | null;
  gc_co_number: string | null;
  description: string;
  amount: string | number;
  materials_amount: string | number | null;
  labor_amount: string | number | null;
  markup_amount: string | number | null;
  status: ChangeOrderStatus;
  date_submitted: string | null;
  date_approved: string | null;
  gc_approval_reference: string;
  approval_doc_url: string | null;
  retention_applies: boolean;
  retention_rate_override: string | number | null;
  sov_impact_type: SovImpactType;
  sov_line_item_id: string | null;
  time_impact_days: number | null;
  applied_at: string | null;
  created_sov_item_id: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

function rowToCo(row: CoRow): ChangeOrder {
  return {
    id: row.id,
    jobId: row.job_id,
    coNumber: row.co_number,
    pcoNumber: row.pco_number,
    gcCoNumber: row.gc_co_number,
    description: row.description,
    amount: Number(row.amount),
    materialsAmount: row.materials_amount != null ? Number(row.materials_amount) : null,
    laborAmount: row.labor_amount != null ? Number(row.labor_amount) : null,
    markupAmount: row.markup_amount != null ? Number(row.markup_amount) : null,
    status: row.status,
    dateSubmitted: row.date_submitted,
    dateApproved: row.date_approved,
    gcApprovalReference: row.gc_approval_reference,
    approvalDocUrl: row.approval_doc_url,
    retentionApplies: row.retention_applies,
    retentionRateOverride: row.retention_rate_override != null ? Number(row.retention_rate_override) : null,
    sovImpactType: row.sov_impact_type,
    sovLineItemId: row.sov_line_item_id,
    timeImpactDays: row.time_impact_days,
    appliedAt: row.applied_at,
    createdSovItemId: row.created_sov_item_id,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchNextCoNumber(jobId: string): Promise<string> {
  const supabase = createClient();
  const { data } = await supabase
    .from("change_orders")
    .select("co_number")
    .eq("job_id", jobId);
  const max = (data ?? []).reduce((m, row) => {
    const n = row.co_number && /^\d+$/.test(row.co_number) ? parseInt(row.co_number, 10) : 0;
    return Math.max(m, n);
  }, 0);
  return String(max + 1).padStart(3, "0");
}

export async function fetchChangeOrders(jobId?: string): Promise<ChangeOrder[]> {
  const supabase = createClient();
  let query = supabase
    .from("change_orders")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (jobId) query = query.eq("job_id", jobId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToCo);
}

export type CreateCoInput = {
  jobId: string;
  description: string;
  amount: number;
  pcoNumber?: string;
  approvalDocUrl?: string;
  materialsAmount?: number | null;
  laborAmount?: number | null;
  markupAmount?: number | null;
  dateSubmitted?: string | null;
};

export async function createChangeOrder(input: CreateCoInput): Promise<ChangeOrder> {
  const supabase = createClient();
  const { userId, organizationId } = await getCurrentUserContext();

  const { data, error } = await supabase
    .from("change_orders")
    .insert({
      job_id: input.jobId,
      user_id: userId,
      organization_id: organizationId,
      description: input.description,
      amount: input.amount,
      pco_number: input.pcoNumber || null,
      approval_doc_url: input.approvalDocUrl || null,
      materials_amount: input.materialsAmount ?? null,
      labor_amount: input.laborAmount ?? null,
      markup_amount: input.markupAmount ?? null,
      date_submitted: input.dateSubmitted || null,
      status: "pending",
      retention_applies: true,
      sov_impact_type: "new_line_item",
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  const created = rowToCo(data);
  logActivity(
    "change_order.created",
    "change_order",
    created.id,
    `${created.pcoNumber || created.coNumber || "CO"} — ${created.description}`
  ).catch(() => {});
  return created;
}

export type UpdateCoInput = {
  coNumber?: string | null;
  pcoNumber?: string | null;
  gcCoNumber?: string | null;
  description?: string;
  amount?: number;
  gcApprovalReference?: string;
  approvalDocUrl?: string | null;
  retentionApplies?: boolean;
  retentionRateOverride?: number | null;
  sovImpactType?: SovImpactType;
  sovLineItemId?: string | null;
  timeImpactDays?: number | null;
  dateSubmitted?: string | null;
  dateApproved?: string | null;
};

function toDbColumns(fields: UpdateCoInput): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (fields.coNumber !== undefined) out.co_number = fields.coNumber;
  if (fields.pcoNumber !== undefined) out.pco_number = fields.pcoNumber;
  if (fields.gcCoNumber !== undefined) out.gc_co_number = fields.gcCoNumber;
  if (fields.description !== undefined) out.description = fields.description;
  if (fields.amount !== undefined) out.amount = fields.amount;
  if (fields.gcApprovalReference !== undefined) out.gc_approval_reference = fields.gcApprovalReference;
  if (fields.approvalDocUrl !== undefined) out.approval_doc_url = fields.approvalDocUrl;
  if (fields.retentionApplies !== undefined) out.retention_applies = fields.retentionApplies;
  if (fields.retentionRateOverride !== undefined) out.retention_rate_override = fields.retentionRateOverride;
  if (fields.sovImpactType !== undefined) out.sov_impact_type = fields.sovImpactType;
  if (fields.sovLineItemId !== undefined) out.sov_line_item_id = fields.sovLineItemId;
  if (fields.timeImpactDays !== undefined) out.time_impact_days = fields.timeImpactDays;
  if (fields.dateSubmitted !== undefined) out.date_submitted = fields.dateSubmitted;
  if (fields.dateApproved !== undefined) out.date_approved = fields.dateApproved;
  return out;
}

export async function updateChangeOrder(id: string, fields: UpdateCoInput): Promise<ChangeOrder> {
  const supabase = createClient();
  const updates = { ...toDbColumns(fields), updated_at: new Date().toISOString() };
  const { data, error } = await supabase
    .from("change_orders")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToCo(data);
}

export async function setChangeOrderStatus(
  id: string,
  status: ChangeOrderStatus,
  extra?: { gcApprovalReference?: string; approvalDocUrl?: string }
): Promise<ChangeOrder> {
  const supabase = createClient();
  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === "submitted") updates.date_submitted = new Date().toISOString().slice(0, 10);
  if (status === "approved") {
    updates.date_approved = new Date().toISOString().slice(0, 10);
    if (extra?.gcApprovalReference) updates.gc_approval_reference = extra.gcApprovalReference;
    if (extra?.approvalDocUrl) updates.approval_doc_url = extra.approvalDocUrl;
  }
  const { data, error } = await supabase
    .from("change_orders")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  const updated = rowToCo(data);

  if (status === "approved" || status === "rejected" || status === "void") {
    logActivity(
      "change_order.status_changed",
      "change_order",
      updated.id,
      `${updated.pcoNumber || updated.coNumber || "CO"} → ${status}`
    ).catch(() => {});
  }

  return updated;
}

export async function applyChangeOrder(id: string): Promise<void> {
  const supabase = createClient();

  const { userId, organizationId } = await getCurrentUserContext();

  const { data: coRow, error: coError } = await supabase
    .from("change_orders")
    .select("*")
    .eq("id", id)
    .single();
  if (coError) throw new Error(coError.message);
  const co = rowToCo(coRow);

  if (co.status !== "approved") throw new Error("CO must be in Approved status before applying.");
  if (co.appliedAt) throw new Error("This CO has already been applied to the SOV.");

  // Find the latest SOV application for this job
  const { data: latestAppRows, error: appError } = await supabase
    .from("sov_line_items")
    .select("application_number, application_date, period_to")
    .eq("job_id", co.jobId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (appError) throw new Error(appError.message);

  if (!latestAppRows || latestAppRows.length === 0) {
    throw new Error("No Schedule of Values found for this job. Save an SOV application first.");
  }
  const { application_number, application_date, period_to } = latestAppRows[0];

  if (co.sovImpactType === "new_line_item") {
    const { data: existingCOs } = await supabase
      .from("sov_line_items")
      .select("sort_order")
      .eq("job_id", co.jobId)
      .eq("application_number", application_number)
      .eq("kind", "change_order")
      .order("sort_order", { ascending: false })
      .limit(1);

    const nextSortOrder = existingCOs && existingCOs.length > 0 ? (existingCOs[0].sort_order ?? 0) + 1 : 100;
    const itemLabel = co.coNumber ?? co.pcoNumber ?? `CO`;

    const { data: newRow, error: insertError } = await supabase
      .from("sov_line_items")
      .insert({
        job_id: co.jobId,
        user_id: userId,
        organization_id: organizationId,
        application_number,
        application_date,
        period_to,
        kind: "change_order",
        item: itemLabel,
        description: co.description,
        scheduled_value: co.amount,
        previous_applications: 0,
        this_period: 0,
        stored_materials: 0,
        sort_order: nextSortOrder,
      })
      .select("id")
      .single();
    if (insertError) throw new Error(`Failed to create SOV line: ${insertError.message}`);

    await supabase
      .from("change_orders")
      .update({ applied_at: new Date().toISOString(), created_sov_item_id: newRow.id, updated_at: new Date().toISOString() })
      .eq("id", id);
  } else {
    if (!co.sovLineItemId) throw new Error("No target SOV line item set on this CO.");

    const { data: targetLine, error: targetError } = await supabase
      .from("sov_line_items")
      .select("scheduled_value")
      .eq("id", co.sovLineItemId)
      .single();
    if (targetError) throw new Error(targetError.message);

    const newValue = Number(targetLine.scheduled_value) + co.amount;
    const { error: updateError } = await supabase
      .from("sov_line_items")
      .update({ scheduled_value: newValue })
      .eq("id", co.sovLineItemId);
    if (updateError) throw new Error(updateError.message);

    await supabase
      .from("change_orders")
      .update({ applied_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", id);
  }
}

export async function fetchCoExposure(): Promise<{ amount: number; count: number; readyToApplyCount: number }> {
  const supabase = createClient();

  const [{ data: exposureData, error: e1 }, { data: readyData, error: e2 }] = await Promise.all([
    supabase
      .from("change_orders")
      .select("amount")
      .in("status", ["pending", "submitted"])
      .is("deleted_at", null),
    supabase
      .from("change_orders")
      .select("id")
      .eq("status", "approved")
      .is("applied_at", null)
      .is("deleted_at", null),
  ]);
  if (e1) throw new Error(e1.message);
  if (e2) throw new Error(e2.message);

  const amount = (exposureData ?? []).reduce((sum, row) => sum + Number(row.amount), 0);
  return {
    amount,
    count: (exposureData ?? []).length,
    readyToApplyCount: (readyData ?? []).length,
  };
}

export async function softDeleteChangeOrder(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("change_orders")
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function fetchDeletedChangeOrders(jobId?: string): Promise<ChangeOrder[]> {
  const supabase = createClient();
  let query = supabase
    .from("change_orders")
    .select("*")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });
  if (jobId) query = query.eq("job_id", jobId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToCo);
}

export async function restoreChangeOrder(id: string): Promise<ChangeOrder> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("change_orders")
    .update({ deleted_at: null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToCo(data);
}

export async function uploadCoDocument(coId: string, file: File): Promise<string> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? "anon";
  const ext = file.name.split(".").pop() ?? "bin";
  const path = `${userId}/${coId}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from("co-documents").upload(path, file);
  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  const { data: urlData } = supabase.storage.from("co-documents").getPublicUrl(path);
  return urlData.publicUrl;
}
