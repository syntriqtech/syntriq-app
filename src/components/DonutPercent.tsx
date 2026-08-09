const RADIUS = 16;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function DonutPercent({
  percent,
  size = 64,
}: {
  percent: number;
  size?: number;
}) {
  const offset = CIRCUMFERENCE * (1 - percent / 100);

  return (
    <div className="relative flex-none" style={{ width: size, height: size }}>
      <svg viewBox="0 0 36 36" className="-rotate-90" width={size} height={size}>
        <circle cx="18" cy="18" r={RADIUS} fill="none" stroke="#EAEEF1" strokeWidth="4" />
        <circle
          cx="18"
          cy="18"
          r={RADIUS}
          fill="none"
          stroke="#1D8F96"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-navy">
        {percent}%
      </span>
    </div>
  );
}
