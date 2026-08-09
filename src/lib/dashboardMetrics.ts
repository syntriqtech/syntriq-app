import { DbJob } from "@/lib/jobs";
import { fetchApplicationOptions, fetchSovItems } from "@/lib/sovLineItemsDb";
import { computeLine, sumLines } from "@/lib/payAppMath";
import { fetchAllPayApplications, PayApplication } from "@/lib/payApplicationsDb";
import { fetchAllPaymentsForDashboard } from "@/lib/payAppPaymentsDb";

export type JobMetrics = {
  id: string;
  jobName: string;
  jobNumber: string;
  customer: string;
  contractValue: number;
  billedToDate: number;
  balanceToFinish: number;
  percentComplete: number;
  retention: number;
  status: "Active" | "On Hold" | "Closed";
  currentApplicationNumber: string | null;
  contractPercentComplete: number;
  contractValueBase: number;
  contractBilledToDate: number;
  hasChangeOrders: boolean;
  changeOrderPercentComplete: number;
  changeOrderValue: number;
  changeOrderBilledToDate: number;
};

export async function computeJobMetrics(job: DbJob): Promise<JobMetrics> {
  const applications = await fetchApplicationOptions(job.id);
  const latest = applications[applications.length - 1];
  const { lines, changeOrders } = latest
    ? await fetchSovItems(job.id, latest.applicationNumber)
    : { lines: [], changeOrders: [] };
  const cwRate = job.retentionRateCW / 100;
  const smRate = job.retentionRateSM / 100;
  const computedContract = lines.map((line) => computeLine(line, cwRate, smRate));
  const computedChangeOrders = changeOrders.map((line) => computeLine(line, cwRate, smRate));
  const contractTotals = sumLines(computedContract);
  const changeOrderTotals = sumLines(computedChangeOrders);
  const totals = sumLines([...computedContract, ...computedChangeOrders]);
  const netChangeOrders = changeOrders.reduce((sum, co) => sum + co.scheduledValue, 0);
  const revisedContractValue = job.contractValue + netChangeOrders;

  return {
    id: job.id,
    jobName: job.jobName,
    jobNumber: job.jobNumber,
    customer: job.customer,
    contractValue: revisedContractValue,
    billedToDate: totals.totalCompleted,
    balanceToFinish: revisedContractValue - totals.totalCompleted,
    percentComplete: revisedContractValue !== 0 ? Math.round((totals.totalCompleted / revisedContractValue) * 100) : 0,
    retention: totals.retention,
    status: "Active",
    currentApplicationNumber: latest?.applicationNumber ?? null,
    contractPercentComplete: Math.round(contractTotals.percentComplete),
    contractValueBase: contractTotals.scheduledValue,
    contractBilledToDate: contractTotals.totalCompleted,
    hasChangeOrders: changeOrders.length > 0,
    changeOrderPercentComplete: Math.round(changeOrderTotals.percentComplete),
    changeOrderValue: changeOrderTotals.scheduledValue,
    changeOrderBilledToDate: changeOrderTotals.totalCompleted,
  };
}

export async function computeAllJobMetrics(jobs: DbJob[]): Promise<JobMetrics[]> {
  return Promise.all(jobs.map(computeJobMetrics));
}

export type AgingBucket = { label: string; amount: number; color: string };

export async function fetchBillingActivity() {
  const [applications, payments] = await Promise.all([fetchAllPayApplications(), fetchAllPaymentsForDashboard()]);
  return { applications, payments };
}

