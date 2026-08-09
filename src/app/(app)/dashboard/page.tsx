"use client";

import { useState } from "react";
import Link from "next/link";
import KpiStrip from "@/components/KpiStrip";
import CoExposureTile from "@/components/CoExposureTile";
import BillingCheckinTile from "@/components/BillingCheckinTile";
import ActiveJobCard from "@/components/ActiveJobCard";
import OpenARWidget from "@/components/OpenARWidget";
import OutstandingPaymentsCard from "@/components/OutstandingPaymentsCard";
import BilledMonthComparisonCard from "@/components/BilledMonthComparisonCard";
import BillingDueWidget from "@/components/BillingDueWidget";
import MonthlyBillingChart from "@/components/MonthlyBillingChart";
import MonthlyBillingDrilldownModal from "@/components/MonthlyBillingDrilldownModal";
import { useJobs } from "@/hooks/useJobs";
import { useDashboardMetrics } from "@/hooks/useDashboardMetrics";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function DashboardPage() {
  const { jobs, isLoading: isLoadingJobs } = useJobs();
  const { jobMetrics, applications, aging, chart, billedMonthComparison, isLoading } = useDashboardMetrics();
  const [drilldownMonth, setDrilldownMonth] = useState<string | null>(null);


  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const activeProjects = jobMetrics.filter((j) => j.status === "Active").length;
  const totalContractValue = jobMetrics.reduce((sum, j) => sum + j.contractValue, 0);
  const billedToDate = jobMetrics.reduce((sum, j) => sum + j.billedToDate, 0);
  const outstanding = jobMetrics.reduce((sum, j) => sum + (j.billedToDate - j.retention), 0);
  const billedPercentOfContract = totalContractValue !== 0 ? Math.round((billedToDate / totalContractValue) * 100) : 0;

  const kpiStrip = [
    {
      label: "Active projects",
      value: isLoading ? "—" : String(activeProjects),
      delta: `${jobMetrics.length} job${jobMetrics.length === 1 ? "" : "s"} total`,
      direction: "plain" as const,
    },
    {
      label: "Total contract value",
      value: isLoading ? "—" : currency.format(totalContractValue),
      delta: "including change orders",
      direction: "plain" as const,
    },
    {
      label: "Billed to date",
      value: isLoading ? "—" : currency.format(billedToDate),
      delta: `${billedPercentOfContract}% of contract`,
      direction: "plain" as const,
    },
    {
      label: "Outstanding",
      value: isLoading ? "—" : currency.format(outstanding),
      delta: "earned less retention",
      direction: "plain" as const,
    },
  ];


  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">{today}</p>
        </div>
        <Link
          href="/sov"
          className="flex-none rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal/90"
        >
          + New pay application
        </Link>
      </div>

      <KpiStrip items={kpiStrip} />

      <CoExposureTile />
      <BillingCheckinTile />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <OpenARWidget jobs={jobs} isLoadingJobs={isLoadingJobs} />
        </div>
        <OutstandingPaymentsCard total={aging.total} buckets={aging.buckets} />
      </div>

      <BilledMonthComparisonCard
        thisMonth={billedMonthComparison.thisMonth}
        lastMonth={billedMonthComparison.lastMonth}
        percentChange={billedMonthComparison.percentChange}
        isLoading={isLoading}
      />

      <MonthlyBillingChart
        monthLabels={chart.monthLabels}
        monthKeys={chart.monthKeys}
        billed={chart.billed}
        onMonthClick={(monthKey) => setDrilldownMonth(monthKey)}
      />

      {drilldownMonth && (
        <MonthlyBillingDrilldownModal
          monthKey={drilldownMonth}
          applications={applications}
          jobs={jobs}
          onClose={() => setDrilldownMonth(null)}
        />
      )}

      <BillingDueWidget jobs={jobs} isLoadingJobs={isLoadingJobs} />

      <div>
        <h2 className="mb-3 text-lg font-bold text-navy">Active jobs</h2>
        {isLoading && <p className="text-sm text-gray-500">Loading jobs…</p>}
        {!isLoading && jobMetrics.length === 0 && (
          <p className="text-sm text-gray-500">No jobs yet — add one in Job Setup.</p>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {jobMetrics.map((job) => (
            <ActiveJobCard key={job.jobNumber} job={job} />
          ))}
        </div>
      </div>
    </div>
  );
}
