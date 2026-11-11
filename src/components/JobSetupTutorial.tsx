"use client";

import TourOverlay from "@/components/tour/TourOverlay";
import { JOB_SETUP_TUTORIAL_STEPS } from "@/lib/jobSetupTutorial";

type Props = {
  /** Which step is showing, or null when the tutorial is closed. */
  step: number | null;
  setStep: (step: number | null) => void;
};

/** Step-by-step walkthrough of the Job Setup form. Starts from the "i" next to the page title. */
export default function JobSetupTutorial({ step, setStep }: Props) {
  if (step === null) return null;
  const current = JOB_SETUP_TUTORIAL_STEPS[step];
  if (!current) return null;

  const total = JOB_SETUP_TUTORIAL_STEPS.length;
  const isLast = step === total - 1;

  return (
    <TourOverlay
      step={current}
      progress={{ current: step + 1, total }}
      onBack={step > 0 ? () => setStep(step - 1) : undefined}
      onNext={() => setStep(isLast ? null : step + 1)}
      nextLabel={isLast ? "Done" : undefined}
      onSkip={() => setStep(null)}
      onPause={() => setStep(null)}
    />
  );
}
