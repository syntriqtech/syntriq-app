import { SOVLineItem } from "@/lib/sovData";
import { computeLine, sumLines } from "@/lib/payAppMath";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// Grand total of the contract lines plus change orders, shown under the
// Change orders table on the Schedule of Values screen.
export default function SOVGrandTotal({
  lineItems,
  changeOrders,
  cwRate,
  smRate,
}: {
  lineItems: SOVLineItem[];
  changeOrders: SOVLineItem[];
  cwRate: number;
  smRate: number;
}) {
  const all = [...lineItems, ...changeOrders];
  if (all.length === 0) return null;
  const t = sumLines(all.map((line) => computeLine(line, cwRate, smRate)));

  const cells: { label: string; value: string }[] = [
    { label: "Scheduled Value", value: currency.format(t.scheduledValue) },
    { label: "Previous Applications", value: currency.format(t.previousApplications) },
    { label: "This Period", value: currency.format(t.thisPeriod) },
    { label: "Stored Materials", value: currency.format(t.storedMaterials) },
    { label: "Total Completed", value: currency.format(t.totalCompleted) },
    { label: "% Complete", value: `${t.percentComplete.toFixed(1)}%` },
    { label: "Balance to Finish", value: currency.format(t.balanceToFinish) },
    { label: "Retention", value: currency.format(t.retention) },
  ];

  return (
    <div className="rounded-2xl border border-navy/20 bg-navy/5 p-5">
      <h3 className="text-base font-bold text-navy">Grand Total — contract + change orders</h3>
      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4 lg:grid-cols-8">
        {cells.map((c) => (
          <div key={c.label} className="flex flex-col">
            <span className="text-[11px] uppercase tracking-wide text-gray-500">{c.label}</span>
            <span className="text-sm font-bold text-navy">{c.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
