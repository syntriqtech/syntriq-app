"use client";

import { useCallback, useEffect, useState } from "react";
import { useJobs } from "@/hooks/useJobs";
import {
  computeAllJobMetrics,
  computeAgingBuckets,
  computeMonthlyBillingChart,
  computeBilledMonthComparison,
  fetchBillingActivity,
  JobMetrics,
  AgingBucket,
  BilledMonthComparison,
} from "@/lib/dashboardMetrics";
import { PayApplication } from "@/lib/payApplicationsDb";

export function useDashboardMetrics() {
  const { jobs, isLoading: isLoadingJobs } = useJobs();
  const [jobMetrics, setJobMetrics] = useState<JobMetrics[]>([]);
  const [applications, setApplications] = useState<PayApplication[]>([]);
  const [aging, setAging] = useState<{ total: number; buckets: AgingBucket[] }>({ total: 0, buckets: [] });
  const [chart, setChart] = useState<{ monthLabels: string[]; monthKeys: string[]; billed: number[] }>({
    monthLabels: [],
    monthKeys: [],
    billed: [],
  });
  const [billedMonthComparison, setBilledMonthComparison] = useState<BilledMonthComparison>({
    thisMonth: 0,
    lastMonth: 0,
    percentChange: null,
  });
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingMetrics(true);

    const jobMetricsPromise = jobs.length > 0 ? computeAllJobMetrics(jobs) : Promise.resolve([]);
    const activityPromise = fetchBillingActivity();

    Promise.all([jobMetricsPromise, activityPromise])
      .then(([metrics, { applications: apps, payments }]) => {
        if (cancelled) return;
        setJobMetrics(metrics);
        setApplications(apps);
        setAging(computeAgingBuckets(apps, payments));
        setChart(computeMonthlyBillingChart(apps));
        setBilledMonthComparison(computeBilledMonthComparison(apps));
      })
      .finally(() => {
        if (!cancelled) setIsLoadingMetrics(false);
      });

    return () => {
      cancelled = true;
    };
  }, [jobs, reloadKey]);

  return { jobMetrics, applications, aging, chart, billedMonthComparison, isLoading: isLoadingJobs || isLoadingMetrics, reload };
}
