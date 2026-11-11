// Wording for the "Jobs" step-by-step tutorial. Edit the text here.
// Steps run in order. Step 1 is on the Jobs list; the rest are on a job's detail page.

import type { TourStep } from "@/lib/tourContent";

export type JobsTutorialStep = TourStep & { page: "list" | "detail" };

export const JOBS_TUTORIAL_STEPS: JobsTutorialStep[] = [
  {
    id: "jobs-list",
    page: "list",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="jobs-table"]'],
    title: "Your jobs",
    body: "Each row is one project. Use the search box or the sort buttons to find a job. Click any job to open its details and continue. Or press Next and Syntriq opens the first one for you.",
  },
  {
    id: "jobs-detail-header",
    page: "detail",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="job-header"]'],
    title: "Job details",
    body: "This is everything about one job: who the GC is, who manages it, and when billing is due. The ring on the right shows how much of the contract you've billed.",
  },
  {
    id: "jobs-view-sov",
    page: "detail",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="job-view-sov"]'],
    title: "View SOV",
    body: "Opens this job's Schedule of Values. That's the billing grid with every line of the job and how much has been billed on each.",
  },
  {
    id: "jobs-create-pay-app",
    page: "detail",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="job-create-payapp"]'],
    title: "Create pay app",
    body: "Starts your next pay application for this job. Syntriq carries forward what you billed before, so you only enter what you completed this period.",
  },
  {
    id: "jobs-bars",
    page: "detail",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="job-bars"]'],
    title: "Progress bars",
    body: "The Contract bar shows how much of the original contract you've billed. If the job has change orders, a second Change orders bar appears under it with its own total. A bar turns green when it's fully billed.",
  },
  {
    id: "jobs-pay-apps",
    page: "detail",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="job-payapps"]'],
    title: "Pay applications",
    body: "Every pay app you've made for this job is listed here with its date, amount and whether it's been paid. Click a number to open it. All pay apps takes you to this job's SOV screen.",
  },
  {
    id: "jobs-change-orders",
    page: "detail",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="job-change-orders"]'],
    title: "Change orders",
    body: "Changes to the original contract, with their amount and approval status. All COs opens the full change order list for this job.",
  },
  {
    id: "jobs-retention",
    page: "detail",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="job-retention"]'],
    title: "Current retention",
    body: "Retention is money the GC holds back from each payment. Held is the total held so far, Released is what they've paid back, and Remaining is what's still owed to you. View opens the Retention page.",
  },
];
