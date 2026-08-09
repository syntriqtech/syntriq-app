import { DbJob } from "@/lib/jobs";
import { fetchApplicationOptions, fetchSovItems } from "@/lib/sovLineItemsDb";
import { computeLine, sumLines } from "@/lib/payAppMath";
import { fetchAllPayApplications, PayApplication } from "@/lib/payApplicationsDb";
import { fetchPayAppPayments } from "@/lib/payAppPaymentsDb";
import { fetchAllRetentionReleases, RetentionRelease } from "@/lib/retentionReleasesDb";

export type JobBillingRow = {
  jobId: string;
  jobName: string;
  jobNumber: string;
  customer: string;
  ctiPm: string;
  billingPlatform: string;
  revisedContractValue: number;
  billedToDate: number;
  percentBilled: number;
  balanceToFill: number;
  retentionHeld: number;
  retentionRate: number;
  paidToDate: number;
  openAR: number;
  lastPaymentDate: string | null;
  daysSinceLastPayment: number | null;
  currentBucket: "Current" | "31-60" | "61-90" | "90+";
  amountCurrent: number;
  amount31to60: number;
  amount61to90: number;
  amount90plus: number;
  isReadyForRetention: boolean;
  isOverdue90plus: boolean;
  isNotBilledThisPeriod: boolean;
  isReadyToClose: boolean;
  agingSeverityScore: number;
  lastBillingDate: string | null;
};

