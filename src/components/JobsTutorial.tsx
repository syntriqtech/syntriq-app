"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TourOverlay from "@/components/tour/TourOverlay";
import { JOBS_TUTORIAL_STEPS } from "@/lib/jobsTutorial";

const STORAGE_KEY = "syntriq_jobs_tutorial_step";

/**
 * Keeps track of which tutorial step is showing. The step number is also saved
 * in the browser tab so the tutorial can carry on after moving from the Jobs
 * list to a job's detail page.
 */
export function useJobsTutorial(page: "list" | "detail") {
  const [step, setStep] = useState<number | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      const n = raw === null ? NaN : Number(raw);
      if (Number.isInteger(n) && JOBS_TUTORIAL_STEPS[n]?.page === page) setStep(n);
      else sessionStorage.removeItem(STORAGE_KEY); // stale leftover from a tutorial that was left midway
    } catch {
      // Storage unavailable: the tutorial just won't carry across pages.
    }
  }, [page]);

  const go = useCallback((n: number | null) => {
    try {
      if (n === null) sessionStorage.removeItem(STORAGE_KEY);
      else sessionStorage.setItem(STORAGE_KEY, String(n));
    } catch {
      // ignore
    }
    setStep(n);
  }, []);

  return { step, go };
}

type Props = {
  page: "list" | "detail";
  step: number | null;
  go: (n: number | null) => void;
  /** Where "Next" should go when the next step is on the job detail page. */
  firstJobHref?: string;
};

export default function JobsTutorial({ page, step, go, firstJobHref }: Props) {
  const router = useRouter();
  if (step === null) return null;
  const current = JOBS_TUTORIAL_STEPS[step];
  if (!current || current.page !== page) return null;

  const total = JOBS_TUTORIAL_STEPS.length;
  const isLast = step === total - 1;
  const prevStep = step > 0 ? JOBS_TUTORIAL_STEPS[step - 1] : null;

  function onNext() {
    if (isLast) return go(null);
    const next = JOBS_TUTORIAL_STEPS[step! + 1];
    if (next.page === page) return go(step! + 1);
    // The next step lives on the job detail page.
    if (!firstJobHref) return go(null);
    go(step! + 1);
    router.push(firstJobHref);
  }

  function onBack() {
    if (!prevStep) return;
    go(step! - 1);
    if (prevStep.page !== page) router.push("/jobs");
  }

  return (
    <TourOverlay
      step={current}
      progress={{ current: step + 1, total }}
      onBack={prevStep ? onBack : undefined}
      onNext={onNext}
      nextLabel={isLast ? "Done" : undefined}
      onSkip={() => go(null)}
      onPause={() => go(null)}
    />
  );
}
