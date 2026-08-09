"use client";

import { useEffect, useState } from "react";
import { fetchCoExposure } from "@/lib/changeOrdersDb";

export type CoExposureData = {
  amount: number;
  count: number;
  readyToApplyCount: number;
};

export function useCoExposure() {
  const [data, setData] = useState<CoExposureData>({ amount: 0, count: 0, readyToApplyCount: 0 });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetchCoExposure()
      .then((result) => { if (!cancelled) setData(result); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { ...data, isLoading };
}
