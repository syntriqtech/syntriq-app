"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useJobs } from "@/hooks/useJobs";
import { computeAllJobMetrics } from "@/lib/dashboardMetrics";
import DonutPercent from "@/components/DonutPercent";

function extractCity(address: string): string {
  if (!address) return "—";
  const parts = address.split(",").map((p) => p.trim());
  if (parts.length >= 3) return parts[parts.length - 2];
  if (parts.length === 2) return parts[1];
  return address;
}

function numericSort(a: string, b: string): number {
  const na = parseFloat(a),
    nb = parseFloat(b);
  return !isNaN(na) && !isNaN(nb) ? na - nb : a.localeCompare(b);
}

type JobRow = {
  id: string;
  jobName: string;
  jobNumber: string;
  customer: string;
  percentComplete: number;
  ctiPm: string;
  city: string;
  archProjectNumber: string;
  billingPlatform: string;
};

export default function JobsPage() {
  const router = useRouter();
  const { jobs, isLoading: isLoadingJobs } = useJobs();
  const [rows, setRows] = useState<JobRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"jobNumber" | "percent">("jobNumber");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    if (isLoadingJobs) return;
    if (jobs.length === 0) {
      setRows([]);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    computeAllJobMetrics(jobs)
      .then((metrics) => {
        if (cancelled) return;
        const merged: JobRow[] = jobs.map((job, i) => ({
          id: job.id,
          jobName: job.jobName,
          jobNumber: job.jobNumber,
          customer: job.customer,
          percentComplete: metrics[i]?.percentComplete ?? 0,
          ctiPm: job.ctiPm,
          city: extractCity(job.jobAddress),
          archProjectNumber: job.architectProjectNumber,
          billingPlatform: job.billingPlatform,
        }));
        setRows(merged);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [jobs, isLoadingJobs]);

  function handleSort(col: "jobNumber" | "percent") {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(col);
      setSortDir("asc");
    }
  }

  const filtered = rows.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.jobNumber.toLowerCase().includes(q) ||
      r.jobName.toLowerCase().includes(q) ||
      r.customer.toLowerCase().includes(q)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    const cmp =
      sortBy === "jobNumber"
        ? numericSort(a.jobNumber, b.jobNumber)
        : a.percentComplete - b.percentComplete;
    return sortDir === "asc" ? cmp : -cmp;
  });

  const isSpinning = isLoadingJobs || isLoading;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Jobs</h1>
        <p className="mt-1 text-sm text-gray-500">
          Active projects — click a row to view details.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-72">
          <input
            type="search"
            placeholder="Search by job #, name, or GC…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-navy placeholder:text-gray-400 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30"
          />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500">Sort:</span>
          <button
            type="button"
            onClick={() => handleSort("jobNumber")}
            className={`rounded-lg px-3 py-2 font-medium transition-colors ${
              sortBy === "jobNumber"
                ? "bg-teal text-white"
                : "border border-gray-200 text-navy hover:bg-gray-50"
            }`}
          >
            Job #{" "}
            {sortBy === "jobNumber" && (sortDir === "asc" ? "↑" : "↓")}
          </button>
          <button
            type="button"
            onClick={() => handleSort("percent")}
            className={`rounded-lg px-3 py-2 font-medium transition-colors ${
              sortBy === "percent"
                ? "bg-teal text-white"
                : "border border-gray-200 text-navy hover:bg-gray-50"
            }`}
          >
            % Complete{" "}
            {sortBy === "percent" && (sortDir === "asc" ? "↑" : "↓")}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-gray-500">
              <th className="px-6 py-3 font-medium">Job # / Name</th>
              <th className="px-6 py-3 font-medium">GC</th>
              <th className="px-6 py-3 font-medium">City</th>
              <th className="px-6 py-3 font-medium">PM</th>
              <th className="px-6 py-3 font-medium">GC Project #</th>
              <th className="px-6 py-3 font-medium">Billing Platform</th>
              <th className="px-6 py-3 font-medium text-center">Billed %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isSpinning ? (
              <tr>
                <td colSpan={7} className="px-6 py-6 text-sm text-gray-500">
                  Loading…
                </td>
              </tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-6 text-sm text-gray-500">
                  {search
                    ? "No jobs match your search."
                    : "No active jobs yet — add one in Job Setup."}
                </td>
              </tr>
            ) : (
              sorted.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer transition-colors hover:bg-gray-50"
                  onClick={() => router.push(`/jobs/${row.id}`)}
                >
                  <td className="px-6 py-4">
                    <div className="font-semibold text-navy">
                      {row.jobName || (
                        <span className="text-amber-600">⚠ No name</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400">{row.jobNumber}</div>
                  </td>
                  <td className="px-6 py-4 text-navy">{row.customer}</td>
                  <td className="px-6 py-4 text-gray-600">{row.city || "—"}</td>
                  <td className="px-6 py-4 text-gray-600">
                    {row.ctiPm || "—"}
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {row.archProjectNumber || "—"}
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {row.billingPlatform || "—"}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-center">
                      <DonutPercent percent={row.percentComplete} size={52} />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
