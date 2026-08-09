import { fetchPayApplicationsByJob, PayApplication } from "@/lib/payApplicationsDb";
import { fetchPayAppPayments } from "@/lib/payAppPaymentsDb";
import { fetchRetentionReleases, RetentionRelease } from "@/lib/retentionReleasesDb";

export type UnpaidApp = { app: PayApplication; outstanding: number };
export type UnpaidRelease = { release: RetentionRelease; outstanding: number };

export type VerificationResult =
  | { ok: true }
  | { ok: false; unpaidApps: UnpaidApp[]; unpaidReleases: UnpaidRelease[] };

/**
 * Checks every pay application and every billed retention release for a job.
 * Pass excludeReleaseId to skip the release currently being acted on
 * (so marking a release paid doesn't block itself).
 */
export async function verifyJobPayments(
  jobId: string,
  excludeReleaseId?: string
): Promise<VerificationResult> {
  const [apps, releases] = await Promise.all([
    fetchPayApplicationsByJob(jobId),
    fetchRetentionReleases(jobId),
  ]);

  const unpaidApps: UnpaidApp[] = [];
  for (const app of apps) {
    const payments = await fetchPayAppPayments(app.id);
    const totalPaid = payments.reduce((sum, p) => sum + p.amountPaid, 0);
    const outstanding = Math.max(0, app.currentPaymentDue - totalPaid);
    if (outstanding > 0.01) unpaidApps.push({ app, outstanding });
  }

  const unpaidReleases: UnpaidRelease[] = [];
  for (const rel of releases) {
    if (rel.id === excludeReleaseId) continue;
    if (rel.status === "billed") {
      const outstanding = Math.max(0, rel.amountReleased - rel.amountPaid);
      if (outstanding > 0.01) unpaidReleases.push({ release: rel, outstanding });
    }
  }

  if (unpaidApps.length === 0 && unpaidReleases.length === 0) return { ok: true };
  return { ok: false, unpaidApps, unpaidReleases };
}
