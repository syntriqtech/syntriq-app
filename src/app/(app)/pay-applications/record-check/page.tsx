"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useJobs } from "@/hooks/useJobs";
import { fetchAllPayApplications, PayApplication } from "@/lib/payApplicationsDb";
import { fetchAllPaymentsForDashboard, recordPayment } from "@/lib/payAppPaymentsDb";
import type { DbJob } from "@/lib/jobs";
import { formatDate } from "@/lib/dateUtils";
import TextField from "@/components/TextField";
import Button from "@/components/Button";
import InfoTip from "@/components/InfoTip";
import StepTutorial from "@/components/StepTutorial";
import { CHECK_TUTORIAL_STEPS } from "@/lib/checkTutorial";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** Money is compared in whole cents so 0.1 + 0.2 style rounding never blocks a save. */
function toCents(value: string): number {
  const n = Number(value);
  if (!value.trim() || Number.isNaN(n) || n <= 0) return 0;
  return Math.round(n * 100);
}

const money = (cents: number) => currency.format(cents / 100);

type OpenRow = {
  app: PayApplication;
  job: DbJob;
  paidCents: number;
  balanceCents: number;
};

type SavedLine = { jobLabel: string; appNumber: string; cents: number };

function appNumberSort(a: string, b: string) {
  const na = Number(a);
  const nb = Number(b);
  return !Number.isNaN(na) && !Number.isNaN(nb) ? na - nb : a.localeCompare(b);
}

