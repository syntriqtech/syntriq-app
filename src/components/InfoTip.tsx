"use client";

import { ReactNode, useEffect, useId, useRef, useState } from "react";

type InfoTipProps = {
  /** Short heading shown at the top of the popup, e.g. "Retention rate". */
  title: string;
  /** The how-to text. Can be a sentence, or a few <li> steps wrapped in <ol>. */
  children: ReactNode;
  /** Which way the popup opens. Use "right" for icons near the left edge of the page. */
  align?: "left" | "right";
  /** Optional button under the text, e.g. "Show me step by step". Closes the popup when clicked. */
  action?: { label: string; onClick: () => void };
};

/**
 * A small "i" icon. Click it to open a short how-to popup; click anywhere
 * else (or press Escape) to close it. Reuse this anywhere in the app.
 */
export default function InfoTip({ title, children, align = "left", action }: InfoTipProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const popupId = useId();

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={wrapperRef} className="relative inline-flex align-middle">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Help: ${title}`}
        aria-expanded={open}
        aria-controls={open ? popupId : undefined}
        className="flex h-4 w-4 items-center justify-center rounded-full border border-teal/60 text-[10px] font-bold italic leading-none text-teal hover:bg-teal hover:text-white focus:outline-none focus:ring-2 focus:ring-teal/30"
      >
        i
      </button>
      {open && (
        <div
          id={popupId}
          role="dialog"
          aria-label={title}
          className={`absolute top-6 z-30 w-72 rounded-xl border border-gray-100 bg-white p-4 text-left shadow-lg ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <p className="text-sm font-bold text-navy">{title}</p>
          <div className="mt-1.5 space-y-1.5 text-sm font-normal leading-snug text-gray-600 [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:space-y-1">
            {children}
          </div>
          {action && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                action.onClick();
              }}
              className="mt-3 w-full rounded-lg bg-teal px-3 py-2 text-sm font-semibold text-white hover:bg-teal/90"
            >
              {action.label}
            </button>
          )}
        </div>
      )}
    </span>
  );
}
