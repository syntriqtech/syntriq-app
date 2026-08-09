"use client";

import { useEffect, useState } from "react";
import { fetchBillingCheckinPendingCount } from "@/lib/billingCheckinDb";
import { useJobs } from "@/hooks/useJobs";

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export function useBillingCheckinBadge() {
  const [pendingCount, setPendingCount] = useState(0);
  const { jobs } = useJobs();

  useEffect(() => {
    let cancelled = false;

    function refresh() {
      fetchBillingCheckinPendingCount(currentMonth())
        .then((count) => { if (!cancelled) setPendingCount(count); })
        .catch(() => { if (!cancelled) setPendingCount(0); });
    }

    refresh();
    window.addEventListener("syntriq:billing-checkin-updated", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("syntriq:billing-checkin-updated", refresh);
    };
  }, [jobs]);

  return { pendingCount };
}