function daysBetween(earlier: string, later: Date) {
  const ms = later.getTime() - new Date(earlier).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

type DashboardPayment = { id: string; payAppId: string; jobId: string; amount: number; paymentDate: string };

export function computeAgingBuckets(
  applications: PayApplication[],
  payments: DashboardPayment[],
  today: Date = new Date()
): { total: number; buckets: AgingBucket[] } {
  // Sum payments per pay application (not per job) for accurate matching
  const paidByApp = new Map<string, number>();
  for (const payment of payments) {
    paidByApp.set(payment.payAppId, (paidByApp.get(payment.payAppId) ?? 0) + payment.amount);
  }

  let current = 0;
  let days31to60 = 0;
  let days61to90 = 0;
  let days90plus = 0;

  for (const app of applications) {
    const totalPaid = paidByApp.get(app.id) ?? 0;
    // currentPaymentDue is what was invoiced for this period; subtract what's been paid
    const unpaid = Math.max(0, app.currentPaymentDue - totalPaid);
    if (unpaid <= 0.01) continue;
    const age = daysBetween(app.applicationDate, today);
    if (age <= 30) current += unpaid;
    else if (age <= 60) days31to60 += unpaid;
    else if (age <= 90) days61to90 += unpaid;
    else days90plus += unpaid;
  }

  const buckets: AgingBucket[] = [
    { label: "Current", amount: current, color: "#1D8F96" },
    { label: "31–60 days", amount: days31to60, color: "#3FA9A0" },
    { label: "61–90 days", amount: days61to90, color: "#956512" },
    { label: "90+ days", amount: days90plus, color: "#B5443A" },
  ];

  return { total: current + days31to60 + days61to90 + days90plus, buckets };
}

export type BilledMonthComparison = {
  thisMonth: number;
  lastMonth: number;
  percentChange: number | null; // null when lastMonth is 0 — percent change is undefined
};

// Buckets by applicationDate (the "Application date" field on the form) so the
// month a bill lands in matches what's visually on the pay application itself.
export function computeBilledMonthComparison(
  applications: PayApplication[],
  today: Date = new Date()
): BilledMonthComparison {
  const thisMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const lastMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthKey = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}`;

  const sumFor = (monthKey: string) =>
    applications
      .filter((app) => app.applicationDate.slice(0, 7) === monthKey)
      .reduce((sum, app) => sum + app.amountBilled, 0);

  const thisMonth = sumFor(thisMonthKey);
  const lastMonth = sumFor(lastMonthKey);
  const percentChange = lastMonth !== 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : null;

  return { thisMonth, lastMonth, percentChange };
}

// Buckets by periodTo (the billing period end date) — a pay app with period
// end 06/30/2026 counts toward June, regardless of when it was created or
// dated. This is the field the Monthly Billing chart's drill-down reconciles
// against, so both must stay on the same field.
export function computeMonthlyBillingChart(
  applications: PayApplication[],
  today: Date = new Date()
): { monthLabels: string[]; monthKeys: string[]; billed: number[] } {
  const months: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const billed = months.map((month) =>
    applications
      .filter((app) => app.periodTo.slice(0, 7) === month)
      .reduce((sum, app) => sum + app.amountBilled, 0)
  );

  const monthLabels = months.map((m) => {
    const [y, mo] = m.split("-").map(Number);
    return new Date(y, mo - 1, 1).toLocaleDateString("en-US", { month: "short" });
  });

  return { monthLabels, monthKeys: months, billed };
}

export type MonthDrilldownPayApp = {
  id: string;
  applicationNumber: string;
  periodTo: string;
  amount: number;
};

export type MonthDrilldownJobRow = {
  jobId: string;
  jobName: string;
  jobNumber: string;
  customer: string;
  total: number;
  payApps: MonthDrilldownPayApp[];
};

export type MonthDrilldown = {
  monthKey: string;
  monthLabel: string;
  grandTotal: number;
  jobRows: MonthDrilldownJobRow[];
};

// Same periodTo-bucketing as computeMonthlyBillingChart, broken out per job so
// the sum of jobRows[].total always reconciles exactly with that month's bar.
export function computeMonthBillingDrilldown(
  applications: PayApplication[],
  jobs: DbJob[],
  monthKey: string
): MonthDrilldown {
  // Skip $0 pay apps — they add nothing to the total and just clutter the list.
  const matches = applications.filter(
    (app) => app.periodTo.slice(0, 7) === monthKey && app.amountBilled !== 0
  );

  const byJob = new Map<string, PayApplication[]>();
  for (const app of matches) {
    const list = byJob.get(app.jobId);
    if (list) list.push(app);
    else byJob.set(app.jobId, [app]);
  }

  const jobRows: MonthDrilldownJobRow[] = Array.from(byJob.entries()).map(([jobId, apps]) => {
    const job = jobs.find((j) => j.id === jobId);
    return {
      jobId,
      jobName: job?.jobName || job?.jobNumber || "Unknown job",
      jobNumber: job?.jobNumber ?? "",
      customer: job?.customer ?? "—",
      total: apps.reduce((sum, a) => sum + a.amountBilled, 0),
      payApps: [...apps]
        .sort((a, b) => a.periodTo.localeCompare(b.periodTo))
        .map((a) => ({
          id: a.id,
          applicationNumber: a.applicationNumber,
          periodTo: a.periodTo,
          amount: a.amountBilled,
        })),
    };
  });

  jobRows.sort((a, b) => b.total - a.total);

  const [y, m] = monthKey.split("-").map(Number);
  const monthLabel = new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const grandTotal = jobRows.reduce((sum, r) => sum + r.total, 0);

  return { monthKey, monthLabel, grandTotal, jobRows };
}
