"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { DbJob } from "@/lib/jobs";
import { createRetentionRelease, RetentionRelease } from "@/lib/retentionReleasesDb";
import { exportRetentionReleasePdf } from "@/lib/retentionReleasePdf";
import { getContractorInfo } from "@/lib/sampleUser";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

type Props = {
  job: DbJob;
  retentionHeld: number;
  previouslyReleased: number;
  remaining: number;
  onClose: () => void;
  onCreated: (release: RetentionRelease) => void;
};

export default function RetentionReleaseModal({ job, retentionHeld, previouslyReleased, remaining, onClose, onCreated }: Props) {
  const [amount, setAmount] = useState(remaining.toFixed(2));
  const [isFinal, setIsFinal] = useState(true);
  const [releaseDate, setReleaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<RetentionRelease | null>(null);
  const [contractorName, setContractorName] = useState("");

  useEffect(() => {
    getContractorInfo().then((c) => setContractorName(c.company));
  }, []);

  const parsedAmount = parseFloat(amount.replace(/[^0-9.]/g, ""));
  const isValidAmount = !isNaN(parsedAmount) && parsedAmount > 0 && parsedAmount <= remaining + 0.01;
  const afterRelease = Math.max(0, remaining - (isValidAmount ? parsedAmount : 0));
  const wouldFullyRelease = afterRelease < 0.01;

  async function handleSave() {
    if (!isValidAmount) { setError("Enter a valid amount — cannot exceed remaining retention."); return; }
    setError(null);
    setSaving(true);
    try {
      const release = await createRetentionRelease({
        jobId: job.id,
        releaseDate,
        amountReleased: parsedAmount,
        isFinal,
        notes,
        status: "billed",
      });
      setCreated(release);
      onCreated(release);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDownload() {
    if (!created) return;
    exportRetentionReleasePdf({
      job,
      contractorName,
      release: created,
      retentionHeld,
      previouslyReleased,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-navy">Bill Retention</h2>
            <p className="text-sm text-gray-500 mt-0.5">{job.jobName || job.jobNumber} · {job.customer}</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none mt-0.5">×</button>
        </div>

        {!created ? (
          <div className="flex flex-col gap-5 p-6">
            {/* Retention summary */}
            <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Total retention held</span>
                <span className="font-semibold text-navy">{currency.format(retentionHeld)}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-gray-500">Previously released</span>
                <span className="font-semibold text-navy">{currency.format(previouslyReleased)}</span>
              </div>
              <div className="mt-1 border-t border-gray-200 pt-1 flex justify-between">
                <span className="text-gray-700 font-medium">Available to release</span>
                <span className="font-bold text-navy">{currency.format(remaining)}</span>
              </div>
            </div>

            {/* Amount */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Amount to release
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    const v = parseFloat(e.target.value.replace(/[^0-9.]/g, ""));
                    if (!isNaN(v)) setIsFinal(Math.max(0, remaining - v) < 0.01);
                  }}
                  className="w-full rounded-lg border border-gray-200 pl-7 pr-3 py-2 text-sm text-navy focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                />
              </div>
              {isValidAmount && (
                <p className="mt-1 text-xs text-gray-400">
                  Remaining after this release: <strong className="text-navy">{currency.format(afterRelease)}</strong>
                </p>
              )}
              {!isValidAmount && amount !== "" && (
                <p className="mt-1 text-xs text-red-500">Cannot exceed remaining retention of {currency.format(remaining)}</p>
              )}
            </div>

            {/* Final toggle */}
            <div className="flex items-start gap-3">
              <input
                id="isFinal"
                type="checkbox"
                checked={isFinal}
                onChange={(e) => setIsFinal(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-teal focus:ring-teal"
              />
              <div>
                <label htmlFor="isFinal" className="text-sm font-medium text-gray-700 cursor-pointer">
                  Final retention release
                </label>
                <p className="text-xs text-gray-400 mt-0.5">
                  {wouldFullyRelease
                    ? "This releases all remaining retention — auto-flagged as Final."
                    : "Check this if this is the last retention bill for this job, even if partial."}
                </p>
              </div>
            </div>

            {/* Date */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Release date</label>
              <input
                type="date"
                value={releaseDate}
                onChange={(e) => setReleaseDate(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-navy focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Notes <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Substantial completion reached — 50% retention released per subcontract §12.3"
                className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-navy placeholder-gray-400 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
              />
            </div>

            {/* Lien waiver guidance */}
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
              <p className="font-semibold text-amber-900 mb-1">Lien waiver — {isFinal ? "Final release" : "Partial release"}</p>
              <p className="text-amber-800 text-xs leading-relaxed">
                {isFinal
                  ? "Use a Conditional Waiver on Final Payment (Cal. Civil Code §8136) when sending this bill. Once payment clears, execute the Unconditional Final (§8138)."
                  : "Use a Conditional Waiver on Progress Payment (Cal. Civil Code §8132) when sending this bill. Once payment clears, execute the Unconditional Progress (§8134)."}
              </p>
              <Link
                href={`/lien-waivers`}
                className="mt-2 inline-block text-xs font-medium text-amber-700 underline hover:text-amber-900"
                onClick={onClose}
              >
                Generate waiver on Lien Waivers page →
              </Link>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !isValidAmount}
                className="flex-1 rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal/90 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save & Generate Bill"}
              </button>
            </div>
          </div>
        ) : (
          /* Post-save confirmation */
          <div className="flex flex-col gap-5 p-6">
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-4 text-center">
              <p className="text-base font-bold text-green-800">Retention Release #{created.releaseNumber} saved</p>
              <p className="text-sm text-green-700 mt-1">
                {currency.format(created.amountReleased)} — {created.isFinal ? "Final release" : "Partial release"}
              </p>
              <p className="text-xs text-green-600 mt-1">Status: Billed (awaiting payment)</p>
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handleDownload}
                className="w-full rounded-lg bg-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy/90"
              >
                Download Release Bill PDF
              </button>
              <Link
                href="/lien-waivers"
                onClick={onClose}
                className="w-full rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 hover:bg-amber-100 text-center block"
              >
                Go to Lien Waivers →
              </Link>
              <button type="button" onClick={onClose} className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50">
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
