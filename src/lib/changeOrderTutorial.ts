// Wording for the "Change Orders" step-by-step tutorial. Edit the text here.
// The page has two screens: the job list, and one job's change orders.

import type { TourStep } from "@/lib/tourContent";

export type ChangeOrderTutorialStep = TourStep & { view: "list" | "cards" };

export const CHANGE_ORDER_TUTORIAL_STEPS: ChangeOrderTutorialStep[] = [
  {
    id: "co-totals",
    view: "list",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="co-kpi"]'],
    title: "Your change order totals",
    body: "A change order is a change to your original contract, like extra work or a deduct. These cards total what you've submitted to the GC, what's been approved, and how much of the approved amount you've billed so far.",
  },
  {
    id: "co-job",
    view: "list",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="co-job-list"]'],
    title: "Pick a job",
    body: "Change orders belong to a job. Click any job to see its change orders, or press Next and Syntriq opens the first one for you.",
  },
  {
    id: "co-header",
    view: "cards",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="co-job-header"]'],
    title: "What changed on this job",
    body: "Original contract is what you signed. Net change orders is the total of your approved changes, and Revised contract is the two added together. The pills count how many change orders are pending or approved.",
  },
  {
    id: "co-new",
    view: "cards",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="co-new"]'],
    title: "Add a change order",
    body: "Click New Change Order to add one, or press Next and the form opens for you.",
  },
  {
    id: "co-form",
    view: "cards",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="co-add-form"]'],
    title: "Fill in the details",
    body: "Describe what the change order covers and enter the amount, using a negative number for a deduct. You can attach the GC's paperwork if you have it. The top shows the CO number Syntriq will give it. Press Add CO to save it, or press Next to close this without adding anything.",
  },
  {
    id: "co-import",
    view: "cards",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="co-import"]'],
    title: "Import from a file (AI)",
    body: "Instead of typing it in, Import Change Order (AI) reads a change order request file and fills in the details. It's a Pro feature. You can edit every field, and nothing is created until you confirm.",
  },
  {
    id: "co-cards",
    view: "cards",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="co-cards"]'],
    title: "Your change orders",
    body: "Each card is one change order, with its number, status, description and amount. The strip at the bottom of each card tells you where it stands, such as how many days it's been pending, or Ready to apply to SOV.",
  },
  {
    id: "co-lifecycle",
    view: "cards",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="co-cards"]'],
    title: "Moving one along",
    body: "Click a card to open it. Use the Mark buttons to update its status, for example Mark Submitted once you've sent it to the GC, then Mark Approved. Add the GC's approval reference and attach their approval doc. Once it's approved, Apply adds it as a new line on your current pay app. That can't be undone.",
  },
  {
    id: "co-filters",
    view: "cards",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="co-filters"]'],
    title: "Filter the list",
    body: "Use these to show only Pending, Approved or Rejected change orders. All shows everything on the job.",
  },
  {
    id: "co-deleted",
    view: "cards",
    phase: 2,
    layout: "anchored",
    anchors: ['[data-tour="co-deleted"]'],
    title: "Deleted by mistake?",
    body: "A deleted change order moves to Recently deleted. Open it here and press Restore to bring it back. Delete permanently removes it for good.",
  },
];

/** The first step on each of the page's two screens. */
export const CHANGE_ORDER_TUTORIAL_FIRST = { list: 0, cards: 2 } as const;

/** The step that spotlights the New Change Order form (it opens as a popup). */
export const CHANGE_ORDER_TUTORIAL_FORM_STEP = 4;
