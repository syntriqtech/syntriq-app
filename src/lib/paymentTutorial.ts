// Wording for the "Record Payment" step-by-step tutorial. Edit the text here.
// Steps 1-2 are on the Record Payment list. The rest are on a pay application's page:
// steps 3-4 on its Overview tab, steps 5-9 on its Record Payments tab.
// The "certify" step only shows while the pay app isn't certified yet.

import type { TourStep } from "@/lib/tourContent";

export type PaymentTutorialStep = TourStep & {
  page: "list" | "detail";
  /** Which tab of the pay application page this step needs open. */
  tab?: "overview" | "payment";
};

export const PAYMENT_TUTORIAL_STEPS: PaymentTutorialStep[] = [
  {
    id: "pay-jobs",
    page: "list",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="pay-job-list"]'],
    title: "Pick a job",
    body: "Each row is one job, with how much you've billed and how many pay apps it has. Click a job to open its pay apps. Or press Next and Syntriq opens the first job for you.",
  },
  {
    id: "pay-apps",
    page: "list",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="pay-apps-panel"]'],
    title: "Pick a pay app",
    body: "These are the job's pay apps, with the amount due, how much you've received and the status. Click View on the one you got paid for. Or press Next and Syntriq opens the first one for you.",
  },
  {
    id: "pay-status",
    page: "detail",
    tab: "overview",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="pay-status"]'],
    title: "Check the status",
    body: "The badge shows where this pay app stands. You can only record a payment on a certified pay app. If it isn't certified yet, you'll get a button to certify it in a moment.",
  },
  {
    id: "pay-tab",
    page: "detail",
    tab: "overview",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="pay-tab-record"]'],
    title: "Open Record Payments",
    body: "Payments are recorded on this tab. Click it to continue, or press Next and Syntriq opens it for you.",
  },
  {
    id: "pay-summary",
    page: "detail",
    tab: "payment",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="pay-summary"]'],
    title: "Where you stand",
    body: "Amount due is what the GC owes on this pay app. Paid so far is what you've recorded, and Balance due is what's left. Retention held is money the GC is holding back, so it isn't part of this payment.",
  },
  {
    id: "pay-certify",
    page: "detail",
    tab: "payment",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="pay-gate"]'],
    title: "Certify this pay app first",
    body: "Payments can only be recorded on a certified pay app. Once the GC has certified yours, press Mark certified. The tutorial continues on its own as soon as it's done.",
  },
  {
    id: "pay-fields",
    page: "detail",
    tab: "payment",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="pay-gate"]', '[data-tour="pay-fields"]'],
    title: "Enter the payment",
    body: "Enter the date the money arrived and the amount you received. Use this fills in the full balance. A check or wire number is optional but helps you match your bank statement.",
  },
  {
    id: "pay-record",
    page: "detail",
    tab: "payment",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="pay-record-btn"]', '[data-tour="pay-gate"]'],
    title: "Record it",
    body: "Press Record Payment to save it. It's added to Payment History below and your balance due updates. A partial payment is fine, and you can record the rest later.",
  },
  {
    id: "pay-history",
    page: "detail",
    tab: "payment",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="pay-history"]'],
    title: "Payment history",
    body: "Every payment you've recorded is listed here. If you made a mistake, Delete moves it to Recently Deleted, where you can restore it.",
  },
];

/** The first step on the pay application page's Record Payments tab. */
export const PAYMENT_TUTORIAL_FIRST_RECORD_STEP = 4;

/** The step that waits for the pay app to be certified. */
export const PAYMENT_TUTORIAL_CERTIFY_ID = "pay-certify";
