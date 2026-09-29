"use client";

import { useCallback, useEffect, useState } from "react";
import { useJobs } from "@/hooks/useJobs";
import { fetchArchivedJobs, DbJob } from "@/lib/jobs";
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
  // Active + archived jobs, for resolving job names in historical billing
  // views (e.g. the Monthly Billing drilldown) — a past month's billing
  // routinely includes jobs that have since been archived, and `jobs` above
  // is active-only by design (it drives the "Active jobs" cards).
  const [archivedJobs, setArchivedJobs] = useState<DbJob[]>([]);
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
    const archivedJobsPromise = fetchArchivedJobs();

    Promise.all([jobMetricsPromise, activityPromise, archivedJobsPromise])
      .then(([metrics, { applications: apps, payments }, archived]) => {
        if (cancelled) return;
        setJobMetrics(metrics);
        setApplications(apps);
        setArchivedJobs(archived);
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

  return {
    jobMetrics,
    applications,
    aging,
    chart,
    billedMonthComparison,
    jobsForReporting: [...jobs, ...archivedJobs],
    isLoading: isLoadingJobs || isLoadingMetrics,
    reload,
  };
}
