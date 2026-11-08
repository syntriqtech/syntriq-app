// All wording for the guided tour lives here so it is easy to edit in one place.
// Writing rules: short sentences, plain English, no exclamation points, no
// company names, and any jargon gets a one-line explanation the first time.

export type TourPhase = 1 | 2;

export type TourStep = {
  id: string;
  phase: TourPhase;
  title: string;
  body: string;
  /** "modal" = centered card over a dimmed page. "anchored" = card next to a highlighted spot. */
  layout: "modal" | "anchored";
  /** CSS selectors to highlight. If several, the highlight covers all of them. */
  anchors?: string[];
  /** The page this step belongs to. If the user is elsewhere, the tour offers a button to go there. */
  route?: string;
  routeLabel?: string;
  /** Explicit neighbours for Phase 1 (which branches). Phase 2 just uses list order. */
  next?: string | null;
  prev?: string | null;
  nextLabel?: string;
};

// ── Phase 1: set up your first job ───────────────────────────────────────

export const PHASE1_STEPS: TourStep[] = [
  {
    id: "p1-welcome",
    phase: 1,
    layout: "modal",
    title: "Welcome to Syntriq",
    body: "Let's get your first job in. It takes about 5 minutes.",
    next: "p1-choose",
  },
  {
    id: "p1-choose",
    phase: 1,
    layout: "modal",
    title: "How do you want to add your first job?",
    body: "Pick the way that suits you. You can always add more jobs later.",
    prev: "p1-welcome",
  },
  {
    id: "p1-customer",
    phase: 1,
    layout: "anchored",
    route: "/job-setup",
    routeLabel: "Job Setup",
    anchors: ["#customer"],
    title: "Who hired you",
    body: "Pick the general contractor (GC) who hired you, or type a new one. Syntriq saves it, so next time you can pick it from the list.",
    prev: "p1-choose",
    next: "p1-contract",
  },
  {
    id: "p1-contract",
    phase: 1,
    layout: "anchored",
    route: "/job-setup",
    routeLabel: "Job Setup",
    anchors: ["#contractValue", "#retentionRateCW"],
    title: "Contract value and retention",
    body: "Enter the full contract value. Then enter the retention percentage (money held back until the job closes). Your contract states the rate, often 5 or 10 percent.",
    prev: "p1-customer",
    next: "p1-billing",
  },
  {
    id: "p1-billing",
    phase: 1,
    layout: "anchored",
    route: "/job-setup",
    routeLabel: "Job Setup",
    anchors: ["#billingPlatform"],
    title: "Billing platform",
    body: "Say where you send your billing, such as Procore, GCPay, or email. Syntriq remembers the options you use.",
    prev: "p1-contract",
    next: "p1-save",
  },
  {
    id: "p1-save",
    phase: 1,
    layout: "anchored",
    route: "/job-setup",
    routeLabel: "Job Setup",
    anchors: ['[data-tour="job-save"]'],
    title: "Create the job",
    body: "Fill in the other fields marked with a star, then select Create job. You can edit the job later from Job Setup.",
    prev: "p1-billing",
    next: "p1-sov-intro",
    nextLabel: "I saved my job",
  },
  {
    id: "p1-excel",
    phase: 1,
    layout: "anchored",
    route: "/job-setup",
    routeLabel: "Job Setup",
    anchors: ['[data-tour="job-import"]'],
    title: "Import from Excel",
    body: "Select Job Import and choose your spreadsheet. Syntriq reads it and lets you review the job before saving. If the file does not read correctly, you can enter the job by hand instead.",
    prev: "p1-choose",
    next: "p1-sov-intro",
    nextLabel: "I saved my job",
  },
  {
    id: "p1-ai",
    phase: 1,
    layout: "anchored",
    route: "/job-setup",
    routeLabel: "Job Setup",
    anchors: ['[data-tour="job-import-ai"]'],
    title: "Import a contract PDF",
    body: "Select Job Import (AI) and choose your contract PDF. Syntriq reads it and fills in what it finds. Check every field before you save.",
    prev: "p1-choose",
    next: "p1-sov-intro",
    nextLabel: "I saved my job",
  },
  {
    id: "p1-sov-intro",
    phase: 1,
    layout: "modal",
    title: "Your job is saved",
    body: "Next is the Schedule of Values. This is where you break the contract into billable lines.",
    next: "p1-sov-list",
    nextLabel: "Show me",
  },
  {
    id: "p1-sov-list",
    phase: 1,
    layout: "anchored",
    route: "/sov",
    routeLabel: "Create Pay App",
    anchors: ['[data-tour="new-pay-app"]'],
    title: "Start a pay application",
    body: "Pick your job, then select New Pay Application. A pay application is the bill you send each billing period.",
    prev: "p1-sov-intro",
    next: "p1-sov-grid",
  },
  {
    id: "p1-sov-grid",
    phase: 1,
    layout: "anchored",
    route: "/sov",
    routeLabel: "Create Pay App",
    anchors: ['[data-tour="sov-grid"]'],
    title: "The Schedule of Values",
    body: "Each row is one billable line of your contract. Enter the work you completed this period. Syntriq works out the totals, percent complete, and retention for you.",
    prev: "p1-sov-list",
    next: "p1-finish",
  },
  {
    id: "p1-finish",
    phase: 1,
    layout: "modal",
    title: "Your first job is set up",
    body: "Want a quick tour of the rest of Syntriq?",
  },
];

// ── Phase 2: tour the app ────────────────────────────────────────────────

