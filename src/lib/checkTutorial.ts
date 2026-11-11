// Wording for the "Record a Check" step-by-step tutorial. Edit the text here.

import type { TourStep } from "@/lib/tourContent";

export const CHECK_TUTORIAL_STEPS: TourStep[] = [
  {
    id: "check-details",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="check-details"]'],
    title: "The check",
    body: "Enter the check, wire or ACH number, the date the money arrived, and the total amount on the check. The number is what ties the payments together later.",
  },
  {
    id: "check-list",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="check-list"]'],
    title: "Your open pay apps",
    body: "Every certified pay app that still has a balance is listed here, grouped by job. Use the search box to find a job or GC.",
  },
  {
    id: "check-amounts",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="check-first-row"]', '[data-tour="check-list"]'],
    title: "Split the check",
    body: "Type how much of the check goes to each pay app. Fill enters the pay app's balance, or whatever is left on the check if that's less. Leave a pay app empty if this check doesn't cover it.",
  },
  {
    id: "check-summary",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="check-summary"]'],
    title: "Check the math",
    body: "This bar shows the check total, how much you've assigned, and what's left over. Left over has to be $0.00 before you can save, so nothing gets lost or counted twice.",
  },
  {
    id: "check-save",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="check-save"]'],
    title: "Record the check",
    body: "This saves one payment on each pay app you filled in, all with the same check number and date. Each one shows up in that pay app's Payment History.",
  },
];
