"use client";

import { useEffect, useState } from "react";
import { fetchTrialStatus, type TrialStatus } from "@/lib/trialStatusDb";

export function useTrialStatus() {
  const [status, setStatus] = useState<TrialStatus>(null);

  useEffect(() => {
    let cancelled = false;
    fetchTrialStatus()
      .then((result) => { if (!cancelled) setStatus(result); })
      .catch(() => { if (!cancelled) setStatus(null); });
    return () => { cancelled = true; };
  }, []);

  return status;
}
