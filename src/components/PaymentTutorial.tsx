"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import TourOverlay from "@/components/tour/TourOverlay";
import { PAYMENT_TUTORIAL_CERTIFY_ID, PAYMENT_TUTORIAL_STEPS, type PaymentTutorialStep } from "@/lib/paymentTutorial";

const STORAGE_KEY = "syntriq_payment_tutorial_step";

/**
 * Keeps track of which tutorial step is showing. When the tutorial moves from
 * the list to a pay application's page, the step number is handed over through
 * the browser tab (and used up once the new page has read it).
 */
export function usePaymentTutorial(page: "list" | "detail", onStep?: (step: PaymentTutorialStep) => void) {
  const [step, setStep] = useState<number | null>(null);
  const onStepRef = useRef(onStep);
  useEffect(() => {
    onStepRef.current = onStep;
  });

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      sessionStorage.removeItem(STORAGE_KEY); // read once, then it's used up
      if (page !== "detail" || raw === null) return;
      const n = Number(raw);
      const found = PAYMENT_TUTORIAL_STEPS[n];
      if (Number.isInteger(n) && found?.page === "detail") {
        setStep(n);
        onStepRef.current?.(found);
      }
    } catch {
      // Storage unavailable: the tutorial just won't carry across pages.
    }
  }, [page]);

  const go = useCallback(
    (n: number | null, handOver = false) => {
      try {
        if (handOver && n !== null) sessionStorage.setItem(STORAGE_KEY, String(n));
      } catch {
        // ignore
      }
      setStep(n);
      if (n !== null) onStepRef.current?.(PAYMENT_TUTORIAL_STEPS[n]);
    },
    []
  );

  return { step, go };
}

type Props = {
  page: "list" | "detail";
  step: number | null;
  go: (n: number | null, handOver?: boolean) => void;
  /** Replaces what "Next" does on a given step (used by the list to open a job or pay app). */
  nextOverrides?: Partial<Record<number, () => void>>;
  /** True once the pay app is certified. Until then the tutorial waits at the "certify" step. */
  isCertified?: boolean;
};

export default function PaymentTutorial({ page, step, go, nextOverrides, isCertified = false }: Props) {
  const router = useRouter();
  if (step === null) return null;
  const steps = PAYMENT_TUTORIAL_STEPS;
  const isCertifyStep = (i: number) => steps[i]?.id === PAYMENT_TUTORIAL_CERTIFY_ID;

  // Once the pay app is certified there's nothing left to do at the certify step,
  // so the tutorial carries on to the step after it.
  const shown = isCertifyStep(step) && isCertified ? step + 1 : step;
  const current = steps[shown];
  if (!current || current.page !== page) return null;

  const certifyIndex = steps.findIndex((s) => s.id === PAYMENT_TUTORIAL_CERTIFY_ID);
  const waitingToCertify = isCertifyStep(shown); // only true while not certified
  const skipsCertify = isCertified && certifyIndex >= 0;
  const total = steps.length - (skipsCertify ? 1 : 0);
  const position = shown + 1 - (skipsCertify && shown > certifyIndex ? 1 : 0);
  const isLast = shown === steps.length - 1;

  // Back and Next hop over the certify step when it doesn't apply.
  let prevIndex = shown - 1;
  if (isCertifyStep(prevIndex) && isCertified) prevIndex -= 1;
  const prevStep = prevIndex >= 0 ? steps[prevIndex] : null;

  function onNext() {
    const override = nextOverrides?.[shown];
    if (override) return override();
    if (isLast) return go(null);
    go(shown + 1);
  }

  function onBack() {
    if (!prevStep) return;
    if (prevStep.page !== page) {
      // Back to the list: start over from its first step, since the list has been reset.
      go(0);
      router.push("/pay-applications");
      return;
    }
    go(prevIndex);
  }

  return (
    <TourOverlay
      step={current}
      progress={{ current: position, total }}
      onBack={prevStep ? onBack : undefined}
      // No Next button while waiting: the tutorial moves on when the pay app is certified.
      onNext={waitingToCertify ? undefined : onNext}
      nextLabel={isLast ? "Done" : undefined}
      onSkip={() => go(null)}
      onPause={() => go(null)}
    />
  );
}
