"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import ProUpgradeModal from "@/components/ProUpgradeModal";
import Button from "@/components/Button";
import ProBadge from "@/components/ProBadge";
import TourOverlay from "@/components/tour/TourOverlay";
import { usePlan } from "@/hooks/usePlan";
import { fetchJobs } from "@/lib/jobs";
import { fetchTourProgress, saveTourProgress, type TourStatus } from "@/lib/tourDb";
import {
  PHASE1_STEPS,
  buildPhase2Steps,
  hrefFromNavStepId,
  type TourPhase,
  type TourStep,
} from "@/lib/tourContent";

type Session = {
  phase: TourPhase;
  steps: TourStep[];
  stepId: string;
  /** Replays never write progress, so they cannot trigger a "resume" later. */
  replay: boolean;
};

type TourContextValue = {
  /** Starts a tour from the beginning (used by "Replay" in Help & Support). */
  startPhase: (phase: TourPhase) => void;
};

const TourContext = createContext<TourContextValue>({ startPhase: () => {} });

export function useTour() {
  return useContext(TourContext);
}

// The Phase 1 steps that sit on the Job Setup form. When the "Job Created"
// popup appears while the user is on one of these, the tour moves on.
const JOB_FORM_STEPS = new Set(["p1-customer", "p1-contract", "p1-billing", "p1-save", "p1-excel", "p1-ai"]);

const SECONDARY_BUTTON =
  "rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-navy hover:bg-gray-50";

function phaseKey(phase: TourPhase): "phase1" | "phase2" {
  return phase === 1 ? "phase1" : "phase2";
}

function collectSidebarHrefs(): string[] {
  return Array.from(document.querySelectorAll('[data-tour^="nav-"]'))
    .map((el) => el.getAttribute("data-tour")?.slice("nav-".length) ?? "")
    .filter(Boolean);
}

function ChoiceCard({
  title,
  description,
  showPro,
  locked,
  onClick,
}: {
  title: string;
  description: string;
  showPro?: boolean;
  /** Greyed out and not clickable (used for Pro features on the Basic plan). */
  locked?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={locked}
      className={`flex w-full flex-col gap-1 rounded-xl border p-4 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-teal/40 ${
        locked
          ? "cursor-not-allowed border-gray-100 bg-gray-50 opacity-60"
          : "border-gray-200 bg-white hover:border-teal hover:bg-teal/5"
      }`}
    >
      <span className="flex items-center gap-2 text-sm font-semibold text-navy">
        {title}
        {showPro && <ProBadge />}
      </span>
      <span className="text-xs text-gray-500">{description}</span>
    </button>
  );
}

