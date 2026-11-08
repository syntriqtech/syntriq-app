// Small yellow "PRO" tag shown next to features that need the Pro plan.
// Same amber as the sidebar count badges.
export default function ProBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex flex-none items-center rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-navy ${className}`}
    >
      Pro
    </span>
  );
}
