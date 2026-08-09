const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export default function BilledMonthComparisonCard({
  thisMonth,
  lastMonth,
  percentChange,
  isLoading,
}: {
  thisMonth: number;
  lastMonth: number;
  percentChange: number | null;
  isLoading: boolean;
}) {
  const isUp = (percentChange ?? 0) >= 0;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="text-sm text-gray-500">Billed this month vs. last month</div>

      <div className="mt-3 grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-gray-400">Billed this month</div>
          <div className="mt-1 text-2xl font-bold text-navy">
            {isLoading ? "—" : currency.format(thisMonth)}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-400">Billed last month</div>
          <div className="mt-1 text-2xl font-bold text-navy">
            {isLoading ? "—" : currency.format(lastMonth)}
          </div>
        </div>
      </div>

      {!isLoading && (
        <div
          className={`mt-3 text-sm font-medium ${isUp ? "text-[#15795A]" : "text-[#B5443A]"}`}
        >
          {percentChange === null ? (
            "No billing last month to compare"
          ) : (
            <>
              <span>{isUp ? "▲ " : "▼ "}</span>
              {isUp ? "+" : ""}
              {Math.round(percentChange)}% vs last month
            </>
          )}
        </div>
      )}
    </div>
  );
}
