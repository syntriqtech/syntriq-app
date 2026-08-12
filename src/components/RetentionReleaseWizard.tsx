"use client";

import { useState, useEffect } from "react";
import { DbJob } from "@/lib/jobs";
import { createRetentionRelease } from "@/lib/retentionReleasesDb";
import { fetchApplicationOptions, fetchSovItems } from "@/lib/sovLineItemsDb";
import { computeLine, ComputedLine } from "@/lib/payAppMath";
import { LienWaiverKind } from "@/lib/lienWaiverPdf";
import { exportRetentionBillingPackage } from "@/lib/retentionBillingPackagePdf";
import { loadLogoForPdf, LogoData } from "@/lib/invoiceCoverPdf";
import { useCompanyProfile } from "@/hooks/useCompanyProfile";
import { getContractorInfo } from "@/lib/sampleUser";
import { fetchUserProfile, saveUserSignature, formatSignerLine } from "@/lib/userProfileDb";
import AdoptSignatureModal from "@/components/AdoptSignatureModal";

const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const fmtShort = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });

type LineRelease = {
  line: ComputedLine;
  selected: boolean;
  releaseAmount: string;
  suggestedAmount: number | null;
};

type WaiverKind = "conditional-progress" | "unconditional-progress" | "conditional-final";

const WAIVER_OPTIONS: { kind: WaiverKind; label: string; statute: string; description: string }[] = [
  {
    kind: "conditional-progress",
    label: "Conditional Waiver — Progress Payment",
    statute: "Cal. Civil Code §8132",
    description: "Use when sending this bill. Takes effect once the check clears.",
  },
  {
    kind: "unconditional-progress",
    label: "Unconditional Waiver — Progress Payment",
    statute: "Cal. Civil Code §8134",
    description: "Use only after you have received and confirmed the retention payment.",
  },
  {
    kind: "conditional-final",
    label: "Conditional Waiver — Final Payment",
    statute: "Cal. Civil Code §8136",
    description: "Use for the last retention bill for this job. Takes effect when final payment clears.",
  },
];

const STEP_LABELS = ["Eligibility", "Release Amount", "Lien Waiver", "Review & Confirm"];

function suggestRelease(line: ComputedLine, job: DbJob): number | null {
  if (line.percentComplete >= 99.9) return line.retention;

  const { retentionStepdownThreshold, retentionStepdownRateCW, retentionRateCW, retentionRateSM } = job;
  if (
    retentionStepdownThreshold != null &&
    retentionStepdownRateCW != null &&
    retentionRateCW > 0 &&
    line.percentComplete >= retentionStepdownThreshold
  ) {
    const cwBilled = line.previousApplications + line.thisPeriod;
    const targetRetention =
      (retentionStepdownRateCW / 100) * cwBilled + (retentionRateSM / 100) * line.storedMaterials;
    return Math.max(0, line.retention - targetRetention);
  }

  return null;
}

function parseAmt(s: string): number {
  const v = parseFloat(s.replace(/[^0-9.]/g, ""));
  return isNaN(v) ? 0 : v;
}

function endOfCurrentMonth(): string {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return end.toISOString().slice(0, 10);
}

// ─── Mini retention gauge bar ─────────────────────────────────────────────────

function RetentionGauge({
  total,
  releasing,
}: {
  total: number;
  releasing: number;
}) {
  if (total <= 0) return null;
  const releasePct = Math.min(100, (releasing / total) * 100);
  const heldPct = 100 - releasePct;
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-gray-100">
      <div className="bg-teal transition-all" style={{ width: `${releasePct}%` }} />
      <div className="bg-amber-400 transition-all" style={{ width: `${heldPct}%` }} />
    </div>
  );
}

// ─── Step rail ────────────────────────────────────────────────────────────────