function daysBetween(earlier: string, today: Date): number {
  const ms = today.getTime() - new Date(earlier).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export async function computeJobBillingRows(
  jobs: DbJob[],
  today: Date = new Date()
): Promise<JobBillingRow[]> {
  const [allApplications, allRetentionReleases] = await Promise.all([
    fetchAllPayApplications(),
    fetchAllRetentionReleases(),
  ]);

  // Build map of applications by job
  const applicationsByJob = new Map<string, PayApplication[]>();
  for (const app of allApplications) {
    if (!applicationsByJob.has(app.jobId)) applicationsByJob.set(app.jobId, []);
    applicationsByJob.get(app.jobId)!.push(app);
  }

  // Build map of retention releases by job
  const releasesByJob = new Map<string, RetentionRelease[]>();
  for (const rel of allRetentionReleases) {
    if (!releasesByJob.has(rel.jobId)) releasesByJob.set(rel.jobId, []);
    releasesByJob.get(rel.jobId)!.push(rel);
  }

  const rows: JobBillingRow[] = [];

  for (const job of jobs) {
    const applications = await fetchApplicationOptions(job.id);
    const latest = applications[applications.length - 1];

    // Fetch SOV for latest application
    let billedToDate = 0;
    let retentionHeld = 0;
    let netChangeOrders = 0;

    if (latest) {
      const { lines, changeOrders } = await fetchSovItems(job.id, latest.applicationNumber);
      const cwRate = job.retentionRateCW / 100;
      const smRate = job.retentionRateSM / 100;
      const allLines = [...lines, ...changeOrders];
      const computed = allLines.map((line) => computeLine(line, cwRate, smRate));
      const totals = sumLines(computed);
      billedToDate = totals.totalCompleted;
      retentionHeld = totals.retention;
      netChangeOrders = changeOrders.reduce((sum, co) => sum + co.scheduledValue, 0);
    }

    const revisedContractValue = job.contractValue + netChangeOrders;
    const percentBilled = revisedContractValue !== 0 ? (billedToDate / revisedContractValue) * 100 : 0;
    const balanceToFill = Math.max(0, revisedContractValue - billedToDate);

    // Fetch all pay applications with their payments for AR calculation
    const jobApps = applicationsByJob.get(job.id) ?? [];

    // Calculate total paid and outstanding per application
    let totalPaid = 0;
    let openAR = 0;
    let lastPaymentDate: string | null = null;
    let daysSinceLastPayment: number | null = null;

    // For aging buckets, we need to bucket the outstanding balance by application date
    let currentBucket: "Current" | "31-60" | "61-90" | "90+" = "Current";
    let amountCurrent = 0;
    let amount31to60 = 0;
    let amount61to90 = 0;
    let amount90plus = 0;

    const sortedApps = [...jobApps].sort((a, b) => a.applicationDate.localeCompare(b.applicationDate));

    for (const app of sortedApps) {
      const payments = await fetchPayAppPayments(app.id);
      const appPaymentTotal = payments.reduce((sum, p) => sum + p.amountPaid, 0);
      totalPaid += appPaymentTotal;

      // Outstanding balance for this application = current payment due - amount paid
      const outstandingBalance = Math.max(0, app.currentPaymentDue - appPaymentTotal);
      openAR += outstandingBalance;

      // Track last payment date across all applications
      if (payments.length > 0) {
        const sorted = [...payments].sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
        const appLastPaymentDate = sorted[0].paymentDate;
        if (!lastPaymentDate || appLastPaymentDate > lastPaymentDate) {
          lastPaymentDate = appLastPaymentDate;
        }
      }

      // Bucket the outstanding balance by application age
      if (outstandingBalance > 0.01) {
        const age = daysBetween(app.applicationDate, today);
        if (age <= 30) {
          amountCurrent += outstandingBalance;
        } else if (age <= 60) {
          amount31to60 += outstandingBalance;
        } else if (age <= 90) {
          amount61to90 += outstandingBalance;
        } else {
          amount90plus += outstandingBalance;
        }
      }
    }

    // Add retention release AR to openAR, aging, and totalPaid
    const jobReleases = releasesByJob.get(job.id) ?? [];
    for (const rel of jobReleases) {
      // Any retention payment received counts toward totalPaid and lastPaymentDate
      if (rel.amountPaid > 0) {
        totalPaid += rel.amountPaid;
        if (rel.paymentDate && (!lastPaymentDate || rel.paymentDate > lastPaymentDate)) {
          lastPaymentDate = rel.paymentDate;
        }
      }
      // Only billed (sent) releases contribute to outstanding AR — drafts are not yet receivable
      if (rel.status === "billed") {
        const outstanding = Math.max(0, rel.amountReleased - rel.amountPaid);
        if (outstanding > 0.01) {
          openAR += outstanding;
          const age = daysBetween(rel.releaseDate, today);
          if (age <= 30) amountCurrent += outstanding;
          else if (age <= 60) amount31to60 += outstanding;
          else if (age <= 90) amount61to90 += outstanding;
          else amount90plus += outstanding;
        }
      }
    }

    if (lastPaymentDate) {
      daysSinceLastPayment = daysBetween(lastPaymentDate, today);
    }

    // Last billing date
    let lastBillingDate: string | null = null;
    if (jobApps.length > 0) {
      const sorted = [...jobApps].sort((a, b) => b.applicationDate.localeCompare(a.applicationDate));
      lastBillingDate = sorted[0].applicationDate;
    }

    // Status flags
    const isReadyForRetention = percentBilled >= 100 && retentionHeld > 0;
    const isOverdue90plus = amount90plus > 0;
    const isNotBilledThisPeriod = lastBillingDate ? daysBetween(lastBillingDate, today) > 30 : true;
    const isReadyToClose = percentBilled >= 100 && openAR <= 0.01;

    // Aging severity score: weight buckets so 90+ dominates, break ties by openAR
    const agingSeverityScore =
      amount90plus * 1e12 +
      amount61to90 * 1e9 +
      amount31to60 * 1e6 +
      amountCurrent * 1e3 +
      openAR;

    rows.push({
      jobId: job.id,
      jobName: job.jobName,
      jobNumber: job.jobNumber,
      customer: job.customer,
      ctiPm: job.ctiPm,
      billingPlatform: job.billingPlatform ?? "",
      revisedContractValue,
      billedToDate,
      percentBilled: Math.round(percentBilled * 10) / 10,
      balanceToFill,
      retentionHeld,
      retentionRate: job.retentionRateCW,
      paidToDate: totalPaid,
      openAR,
      lastPaymentDate,
      daysSinceLastPayment,
      currentBucket,
      amountCurrent,
      amount31to60,
      amount61to90,
      amount90plus,
      isReadyForRetention,
      isOverdue90plus,
      isNotBilledThisPeriod,
      isReadyToClose,
      agingSeverityScore,
      lastBillingDate,
    });
  }

  return rows;
}
