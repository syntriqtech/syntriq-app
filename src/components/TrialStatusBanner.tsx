"use client";

import { useTrialStatus } from "@/hooks/useTrialStatus";

export default function TrialStatusBanner() {
  const status = useTrialStatus();

  if (!status || !status.isTrialing || status.daysRemaining === null) return null;

  const days = status.daysRemaining;
  const label =
    days <= 0 ? "Trial expires today" : days === 1 ? "Trial · 1 day left" : `Trial · ${days} days left`;

  const colorClasses =
    days <= 2
      ? "border-red-200 bg-red-50 text-red-600"
      : days <= 7
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : "border-teal/20 bg-teal/10 text-teal";

  return (
    <div className={`mb-3 rounded-lg border px-3 py-2 text-center text-xs font-semibold ${colorClasses}`}>
      {label}
    </div>
  );
}