function StepRail({ current }: { current: number }) {
  return (
    <div className="hidden w-48 shrink-0 flex-col gap-1 border-r border-gray-100 p-6 sm:flex">
      {STEP_LABELS.map((label, i) => {
        const num = i + 1;
        const done = num < current;
        const active = num === current;
        return (
          <div key={num} className="flex items-center gap-3 py-1.5">
            <div
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                done
                  ? "bg-teal text-white"
                  : active
                  ? "bg-navy text-white"
                  : "bg-gray-100 text-gray-400"
              }`}
            >
              {done ? "✓" : num}
            </div>
            <span
              className={`text-sm leading-tight ${
                active ? "font-semibold text-navy" : done ? "text-teal" : "text-gray-400"
              }`}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Props ───────────────────────────────────────────────────────────────────

type Props = {
  job: DbJob;
  retentionHeld: number;
  previouslyReleased: number;
  remaining: number;
  onClose: () => void;
  onCreated: () => void;
};

// ─── Wizard ──────────────────────────────────────────────────────────────────

export default function RetentionReleaseWizard({
  job,
  retentionHeld,
  previouslyReleased,
  remaining,
  onClose,
  onCreated,
}: Props) {
  const { profile } = useCompanyProfile();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [lineReleases, setLineReleases] = useState<LineRelease[]>([]);
  const [isLoadingLines, setIsLoadingLines] = useState(true);
  const [linesError, setLinesError] = useState<string | null>(null);

  // The job's latest pay application's metadata — the SOV snapshot this
  // release's retention was computed against. Referenced on the retention
  // invoice only as a traceability note ("accrued through Pay App #N"), not
  // reproduced as a full SOV table.
  const [latestApp, setLatestApp] = useState<{ applicationNumber: string; applicationDate: string; periodTo: string } | null>(null);

  const [waiverKind, setWaiverKind] = useState<WaiverKind>("conditional-progress");
  const [releaseDate, setReleaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  // Distinct from releaseDate: what period the released retention covers
  // (like a pay application's "period to"), not when this bill is generated.
  // Defaults to the end of the current month, but is its own field from
  // then on — never silently derived from releaseDate.
  const [releasedThrough, setReleasedThrough] = useState(endOfCurrentMonth);
  const [claimantTitle, setClaimantTitle] = useState("");
  const [notes, setNotes] = useState("");

  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [savedSignature, setSavedSignature] = useState<string>("");
  const [sigModalOpen, setSigModalOpen] = useState(false);
  const [userFullName, setUserFullName] = useState("");

  const [contractorName, setContractorName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedReleaseNumber, setSavedReleaseNumber] = useState<number | null>(null);

  // Fetch SOV lines on mount
  useEffect(() => {
    let cancelled = false;
    setIsLoadingLines(true);
    setLinesError(null);

    (async () => {
      try {
        const options = await fetchApplicationOptions(job.id);
        const latest = options[options.length - 1];
        if (!latest) {
          if (!cancelled) setLineReleases([]);
          return;
        }
        const { lines, changeOrders } = await fetchSovItems(job.id, latest.applicationNumber);
        const cwRate = job.retentionRateCW / 100;
        const smRate = job.retentionRateSM / 100;

        if (!cancelled) {
          setLatestApp({
            applicationNumber: latest.applicationNumber,
            applicationDate: latest.applicationDate,
            periodTo: latest.periodTo,
          });
        }

        const allItems = [
          ...lines.map((l) => ({ ...l })),
          ...changeOrders.map((l) => ({ ...l })),
        ];

        const releases: LineRelease[] = allItems
          .map((item) => {
            const cl = computeLine(item, cwRate, smRate);
            const sugg = suggestRelease(cl, job);
            return {
              line: cl,
              selected: true,
              releaseAmount: sugg !== null ? sugg.toFixed(2) : "",
              suggestedAmount: sugg,
            };
          })
          .filter((lr) => lr.line.retention > 0.005);

        if (!cancelled) setLineReleases(releases);
      } catch (err) {
        if (!cancelled) setLinesError(err instanceof Error ? err.message : "Failed to load SOV data.");
      } finally {
        if (!cancelled) setIsLoadingLines(false);
      }
    })();

    getContractorInfo().then((c) => setContractorName(c.company));

    fetchUserProfile()
      .then((p) => {
        if (!p) return;
        const signer = formatSignerLine(p);
        if (signer) setClaimantTitle((prev) => prev || signer);
        if (p.fullName) setUserFullName(p.fullName);
        if (p.signatureData) {
          setSavedSignature(p.signatureData);
          setSignatureDataUrl(p.signatureData);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [job.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-update waiver kind default based on selections
  useEffect(() => {
    const sel = lineReleases.filter((lr) => lr.selected);
    if (sel.length === 0) return;
    const allAt100 = sel.every((lr) => lr.line.percentComplete >= 99.9);
    const allFullRelease = sel.every((lr) => {
      const v = parseAmt(lr.releaseAmount);
      return v > 0 && Math.abs(v - lr.line.retention) < 0.01;
    });
    setWaiverKind(allAt100 && allFullRelease ? "conditional-final" : "conditional-progress");
  }, [lineReleases]);

  // ─── Derived values ─────────────────────────────────────────────────────────

  const selectedLines = lineReleases.filter((lr) => lr.selected);
  const totalRelease = selectedLines.reduce((s, lr) => s + parseAmt(lr.releaseAmount), 0);
  const totalHeldSelected = selectedLines.reduce((s, lr) => s + lr.line.retention, 0);
  const totalRemainsAfter = totalHeldSelected - totalRelease;
  const isFinal = waiverKind === "conditional-final";

  // ─── Validation ─────────────────────────────────────────────────────────────

  const step1Valid = selectedLines.length > 0;

  const step2LineErrors = selectedLines.filter((lr) => {
    const v = parseAmt(lr.releaseAmount);
    return v <= 0 || v > lr.line.retention + 0.005;
  });
  const step2Valid =
    step2LineErrors.length === 0 &&
    totalRelease > 0 &&
    totalRelease <= remaining + 0.005;

  const step3Valid = releaseDate.length > 0 && releasedThrough.length > 0;

  // ─── Handlers ───────────────────────────────────────────────────────────────

  function toggleLine(idx: number) {
    setLineReleases((prev) =>
      prev.map((lr, i) => (i === idx ? { ...lr, selected: !lr.selected } : lr))
    );
  }

  function setRelease(idx: number, value: string) {
    setLineReleases((prev) =>
      prev.map((lr, i) => (i === idx ? { ...lr, releaseAmount: value } : lr))
    );
  }

  function useSuggested(idx: number) {
    setLineReleases((prev) =>
      prev.map((lr, i) =>
        i === idx && lr.suggestedAmount !== null
          ? { ...lr, releaseAmount: lr.suggestedAmount.toFixed(2) }
          : lr
      )
    );
  }

  function useFullRelease(idx: number) {
    setLineReleases((prev) =>
      prev.map((lr, i) =>
        i === idx ? { ...lr, releaseAmount: lr.line.retention.toFixed(2) } : lr
      )
    );
  }

  // Builds and downloads the retention release's own invoice (RET-#, this
  // release's basis/%/amount only — no full SOV) plus its lien waiver.
  // Reuses the same PDF merge pipeline, logo loading, and lien-waiver
  // builder as the standalone Download Package flow; only the cover
  // content and numbering are specific to a retention release.
  //
  // releaseNumber is passed in explicitly rather than read from
  // savedReleaseNumber state: when called from handleConfirm, the state
  // setter that stores it hasn't re-rendered yet, so the state value in
  // this closure would still be stale.
  async function downloadPackage(releaseNumber: number) {
    let logo: LogoData | undefined;
    if (profile?.logoUrl) {
      logo = (await loadLogoForPdf(profile.logoUrl)) ?? undefined;
    }

    await exportRetentionBillingPackage({
      cover: {
        job,
        releaseNumber,
        invoiceDate: releaseDate,
        releasedThrough,
        isFinal,
        retentionBasis: totalHeldSelected,
        releaseAmount: totalRelease,
        sourceApplicationNumber: latestApp?.applicationNumber ?? "—",
        sourcePeriodTo: latestApp?.periodTo ?? releasedThrough,
        logo,
      },
      lienWaivers: [
        {
          kind: waiverKind as LienWaiverKind,
          data: {
            job,
            claimantName: contractorName,
            amountOfCheck: totalRelease,
            throughDate: releasedThrough,
            signatureDate: releaseDate,
            claimantTitle,
            unpaidProgressDates: "",
            unpaidProgressAmounts: "",
            disputedExtrasAmount: 0,
            signatureDataUrl: signatureDataUrl ?? undefined,
          },
        },
      ],
    });
  }

  async function handleConfirm() {
    setSaveError(null);
    setIsSaving(true);
    try {
      const lineDetail = selectedLines.map((lr) => ({
        item: lr.line.item,
        description: lr.line.description,
        retentionHeld: lr.line.retention,
        releaseAmount: parseAmt(lr.releaseAmount),
        pctComplete: Math.round(lr.line.percentComplete * 10) / 10,
      }));

      const auditNotes = JSON.stringify({
        wizard: "v1",
        waiverKind,
        lines: lineDetail,
      });

      const finalNotes = [notes.trim(), auditNotes].filter(Boolean).join("\n---\n");

      const release = await createRetentionRelease({
        jobId: job.id,
        releaseDate,
        amountReleased: totalRelease,
        isFinal,
        notes: finalNotes,
        status: "billed",
        releasedThrough,
      });

      setSavedReleaseNumber(release.releaseNumber);

      // Download the retention release invoice + waiver immediately
      await downloadPackage(release.releaseNumber);

      onCreated();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleDownloadAgain() {
    if (savedReleaseNumber === null) return;
    downloadPackage(savedReleaseNumber).catch((err) => {
      alert(err instanceof Error ? err.message : "Could not download package.");
    });
  }

  // ─── Step content ────────────────────────────────────────────────────────────

  function renderStep1() {
    if (isLoadingLines) {
      return <p className="py-8 text-center text-sm text-gray-500">Loading SOV data…</p>;
    }
    if (linesError) {
      return <p className="py-8 text-center text-sm text-red-600">{linesError}</p>;
    }
    if (lineReleases.length === 0) {
      return (
        <div className="py-12 text-center">
          <p className="text-sm font-semibold text-gray-500">No retention to release</p>
          <p className="mt-1 text-xs text-gray-400">
            No SOV lines have retention held for this job.
          </p>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-5">
        <div>
          <p className="text-sm font-semibold text-navy">
            {job.jobName || job.jobNumber} — {job.customer}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            Check the lines you want to release. Uncheck lines to keep their retention held.
          </p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs font-semibold uppercase tracking-wide text-gray-400">
                <th className="px-4 py-2.5 w-8"></th>
                <th className="px-4 py-2.5">Item</th>
                <th className="px-4 py-2.5">Description</th>
                <th className="px-4 py-2.5 text-right">% Complete</th>
                <th className="px-4 py-2.5 text-right">Retention Held</th>
                <th className="px-4 py-2.5 w-28">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {lineReleases.map((lr, i) => (
                <tr
                  key={i}
                  className={`cursor-pointer transition-colors ${lr.selected ? "bg-teal/5" : "hover:bg-gray-50"}`}
                  onClick={() => toggleLine(i)}
                >
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={lr.selected}
                      onChange={() => toggleLine(i)}
                      className="h-4 w-4 rounded border-gray-300 text-teal focus:ring-teal"
                    />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{lr.line.item}</td>
                  <td className="px-4 py-3 text-navy max-w-xs">
                    <span className="line-clamp-2">{lr.line.description}</span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <div className="flex flex-col items-end gap-1">
                      <span
                        className={`text-sm font-semibold ${lr.line.percentComplete >= 100 ? "text-green-700" : "text-navy"}`}
                      >
                        {lr.line.percentComplete.toFixed(1)}%
                      </span>
                      <div className="w-16">
                        <RetentionGauge total={lr.line.scheduledValue} releasing={lr.line.totalCompleted} />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-navy">
                    {fmt.format(lr.line.retention)}
                  </td>
                  <td className="px-4 py-3">
                    {lr.line.percentComplete >= 100 ? (
                      <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                        100% done
                      </span>
                    ) : lr.suggestedAmount !== null ? (
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                        Step-down eligible
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                        In progress
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Summary strip */}
        <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm">
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <div>
              <span className="text-gray-500">Lines selected: </span>
              <span className="font-semibold text-navy">{selectedLines.length}</span>
            </div>
            <div>
              <span className="text-gray-500">Total retention on selected: </span>
              <span className="font-semibold text-navy">{fmt.format(totalHeldSelected)}</span>
            </div>
            <div>
              <span className="text-gray-500">Available to release: </span>
              <span className="font-semibold text-navy">{fmt.format(remaining)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderStep2() {
    if (selectedLines.length === 0) {
      return (
        <p className="py-8 text-center text-sm text-gray-500">
          No lines selected — go back and check at least one line.
        </p>
      );
    }

    const hasStepdown = selectedLines.some((lr) => lr.suggestedAmount !== null && lr.line.percentComplete < 99.9);

    return (
      <div className="flex flex-col gap-5">
        <div>
          <p className="text-sm font-semibold text-navy">Enter the release amount for each selected line.</p>
          {hasStepdown && (
            <p className="mt-0.5 text-xs text-gray-500">
              Lines eligible for a step-down release show a suggested amount based on this job&apos;s retention terms (from{" "}
              {job.retentionRateCW}% → {job.retentionStepdownRateCW}% at {job.retentionStepdownThreshold}% complete). You can
              override any suggestion.
            </p>
          )}
        </div>

        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs font-semibold uppercase tracking-wide text-gray-400">
                <th className="px-4 py-2.5">Item / Description</th>
                <th className="px-4 py-2.5 text-right">Retention Held</th>
                <th className="px-4 py-2.5 w-48">Release Amount</th>
                <th className="px-4 py-2.5 text-right">Remains Held</th>
                <th className="px-4 py-2.5 w-32"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {selectedLines.map((lr, rawIdx) => {
                const idx = lineReleases.indexOf(lr);
                const parsed = parseAmt(lr.releaseAmount);
                const remains = Math.max(0, lr.line.retention - parsed);
                const isOverMax = parsed > lr.line.retention + 0.005;
                const isEmpty = lr.releaseAmount === "" || parsed === 0;

                return (
                  <tr key={rawIdx} className="align-top">
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs text-gray-400">{lr.line.item}</div>
                      <div className="text-navy text-sm line-clamp-2 mt-0.5">{lr.line.description}</div>
                      <div className="mt-1 w-full">
                        <RetentionGauge total={lr.line.retention} releasing={isEmpty ? 0 : parsed} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-navy whitespace-nowrap">
                      {fmt.format(lr.line.retention)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={lr.releaseAmount}
                          onChange={(e) => setRelease(idx, e.target.value)}
                          className={`w-full rounded-lg border pl-7 pr-3 py-1.5 text-sm text-navy focus:outline-none focus:ring-1 ${
                            isOverMax
                              ? "border-red-300 focus:border-red-400 focus:ring-red-300"
                              : "border-gray-200 focus:border-teal focus:ring-teal"
                          }`}
                        />
                      </div>
                      {isOverMax && (
                        <p className="mt-0.5 text-xs text-red-500">
                          Max {fmt.format(lr.line.retention)}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600 whitespace-nowrap">
                      {fmt.format(remains)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-col items-end gap-1">
                        {lr.suggestedAmount !== null && lr.line.percentComplete < 99.9 && (
                          <button
                            type="button"
                            onClick={() => useSuggested(idx)}
                            className="text-xs font-medium text-teal hover:underline whitespace-nowrap"
                          >
                            Use suggested ({fmtShort.format(lr.suggestedAmount)})
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => useFullRelease(idx)}
                          className="text-xs font-medium text-gray-400 hover:text-navy hover:underline whitespace-nowrap"
                        >
                          Release all ({fmtShort.format(lr.line.retention)})
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Job-level summary */}
        <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Release Summary</p>
          <div className="mb-3">
            <RetentionGauge total={totalHeldSelected} releasing={totalRelease} />
          </div>
          <div className="flex flex-col gap-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Retention on selected lines</span>
              <span className="font-semibold text-navy">{fmt.format(totalHeldSelected)}</span>
            </div>
            <div className="flex justify-between">
              <span className="flex items-center gap-1 text-teal">
                <span className="inline-block h-2 w-2 rounded-full bg-teal" />
                Releasing now
              </span>
              <span className="font-bold text-teal">{fmt.format(totalRelease)}</span>
            </div>
            <div className="flex justify-between">
              <span className="flex items-center gap-1 text-amber-700">
                <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
                Remains held
              </span>
              <span className="font-semibold text-amber-700">{fmt.format(Math.max(0, totalRemainsAfter))}</span>
            </div>
          </div>
          {totalRelease > remaining + 0.005 && (
            <p className="mt-2 text-xs text-red-600">
              Total release ({fmt.format(totalRelease)}) exceeds available remaining ({fmt.format(remaining)}). Reduce one or more line amounts.
            </p>
          )}
        </div>
      </div>
    );
  }

  function renderStep3() {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <p className="text-sm font-semibold text-navy">Select the waiver type to generate with this release.</p>
          <p className="mt-0.5 text-xs text-gray-500">
            The default is set based on your selections. You can change it at any time.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {WAIVER_OPTIONS.map((opt) => (
            <label
              key={opt.kind}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
                waiverKind === opt.kind
                  ? "border-teal bg-teal/5"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <input
                type="radio"
                name="waiverKind"
                value={opt.kind}
                checked={waiverKind === opt.kind}
                onChange={() => setWaiverKind(opt.kind)}
                className="mt-0.5 h-4 w-4 text-teal focus:ring-teal"
              />
              <div>
                <p className="text-sm font-semibold text-navy">{opt.label}</p>
                <p className="text-xs text-gray-500">{opt.statute}</p>
                <p className="mt-0.5 text-xs text-gray-500">{opt.description}</p>
              </div>
            </label>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Invoice / billing date</label>
            <p className="mb-1 text-xs text-gray-400">When this retention release is being billed. Defaults to today.</p>
            <input
              type="date"
              value={releaseDate}
              onChange={(e) => setReleaseDate(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-navy focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Released through</label>
            <p className="mb-1 text-xs text-gray-400">The date this retention release covers, e.g. &quot;released through 05/31/2026.&quot;</p>
            <input
              type="date"
              value={releasedThrough}
              onChange={(e) => setReleasedThrough(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-navy focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Claimant&apos;s title (signer name &amp; title)
            </label>
            <input
              type="text"
              value={claimantTitle}
              onChange={(e) => setClaimantTitle(e.target.value)}
              placeholder="e.g. Jason Blancaflor, Owner"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-navy placeholder-gray-400 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Notes <span className="font-normal text-gray-400">(optional — appears on release record)</span>
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Substantial completion reached per subcontract §12.3"
            className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-navy placeholder-gray-400 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Signature</label>
          <p className="mb-2 text-xs text-gray-500">Stamped on the claimant&apos;s signature line of the downloaded waiver.</p>
          {signatureDataUrl ? (
            <div className="flex items-center gap-4 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={signatureDataUrl} alt="Adopted signature" className="h-12 object-contain" />
              <button type="button" onClick={() => setSigModalOpen(true)} className="text-xs font-medium text-teal hover:underline">Change signature</button>
              <button type="button" onClick={() => setSignatureDataUrl(null)} className="text-xs font-medium text-gray-400 hover:text-red-500">Remove</button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setSigModalOpen(true)}
              className="flex h-20 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-teal/40 bg-teal/5 text-sm font-medium text-teal hover:border-teal hover:bg-teal/10 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
              Click to adopt your signature
            </button>
          )}
        </div>
      </div>
    );
  }

  function renderStep4() {
    if (savedReleaseNumber !== null) {
      return (
        <div className="flex flex-col gap-5">
          <div className="rounded-xl border border-green-200 bg-green-50 px-5 py-5 text-center">
            <p className="text-base font-bold text-green-800">
              Retention Release #{savedReleaseNumber} saved
            </p>
            <p className="mt-1 text-sm text-green-700">
              {fmt.format(totalRelease)} — {isFinal ? "Final release" : "Partial release"}
            </p>
            <p className="mt-1 text-xs text-green-600">
              Retention invoice RET-{savedReleaseNumber} and lien waiver downloaded. Status: Billed (awaiting payment).
            </p>
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            <p className="font-semibold mb-1">AR aging updated automatically</p>
            <p className="text-xs text-blue-700">
              This release is now tracked in AR aging as &ldquo;billed&rdquo;. Once the GC pays, mark it paid from the Retention page to close it out.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleDownloadAgain}
              className="w-full rounded-lg border border-navy px-4 py-2.5 text-sm font-semibold text-navy hover:bg-navy/5"
            >
              Download Retention Invoice Again
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal/90"
            >
              Done
            </button>
          </div>
        </div>
      );
    }

    const waiverLabel = WAIVER_OPTIONS.find((o) => o.kind === waiverKind)?.label ?? waiverKind;

    return (
      <div className="flex flex-col gap-5">
        <div>
          <p className="text-sm font-semibold text-navy mb-0.5">Review the release before confirming.</p>
          <p className="text-xs text-gray-500">
            Nothing is saved or sent until you click Confirm below.
          </p>
        </div>

        {/* Per-line breakdown */}
        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs font-semibold uppercase tracking-wide text-gray-400">
                <th className="px-4 py-2.5">Item</th>
                <th className="px-4 py-2.5">Description</th>
                <th className="px-4 py-2.5 text-right">Retention Basis</th>
                <th className="px-4 py-2.5 text-right">Release %</th>
                <th className="px-4 py-2.5 text-right">Release $</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {selectedLines.map((lr, i) => {
                const amt = parseAmt(lr.releaseAmount);
                const relPct = lr.line.retention > 0 ? (amt / lr.line.retention) * 100 : 0;
                return (
                  <tr key={i}>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{lr.line.item}</td>
                    <td className="px-4 py-2.5 text-navy">{lr.line.description}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
                      {fmt.format(lr.line.retention)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
                      {relPct.toFixed(1)}%
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-teal">
                      {fmt.format(amt)}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-gray-200 bg-gray-50">
                <td colSpan={4} className="px-4 py-2.5 text-sm font-bold text-navy text-right">
                  Total releasing
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-base font-bold text-teal">
                  {fmt.format(totalRelease)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Waiver + AR info */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Lien Waiver</p>
            <p className="font-semibold text-navy">{waiverLabel}</p>
            <p className="text-xs text-gray-500 mt-0.5">Released through {releasedThrough || "—"}</p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">AR Impact</p>
            <p className="font-semibold text-navy">{fmt.format(totalRelease)} added to AR aging</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Moved from &ldquo;retention held&rdquo; to &ldquo;billed — awaiting payment&rdquo;
            </p>
          </div>
        </div>

        {/* Confirm gate */}
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900 mb-2">On confirm, Syntriq will:</p>
          <ul className="flex flex-col gap-1 text-xs text-amber-800 list-disc pl-4">
            <li>
              Record a retention release of <strong>{fmt.format(totalRelease)}</strong> for{" "}
              {job.jobName || job.jobNumber} and mark it as Billed.
            </li>
            <li>
              Add {fmt.format(totalRelease)} to AR aging so it appears in your outstanding receivables.
            </li>
            <li>
              Download a retention release invoice (<strong>RET-#</strong>, released through{" "}
              {releasedThrough || "—"}) and a <strong>{waiverLabel}</strong> lien waiver, pre-filled and
              ready for your signature.
            </li>
          </ul>
          <p className="mt-2 text-xs text-amber-700">
            The waiver will not be sent automatically — you distribute it to the GC after signing.
          </p>
        </div>

        {saveError && <p className="text-sm text-red-600">{saveError}</p>}

        <button
          type="button"
          onClick={handleConfirm}
          disabled={isSaving}
          className="w-full rounded-xl bg-navy px-6 py-3 text-sm font-bold text-white hover:bg-navy/90 disabled:opacity-50"
        >
          {isSaving ? "Saving…" : `Confirm & Download Package — ${fmt.format(totalRelease)}`}
        </button>
      </div>
    );
  }

  // ─── Footer nav ──────────────────────────────────────────────────────────────

  const canGoNext =
    step === 1 ? step1Valid && !isLoadingLines :
    step === 2 ? step2Valid :
    step === 3 ? step3Valid :
    false;

  const isDone = savedReleaseNumber !== null;

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={isDone ? undefined : onClose}
    >
      <div
        className="flex w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl"
        style={{ maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-navy">Retention Release Wizard</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {job.jobName || job.jobNumber} · {job.customer}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xl leading-none text-gray-400 hover:text-gray-600 mt-0.5"
          >
            ×
          </button>
        </div>

        {/* Mobile step indicator */}
        <div className="shrink-0 border-b border-gray-100 px-6 py-2 sm:hidden">
          <p className="text-xs font-semibold text-gray-500">
            Step {step} of 4 — {STEP_LABELS[step - 1]}
          </p>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <StepRail current={step} />
          <div className="flex-1 overflow-y-auto p-6">
            {step === 1 && renderStep1()}
            {step === 2 && renderStep2()}
            {step === 3 && renderStep3()}
            {step === 4 && renderStep4()}
          </div>
        </div>

        {/* Footer */}
        {!isDone && (
          <div className="flex shrink-0 items-center justify-between border-t border-gray-100 px-6 py-4">
            <button
              type="button"
              onClick={step > 1 ? () => setStep((s) => (s - 1) as 1 | 2 | 3 | 4) : onClose}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              {step === 1 ? "Cancel" : "← Back"}
            </button>

            {step < 4 ? (
              <button
                type="button"
                onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3 | 4)}
                disabled={!canGoNext}
                className="rounded-lg bg-teal px-6 py-2 text-sm font-semibold text-white hover:bg-teal/90 disabled:opacity-40"
              >
                Next →
              </button>
            ) : null}
          </div>
        )}
      </div>

      <AdoptSignatureModal
        open={sigModalOpen}
        initialName={userFullName}
        savedSignature={savedSignature || undefined}
        onAdopt={(dataUrl, remember) => {
          setSignatureDataUrl(dataUrl);
          setSigModalOpen(false);
          if (remember) {
            setSavedSignature(dataUrl);
            saveUserSignature(dataUrl).catch(() => {});
          }
        }}
        onClose={() => setSigModalOpen(false)}
      />
    </div>
  );
}
