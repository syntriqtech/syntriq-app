"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import Button from "@/components/Button";
import type { TourStep } from "@/lib/tourContent";

type Rect = { top: number; left: number; width: number; height: number };

const CARD_WIDTH = 340;
const CARD_HEIGHT_GUESS = 240;
const EDGE = 16;
const SPOT_PAD = 6;

/**
 * Finds the page elements a step points at and reports their combined box.
 * Re-checks a few times a second so it keeps up with pages that load data
 * after they first appear, and with scrolling and resizing.
 */
function useAnchorRect(anchors: string[] | undefined): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);
  const key = anchors?.join("|") ?? "";

  useEffect(() => {
    if (!anchors || anchors.length === 0) return;
    let scrolledIntoView = false;

    function measure() {
      const els: Element[] = [];
      for (const selector of anchors!) {
        try {
          const el = document.querySelector(selector);
          if (el) els.push(wholeField(el));
        } catch {
          // A bad selector just means "not found".
        }
      }
      if (els.length === 0) {
        setRect((prev) => (prev === null ? prev : null));
        return;
      }
      if (!scrolledIntoView) {
        els[0].scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
        scrolledIntoView = true;
      }
      let top = Infinity, left = Infinity, right = -Infinity, bottom = -Infinity;
      for (const el of els) {
        const r = el.getBoundingClientRect();
        top = Math.min(top, r.top);
        left = Math.min(left, r.left);
        right = Math.max(right, r.right);
        bottom = Math.max(bottom, r.bottom);
      }
      const next = { top, left, width: right - left, height: bottom - top };
      setRect((prev) =>
        prev && prev.top === next.top && prev.left === next.left && prev.width === next.width && prev.height === next.height
          ? prev
          : next
      );
    }

    measure();
    const timer = setInterval(measure, 250);
    return () => {
      clearInterval(timer);
      setRect(null);
    };
    // `key` stands in for the anchors array so a new array with the same selectors does not restart this.
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return rect;
}

/**
 * For a form input, returns the whole field (label + input + any error text)
 * so the highlight includes the field's title, not just the box you type in.
 */
function wholeField(el: Element): Element {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) || !el.id) {
    return el;
  }
  const label = document.querySelector(`label[for="${el.id}"]`);
  if (!label) return el;
  let node: Element | null = el;
  while (node && !node.contains(label)) node = node.parentElement;
  return node ?? el;
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

type Props = {
  step: TourStep;
  /** "Step X of Y" — only passed for the app tour. */
  progress?: { current: number; total: number };
  /** True when the step belongs to a different page than the one open now. */
  routeMismatch?: boolean;
  onGoToRoute?: () => void;
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  /** Skip the whole tour (remembered). */
  onSkip?: () => void;
  /** Esc: hide the tour for now without changing saved progress. */
  onPause: () => void;
  /** Optional extra button on a step, such as "Open Retention". */
  extraAction?: { label: string; onClick: () => void };
  /** Custom content under the body text (used by the "choose how to add a job" step). */
  content?: ReactNode;
  /** Buttons for centered steps. */
  actions?: ReactNode;
};

