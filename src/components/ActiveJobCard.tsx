"use client";

import { useRouter } from "next/navigation";
import { Project } from "@/lib/mockData";
import DonutPercent from "@/components/DonutPercent";
import StatusBadge from "@/components/StatusBadge";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

type ActiveJob = Project & { id: string; retention: number; flagBanner?: string };

export default function ActiveJobCard({ job }: { job: ActiveJob }) {
  const router = useRouter();

  function handleCreatePayApp() {
    sessionStorage.setItem("sov_initial_job", job.jobNumber);
    sessionStorage.setItem("sov_start_next_app", "1");
    router.push("/sov");
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      {job.flagBanner && (
        <div className="flex items-center gap-2 bg-teal/10 px-5 py-2 text-sm font-semibold text-navy">
          <span className="h-1.5 w-1.5 flex-none rounded-full bg-navy" />
          {job.flagBanner}
        </div>
      )}

      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-bold text-navy">{job.jobName || <span className="text-amber-600">⚠ No job name</span>}</div>
            <div className="text-sm text-gray-500">{job.jobNumber} · {job.customer}</div>
          </div>
          <DonutPercent percent={job.percentComplete} />
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <div>
            <div className="text-sm text-gray-500">Contract</div>
            <div className="text-sm font-bold text-navy">
              {currency.format(job.contractValue)}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Billed</div>
            <div className="text-sm font-bold text-navy">
              {currency.format(job.billedToDate)}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Retention</div>
            <div className="text-sm font-bold text-navy">
              {currency.format(job.retention)}
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <StatusBadge status={job.status} />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => router.push(`/jobs/${job.id}`)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold text-navy hover:bg-gray-50"
            >
              View
            </button>
            <button
              type="button"
              onClick={handleCreatePayApp}
              className="rounded-lg bg-teal px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal/90"
            >
              Create pay app
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
