// Wording for the "Retention" step-by-step tutorial. Edit the text here.

import type { TourStep } from "@/lib/tourContent";

export const RETENTION_TUTORIAL_STEPS: TourStep[] = [
  {
    id: "ret-totals",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="ret-summary"]'],
    title: "Your retention totals",
    body: "Total held is all the retention your GCs are holding back across your active jobs. Available to release is what you haven't billed yet. Ready to bill counts jobs that are 100% complete. Released is what you've billed or been paid.",
  },
  {
    id: "ret-jobs",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="ret-table"]'],
    title: "Retention by job",
    body: "Each row is one job: its contract sum, the retention held so far, how much has been released, what remains, and the percent billed.",
  },
  {
    id: "ret-status",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="ret-status"]', '[data-tour="ret-table"]'],
    title: "Status",
    body: "Held means the retention is still being held. Ready to Bill means the job is 100% complete and you can bill the retention. Partial Release means you've billed some of it. Retention Submitted means all of it has been billed.",
  },
  {
    id: "ret-bill",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="ret-bill"]', '[data-tour="ret-table"]'],
    title: "Bill Retention",
    body: "When you're ready to collect, press Bill Retention on a job. A guided form opens: choose which lines to release (uncheck any to keep their retention held), enter the amount for each, pick the lien waiver and dates, then review. Nothing is saved or sent until you press Confirm. You don't need to open it now.",
  },
  {
    id: "ret-history",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="ret-history"]', '[data-tour="ret-table"]'],
    title: "Release history",
    body: "Click a job's name to open its Release History. Each release shows its number, date, whether it's Partial or Final, the amount, what's been paid, and its status: Draft, Billed or Paid. Download Package builds the paperwork for that release. Once you've billed retention, the history shows up here.",
  },
  {
    id: "ret-payment",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="ret-history"]', '[data-tour="ret-table"]'],
    title: "Record the payment",
    body: "When the GC pays, press Mark Paid on the release. Enter the payment date and the amount you received, plus a reference if you have one. If the amount differs from what you billed, Syntriq asks for a reason, like \"GC withheld $5.85 for a backcharge\". It also checks that the job's pay apps and other releases are paid first, and warns you if they aren't. Billed one by mistake? Use Cancel. Recorded a payment by mistake? Use Undo.",
  },
  {
    id: "ret-close-out",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="ret-table"]'],
    title: "Closing out a job",
    body: "After you record the final retention payment, Syntriq asks whether the project was 100% funded. If you say yes, it checks that every pay app and release is paid, then offers to archive the job. Archiving moves it off your active list, locks it from edits and keeps all of its history. You can unarchive it from the Archive page.",
  },
];

/** The step that shows a job's Release History, which the page opens for you. */
export const RETENTION_TUTORIAL_HISTORY_STEP = 4;