export default function TourOverlay({
  step,
  progress,
  routeMismatch = false,
  onGoToRoute,
  onBack,
  onNext,
  nextLabel,
  onSkip,
  onPause,
  extraAction,
  content,
  actions,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const rect = useAnchorRect(step.layout === "anchored" && !routeMismatch ? step.anchors : undefined);
  const [, setResizeTick] = useState(0);

  useEffect(() => {
    const onResize = () => setResizeTick((n) => n + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Move keyboard focus into the card whenever the step changes.
  useEffect(() => {
    cardRef.current?.focus({ preventScroll: true });
  }, [step.id, routeMismatch]);

  // Keyboard: Esc hides the tour, arrow keys move between steps. Enter is left
  // alone so it never submits a form behind the tour.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onPause();
        return;
      }
      if (isEditable(e.target)) return;
      if (e.key === "ArrowRight" && onNext && !routeMismatch) {
        e.preventDefault();
        onNext();
      } else if (e.key === "ArrowLeft" && onBack && !routeMismatch) {
        e.preventDefault();
        onBack();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onPause, onNext, onBack, routeMismatch]);

  // Keep Tab inside the card on centered (modal) steps.
  function handleCardKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Tab" || step.layout !== "modal") return;
    const focusable = cardRef.current?.querySelectorAll<HTMLElement>("button, [href], input, select, textarea");
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === cardRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const isModal = step.layout === "modal" && !routeMismatch;
  const vw = typeof window === "undefined" ? 1200 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const cardWidth = Math.min(CARD_WIDTH, vw - EDGE * 2);

  const rectIsOnScreen =
    rect !== null && rect.left + rect.width > 0 && rect.left < vw && rect.top + rect.height > 0 && rect.top < vh;

  // Where the card goes. Next to the highlight if it fits, otherwise in the
  // bottom-right corner so the page underneath stays usable.
  let cardStyle: React.CSSProperties;
  if (rect && rectIsOnScreen) {
    const gap = SPOT_PAD + 10;
    if (vw - (rect.left + rect.width) - gap - EDGE >= cardWidth) {
      cardStyle = {
        left: rect.left + rect.width + gap,
        top: Math.max(EDGE, Math.min(rect.top, vh - CARD_HEIGHT_GUESS - EDGE)),
      };
    } else if (rect.top + rect.height + gap + CARD_HEIGHT_GUESS <= vh) {
      cardStyle = {
        left: Math.max(EDGE, Math.min(rect.left, vw - cardWidth - EDGE)),
        top: rect.top + rect.height + gap,
      };
    } else if (rect.top - gap - CARD_HEIGHT_GUESS >= 0) {
      cardStyle = {
        left: Math.max(EDGE, Math.min(rect.left, vw - cardWidth - EDGE)),
        top: rect.top - gap - CARD_HEIGHT_GUESS,
      };
    } else {
      cardStyle = { right: EDGE, bottom: EDGE };
    }
  } else {
    cardStyle = { right: EDGE, bottom: EDGE };
  }

  const showSpotlight = !isModal && rect !== null && rectIsOnScreen;

  const card = (
    <div
      ref={cardRef}
      tabIndex={-1}
      role="dialog"
      aria-modal={isModal}
      aria-labelledby="tour-card-title"
      onKeyDown={handleCardKeyDown}
      style={isModal ? { width: Math.min(440, vw - EDGE * 2) } : { ...cardStyle, width: cardWidth, maxHeight: `calc(100vh - ${EDGE * 2}px)` }}
      className={`${
        isModal ? "relative" : "fixed z-[61] overflow-y-auto"
      } rounded-2xl border border-gray-100 bg-white p-5 shadow-xl focus:outline-none`}
    >
      {progress && !routeMismatch && (
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-teal">
          Step {progress.current} of {progress.total}
        </p>
      )}
      <h2 id="tour-card-title" className="text-lg font-bold text-navy">
        {step.title}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-gray-600">
        {routeMismatch
          ? `This step is on the ${step.routeLabel ?? "next"} page.`
          : step.body}
      </p>

      {!routeMismatch && content && <div className="mt-4">{content}</div>}

      {isModal ? (
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{actions}</div>
      ) : (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          {onSkip ? (
            <button
              type="button"
              onClick={onSkip}
              className="text-xs font-medium text-gray-500 underline-offset-2 hover:text-navy hover:underline"
            >
              Skip tour
            </button>
          ) : (
            <span />
          )}
          <div className="flex flex-wrap items-center gap-2">
            {routeMismatch ? (
              onGoToRoute && (
                <Button type="button" className="w-auto! whitespace-nowrap px-4 py-2 text-sm" onClick={onGoToRoute}>
                  Go to {step.routeLabel ?? "page"}
                </Button>
              )
            ) : (
              <>
                {extraAction && (
                  <button
                    type="button"
                    onClick={extraAction.onClick}
                    className="rounded-lg px-3 py-2 text-sm font-semibold text-teal hover:bg-teal/10"
                  >
                    {extraAction.label}
                  </button>
                )}
                {onBack && (
                  <button
                    type="button"
                    onClick={onBack}
                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-navy hover:bg-gray-50"
                  >
                    Back
                  </button>
                )}
                {onNext && (
                  <Button type="button" className="w-auto! whitespace-nowrap px-4 py-2 text-sm" onClick={onNext}>
                    {nextLabel ?? "Next"}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {showSpotlight && rect && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-[60] rounded-lg border-2 border-teal transition-all duration-150"
          style={{
            top: rect.top - SPOT_PAD,
            left: rect.left - SPOT_PAD,
            width: rect.width + SPOT_PAD * 2,
            height: rect.height + SPOT_PAD * 2,
            boxShadow: "0 0 0 9999px rgba(15, 51, 75, 0.55)",
          }}
        />
      )}
      {isModal ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-navy/55 p-4">{card}</div>
      ) : (
        card
      )}
    </>
  );
}
