"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getCurrentUserContext } from "@/lib/currentUserContext";
import { resolveEffectivePlan } from "@/lib/orgPlan";
import { Plan } from "@/lib/planLimits";

export function usePlan(): { plan: Plan | null; isLoading: boolean } {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    getCurrentUserContext()
      .then(async (ctx) => {
        if (!ctx.organizationId) return;
        const supabase = createClient();
        const { data: org } = await supabase
          .from("organizations")
          .select("plan, subscription_status")
          .eq("id", ctx.organizationId)
          .single();
        if (!cancelled && org) {
          setPlan(resolveEffectivePlan(org.plan, org.subscription_status));
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { plan, isLoading };
}
