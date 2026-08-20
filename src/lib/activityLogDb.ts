import { createClient } from "@/lib/supabase/client";
import { getCurrentUserContext } from "@/lib/currentUserContext";

export type ActivityLogEntry = {
  id: string;
  userId: string;
  actorName: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  detail: string;
  createdAt: string;
};

type ActivityLogRow = {
  id: string;
  user_id: string;
  actor_name: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  detail: string | null;
  created_at: string;
};

function rowToEntry(row: ActivityLogRow): ActivityLogEntry {
  return {
    id: row.id,
    userId: row.user_id,
    actorName: row.actor_name || "",
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    detail: row.detail ?? "",
    createdAt: row.created_at,
  };
}

export async function fetchActivityLog(): Promise<ActivityLogEntry[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("list_activity_log");
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToEntry);
}

// Best-effort, fire-and-forget by design — callers should never await this
// with a throwing catch; a logging failure must never block or fail the
// actual user action. Use as: logActivity(...).catch(() => {}).
export async function logActivity(
  action: string,
  entityType: string | null,
  entityId: string | null,
  detail: string
): Promise<void> {
  const supabase = createClient();
  const { userId, organizationId } = await getCurrentUserContext();
  if (!organizationId) return; // no org yet — nothing to log against

  const { error } = await supabase.from("activity_log").insert({
    organization_id: organizationId,
    user_id: userId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    detail,
  });
  if (error) throw new Error(error.message);
}