export function TourProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { plan, isLoading: planLoading } = usePlan();

  const [session, setSession] = useState<Session | null>(null);
  const [resumePrompt, setResumePrompt] = useState<{ phase: TourPhase; lastStep: string | null } | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [jobCreatedOpen, setJobCreatedOpen] = useState(false);
  const decidedRef = useRef(false);

  const makeSession = useCallback((phase: TourPhase, stepId: string | null, replay: boolean): Session => {
    const steps = phase === 1 ? PHASE1_STEPS : buildPhase2Steps(collectSidebarHrefs());
    const fallback = phase === 1 ? "p1-welcome" : "p2-offer";
    const valid = stepId && steps.some((s) => s.id === stepId) ? stepId : fallback;
    return { phase, steps, stepId: valid, replay };
  }, []);

  // ── Decide, once per page load, whether to show the tour on its own ──────
  useEffect(() => {
    if (decidedRef.current) return;
    decidedRef.current = true;

    Promise.all([fetchTourProgress(), fetchJobs()])
      .then(([progress, jobs]) => {
        if (progress.phase1 === "in_progress") {
          setResumePrompt({ phase: 1, lastStep: progress.lastStep });
        } else if (progress.phase2 === "in_progress") {
          setResumePrompt({ phase: 2, lastStep: progress.lastStep });
        } else if (progress.phase1 === "not_started") {
          if (jobs.length === 0) {
            setSession(makeSession(1, "p1-welcome", false));
          } else {
            // Joined a company that already has jobs: skip setup, offer the app tour.
            saveTourProgress({ phase1: "skipped" }).catch(() => {});
            if (progress.phase2 === "not_started") {
              setSession(makeSession(2, "p2-offer", false));
            }
          }
        }
      })
      .catch(() => {
        // If progress cannot be read (for example the migration has not been run yet), stay out of the way.
      });
  }, [makeSession]);

  // ── Remember where the user is, so "Maybe later" can resume ──────────────
  useEffect(() => {
    if (!session || session.replay || session.stepId === "p1-welcome") return;
    saveTourProgress({ [phaseKey(session.phase)]: "in_progress", lastStep: session.stepId }).catch(() => {});
  }, [session]);

  // ── Watch for the "Job Created" popup so the tour can step aside, then move on ──
  useEffect(() => {
    if (!session) return;
    const timer = setInterval(() => {
      const open = document.querySelector('[data-tour="job-created-modal"]') !== null;
      setJobCreatedOpen(open);
      if (open) {
        setSession((s) => (s && s.phase === 1 && JOB_FORM_STEPS.has(s.stepId) ? { ...s, stepId: "p1-sov-intro" } : s));
      }
    }, 400);
    return () => clearInterval(timer);
  }, [session]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const goTo = useCallback((stepId: string) => {
    setSession((s) => (s ? { ...s, stepId } : s));
  }, []);

  const finish = useCallback(
    (status: TourStatus) => {
      if (session && !session.replay) {
        saveTourProgress({ [phaseKey(session.phase)]: status, lastStep: null }).catch(() => {});
      }
      setSession(null);
    },
    [session]
  );

  const startAppTour = useCallback(
    (replay: boolean) => {
      setSession(makeSession(2, "p2-dash-kpi", replay));
      router.push("/dashboard");
    },
    [makeSession, router]
  );

  const startPhase = useCallback(
    (phase: TourPhase) => {
      setResumePrompt(null);
      if (phase === 1) {
        setSession(makeSession(1, "p1-welcome", true));
      } else {
        startAppTour(true);
      }
    },
    [makeSession, startAppTour]
  );

  const contextValue = useMemo(() => ({ startPhase }), [startPhase]);

  // ── Which step is showing, and what are its buttons ──────────────────────

  const hidden = showUpgrade || jobCreatedOpen;
  const step = session?.steps.find((s) => s.id === session.stepId) ?? null;

  function neighbour(direction: "next" | "prev"): string | null {
    if (!session || !step) return null;
    if (session.phase === 1) return (direction === "next" ? step.next : step.prev) ?? null;
    const index = session.steps.findIndex((s) => s.id === step.id);
    const target = session.steps[index + (direction === "next" ? 1 : -1)];
    // The first step (the offer) is only a doorway; Back never returns to it.
    return target && target.id !== "p2-offer" ? target.id : null;
  }

  function renderSession() {
    if (!session || !step || hidden) return null;

    const onPause = () => setSession(null);
    const skip = () => finish("skipped");

    // Centered steps with their own buttons.
    if (step.id === "p1-welcome") {
      return (
        <TourOverlay
          step={step}
          onPause={onPause}
          actions={
            <>
              <button type="button" className={SECONDARY_BUTTON} onClick={skip}>
                Skip for now
              </button>
              <Button type="button" className="w-auto! px-5 py-2 text-sm" onClick={() => goTo("p1-info")}>
                Start
              </Button>
            </>
          }
        />
      );
    }

    if (step.id === "p1-info") {
      return (
        <TourOverlay
          step={step}
          onPause={onPause}
          content={
            <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm text-navy">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-teal/60 text-xs font-bold italic leading-none text-teal">
                i
              </span>
              <span>This is what it looks like. You will find it all over Syntriq.</span>
            </div>
          }
          actions={
            <>
              <button type="button" className={SECONDARY_BUTTON} onClick={() => goTo("p1-welcome")}>
                Back
              </button>
              <Button type="button" className="w-auto! px-5 py-2 text-sm" onClick={() => goTo("p1-choose")}>
                Got it
              </Button>
            </>
          }
        />
      );
    }

    if (step.id === "p1-choose") {
      return (
        <TourOverlay
          step={step}
          onPause={onPause}
          content={
            <div className="flex flex-col gap-2.5">
              <ChoiceCard
                title="Enter it manually"
                description="Type in the job details yourself. This works for every job."
                onClick={() => {
                  goTo("p1-customer");
                  router.push("/job-setup");
                }}
              />
              <ChoiceCard
                title="Import from Excel"
                description="Read a job from a spreadsheet. The file has to match the layout Syntriq supports."
                onClick={() => {
                  goTo("p1-excel");
                  router.push("/job-setup");
                }}
              />
              <ChoiceCard
                title="Import a contract PDF (AI)"
                description={
                  !planLoading && plan !== "pro"
                    ? "Available on the Pro plan."
                    : "Syntriq reads your contract and fills in the job for you."
                }
                showPro
                locked={!planLoading && plan !== "pro"}
                onClick={() => {
                  goTo("p1-ai");
                  router.push("/job-setup");
                }}
              />
            </div>
          }
          actions={
            <button type="button" className={SECONDARY_BUTTON} onClick={skip}>
              Skip for now
            </button>
          }
        />
      );
    }

    if (step.id === "p1-sov-intro") {
      return (
        <TourOverlay
          step={step}
          onPause={onPause}
          actions={
            <>
              <button type="button" className={SECONDARY_BUTTON} onClick={() => goTo("p1-finish")}>
                Skip this
              </button>
              <Button
                type="button"
                className="w-auto! px-5 py-2 text-sm"
                onClick={() => {
                  goTo("p1-sov-list");
                  router.push("/sov");
                }}
              >
                {step.nextLabel ?? "Next"}
              </Button>
            </>
          }
        />
      );
    }

    if (step.id === "p1-finish") {
      return (
        <TourOverlay
          step={step}
          onPause={onPause}
          actions={
            <>
              <button
                type="button"
                className={SECONDARY_BUTTON}
                onClick={() => {
                  if (!session.replay) {
                    saveTourProgress({ phase1: "completed", phase2: "in_progress", lastStep: "p2-offer" }).catch(() => {});
                  }
                  setSession(null);
                }}
              >
                Maybe later
              </button>
              <Button
                type="button"
                className="w-auto! px-5 py-2 text-sm"
                onClick={() => {
                  if (!session.replay) {
                    saveTourProgress({ phase1: "completed", phase2: "in_progress", lastStep: "p2-dash-kpi" }).catch(() => {});
                  }
                  startAppTour(session.replay);
                }}
              >
                Take the tour
              </Button>
            </>
          }
        />
      );
    }

    if (step.id === "p2-offer") {
      return (
        <TourOverlay
          step={step}
          onPause={onPause}
          actions={
            <>
              <button type="button" className={SECONDARY_BUTTON} onClick={onPause}>
                Maybe later
              </button>
              <Button
                type="button"
                className="w-auto! px-5 py-2 text-sm"
                onClick={() => {
                  goTo("p2-dash-kpi");
                  router.push("/dashboard");
                }}
              >
                Take the tour
              </Button>
            </>
          }
        />
      );
    }

    if (step.id === "p2-done") {
      return (
        <TourOverlay
          step={step}
          onPause={onPause}
          actions={
            <Button type="button" className="w-auto! px-5 py-2 text-sm" onClick={() => finish("completed")}>
              Finish
            </Button>
          }
        />
      );
    }

    // Everything else: a highlighted spot with Back / Next / Skip tour.
    const next = neighbour("next");
    const prev = neighbour("prev");
    const routeMismatch =
      !!step.route && pathname !== step.route && !pathname.startsWith(`${step.route}/`);

    const navHref = hrefFromNavStepId(step.id);
    const appSteps = session.steps.filter((s) => s.id !== "p2-offer" && s.id !== "p2-done");
    const appIndex = appSteps.findIndex((s) => s.id === step.id);

    return (
      <TourOverlay
        step={step}
        progress={session.phase === 2 && appIndex >= 0 ? { current: appIndex + 1, total: appSteps.length } : undefined}
        routeMismatch={routeMismatch}
        onGoToRoute={() => step.route && router.push(step.route)}
        onBack={prev ? () => goTo(prev) : undefined}
        onNext={() => (next ? goTo(next) : finish("completed"))}
        nextLabel={step.nextLabel}
        onSkip={skip}
        onPause={onPause}
        extraAction={navHref ? { label: `Open ${step.title}`, onClick: () => router.push(navHref) } : undefined}
      />
    );
  }

  function renderResumePrompt() {
    if (!resumePrompt || session) return null;
    const promptStep: TourStep = {
      id: "resume",
      phase: resumePrompt.phase,
      layout: "modal",
      title: "Welcome back",
      body: "Do you want to pick up the tour where you left off?",
    };
    return (
      <TourOverlay
        step={promptStep}
        onPause={() => setResumePrompt(null)}
        actions={
          <>
            <button
              type="button"
              className={SECONDARY_BUTTON}
              onClick={() => {
                saveTourProgress({ [phaseKey(resumePrompt.phase)]: "skipped", lastStep: null }).catch(() => {});
                setResumePrompt(null);
              }}
            >
              Skip tour
            </button>
            <Button
              type="button"
              className="w-auto! px-5 py-2 text-sm"
              onClick={() => {
                const next = makeSession(resumePrompt.phase, resumePrompt.lastStep, false);
                setResumePrompt(null);
                setSession(next);
              }}
            >
              Resume
            </Button>
          </>
        }
      />
    );
  }

  return (
    <TourContext.Provider value={contextValue}>
      {children}
      {renderSession()}
      {renderResumePrompt()}
      {showUpgrade && <ProUpgradeModal featureName="Job Import (AI)" onClose={() => setShowUpgrade(false)} />}
    </TourContext.Provider>
  );
}
