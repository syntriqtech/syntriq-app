"use client";

import Link from "next/link";
import { REPORT_DEFINITIONS } from "@/lib/reportsData";

export default function ReportsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Reports</h1>
        <p className="mt-1 text-sm text-gray-500">
          Pull ready-to-share reports from your existing billing, AR, and retention data.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORT_DEFINITIONS.map((report) => {
          const isAvailable = report.status === "available";
          const cardBody = (
            <>
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-base font-semibold text-navy">{report.title}</h2>
                {report.tier === "pro" && (
                  <span className="flex-none rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                    Pro
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm text-gray-500">{report.description}</p>
              <div className="mt-4 text-sm font-semibold">
                {isAvailable ? (
                  <span className="text-teal">View report →</span>
                ) : (
                  <span className="text-gray-400">Coming soon</span>
                )}
              </div>
            </>
          );

          if (!isAvailable) {
            return (
              <div
                key={report.id}
                className="rounded-2xl border border-gray-100 bg-white p-5 opacity-60 shadow-sm"
              >
                {cardBody}
              </div>
            );
          }

          return (
            <Link
              key={report.id}
              href={report.href}
              className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-colors hover:border-teal/40 hover:shadow-md"
            >
              {cardBody}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
