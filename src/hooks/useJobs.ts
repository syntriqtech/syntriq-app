"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJobs, DbJob } from "@/lib/jobs";

export function useJobs() {
  const [jobs, setJobs] = useState<DbJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(async () => {
    setIsLoading(true);
    try {
      const raw = await fetchJobs();
      setJobs(raw.sort((a, b) => {
        const na = parseFloat(a.jobNumber), nb = parseFloat(b.jobNumber);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        return a.jobNumber.localeCompare(b.jobNumber);
      }));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { jobs, isLoading, reload, setJobs };
}
