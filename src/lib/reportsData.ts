import { DbJob } from "@/lib/jobs";
import { computeJobBillingRows, JobBillingRow } from "@/lib/billingSummary";
import { fetchAllPayApplications } from "@/lib/payApplicationsDb";
import { fetchAllPaymentsForDashboard } from "@/lib/payAppPaymentsDb";
import {
  fetchAllRetentionReleases,
  RetentionRelease,
} from "@/lib/retentionReleasesDb";
import {
  billingRowToRetentionRow,
  computeRetentionSummary,
  RetentionRow,
  RetentionSummary,
} from "@/lib/retentionData";

// ── Report catalog ──────────────────────────────────────────────────────────
// Config-driven list so Pro-tier reports (WIP schedule, CPA export) can be
// added later without restructuring the Reports tab — they show here as
// "coming soon" placeholders and aren't wired to any calculation logic yet.

export type ReportTier = "basic" | "pro";
export type ReportStatus = "available" | "coming_soon";

export type ReportDefinition = {
  id: string;
  title: string;
  description: string;
  href: string;
  tier: ReportTier;
  status: ReportStatus;
};

export const REPORT_DEFINITIONS: ReportDefinition[] = [
  {
    id: "billing-summary",
    title: "Billing Summary",
    description: "Contract value, billed, collected, and outstanding balance by job over any date range.",
    href: "/reports/billing-summary",
    tier: "basic",
    status: "available",
  },
  {
    id: "ar-aging",
    title: "AR Aging Snapshot",
    description: "Point-in-time, printable snapshot of outstanding receivables bucketed by age.",
    href: "/reports/ar-aging",
    tier: "basic",
    status: "available",
  },
  {
    id: "retention",
    title: "Retention Held vs. Released",
    description: "Total retention currently held vs. released, broken out by job.",
    href: "/reports/retention",
    tier: "basic",
    status: "available",
  },
  {
    id: "wip-schedule",
    title: "WIP Schedule",
    description: "Percentage-of-completion schedule for job costing and bonding.",
    href: "/reports/wip-schedule",
    tier: "pro",
    status: "coming_soon",
  },
  {
    id: "cpa-export",
    title: "CPA Year-End Export",
    description: "Tax-ready export package for your accountant.",
    href: "/reports/cpa-export",
    tier: "pro",
    status: "coming_soon",
  },
];

// ── Billing Summary ──────────────────────────────────────────────────────────
// No new math: contract value + outstanding balance come straight from
// computeJobBillingRows (same engine as AR Aging Summary); billed/collected
// are just pay_applications / pay_app_payments filtered to the selected
// date range and summed per job.

export type DateRange = { start: string; end: string };

export type BillingSummaryRow = {
  jobId: string;
  jobName: string;
  jobNumber: string;
  customer: string;
  contractValue: number;
  billedInRange: number;
  collectedInRange: number;
  outstandingBalance: number;
};

export function defaultYearRange(today: Date = new Date()): DateRange {
  const year = today.getFullYear();
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

export async function computeBillingSummaryReport(
  jobs: DbJob[],
  range: DateRange
): Promise<BillingSummaryRow[]> {
  const [billingRows, allApplications, allPayments] = await Promise.all([
    computeJobBillingRows(jobs),
    fetchAllPayApplications(),
    fetchAllPaymentsForDashboard(),
  ]);

  const billingByJob = new Map(billingRows.map((row) => [row.jobId, row]));

  const billedByJob = new Map<string, number>();
  for (const app of allApplications) {
    if (app.applicationDate < range.start || app.applicationDate > range.end) continue;
    billedByJob.set(app.jobId, (billedByJob.get(app.jobId) ?? 0) + app.amountBilled);
  }

  const collectedByJob = new Map<string, number>();
  for (const payment of allPayments) {
    if (payment.paymentDate < range.start || payment.paymentDate > range.end) continue;
    collectedByJob.set(payment.jobId, (collectedByJob.get(payment.jobId) ?? 0) + payment.amount);
  }

  return jobs.map((job) => {
    const billing = billingByJob.get(job.id);
    return {
      jobId: job.id,
      jobName: job.jobName,
      jobNumber: job.jobNumber,
      customer: job.customer,
      contractValue: billing?.revisedContractValue ?? job.contractValue,
      billedInRange: billedByJob.get(job.id) ?? 0,
      collectedInRange: collectedByJob.get(job.id) ?? 0,
      outstandingBalance: billing?.openAR ?? 0,
    };
  });
}

// ── AR Aging Snapshot ────────────────────────────────────────────────────────
// Pure reuse of the AR Aging Summary engine — just a static, exportable cut
// of the same rows rather than the live/interactive dashboard view.

export async function computeArAgingReport(jobs: DbJob[]): Promise<JobBillingRow[]> {
  const rows = await computeJobBillingRows(jobs);
  return rows
    .filter((row) => row.openAR > 0.01)
    .sort((a, b) => b.agingSeverityScore - a.agingSeverityScore);
}

// ── Retention Held vs. Released ─────────────────────────────────────────────
// Same pipeline the Retention tab uses (computeJobBillingRows + retention
// releases), minus the interactive billing/mark-paid actions.

export async function computeRetentionReport(
  jobs: DbJob[]
): Promise<{ rows: RetentionRow[]; summary: RetentionSummary }> {
  const [billingRows, allReleases] = await Promise.all([
    computeJobBillingRows(jobs),
    fetchAllRetentionReleases(),
  ]);

  const releasesByJob = new Map<string, RetentionRelease[]>();
  for (const rel of allReleases) {
    if (!releasesByJob.has(rel.jobId)) releasesByJob.set(rel.jobId, []);
    releasesByJob.get(rel.jobId)!.push(rel);
  }

  const rows = billingRows
    .map((row) => billingRowToRetentionRow(row, releasesByJob.get(row.jobId) ?? []))
    .filter((row) => row.retentionHeld > 0 || row.releases.length > 0)
    .sort((a, b) => b.retentionHeld - a.retentionHeld);

  const summary = computeRetentionSummary(rows);
  return { rows, summary };
}
