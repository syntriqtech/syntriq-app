"use client";

const TEAL = "#1D8F96";
const NAVY = "#0F334B";
const TEAL_MUTED = "#A8D5D9";

// Max bar renders at this many px (leaves room for the dollar label above it)
const MAX_BAR_PX = 112;
const LABEL_SPACE_PX = 20;
// Nonzero values always show at least this height so small months are visible
const MIN_BAR_PX = 5;

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function compact(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
}

export default function MonthlyBillingChart({
  monthLabels,
  monthKeys,
  billed,
  onMonthClick,
}: {
  monthLabels: string[];
  monthKeys?: string[];
  billed: number[];
  onMonthClick?: (monthKey: string, monthLabel: string) => void;
}) {
  if (!billed.length) return null;

  const max = Math.max(...billed, 1);
  const avg = billed.reduce((s, v) => s + v, 0) / billed.length;
  const lastIdx = billed.length - 1;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-navy">Monthly Billing</h2>
          <p className="mt-0.5 text-sm text-gray-500">Total billed per month · last 12 months</p>
        </div>
        <div className="flex-none text-right">
          <p className="text-xs text-gray-400">Avg / month</p>
          <p className="mt-0.5 text-base font-semibold text-navy tabular-nums">{currency.format(avg)}</p>
        </div>
      </div>

      {/* Bar chart — equal flex columns, bars grow from the bottom */}
      <div className="mt-5 flex items-end gap-1" style={{ height: `${MAX_BAR_PX + LABEL_SPACE_PX}px` }}>
        {billed.map((value, i) => {
          const isCurrent = i === lastIdx;
          const barPx = value > 0 ? Math.max((value / max) * MAX_BAR_PX, MIN_BAR_PX) : 0;
          const fill = isCurrent ? TEAL_MUTED : TEAL;
          const monthKey = monthKeys?.[i];
          const isClickable = value > 0 && !!onMonthClick && !!monthKey;

          return (
            <div
              key={i}
              role={isClickable ? "button" : undefined}
              tabIndex={isClickable ? 0 : undefined}
              onClick={isClickable ? () => onMonthClick!(monthKey!, monthLabels[i]) : undefined}
              onKeyDown={
                isClickable
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") onMonthClick!(monthKey!, monthLabels[i]);
                    }
                  : undefined
              }
              className={`flex flex-1 flex-col items-center justify-end ${isClickable ? "cursor-pointer" : ""}`}
              title={isClickable ? `View billing detail for ${monthLabels[i]}` : undefined}
            >
              {value > 0 && (
                <span
                  className="mb-1 block w-full text-center text-xs font-medium leading-none tabular-nums"
                  style={{ color: NAVY }}
                >
                  {compact(value)}
                </span>
              )}
              <div
                className={`w-full rounded-sm transition-opacity ${isClickable ? "hover:opacity-70" : ""}`}
                style={{ height: `${barPx}px`, backgroundColor: fill }}
              />
            </div>
          );
        })}
      </div>

      {/* Month labels — same gap/column structure as bars above */}
      <div className="mt-2 flex gap-1">
        {monthLabels.map((label, i) => {
          const isCurrent = i === lastIdx;
          return (
            <div
              key={i}
              className="flex-1 text-center text-xs"
              style={{
                fontWeight: isCurrent ? 600 : 400,
                color: isCurrent ? NAVY : "#9CA3AF",
              }}
            >
              {label}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center gap-5 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: TEAL }} />
          Prior months
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: TEAL_MUTED }} />
          Current month (in progress)
        </span>
      </div>
    </div>
  );
}
