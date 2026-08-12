import { docBytes, mergePdfSources, downloadPdfBlob } from "@/lib/billingPackagePdf";
import { buildRetentionReleaseCoverDoc, RetentionReleaseCoverData } from "@/lib/retentionReleaseCoverPdf";
import { buildLienWaiverDoc, LienWaiverData, LienWaiverKind } from "@/lib/lienWaiverPdf";
import { formatRetentionInvoiceNumber, parseRetentionReleaseAudit, RetentionRelease } from "@/lib/retentionReleasesDb";
import { loadLogoForPdf, LogoData } from "@/lib/invoiceCoverPdf";
import { DbJob } from "@/lib/jobs";
import { getContractorInfo } from "@/lib/sampleUser";
import { fetchCompanyProfile } from "@/lib/companyProfileDb";
import { fetchUserProfile, formatSignerLine } from "@/lib/userProfileDb";
import { fetchApplicationOptions } from "@/lib/sovLineItemsDb";

export type RetentionBillingPackageData = {
  cover: RetentionReleaseCoverData;
  lienWaivers: { kind: LienWaiverKind; data: LienWaiverData }[];
};

export async function exportRetentionBillingPackage(data: RetentionBillingPackageData): Promise<Blob> {
  const sourceBytes = [
    docBytes(buildRetentionReleaseCoverDoc(data.cover)),
    ...data.lienWaivers.map((waiver) => docBytes(buildLienWaiverDoc(waiver.data, waiver.kind))),
  ];
  const mergedBytes = await mergePdfSources(sourceBytes);
  const invoiceNumber = formatRetentionInvoiceNumber(data.cover.job.jobNumber, data.cover.releaseNumber);
  return downloadPdfBlob(mergedBytes, `${invoiceNumber}.pdf`);
}

const VALID_WAIVER_KINDS: LienWaiverKind[] = [
  "conditional-progress",
  "unconditional-progress",
  "conditional-final",
  "unconditional-final",
];

function endOfMonth(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return end.toISOString().slice(0, 10);
}

// Regenerates the invoice + waiver package for a release that already
// exists — the row-level "Download Package" action on the Retention page,
// for re-downloading a release billed in an earlier session (the wizard's
// own "Download Again" only works within the same session it was created
// in). Reconstructs the wizard's original inputs as faithfully as
// possible: waiver kind and per-line retention basis come from the
// release's own stored audit snapshot (not recomputed against today's SOV,
// which may have changed since); signature/claimant title come from the
// current saved profile, same as what a fresh wizard run defaults to.
export async function regenerateRetentionBillingPackage(release: RetentionRelease, job: DbJob): Promise<Blob> {
  const audit = parseRetentionReleaseAudit(release.notes);
  const waiverKind = VALID_WAIVER_KINDS.includes(audit?.waiverKind as LienWaiverKind)
    ? (audit!.waiverKind as LienWaiverKind)
    : release.isFinal
    ? "conditional-final"
    : "conditional-progress";

  // Prefer the billing-time snapshot; fall back to treating the release
  // amount as its own basis (100%) if no snapshot is available at all.
  const retentionBasis =
    audit && audit.lines.length > 0
      ? audit.lines.reduce((sum, l) => sum + l.retentionHeld, 0)
      : release.amountReleased;

  const releasedThrough = release.releasedThrough ?? endOfMonth(release.releaseDate);

  const [contractor, profile, userProfile, applicationOptions] = await Promise.all([
    getContractorInfo(),
    fetchCompanyProfile(),
    fetchUserProfile(),
    fetchApplicationOptions(job.id),
  ]);
  const latestApp = applicationOptions[applicationOptions.length - 1];

  let logo: LogoData | undefined;
  if (profile?.logoUrl) {
    logo = (await loadLogoForPdf(profile.logoUrl)) ?? undefined;
  }

  return exportRetentionBillingPackage({
    cover: {
      job,
      releaseNumber: release.releaseNumber,
      invoiceDate: release.releaseDate,
      releasedThrough,
      isFinal: release.isFinal,
      retentionBasis,
      releaseAmount: release.amountReleased,
      sourceApplicationNumber: latestApp?.applicationNumber ?? "—",
      sourcePeriodTo: latestApp?.periodTo ?? releasedThrough,
      logo,
    },
    lienWaivers: [
      {
        kind: waiverKind,
        data: {
          job,
          claimantName: contractor.company,
          amountOfCheck: release.amountReleased,
          throughDate: releasedThrough,
          signatureDate: release.paymentDate ?? release.releaseDate,
          claimantTitle: formatSignerLine(userProfile),
          unpaidProgressDates: "",
          unpaidProgressAmounts: "",
          disputedExtrasAmount: 0,
          signatureDataUrl: userProfile?.signatureData || undefined,
        },
      },
    ],
  });
}