const DASHBOARD_STEPS: Omit<TourStep, "phase" | "layout" | "route" | "routeLabel">[] = [
  {
    id: "p2-dash-kpi",
    anchors: ['[data-tour="dash-kpi"]'],
    title: "Dashboard",
    body: "This is your home page. The top row shows active projects, total contract value, amount billed, and what is still outstanding. Look here first each day.",
  },
  {
    id: "p2-dash-ar",
    anchors: ['[data-tour="dash-open-ar"]'],
    title: "Open AR due",
    body: "AR means accounts receivable, the money customers owe you. This list shows unpaid billing by job. Select a row to go record a payment.",
  },
  {
    id: "p2-dash-outstanding",
    anchors: ['[data-tour="dash-outstanding"]'],
    title: "Outstanding payments",
    body: "This card totals unpaid billing and groups it by how late it is. Use it to see how much is overdue.",
  },
  {
    id: "p2-dash-chart",
    anchors: ['[data-tour="dash-chart"]'],
    title: "Monthly billing",
    body: "Each bar is how much you billed in a month. Select a month to see the pay applications behind it.",
  },
  {
    id: "p2-dash-checkin",
    anchors: ['[data-tour="dash-checkin"]'],
    title: "Billing check-in",
    body: "When jobs need a billing review this month, this banner counts them. The same count shows as a badge on the sidebar. Select Review now to go through them.",
  },
  {
    id: "p2-dash-active",
    anchors: ['[data-tour="dash-active-jobs"]'],
    title: "Active jobs",
    body: "Each card is one job and how far along its billing is. Use it for a quick look at where every job stands.",
  },
];

// Copy for each sidebar item, keyed by its route. A route with no entry here
// (for example a tab added later) is skipped rather than shown with made-up text.
export const NAV_COPY: Record<string, { title: string; body: string }> = {
  "/job-setup": {
    title: "Job Setup",
    body: "Create a new job and manage the ones already on the books. Use it each time you win a new contract.",
  },
  "/jobs": {
    title: "Job List",
    body: "Your active projects in one list. Select a row to open that job's details.",
  },
  "/billing-summary": {
    title: "AR Aging Summary",
    body: "A portfolio view of what is owed, how late it is, and retention held. Use it to spot jobs with overdue money.",
  },
  "/pay-applications": {
    title: "Record Payment",
    body: "Track billing progress and payment status by job. Use it when a payment arrives so your balances stay correct.",
  },
  "/billing-checkin": {
    title: "Billing Check-in",
    body: "Review which jobs you will bill this month. Use it at the start of each billing cycle so no job is missed.",
  },
  "/sov": {
    title: "Create Pay App",
    body: "Pick a job and enter what you completed this period. Syntriq does the math and carries earlier billing forward. Use it every billing period.",
  },
  "/change-orders": {
    title: "Change Orders",
    body: "View and manage each job's change orders, which are approved changes to the contract. Use it when the scope or price of a job changes.",
  },
  "/retention": {
    title: "Retention",
    body: "Retention (money held back until the job closes) held and released across your active jobs. Use it to see what is ready to bill for release.",
  },
  "/archive": {
    title: "Archive",
    body: "Fully funded, closed-out jobs, kept read-only with all history. Use it to look back at finished work.",
  },
  "/g702": {
    title: "G702 Cover Sheet",
    body: "The Application and Certificate for Payment, a summary of this period's billing. Use it to review the cover sheet before you send it.",
  },
  "/invoice-cover": {
    title: "Invoice Cover",
    body: "The cover sheet that goes out with every billing, with job totals, retention, and current payment due. Use it when your customer wants an invoice cover.",
  },
  "/lien-waivers": {
    title: "Lien Waivers",
    body: "The four California statutory waiver forms, pre-filled from the job. A lien waiver is a signed form saying you have been paid or will be. Use it when your customer asks for one with your pay application.",
  },
  "/download-package": {
    title: "Download Package",
    body: "Builds the full billing package for one application: pay application, invoice cover, and lien waivers. Use it when you are ready to send billing.",
  },
  "/reports": {
    title: "Reports",
    body: "Ready-to-share reports from your billing, AR, and retention data. Use it when you need numbers for a meeting or your accountant.",
  },
  "/activity": {
    title: "Activity",
    body: "A record of what has happened across your company's account. Use it to see who did what. Only owners can open it.",
  },
};

const NEVER_TOUR = new Set(["/dashboard", "/admin"]);

/**
 * Builds Phase 2 from the sidebar as it actually appears right now (so custom
 * order, hidden tabs and the owner-only Activity tab are all respected).
 */
export function buildPhase2Steps(navHrefsInOrder: string[]): TourStep[] {
  const steps: TourStep[] = [
    {
      id: "p2-offer",
      phase: 2,
      layout: "modal",
      title: "Take a quick tour?",
      body: "See what each part of Syntriq is for. It takes about 2 minutes.",
    },
    ...DASHBOARD_STEPS.map<TourStep>((s) => ({
      ...s,
      phase: 2,
      layout: "anchored",
      route: "/dashboard",
      routeLabel: "Dashboard",
    })),
  ];

  for (const href of navHrefsInOrder) {
    if (NEVER_TOUR.has(href)) continue;
    const copy = NAV_COPY[href];
    if (!copy) continue;
    steps.push({
      id: `p2-nav-${href}`,
      phase: 2,
      layout: "anchored",
      anchors: [`[data-tour="nav-${href}"]`],
      title: copy.title,
      body: copy.body,
      // Offered as a button on the card; the tour never navigates by itself.
      route: undefined,
      routeLabel: copy.title,
    });
  }

  steps.push({
    id: "p2-done",
    phase: 2,
    layout: "modal",
    title: "That is the tour",
    body: "You can replay it any time from Help & Support.",
  });

  return steps;
}

export function hrefFromNavStepId(id: string): string | null {
  return id.startsWith("p2-nav-") ? id.slice("p2-nav-".length) : null;
}
