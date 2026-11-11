// Wording for the "Create Pay App" step-by-step tutorial. Edit the text here.
// The page has three screens: the job list, a job's pay applications, and the
// billing grid. Each step says which screen it belongs on.

import type { TourStep } from "@/lib/tourContent";

export type PayAppTutorialStep = TourStep & { view: "list" | "bubbles" | "form" };

export const PAY_APP_TUTORIAL_STEPS: PayAppTutorialStep[] = [
  {
    id: "payapp-job",
    view: "list",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="sov-job-list"]'],
    title: "Pick a job",
    body: "Choose the job you're billing this period. Click any job, or press Next and Syntriq opens the first one for you.",
  },
  {
    id: "payapp-summary",
    view: "bubbles",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="sov-job-summary"]'],
    title: "Job snapshot",
    body: "This shows where the job stands: the revised contract value, how much you've billed to date, and the retention held. The bars show how much of the contract, and of any change orders, is billed.",
  },
  {
    id: "payapp-cards",
    view: "bubbles",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="sov-app-cards"]'],
    title: "Your pay applications",
    body: "Each card is one pay app, with its status, dates and the amount billed. Click a card to open and edit it. While a pay app is Submitted or Revised you can also Revise it or Mark certified. Once it's certified, it's locked.",
  },
  {
    id: "payapp-new",
    view: "bubbles",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="new-pay-app"]'],
    title: "Start a new pay app",
    body: "Click New Pay Application to bill the next period. Syntriq fills in the next application number for you. Or press Next and it opens for you.",
  },
  {
    id: "payapp-details",
    view: "form",
    phase: 2,
    layout: "anchored",
    anchors: ["#appNumber", "#appDate", "#periodTo"],
    title: "Application details",
    body: "The application number is filled in for you. Application date is the date of this bill, and Period to is the last day of the period you're billing. On your very first pay app in Syntriq you can type the number yourself, for example if you already billed this job somewhere else.",
  },
  {
    id: "payapp-grid",
    view: "form",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="sov-grid"]'],
    title: "Enter this period's work",
    body: "Each row is one line of your contract. Type what you completed this period in the This Period column. Previous Applications carries forward what you billed before. Syntriq works out Total Completed, % Complete, Balance to Finish and Retention for you. A row turns red if it would bill more than its Scheduled Value.",
  },
  {
    id: "payapp-stored",
    view: "form",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="sov-grid"]'],
    title: "Stored materials",
    body: "If you've bought materials for a line but haven't installed them yet, enter their value in Stored Materials. Each line has a link in that cell to add entries and attach your invoices as backup. Stored materials use their own retention rate, shown at the top of the page.",
  },
  {
    id: "payapp-change-orders",
    view: "form",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="sov-co"]'],
    title: "Change orders",
    body: "If this job has change orders, they're in this second table. Bill them the same way as your contract lines. The change orders themselves are managed on the Change Orders page.",
  },
  {
    id: "payapp-total",
    view: "form",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="sov-total"]'],
    title: "Grand total",
    body: "The totals across your contract lines and change orders, so you can check the whole bill at a glance before you save.",
  },
  {
    id: "payapp-save",
    view: "form",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="sov-save"]'],
    title: "Save it",
    body: "Press Save to store this application. Nothing is saved until you do. Save turns off if something needs fixing, like a row billing more than its Scheduled Value.",
  },
  {
    id: "payapp-finish",
    view: "form",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="sov-download"]', '[data-tour="sov-certify"]'],
    title: "Download and certify",
    body: "Download SOV saves a PDF of the schedule of values. After you save, Mark certified appears. Press it once the GC has certified the pay app, which locks it so you can record payments. Download Package builds the full billing package.",
  },
];

/** The first step on each of the page's three screens. */
export const PAY_APP_TUTORIAL_FIRST = { list: 0, bubbles: 1, form: 4 } as const;
