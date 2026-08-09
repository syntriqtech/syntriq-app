"use client";

import { useEffect, useState } from "react";
import { fetchRetentionSummaryLight } from "@/lib/retentionData";
import { useJobs } from "@/hooks/useJobs";

export function useRetentionBadge() {
  const [readyToBillCount, setReadyToBillCount] = useState(0);
  const { jobs } = useJobs();

  useEffect(() => {
    let cancelled = false;

    function refresh() {
      fetchRetentionSummaryLight()
        .then((s) => { if (!cancelled) setReadyToBillCount(s.readyToBillCount); })
        .catch(() => {});
    }

    refresh();
    window.addEventListener("syntriq:retention-updated", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("syntriq:retention-updated", refresh);
    };
  }, [jobs]);

  return { readyToBillCount };
}
