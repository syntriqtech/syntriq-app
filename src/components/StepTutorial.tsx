"use client";

import TourOverlay from "@/components/tour/TourOverlay";
import type { TourStep } from "@/lib/tourContent";

type Props = {
  /** The steps, in order. */
  steps: TourStep[];
  /** Which step is showing, or null when the tutorial is closed. */
  step: number | null;
  setStep: (step: number | null) => void;
};

/** A simple one-page, step-by-step walkthrough. The page owns which step is showing. */
export default function StepTutorial({ steps, step, setStep }: Props) {
  if (step === null) return null;
  const current = steps[step];
  if (!current) return null;

  const isLast = step === steps.length - 1;

  return (
    <TourOverlay
      step={current}
      progress={{ current: step + 1, total: steps.length }}
      onBack={step > 0 ? () => setStep(step - 1) : undefined}
      onNext={() => setStep(isLast ? null : step + 1)}
      nextLabel={isLast ? "Done" : undefined}
      onSkip={() => setStep(null)}
      onPause={() => setStep(null)}
    />
  );
}
