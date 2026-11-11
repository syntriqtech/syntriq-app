// Wording for the "Job Setup" step-by-step tutorial. Edit the text here.

import type { TourStep } from "@/lib/tourContent";

export const JOB_SETUP_TUTORIAL_STEPS: TourStep[] = [
  {
    id: "setup-import",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="job-import"]', '[data-tour="job-import-ai"]'],
    title: "Shortcut: import a job",
    body: "Job Import reads a spreadsheet and fills in the form. Job Import (AI) reads your contract PDF instead. Either way, check every field before you save. Or skip this and type the job in by hand.",
  },
  {
    id: "setup-name",
    phase: 2,
    layout: "anchored",
    anchors: ["#jobName", "#jobNumber"],
    title: "Name and job number",
    body: "Give the job a name you'll recognize, and enter your own job number. Both show up on your pay apps and lien waivers.",
  },
  {
    id: "setup-customer",
    phase: 2,
    layout: "anchored",
    anchors: ["#customer"],
    title: "Who hired you",
    body: "Pick the general contractor (GC) who hired you, or type a new one. Syntriq saves it, so next time you can pick it from the list.",
  },
  {
    id: "setup-addresses",
    phase: 2,
    layout: "anchored",
    anchors: ["#jobAddress", "#customerAddress"],
    title: "Addresses",
    body: "The job site address is where the work happens. The customer billing address is where the GC wants your bill sent. Owner and architect are optional.",
  },
  {
    id: "setup-contract",
    phase: 2,
    layout: "anchored",
    anchors: ["#contractFor", "#contractValue", "#contractDate"],
    title: "The contract",
    body: "Describe your scope of work, then enter the original contract value and the date you signed. Change orders get added later, not here.",
  },
  {
    id: "setup-retention",
    phase: 2,
    layout: "anchored",
    anchors: ["#retentionRateCW", "#retentionRateSM"],
    title: "Retention",
    body: "Retention is money the GC holds back from each payment until the job closes. Your contract states the rate, often 5 or 10 percent. Enter it as a number, so 10 means 10%.",
  },
  {
    id: "setup-pm",
    phase: 2,
    layout: "anchored",
    anchors: ["#ctiPm", "#certifiedPayroll"],
    title: "Project manager and payroll",
    body: "Enter who runs this job on your side, and say whether it's a certified payroll job.",
  },
  {
    id: "setup-billing",
    phase: 2,
    layout: "anchored",
    anchors: ["#paymentTerms", "#billingDueDay", "#billingPlatform"],
    title: "Billing",
    body: "Enter the day of the month your pay app is due and how you send it, such as Procore, GCPay or email. Syntriq remembers the platforms you use and uses the due day for reminders.",
  },
  {
    id: "setup-save",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="job-save"]'],
    title: "Create the job",
    body: "Fill in anything marked with a star, then select Create job. You can edit the job later from Job Setup.",
  },
];