export default function RecordCheckPage() {
  const { jobs, isLoading: isLoadingJobs } = useJobs();

  const [apps, setApps] = useState<PayApplication[]>([]);
  const [paidByApp, setPaidByApp] = useState<Map<string, number>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // The check
  const [reference, setReference] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [total, setTotal] = useState("");
  const [notes, setNotes] = useState("");

  // How the check is split: pay app id -> amount typed
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [result, setResult] = useState<{ reference: string; totalCents: number; lines: SavedLine[] } | null>(null);
  const [tutorialStep, setTutorialStep] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    setIsLoading(true);
    try {
      const [allApps, payments] = await Promise.all([fetchAllPayApplications(), fetchAllPaymentsForDashboard()]);
      const paid = new Map<string, number>();
      for (const p of payments) paid.set(p.payAppId, (paid.get(p.payAppId) ?? 0) + Math.round(p.amount * 100));
      setApps(allApps);
      setPaidByApp(paid);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load pay applications.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Every certified pay app (on an active job) that still has a balance.
  const openRows = useMemo<OpenRow[]>(() => {
    const jobIndex = new Map(jobs.map((j, i) => [j.id, i]));
    const rows: OpenRow[] = [];
    for (const app of apps) {
      if (app.status !== "certified") continue;
      const job = jobs.find((j) => j.id === app.jobId);
      if (!job) continue;
      const paidCents = paidByApp.get(app.id) ?? 0;
      const balanceCents = Math.round(app.currentPaymentDue * 100) - paidCents;
      if (balanceCents > 1) rows.push({ app, job, paidCents, balanceCents });
    }
    return rows.sort(
      (a, b) =>
        (jobIndex.get(a.job.id) ?? 0) - (jobIndex.get(b.job.id) ?? 0) ||
        appNumberSort(a.app.applicationNumber, b.app.applicationNumber)
    );
  }, [apps, jobs, paidByApp]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return openRows;
    return openRows.filter(
      (r) =>
        r.job.jobNumber.toLowerCase().includes(q) ||
        r.job.jobName.toLowerCase().includes(q) ||
        r.job.customer.toLowerCase().includes(q)
    );
  }, [openRows, search]);

  const groups = useMemo(() => {
    const map = new Map<string, OpenRow[]>();
    for (const r of visibleRows) {
      if (!map.has(r.job.id)) map.set(r.job.id, []);
      map.get(r.job.id)!.push(r);
    }
    return Array.from(map.values());
  }, [visibleRows]);

  // ── The math ────────────────────────────────────────────────────────────
  const totalCents = toCents(total);
  const assignedCents = openRows.reduce((sum, r) => sum + toCents(amounts[r.app.id] ?? ""), 0);
  const leftCents = totalCents - assignedCents;
  const filledRows = openRows.filter((r) => toCents(amounts[r.app.id] ?? "") > 0);
  const hasRowError = filledRows.some((r) => toCents(amounts[r.app.id]) > r.balanceCents);
  const canSave =
    !isSaving && totalCents > 0 && leftCents === 0 && filledRows.length > 0 && !hasRowError && reference.trim() !== "" && paymentDate !== "";

  function setAmount(id: string, value: string) {
    setAmounts((prev) => ({ ...prev, [id]: value }));
  }

  // Fill = this pay app's balance, or whatever is left on the check if that's less.
  function fill(row: OpenRow) {
    const mine = toCents(amounts[row.app.id] ?? "");
    const leftForThis = totalCents > 0 ? Math.max(0, totalCents - (assignedCents - mine)) : row.balanceCents;
    const cents = Math.min(row.balanceCents, leftForThis);
    setAmount(row.app.id, cents > 0 ? (cents / 100).toFixed(2) : "");
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaveError(null);
    if (!canSave) return;

    const todayIso = new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) return setSaveError("Enter a valid payment date.");
    if (paymentDate > todayIso) return setSaveError("Payment date can't be in the future.");
    for (const r of filledRows) {
      if (r.job.startDate && paymentDate < r.job.startDate) {
        return setSaveError(
          `Payment date can't be before the start date of job ${r.job.jobNumber} (${formatDate(r.job.startDate)}).`
        );
      }
    }

    const ref = reference.trim();
    const note = [
      filledRows.length > 1 ? `Split check ${ref} (${money(totalCents)}) across ${filledRows.length} pay apps` : "",
      notes.trim(),
    ]
      .filter(Boolean)
      .join(" — ");

    setIsSaving(true);
    const saved: OpenRow[] = [];
    let current: OpenRow | null = null;
    try {
      for (const r of filledRows) {
        current = r;
        await recordPayment(r.app.id, paymentDate, toCents(amounts[r.app.id]) / 100, ref, note);
        saved.push(r);
      }
      setResult({
        reference: ref,
        totalCents,
        lines: saved.map((r) => ({
          jobLabel: `${r.job.jobNumber}${r.job.jobName ? ` · ${r.job.jobName}` : ""}`,
          appNumber: r.app.applicationNumber,
          cents: toCents(amounts[r.app.id]),
        })),
      });
      setReference("");
      setTotal("");
      setNotes("");
      setAmounts({});
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not record the payment.";
      if (saved.length === 0) {
        setSaveError(`Nothing was recorded. ${message}`);
      } else {
        // Some payments were saved before one failed: take those off the screen so the rest can be fixed and saved again.
        const savedCents = saved.reduce((sum, r) => sum + toCents(amounts[r.app.id]), 0);
        setAmounts((prev) => {
          const next = { ...prev };
          for (const r of saved) delete next[r.app.id];
          return next;
        });
        setTotal(((totalCents - savedCents) / 100).toFixed(2));
        setSaveError(
          `Recorded ${saved.length} of ${filledRows.length} payments (${money(savedCents)}). Stopped at job ${current?.job.jobNumber}, App #${current?.app.applicationNumber}: ${message} The check total now shows what's still left to record.`
        );
      }
    } finally {
      setIsSaving(false);
      load();
    }
  }

  const loading = isLoading || isLoadingJobs;
  const firstRowId = groups[0]?.[0]?.app.id;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/pay-applications" className="w-fit text-sm text-teal hover:underline">
          ← Back to Record Payment
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-navy">Record a Check</h1>
            <InfoTip
              title="Record one check for several pay apps"
              action={{ label: "Show me step by step", onClick: () => setTutorialStep(0) }}
            >
              <ol>
                <li>Enter the check number, date and total amount.</li>
                <li>Type how much goes to each pay app, or press <strong>Fill</strong>.</li>
                <li>When <strong>Left over</strong> reaches $0.00, press <strong>Record check</strong>.</li>
              </ol>
              <p>One payment is saved on each pay app, all with the same check number.</p>
            </InfoTip>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            For a single check, wire or ACH that pays more than one pay app, even across different jobs.
          </p>
        </div>
      </div>

      {result && (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-5">
          <p className="text-sm font-semibold text-green-800">
            Check {result.reference} recorded: {money(result.totalCents)} across {result.lines.length} pay app
            {result.lines.length !== 1 ? "s" : ""}.
          </p>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-green-700">
            {result.lines.map((l) => (
              <li key={`${l.jobLabel}-${l.appNumber}`}>
                {l.jobLabel} · App #{l.appNumber} — {money(l.cents)}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-4 text-sm font-semibold">
            <button type="button" onClick={() => setResult(null)} className="text-teal hover:underline">
              Record another check
            </button>
            <Link href="/pay-applications" className="text-teal hover:underline">
              Back to Record Payment
            </Link>
          </div>
        </div>
      )}

      {loadError && <p className="text-sm text-red-600">{loadError}</p>}

      <form onSubmit={handleSave} className="flex flex-col gap-6">
        {/* The check */}
        <div data-tour="check-details" className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="text-base font-bold text-navy">The check</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <TextField
              label="Check / wire / ACH number *"
              help="The number on the check, or the wire or ACH confirmation number. It's saved on every payment, so you can tell they came from the same check. For cash, type cash."
              id="checkReference"
              required
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
            <TextField
              label="Payment date *"
              help="The day the money actually arrived. It can't be in the future."
              id="checkDate"
              type="date"
              required
              max={new Date().toISOString().slice(0, 10)}
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
            />
            <TextField
              label="Total amount on the check *"
              help="The full amount of the check, before you split it. The pay apps below have to add up to exactly this."
              id="checkTotal"
              type="number"
              prefix="$"
              min="0"
              step="0.01"
              required
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              onWheel={(e) => e.currentTarget.blur()}
            />
          </div>
          <div className="mt-4">
            <label htmlFor="checkNotes" className="block text-sm font-medium text-navy">
              Notes (optional)
            </label>
            <textarea
              id="checkNotes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-navy focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30"
            />
          </div>
        </div>

        {/* Open pay apps */}
        <div data-tour="check-list" className="rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-gray-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-bold text-navy">Split it across pay apps</h2>
              <p className="mt-0.5 text-xs text-gray-400">
                Certified pay apps with a balance, across all your jobs.
              </p>
            </div>
            <input
              type="search"
              aria-label="Search jobs"
              placeholder="Search by job #, name, or GC…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-navy placeholder:text-gray-400 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30 sm:w-72"
            />
          </div>

          {loading ? (
            <p className="px-6 py-6 text-sm text-gray-400">Loading pay applications…</p>
          ) : groups.length === 0 ? (
            <p className="px-6 py-6 text-sm text-gray-500">
              {search
                ? "No open pay apps match your search."
                : "No certified pay apps with a balance. Certify a pay app from its page first."}
            </p>
          ) : (
            <div className="divide-y divide-gray-100">
              {groups.map((rows) => {
                const job = rows[0].job;
                return (
                  <div key={job.id}>
                    <div className="bg-gray-50/70 px-6 py-2.5">
                      <span className="text-sm font-semibold text-navy">
                        {job.jobName || <span className="text-amber-600">⚠ No name</span>}
                      </span>
                      <span className="ml-2 text-xs text-gray-400">
                        #{job.jobNumber} · {job.customer}
                      </span>
                    </div>
                    {rows.map((r) => {
                      const cents = toCents(amounts[r.app.id] ?? "");
                      const tooMuch = cents > r.balanceCents;
                      return (
                        <div
                          key={r.app.id}
                          data-tour={r.app.id === firstRowId ? "check-first-row" : undefined}
                          className={`flex flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3 ${cents > 0 ? "bg-teal/5" : ""}`}
                        >
                          <div className="min-w-[120px] flex-1">
                            <div className="text-sm font-semibold text-navy">App #{r.app.applicationNumber}</div>
                            <div className="text-xs text-gray-400">{formatDate(r.app.applicationDate)}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-gray-400">Amount due</div>
                            <div className="text-sm tabular-nums text-gray-600">{money(Math.round(r.app.currentPaymentDue * 100))}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-gray-400">Paid so far</div>
                            <div className="text-sm tabular-nums text-gray-600">{money(r.paidCents)}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-gray-400">Balance</div>
                            <div className="text-sm font-semibold tabular-nums text-orange-600">{money(r.balanceCents)}</div>
                          </div>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <div
                                className={`flex w-36 items-center rounded-lg border bg-white focus-within:ring-2 ${
                                  tooMuch
                                    ? "border-red-300 focus-within:border-red-400 focus-within:ring-red-200"
                                    : "border-gray-200 focus-within:border-teal focus-within:ring-teal/30"
                                }`}
                              >
                                <span className="select-none pl-3 pr-1 text-sm text-navy">$</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  aria-label={`Amount for job ${r.job.jobNumber} app ${r.app.applicationNumber}`}
                                  value={amounts[r.app.id] ?? ""}
                                  onChange={(e) => setAmount(r.app.id, e.target.value)}
                                  onWheel={(e) => e.currentTarget.blur()}
                                  className="min-w-0 flex-1 bg-transparent py-2 pr-3 text-sm text-navy focus:outline-none"
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => fill(r)}
                                title="Fill with this balance, or what's left on the check if that's less"
                                className="rounded-lg border border-teal/30 px-2.5 py-2 text-xs font-semibold text-teal hover:bg-teal/5"
                              >
                                Fill
                              </button>
                            </div>
                            {tooMuch && <p className="text-xs text-red-600">More than the balance of {money(r.balanceCents)}.</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {saveError && <p className="text-sm text-red-600">{saveError}</p>}

        {/* Running total + save */}
        <div
          data-tour="check-summary"
          className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-gray-100 bg-white px-6 py-4 shadow-lg"
        >
          <div className="flex flex-wrap gap-x-8 gap-y-2">
            <div>
              <div className="text-xs text-gray-400">Check total</div>
              <div className="text-sm font-bold tabular-nums text-navy">{money(totalCents)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400">Assigned</div>
              <div className="text-sm font-bold tabular-nums text-navy">{money(assignedCents)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400">Left over</div>
              <div
                className={`text-sm font-bold tabular-nums ${
                  totalCents === 0 ? "text-gray-400" : leftCents === 0 ? "text-green-600" : "text-orange-600"
                }`}
              >
                {money(leftCents)}
                {leftCents < 0 && <span className="ml-1 text-xs font-medium">(over-assigned)</span>}
              </div>
            </div>
          </div>
          <div data-tour="check-save">
            <Button type="submit" disabled={!canSave} className="w-auto px-6">
              {isSaving ? "Recording…" : "Record check"}
            </Button>
          </div>
        </div>
      </form>

      <StepTutorial steps={CHECK_TUTORIAL_STEPS} step={tutorialStep} setStep={setTutorialStep} />
    </div>
  );
}
