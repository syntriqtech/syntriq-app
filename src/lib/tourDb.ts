import { createClient } from "@/lib/supabase/client";

export type TourStatus = "not_started" | "in_progress" | "completed" | "skipped";

export type TourProgress = {
  phase1: TourStatus;
  phase2: TourStatus;
  lastStep: string | null;
};

function asStatus(value: unknown): TourStatus {
  return value === "in_progress" || value === "completed" || value === "skipped" ? value : "not_started";
}

/** A missing row or NULL columns both mean "never started". */
export async function fetchTourProgress(): Promise<TourProgress> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Not signed in.");

  const { data, error } = await supabase
    .from("user_profiles")
    .select("tour_phase1_status, tour_phase2_status, tour_last_step")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);

  return {
    phase1: asStatus(data?.tour_phase1_status),
    phase2: asStatus(data?.tour_phase2_status),
    lastStep: data?.tour_last_step ?? null,
  };
}

/** Saves only the fields passed in. Touches nothing but the tour columns. */
export async function saveTourProgress(patch: Partial<TourProgress>): Promise<void> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Not signed in.");

  const row: Record<string, unknown> = { user_id: userData.user.id };
  if (patch.phase1 !== undefined) row.tour_phase1_status = patch.phase1;
  if (patch.phase2 !== undefined) row.tour_phase2_status = patch.phase2;
  if (patch.lastStep !== undefined) row.tour_last_step = patch.lastStep;

  const { error } = await supabase.from("user_profiles").upsert(row, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
}
