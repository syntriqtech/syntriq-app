// Wording for the "Retention Release Wizard" step-by-step tutorial. Edit the text here.
// Each step says which wizard page (1-4) it belongs on.

import type { TourStep } from "@/lib/tourContent";

export type RetentionWizardTutorialStep = TourStep & { wizardStep: 1 | 2 | 3 | 4 };

export const RETENTION_WIZARD_TUTORIAL_STEPS: RetentionWizardTutorialStep[] = [
  {
    id: "wiz-overview",
    wizardStep: 1,
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="wiz-rail"]'],
    title: "Four quick steps",
    body: "This form bills the retention a GC has been holding back: Eligibility, Release Amount, Lien Waiver, then Review & Confirm. Nothing is saved until the very last button.",
  },
  {
    id: "wiz-lines",
    wizardStep: 1,
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="wiz-lines"]'],
    title: "Which lines to release",
    body: "Each row is a line of your contract that has retention held. Check the lines you want to bill now and uncheck any you want to keep held. 100% done lines are ready to release. Step-down eligible means the job's retention terms let you release part of it early.",
  },
  {
    id: "wiz-amounts",
    wizardStep: 2,
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="wiz-amounts"]'],
    title: "How much to release",
    body: "Type the amount for each line, up to what's held on it. Use Release all to take the full amount, or Use suggested when a step-down amount is offered. A line turns red if it's over its limit. Press Next on this page once every line has an amount.",
  },
  {
    id: "wiz-summary",
    wizardStep: 2,
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="wiz-summary"]'],
    title: "Release summary",
    body: "This adds it all up: the retention on your selected lines, what you're releasing now, and what remains held. The total can't be more than the retention still available on the job.",
  },
  {
    id: "wiz-waiver",
    wizardStep: 3,
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="wiz-waiver"]'],
    title: "Pick the lien waiver",
    body: "Syntriq creates a California lien waiver with this release. Conditional Progress is for when you send the bill. Unconditional Progress is only for after you've been paid. Conditional Final is for the last retention bill. Syntriq picks a default for you, and you can change it.",
  },
  {
    id: "wiz-details",
    wizardStep: 3,
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="wiz-details"]'],
    title: "Dates and signature",
    body: "The billing date is today unless you change it. Released through is the last date your waiver covers. Below these, add your name and title and adopt your signature so it's stamped on the waiver. Press Next on this page once both dates are filled in.",
  },
  {
    id: "wiz-confirm",
    wizardStep: 4,
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="wiz-confirm"]', '[data-tour="wiz-rail"]'],
    title: "Review, then confirm",
    body: "Check everything here. Only when you press Confirm does Syntriq record the release as Billed, add it to your receivables and download the invoice and lien waiver. Not ready? Press Back or close the form and nothing is saved.",
  },
];
