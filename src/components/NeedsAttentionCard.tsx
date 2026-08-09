type AttentionItem = {
  icon: "dollar" | "alert" | "check";
  title: string;
  subtitle: string;
  cta: string;
  ctaStyle: "teal" | "red" | "navy";
};

const ICON_GLYPH: Record<AttentionItem["icon"], string> = {
  dollar: "$",
  alert: "!",
  check: "✓",
};

const ICON_STYLE: Record<AttentionItem["icon"], string> = {
  dollar: "bg-teal/10 text-teal",
  alert: "bg-[#FBE7E4] text-[#B5443A]",
  check: "bg-gray-100 text-navy",
};

const CTA_STYLE: Record<AttentionItem["ctaStyle"], string> = {
  teal: "bg-teal text-white hover:bg-teal/90",
  red: "bg-[#B5443A] text-white hover:bg-[#B5443A]/90",
  navy: "bg-navy text-white hover:bg-navy/90",
};

export default function NeedsAttentionCard({ items }: { items: AttentionItem[] }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <h2 className="border-b border-gray-100 pb-3 text-base font-bold text-navy">
        Needs attention
      </h2>
      <div className="flex flex-col">
        {items.map((item) => (
          <div
            key={item.title}
            className="flex items-center justify-between gap-4 border-b border-gray-50 py-4 last:border-0"
          >
            <div className="flex items-center gap-3">
              <span
                className={`flex h-9 w-9 flex-none items-center justify-center rounded-lg text-base font-bold ${ICON_STYLE[item.icon]}`}
              >
                {ICON_GLYPH[item.icon]}
              </span>
              <div>
                <div className="text-sm font-bold text-navy">{item.title}</div>
                <div className="text-sm text-gray-500">{item.subtitle}</div>
              </div>
            </div>
            <button
              type="button"
              className={`flex-none rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${CTA_STYLE[item.ctaStyle]}`}
            >
              {item.cta}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
