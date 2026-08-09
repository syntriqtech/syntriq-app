import { createClient } from "@/lib/supabase/client";

export type SidebarPrefs = {
  tabOrder: string[];
  hiddenTabs: string[];
};

export async function fetchSidebarPrefs(): Promise<SidebarPrefs | null> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data, error } = await supabase
    .from("sidebar_prefs")
    .select("tab_order, hidden_tabs")
    .eq("user_id", userData.user.id)
    .single();

  if (error && error.code !== "PGRST116") throw new Error(error.message);
  if (!data) return null;

  return {
    tabOrder: (data.tab_order as string[]) ?? [],
    hiddenTabs: (data.hidden_tabs as string[]) ?? [],
  };
}

export async function saveSidebarPrefs(tabOrder: string[], hiddenTabs: string[]): Promise<void> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return;

  const { error } = await supabase
    .from("sidebar_prefs")
    .upsert(
      {
        user_id: userData.user.id,
        tab_order: tabOrder,
        hidden_tabs: hiddenTabs,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (error) throw new Error(error.message);
}
