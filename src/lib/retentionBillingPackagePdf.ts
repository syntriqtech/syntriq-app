import { docBytes, mergePdfSources, downloadPdfBlob } from "@/lib/billingPackagePdf";
import { buildRetentionReleaseCoverDoc, RetentionReleaseCoverData } from "@/lib/retentionReleaseCoverPdf";
import { buildLienWaiverDoc, LienWaiverData, LienWaiverKind } from "@/lib/lienWaiverPdf";

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
  return downloadPdfBlob(mergedBytes, `${data.cover.job.jobNumber}-RET-${data.cover.releaseNumber}.pdf`);
}
