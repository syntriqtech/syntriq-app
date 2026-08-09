type KpiItem = {
  label: string;
  value: string;
  delta: string;
  direction: "up" | "down" | "plain";
};

export default function KpiStrip({ items }: { items: KpiItem[] }) {
  return (
    <div className="grid grid-cols-1 divide-y divide-gray-100 rounded-2xl border border-gray-100 bg-white shadow-sm sm:grid-cols-4 sm:divide-x sm:divide-y-0">
      {items.map((item) => (
        <div key={item.label} className="p-5">
          <div className="text-sm text-gray-500">{item.label}</div>
          <div className="mt-1 text-2xl font-bold text-navy">{item.value}</div>
          <div
            className={`mt-2 text-sm font-medium ${
              item.direction === "down" ? "text-[#B5443A]" : "text-[#15795A]"
            }`}
          >
            {item.direction !== "plain" && <span>▲ </span>}
            {item.delta}
          </div>
        </div>
      ))}
    </div>
  );
}
