import Link from "next/link";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

type Bucket = { label: string; amount: number; color: string };

export default function OutstandingPaymentsCard({
  total,
  buckets,
}: {
  total: number;
  buckets: Bucket[];
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="text-sm text-gray-500">Outstanding payments</div>
      <div className="mt-1 text-2xl font-bold text-navy">{currency.format(total)}</div>

      <div className="mt-5 flex h-2.5 w-full overflow-hidden rounded-full">
        {buckets.map((bucket) => (
          <div
            key={bucket.label}
            style={{
              width: `${total > 0 ? (bucket.amount / total) * 100 : 0}%`,
              backgroundColor: bucket.color,
            }}
          />
        ))}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {buckets.map((bucket) => (
          <div key={bucket.label}>
            <div className="flex items-center gap-1.5 text-sm font-medium text-gray-500">
              <span
                className="h-2.5 w-2.5 flex-none rounded-full"
                style={{ backgroundColor: bucket.color }}
              />
              {bucket.label}
            </div>
            <div className="mt-1 text-sm font-bold text-navy">
              {currency.format(bucket.amount)}
            </div>
          </div>
        ))}
      </div>

      <Link
        href="/pay-applications"
        className="mt-5 block w-full rounded-lg bg-teal px-4 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-teal/90"
      >
        Record a payment
      </Link>
    </div>
  );
}
