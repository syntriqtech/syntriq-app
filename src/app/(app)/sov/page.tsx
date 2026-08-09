"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useJobs } from "@/hooks/useJobs";
import { SOVLineItem } from "@/lib/sovData";
import { deletePayApplicationWithItems, fetchApplicationOptions, fetchSovItems, saveSovItems, SovApplicationOption } from "@/lib/sovLineItemsDb";
import SOVTable from "@/components/SOVTable";
import { exportPayApplicationPdf } from "@/lib/payAppPdf";
import { getContractorInfo } from "@/lib/sampleUser";
import { computeAllJobMetrics, JobMetrics } from "@/lib/dashboardMetrics";
import DonutPercent from "@/components/DonutPercent";
import JobListTable from "@/components/JobListTable";
import {
  fetchPayApplicationsByJob,
  purgeDeletedPayApplications,
  findPayApplication,
  certifyPayApplication,
  fetchPayApplicationRevisions,
  PayApplication,
} from "@/lib/payApplicationsDb";
import { fetchPayAppPayments } from "@/lib/payAppPaymentsDb";
import { fetchChangeOrders } from "@/lib/changeOrdersDb";
import { fetchStaleLienWaiverSummaryByJob, LienWaiver } from "@/lib/lienWaiversDb";
import { STATUS_LABEL, STATUS_BADGE_STYLE } from "@/lib/payApplicationStatusUi";
import { formatDate } from "@/lib/dateUtils";
import DownloadPackagePromptModal from "@/components/DownloadPackagePromptModal";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const currencyShort = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function LabeledBar({ label, percent }: { label: string; percent: number }) {
  const pct = Math.max(0, Math.min(100, percent));
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 flex-none text-xs text-gray-500">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-green-500" : "bg-teal"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-9 flex-none text-right text-xs font-medium tabular-nums text-gray-500">{pct}%</span>
    </div>
  );
}

type PayAppWithStatus = PayApplication & {
  totalPaid: number;
  paymentStatus: "Unpaid" | "Partial" | "Paid";
};

type EditableField = "description" | "scheduledValue" | "previousApplications" | "thisPeriod" | "storedMaterials" | "percentComplete";

function applyUpdate(items: SOVLineItem[], index: number, field: EditableField, value: string): SOVLineItem[] {
  const updated = [...items];
  const item = updated[index];

  if (field === "percentComplete") {
    const percent = Number(value) || 0;
    const totalCompleted = (item.scheduledValue * percent) / 100;
    const thisPeriod = Math.max(0, totalCompleted - item.previousApplications);
    updated[index] = { ...item, thisPeriod };
  } else {
    const numericFields: EditableField[] = ["scheduledValue", "previousApplications", "thisPeriod", "storedMaterials"];
    updated[index] = {
      ...item,
      [field]: numericFields.includes(field) ? Number(value) || 0 : value,
    };
  }

  return updated;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function nextApplicationNumber(options: SovApplicationOption[], current: string): string {
  const numbers = [...options.map((o) => o.applicationNumber), current]
    .map((n) => Number(n))
    .filter((n) => !Number.isNaN(n));
  const max = numbers.length > 0 ? Math.max(...numbers) : 0;
  return String(max + 1);
}

function numericSort(a: string, b: string): number {
  const na = parseFloat(a), nb = parseFloat(b);
  return !isNaN(na) && !isNaN(nb) ? na - nb : a.localeCompare(b);
}

export default function ScheduleOfValuesPage() {
  const router = useRouter();
  const { jobs, isLoading: isLoadingJobs } = useJobs();
  const sortedJobs = [...jobs].sort((a, b) => {
    const na = parseFloat(a.jobNumber), nb = parseFloat(b.jobNumber);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.jobNumber.localeCompare(b.jobNumber);
  });

  // ── View state ────────────────────────────────────────────────────────────
  const [view, setView] = useState<"list" | "bubbles" | "form">("list");

  // ── List state ────────────────────────────────────────────────────────────
  const [metrics, setMetrics] = useState<JobMetrics[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"jobNumber" | "percent" | "gc" | "pm">("jobNumber");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // ── Bubbles state ─────────────────────────────────────────────────────────
  const [bubbleJobMetrics, setBubbleJobMetrics] = useState<JobMetrics | null>(null);
  const [jobApps, setJobApps] = useState<PayAppWithStatus[]>([]);
  const [isLoadingApps, setIsLoadingApps] = useState(false);
  const [deletingAppId, setDeletingAppId] = useState<string | null>(null);
  const [bubbleError, setBubbleError] = useState<string | null>(null);
  const [pendingCoCount, setPendingCoCount] = useState(0);
  const [staleWaivers, setStaleWaivers] = useState<Map<string, LienWaiver>>(new Map());
  const [revisionHistory, setRevisionHistory] = useState<Record<string, PayApplication[] | "loading">>({});
  const [certifyingId, setCertifyingId] = useState<string | null>(null);
  const [certifyError, setCertifyError] = useState<string | null>(null);

  // ── Form state ────────────────────────────────────────────────────────────
  const [jobNumber, setJobNumber] = useState("");
  const [applicationOptions, setApplicationOptions] = useState<SovApplicationOption[]>([]);
  const [applicationNumber, setApplicationNumber] = useState("1");
  const [applicationDate, setApplicationDate] = useState(todayIsoDate);
  const [periodTo, setPeriodTo] = useState(todayIsoDate);
  const [lineItems, setLineItems] = useState<SOVLineItem[]>([]);
  const [changeOrders, setChangeOrders] = useState<SOVLineItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [rolledForwardAt, setRolledForwardAt] = useState<number | null>(null);
  const [showDownloadPrompt, setShowDownloadPrompt] = useState(false);
  const [currentPayApp, setCurrentPayApp] = useState<PayApplication | null>(null);
  const [isReviseMode, setIsReviseMode] = useState(false);
  const [revisionReason, setRevisionReason] = useState("");
  const [revisionReasonError, setRevisionReasonError] = useState<string | null>(null);

  // Carries a specific application number from bubbles into the form effect
  const targetAppRef = useRef<string | null>(null);

  // ── Load list metrics ─────────────────────────────────────────────────────
  useEffect(() => {
    if (isLoadingJobs) return;
    if (jobs.length === 0) { setMetrics([]); return; }
    let cancelled = false;
    setIsLoadingList(true);
    computeAllJobMetrics(jobs)
      .then((m) => { if (!cancelled) setMetrics(m); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setIsLoadingList(false); });
    return () => { cancelled = true; };
  }, [jobs, isLoadingJobs]);

  // ── Handle sessionStorage jump-to-job (from "Create pay app" buttons) ─────
  useEffect(() => {
    if (isLoadingJobs || sortedJobs.length === 0) return;
    const initJob = sessionStorage.getItem("sov_initial_job");
    if (initJob) {
      const target = sortedJobs.find((j) => j.jobNumber === initJob);
      if (target) {
        sessionStorage.removeItem("sov_initial_job");
        handleSelectJob(target.id);
      }
    }
  }, [isLoadingJobs, jobs]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync job dropdown default when entering form without a pre-selected job ──
  useEffect(() => {
    if (view === "form" && !jobNumber && sortedJobs.length > 0) {
      setJobNumber(sortedJobs[0].jobNumber);
    }
  }, [view, sortedJobs, jobNumber]);

  const job = jobs.find((j) => j.jobNumber === jobNumber);

  // ── Load SOV items when job/view changes in form view ────────────────────
  useEffect(() => {
    if (view !== "form" || !job) {
      setApplicationOptions([]);
      setLineItems([]);
      setChangeOrders([]);
      setCurrentPayApp(null);
      return;
    }
    let cancelled = false;
    setIsLoadingItems(true);
    setSaveError(null);
    fetchApplicationOptions(job.id)
      .then(async (options) => {
        if (cancelled) return;
        setApplicationOptions(options);
        const latest = options[options.length - 1];

        const startNew = typeof window !== "undefined" && sessionStorage.getItem("sov_start_next_app") === "1";
        if (startNew) sessionStorage.removeItem("sov_start_next_app");

        // Consume the target app number set when clicking an existing bubble
        const targetNum = targetAppRef.current;
        targetAppRef.current = null;

        if (latest) {
          if (startNew) {
            const { lines, changeOrders: cos } = await fetchSovItems(job.id, latest.applicationNumber);
            if (cancelled) return;
            const nextNum = nextApplicationNumber(options, latest.applicationNumber);
            setLineItems(rollForward(lines));
            setChangeOrders(rollForward(cos));
            setApplicationNumber(nextNum);
            setApplicationDate(todayIsoDate());
            setPeriodTo(todayIsoDate());
            setSavedAt(null);
            setRolledForwardAt(Date.now());
            setCurrentPayApp(null); // brand-new application number — nothing to lock/revise yet
          } else {
            const appToLoad = targetNum ?? latest.applicationNumber;
            const { lines, changeOrders: cos } = await fetchSovItems(job.id, appToLoad);
            if (cancelled) return;
            const option = options.find((o) => o.applicationNumber === appToLoad);
            setApplicationNumber(appToLoad);
            setApplicationDate(option?.applicationDate ?? todayIsoDate());
            setPeriodTo(option?.periodTo ?? todayIsoDate());
            setLineItems(lines);
            setChangeOrders(cos);
            const payApp = await findPayApplication(job.id, appToLoad).catch(() => null);
            if (!cancelled) setCurrentPayApp(payApp);
          }
        } else {
          setApplicationNumber("1");
          setApplicationDate(todayIsoDate());
          setPeriodTo(todayIsoDate());
          setLineItems([]);
          setChangeOrders([]);
          setCurrentPayApp(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setSaveError(err instanceof Error ? err.message : "Could not load this job's SOV.");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingItems(false);
      });
    return () => { cancelled = true; };
  }, [job?.id, view]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── List handlers ─────────────────────────────────────────────────────────
  function handleSort(col: "jobNumber" | "percent" | "gc" | "pm") {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(col); setSortDir("asc"); }
  }

  async function handleSelectJob(jobId: string) {
    const selected = jobs.find((j) => j.id === jobId);
    if (!selected) return;
    const selectedMetrics = metrics.find((m) => m.id === jobId) ?? null;
    setJobNumber(selected.jobNumber);
    setBubbleJobMetrics(selectedMetrics);
    setSavedAt(null);
    setRolledForwardAt(null);
    setSaveError(null);
    setShowDownloadPrompt(false);
    setJobApps([]);
    setPendingCoCount(0);
    setIsLoadingApps(true);
    setView("bubbles");
    try {
      const apps = await fetchPayApplicationsByJob(jobId);
      const appsWithStatus = await Promise.all(
        apps.map(async (app) => {
          const payments = await fetchPayAppPayments(app.id);
          const totalPaid = payments.reduce((sum, p) => sum + p.amountPaid, 0);
          const paymentStatus: "Unpaid" | "Partial" | "Paid" =
            totalPaid <= 0 ? "Unpaid" :
            totalPaid < app.currentPaymentDue - 0.01 ? "Partial" :
            "Paid";
          return { ...app, totalPaid, paymentStatus };
        })
      );
      setJobApps(appsWithStatus);
    } catch {
      // silently fail — grid will be empty, user can retry via back + re-select
    } finally {
      setIsLoadingApps(false);
    }

    // Pending/submitted (not yet approved) change orders for this job —
    // same "pending" definition used on the Change Orders page and Record Payment badge.
    try {
      const cos = await fetchChangeOrders(jobId);
      setPendingCoCount(cos.filter((co) => co.status === "pending" || co.status === "submitted").length);
    } catch {
      // silently fail — badge just won't show
    }

    setRevisionHistory({});
    try {
      const stale = await fetchStaleLienWaiverSummaryByJob(jobId);
      setStaleWaivers(stale);
    } catch {
      // silently fail — banner just won't show
      setStaleWaivers(new Map());
    }
  }

  // Navigate to Change Orders, scoped to this job and filtered to pending
  function handleViewPendingCos(jobNumber: string) {
    sessionStorage.setItem("co_initial_job", jobNumber);
    router.push("/change-orders?filter=exposure");
  }

  // ── Bubbles handlers ──────────────────────────────────────────────────────
  function handleOpenExistingApp(appNumber: string, revise: boolean = false) {
    sessionStorage.removeItem("sov_start_next_app");
    targetAppRef.current = appNumber;
    setIsReviseMode(revise);
    setRevisionReason("");
    setRevisionReasonError(null);
    setSavedAt(null);
    setRolledForwardAt(null);
    setSaveError(null);
    setShowDownloadPrompt(false);
    setView("form");
  }

  function handleNewPayApp() {
    sessionStorage.setItem("sov_start_next_app", "1");
    setIsReviseMode(false);
    setRevisionReason("");
    setRevisionReasonError(null);
    setSavedAt(null);
    setRolledForwardAt(null);
    setSaveError(null);
    setShowDownloadPrompt(false);
    setView("form");
  }

  async function toggleRevisionHistory(app: PayAppWithStatus) {
    if (revisionHistory[app.applicationNumber]) {
      setRevisionHistory((prev) => {
        const next = { ...prev };
        delete next[app.applicationNumber];
        return next;
      });
      return;
    }
    if (!job) return;
    setRevisionHistory((prev) => ({ ...prev, [app.applicationNumber]: "loading" }));
    try {
      const rows = await fetchPayApplicationRevisions(job.id, app.applicationNumber);
      setRevisionHistory((prev) => ({ ...prev, [app.applicationNumber]: rows }));
    } catch {
      setRevisionHistory((prev) => {
        const next = { ...prev };
        delete next[app.applicationNumber];
        return next;
      });
    }
  }

  async function handleMarkCertified(app: PayAppWithStatus) {
    setCertifyError(null);
    setCertifyingId(app.id);
    try {
      await certifyPayApplication(app.id);
      const updated = await fetchPayApplicationsByJob(app.jobId);
      const appsWithStatus = await Promise.all(
        updated.map(async (a) => {
          const payments = await fetchPayAppPayments(a.id);
          const totalPaid = payments.reduce((sum, p) => sum + p.amountPaid, 0);
          const paymentStatus: "Unpaid" | "Partial" | "Paid" =
            totalPaid <= 0 ? "Unpaid" :
            totalPaid < a.currentPaymentDue - 0.01 ? "Partial" :
            "Paid";
          return { ...a, totalPaid, paymentStatus };
        })
      );
      setJobApps(appsWithStatus);
      if (currentPayApp?.id === app.id) {
        setCurrentPayApp((prev) => (prev ? { ...prev, status: "certified", certifiedDate: new Date().toISOString().slice(0, 10) } : prev));
      }
    } catch (err) {
      setCertifyError(err instanceof Error ? err.message : "Could not mark this application certified.");
    } finally {
      setCertifyingId(null);
    }
  }

  async function handleDeleteApp(app: PayAppWithStatus) {
    if (!job) return;
    setDeletingAppId(null);
    setBubbleError(null);
    setIsLoadingApps(true);
    try {
      await deletePayApplicationWithItems(job.id, app.applicationNumber, app.id);
      const updated = await fetchPayApplicationsByJob(job.id);
      const appsWithStatus = await Promise.all(
        updated.map(async (a) => {
          const payments = await fetchPayAppPayments(a.id);
          const totalPaid = payments.reduce((sum, p) => sum + p.amountPaid, 0);
          const paymentStatus: "Unpaid" | "Partial" | "Paid" =
            totalPaid <= 0 ? "Unpaid" :
            totalPaid < a.currentPaymentDue - 0.01 ? "Partial" :
            "Paid";
          return { ...a, totalPaid, paymentStatus };
        })
      );
      setJobApps(appsWithStatus);
      computeAllJobMetrics(jobs)
        .then((all) => {
          setMetrics(all);
          setBubbleJobMetrics(all.find((m) => m.id === job.id) ?? null);
        })
        .catch(() => {});
    } catch (err) {
      setBubbleError(err instanceof Error ? err.message : "Could not delete application.");
    } finally {
      setIsLoadingApps(false);
    }
  }

  // ── Form handlers ─────────────────────────────────────────────────────────
  async function handleSelectApplication(number: string) {
    if (!job || number === applicationNumber) return;
    setApplicationNumber(number);
    setSaveError(null);
    setSavedAt(null);
    setRolledForwardAt(null);
    setShowDownloadPrompt(false);
    setIsReviseMode(false);
    setRevisionReason("");
    setRevisionReasonError(null);
    const option = applicationOptions.find((o) => o.applicationNumber === number);
    if (option) {
      setApplicationDate(option.applicationDate);
      setPeriodTo(option.periodTo);
    }
    setIsLoadingItems(true);
    try {
      const { lines, changeOrders: cos } = await fetchSovItems(job.id, number);
      setLineItems(lines);
      setChangeOrders(cos);
      const payApp = await findPayApplication(job.id, number).catch(() => null);
      setCurrentPayApp(payApp);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not load that application.");
    } finally {
      setIsLoadingItems(false);
    }
  }

  const cwRate = (job?.retentionRateCW ?? 0) / 100;
  const smRate = (job?.retentionRateSM ?? 0) / 100;

  function updateLineItem(index: number, field: EditableField, value: string) {
    setLineItems((prev) => applyUpdate(prev, index, field, value));
  }

  function addLineItem() {
    setLineItems((prev) => [
      ...prev,
      { item: String(prev.length + 1), description: "", scheduledValue: 0, previousApplications: 0, thisPeriod: 0, storedMaterials: 0 },
    ]);
  }

  function updateChangeOrder(index: number, field: EditableField, value: string) {
    setChangeOrders((prev) => applyUpdate(prev, index, field, value));
  }

  function rollForward(items: SOVLineItem[]): SOVLineItem[] {
    return items.map((item) => ({
      ...item,
      previousApplications: item.previousApplications + item.thisPeriod,
      thisPeriod: 0,
      storedMaterials: 0,
    }));
  }

  function handleStartNextApplication() {
    const nextNumber = nextApplicationNumber(applicationOptions, applicationNumber);
    setLineItems((prev) => rollForward(prev));
    setChangeOrders((prev) => rollForward(prev));
    setApplicationNumber(nextNumber);
    setApplicationDate(todayIsoDate());
    setPeriodTo(todayIsoDate());
    setSavedAt(null);
    setShowDownloadPrompt(false);
    setRolledForwardAt(Date.now());
    setIsReviseMode(false);
    setRevisionReason("");
    setRevisionReasonError(null);
    setCurrentPayApp(null);
  }

  async function handleMarkCertifiedFromForm() {
    if (!currentPayApp) return;
    setCertifyError(null);
    setCertifyingId(currentPayApp.id);
    try {
      const updated = await certifyPayApplication(currentPayApp.id);
      setCurrentPayApp(updated);
    } catch (err) {
      setCertifyError(err instanceof Error ? err.message : "Could not mark this application certified.");
    } finally {
      setCertifyingId(null);
    }
  }

  async function handleSave() {
    if (!job) return;

    if (isReviseMode) {
      if (!currentPayApp) {
        setSaveError("Could not find the application to revise. Please go back and try again.");
        return;
      }
      if (!revisionReason.trim()) {
        setRevisionReasonError("A reason is required to save a revision.");
        return;
      }
    }
    setRevisionReasonError(null);

    // Date sequence validation — block save if dates go backward vs. the prior application
    const prevApp = applicationOptions
      .filter((o) => Number(o.applicationNumber) < Number(applicationNumber))
      .sort((a, b) => Number(b.applicationNumber) - Number(a.applicationNumber))[0];
    if (prevApp) {
      if (applicationDate < prevApp.applicationDate) {
        setSaveError(
          `Application date must be on or after Application #${prevApp.applicationNumber}'s date (${formatDate(prevApp.applicationDate)}).`
        );
        return;
      }
      if (periodTo < prevApp.periodTo) {
        setSaveError(
          `"Period to" must be on or after Application #${prevApp.applicationNumber}'s "Period to" (${formatDate(prevApp.periodTo)}).`
        );
        return;
      }
    }

    const revisionInput = isReviseMode && currentPayApp
      ? { payAppId: currentPayApp.id, reason: revisionReason.trim() }
      : undefined;

    setIsSaving(true);
    setSaveError(null);
    try {
      await saveSovItems(job.id, applicationNumber, applicationDate, periodTo, lineItems, changeOrders, revisionInput);
      setApplicationOptions((prev) => {
        const withoutCurrent = prev.filter((o) => o.applicationNumber !== applicationNumber);
        return [...withoutCurrent, { applicationNumber, applicationDate, periodTo }].sort(
          (a, b) => Number(a.applicationNumber) - Number(b.applicationNumber)
        );
      });
      setSavedAt(Date.now());
      setShowDownloadPrompt(true);
      setIsReviseMode(false);
      setRevisionReason("");
      // Refresh list metrics in the background so they're current when user returns
      computeAllJobMetrics(jobs).then(setMetrics).catch(() => {});
      findPayApplication(job.id, applicationNumber).then(setCurrentPayApp).catch(() => {});
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not save.";
      if (msg.toLowerCase().includes("coerce") || msg.toLowerCase().includes("single json")) {
        try {
          await purgeDeletedPayApplications(job.id, applicationNumber);
          await saveSovItems(job.id, applicationNumber, applicationDate, periodTo, lineItems, changeOrders, revisionInput);
          setApplicationOptions((prev) => {
            const withoutCurrent = prev.filter((o) => o.applicationNumber !== applicationNumber);
            return [...withoutCurrent, { applicationNumber, applicationDate, periodTo }].sort(
              (a, b) => Number(a.applicationNumber) - Number(b.applicationNumber)
            );
          });
          setSavedAt(Date.now());
          setShowDownloadPrompt(true);
          setIsReviseMode(false);
          setRevisionReason("");
          computeAllJobMetrics(jobs).then(setMetrics).catch(() => {});
          findPayApplication(job.id, applicationNumber).then(setCurrentPayApp).catch(() => {});
        } catch {
          setSaveError("Could not resolve the conflict automatically. Please contact support.");
        }
      } else if (msg.toLowerCase().includes("certified")) {
        setSaveError(
          "This pay application has already been certified and can no longer be revised or edited. Corrections must go into the next billing period's application."
        );
      } else {
        setSaveError(msg);
      }
    } finally {
      setIsSaving(false);
    }
  }

  function handleGoToDownloadPackage() {
    if (job) {
      sessionStorage.setItem("dlpkg_initial_job", job.jobNumber);
      sessionStorage.setItem("dlpkg_initial_app", applicationNumber);
    }
    setShowDownloadPrompt(false);
    router.push("/download-package");
  }

  const netChangeOrders = changeOrders.reduce((sum, co) => sum + co.scheduledValue, 0);
  const revisedContractValue = (job?.contractValue ?? 0) + netChangeOrders;
  const totalScheduledValue = lineItems.reduce((sum, line) => sum + line.scheduledValue, 0);
  const exceedsContractValue = Boolean(job) && totalScheduledValue > job!.contractValue;
  // Lock contract line item description + scheduled value once any application has been saved
  const contractLocked = applicationOptions.length > 0;

  function billsOverScheduledValue(line: SOVLineItem) {
    return line.scheduledValue >= 0 && line.previousApplications + line.thisPeriod + line.storedMaterials > line.scheduledValue;
  }
  const overBilledLineItems = lineItems.filter(billsOverScheduledValue);
  const overBilledChangeOrders = changeOrders.filter(billsOverScheduledValue);
  const hasOverBilledItem = overBilledLineItems.length > 0 || overBilledChangeOrders.length > 0;
  const isUnsavedApplication = !applicationOptions.some((o) => o.applicationNumber === applicationNumber);
  const isLocked = currentPayApp?.status === "certified" || currentPayApp?.status === "paid";
  const canRevise = currentPayApp?.status === "submitted" || currentPayApp?.status === "revised";

  async function handleDownloadSOV() {
    if (!job) return;
    const contractor = await getContractorInfo();
    exportPayApplicationPdf(
      { job, contractorName: contractor.company, contractorAddress: contractor.companyAddress, applicationNumber, applicationDate, periodTo, lineItems, changeOrders, cwRate, smRate },
      "sov"
    );
  }

  // ── List filtered + sorted ────────────────────────────────────────────────
  const filtered = metrics.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return r.jobNumber.toLowerCase().includes(q) || r.jobName.toLowerCase().includes(q) || r.customer.toLowerCase().includes(q);
  });

  function pmFor(jobId: string): string {
    return jobs.find((j) => j.id === jobId)?.ctiPm ?? "";
  }

  const sorted = [...filtered].sort((a, b) => {
    let cmp: number;
    if (sortBy === "jobNumber") cmp = numericSort(a.jobNumber, b.jobNumber);
    else if (sortBy === "percent") cmp = a.percentComplete - b.percentComplete;
    else if (sortBy === "gc") cmp = a.customer.localeCompare(b.customer);
    else {
      const pmA = pmFor(a.id);
      const pmB = pmFor(b.id);
      cmp = !pmA && !pmB ? 0 : !pmA ? 1 : !pmB ? -1 : pmA.localeCompare(pmB);
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  const isSpinning = isLoadingJobs || isLoadingList;

  // Next application number shown on the "+ New" bubble card
  const maxAppNum = jobApps.length > 0 ? Math.max(...jobApps.map((a) => Number(a.applicationNumber) || 0)) : 0;
  const nextBubbleAppNum = String(maxAppNum + 1);

  // The only deletable application: last in sequence, unpaid, and not yet certified
  const lastApp = jobApps.reduce<PayAppWithStatus | null>(
    (max, a) => (max === null || Number(a.applicationNumber) > Number(max.applicationNumber) ? a : max),
    null
  );
  const eligibleDeleteId =
    lastApp?.paymentStatus === "Unpaid" && (lastApp.status === "submitted" || lastApp.status === "revised")
      ? lastApp.id
      : null;

  // ══════════════════════════════════════════════════════════════════════════
  // LIST VIEW
  // ══════════════════════════════════════════════════════════════════════════
  if (view === "list") {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold text-navy">Create Pay App</h1>
          <p className="mt-1 text-sm text-gray-500">Select a job to enter billing for this period.</p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:w-72">
            <input
              type="search"
              placeholder="Search by job #, name, or GC…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-navy placeholder:text-gray-400 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30"
            />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">Sort:</span>
            <button
              type="button"
              onClick={() => handleSort("jobNumber")}
              className={`rounded-lg px-3 py-2 font-medium transition-colors ${sortBy === "jobNumber" ? "bg-teal text-white" : "border border-gray-200 text-navy hover:bg-gray-50"}`}
            >
              Job #{sortBy === "jobNumber" && (sortDir === "asc" ? " ↑" : " ↓")}
            </button>
            <button
              type="button"
              onClick={() => handleSort("percent")}
              className={`rounded-lg px-3 py-2 font-medium transition-colors ${sortBy === "percent" ? "bg-teal text-white" : "border border-gray-200 text-navy hover:bg-gray-50"}`}
            >
              % Complete{sortBy === "percent" && (sortDir === "asc" ? " ↑" : " ↓")}
            </button>
            <button
              type="button"
              onClick={() => handleSort("gc")}
              className={`rounded-lg px-3 py-2 font-medium transition-colors ${sortBy === "gc" ? "bg-teal text-white" : "border border-gray-200 text-navy hover:bg-gray-50"}`}
            >
              GC{sortBy === "gc" && (sortDir === "asc" ? " ↑" : " ↓")}
            </button>
            <button
              type="button"
              onClick={() => handleSort("pm")}
              className={`rounded-lg px-3 py-2 font-medium transition-colors ${sortBy === "pm" ? "bg-teal text-white" : "border border-gray-200 text-navy hover:bg-gray-50"}`}
            >
              PM{sortBy === "pm" && (sortDir === "asc" ? " ↑" : " ↓")}
            </button>
          </div>
        </div>

        <JobListTable
          metrics={sorted}
          jobs={jobs}
          isSpinning={isSpinning}
          onSelectJob={handleSelectJob}
          emptyMessage={search ? "No jobs match your search." : "No active jobs yet — add one in Job Setup."}
          showAppColumn
        />
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BUBBLES VIEW — pay application cards for the selected job
  // ══════════════════════════════════════════════════════════════════════════
  if (view === "bubbles") {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <button
            type="button"
            onClick={() => setView("list")}
            className="mb-1 text-sm font-medium text-teal hover:underline"
          >
            ← All Jobs
          </button>
          <h1 className="text-2xl font-bold text-navy">Pay Applications</h1>
          <p className="mt-1 text-sm text-gray-500">Select an application to edit, or start a new one.</p>
        </div>

        {/* Job summary strip */}
        {bubbleJobMetrics && (
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  Job {bubbleJobMetrics.jobNumber}
                </p>
                <div className="mt-0.5 flex items-center gap-2">
                  <h2 className="truncate text-xl font-bold text-navy">
                    {bubbleJobMetrics.jobName || "—"}
                  </h2>
                  {pendingCoCount > 0 && (
                    <span
                      role="button"
                      tabIndex={0}
                      title={`${pendingCoCount} pending change order${pendingCoCount !== 1 ? "s" : ""} — view`}
                      onClick={() => handleViewPendingCos(bubbleJobMetrics.jobNumber)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") handleViewPendingCos(bubbleJobMetrics.jobNumber);
                      }}
                      className="inline-flex min-w-[18px] flex-none items-center justify-center rounded-full bg-amber-400 px-1 py-0.5 text-[10px] font-bold text-white hover:bg-amber-500"
                    >
                      {pendingCoCount}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-gray-500">{bubbleJobMetrics.customer}</p>
              </div>
              <DonutPercent percent={bubbleJobMetrics.percentComplete} size={64} />
            </div>
            <div className="mt-4 flex flex-col gap-2 border-t border-gray-50 pt-4">
              <LabeledBar label="Contract" percent={bubbleJobMetrics.contractPercentComplete} />
              {bubbleJobMetrics.hasChangeOrders && (
                <LabeledBar label="Change orders" percent={bubbleJobMetrics.changeOrderPercentComplete} />
              )}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-4 border-t border-gray-50 pt-4">
              <div>
                <p className="text-xs text-gray-400">Contract (revised)</p>
                <p className="mt-0.5 font-semibold text-navy">
                  {currencyShort.format(bubbleJobMetrics.contractValue)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Billed to date</p>
                <p className="mt-0.5 font-semibold text-navy">
                  {currencyShort.format(bubbleJobMetrics.billedToDate)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Retention held</p>
                <p className="mt-0.5 font-semibold text-navy">
                  {currencyShort.format(bubbleJobMetrics.retention)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Pay application grid */}
        {bubbleError && <p className="text-sm text-red-600">{bubbleError}</p>}
        {certifyError && <p className="text-sm text-red-600">{certifyError}</p>}
        {isLoadingApps ? (
          <p className="text-sm text-gray-500">Loading pay applications…</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {jobApps.map((app) => {
              const isEligible = app.id === eligibleDeleteId;
              const isConfirming = app.id === deletingAppId;
              const canReviseOrCertify = app.status === "submitted" || app.status === "revised";
              const staleWaiver = staleWaivers.get(app.applicationNumber);
              const history = revisionHistory[app.applicationNumber];

              return (
                <div
                  key={app.id}
                  className="relative rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:border-teal/40 hover:shadow-md"
                >
                  {isEligible && !isConfirming && (
                    <button
                      type="button"
                      title="Delete this application"
                      onClick={() => setDeletingAppId(app.id)}
                      className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full text-gray-300 transition-colors hover:bg-red-50 hover:text-red-400"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                        <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                      </svg>
                    </button>
                  )}

                  {isConfirming ? (
                    <div className="flex min-h-[180px] flex-col items-center justify-center gap-4 text-center">
                      <p className="text-sm font-semibold text-navy">
                        Delete Application #{app.applicationNumber}?
                      </p>
                      <p className="text-xs text-gray-500">
                        The SOV data for this application will be removed. The billing record is retained internally.
                      </p>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => setDeletingAppId(null)}
                          className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-navy hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteApp(app)}
                          className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div
                        className={`group cursor-pointer ${isEligible ? "pr-6" : ""}`}
                        onClick={() => handleOpenExistingApp(app.applicationNumber)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Application</p>
                            <p className="text-2xl font-bold text-navy">#{app.applicationNumber}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className={`mt-1 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE_STYLE[app.status]}`}>
                              {STATUS_LABEL[app.status]}
                            </span>
                            {(app.status === "certified" || app.status === "paid") && (
                              <span className="text-[11px] text-gray-400">
                                {currencyShort.format(app.totalPaid)} of {currencyShort.format(app.currentPaymentDue)} paid
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="mt-2 text-sm text-gray-500">
                          {formatDate(app.applicationDate)} – {formatDate(app.periodTo)}
                        </p>
                        <p className="mt-2 text-lg font-semibold text-navy tabular-nums">
                          {currencyShort.format(app.amountBilled)}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-400">billed this period</p>
                        <p className="mt-3 text-xs font-medium text-teal opacity-0 transition-opacity group-hover:opacity-100">
                          Edit application →
                        </p>
                      </div>

                      {canReviseOrCertify && (
                        <div className="mt-3 flex items-center gap-4 border-t border-gray-50 pt-3">
                          <button
                            type="button"
                            onClick={() => handleOpenExistingApp(app.applicationNumber, true)}
                            className="text-xs font-semibold text-amber-600 hover:underline"
                          >
                            Revise
                          </button>
                          <button
                            type="button"
                            disabled={certifyingId === app.id}
                            onClick={() => handleMarkCertified(app)}
                            className="text-xs font-semibold text-teal hover:underline disabled:opacity-50"
                          >
                            {certifyingId === app.id ? "Marking certified…" : "Mark certified"}
                          </button>
                        </div>
                      )}

                      {staleWaiver && (
                        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 leading-relaxed">
                          Waiver on file was generated at {currency.format(staleWaiver.amountOfCheck)} — this application has since been revised.
                        </div>
                      )}

                      <div className="mt-3 border-t border-gray-50 pt-3">
                        <button
                          type="button"
                          onClick={() => toggleRevisionHistory(app)}
                          className="text-xs font-medium text-gray-500 hover:text-teal"
                        >
                          {history ? "▼ Hide revision history" : "▶ Revision history"}
                        </button>
                        {history === "loading" && <p className="mt-2 text-xs text-gray-400">Loading…</p>}
                        {history && history !== "loading" && (
                          <div className="mt-2 flex flex-col gap-2">
                            <p className="text-[11px] text-gray-400">All revisions submitted by you.</p>
                            {history.map((rev) => (
                              <div key={rev.id} className="rounded-lg bg-gray-50 px-3 py-2 text-xs">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-semibold text-navy">
                                    Rev {rev.revisionNumber}{" "}
                                    <span className={rev.isCurrentRevision ? "text-teal" : "text-gray-400"}>
                                      {rev.isCurrentRevision ? "(current)" : "(superseded)"}
                                    </span>
                                  </span>
                                  <span className="font-semibold text-navy">{currency.format(rev.amountBilled)}</span>
                                </div>
                                <p className="mt-0.5 text-gray-400">{formatDate(rev.applicationDate)}</p>
                                {rev.revisionReason && (
                                  <p className="mt-0.5 text-gray-500">&quot;{rev.revisionReason}&quot;</p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}

            {/* New pay application card */}
            <button
              type="button"
              onClick={handleNewPayApp}
              className="flex min-h-[180px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-gray-200 bg-white p-5 transition-all hover:border-teal/50 hover:bg-teal/5"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal/10 text-xl font-light text-teal">
                +
              </div>
              <div className="text-center">
                <p className="font-semibold text-navy">New Pay Application</p>
                <p className="mt-0.5 text-xs text-gray-400">Application #{nextBubbleAppNum}</p>
              </div>
            </button>
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FORM VIEW — SOV editing interface
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={() => setView("bubbles")}
            className="mb-1 text-sm font-medium text-teal hover:underline"
          >
            ← Back to Pay Applications
          </button>
          <h1 className="text-2xl font-bold text-navy">Create Pay App</h1>
          <p className="mt-1 text-sm text-gray-500">Enter this period&apos;s billing for each line item.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="jobSelect" className="text-sm font-medium text-navy">Job</label>
            <select
              id="jobSelect"
              value={jobNumber}
              onChange={(e) => {
                setJobNumber(e.target.value);
                setSavedAt(null);
                setRolledForwardAt(null);
                setSaveError(null);
              }}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-navy focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30"
            >
              {isLoadingJobs && <option>Loading…</option>}
              {!isLoadingJobs && sortedJobs.length === 0 && <option>No jobs yet — add one in Job Setup</option>}
              {sortedJobs.map((j) => (
                <option key={j.id} value={j.jobNumber}>
                  {j.jobName || `⚠ No name (${j.jobNumber})`}{j.jobName ? ` (${j.jobNumber})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="appNumber" className="text-sm font-medium text-navy">Application #</label>
            <select
              id="appNumber"
              value={applicationNumber}
              onChange={(e) => handleSelectApplication(e.target.value)}
              disabled={!job || isLoadingItems}
              className="w-40 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-navy focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30 disabled:opacity-50"
            >
              {applicationOptions.length === 0 && !isUnsavedApplication && <option>No applications yet</option>}
              {applicationOptions.map((option) => (
                <option key={option.applicationNumber} value={option.applicationNumber}>
                  #{option.applicationNumber}
                </option>
              ))}
              {isUnsavedApplication && (
                <option value={applicationNumber}>#{applicationNumber} (new — unsaved)</option>
              )}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="appDate" className="text-sm font-medium text-navy">Application date</label>
            <input
              id="appDate"
              type="date"
              value={applicationDate}
              onChange={(e) => setApplicationDate(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-navy focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="periodTo" className="text-sm font-medium text-navy">Period to</label>
            <input
              id="periodTo"
              type="date"
              value={periodTo}
              onChange={(e) => setPeriodTo(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-navy focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30"
            />
          </div>
          <button
            type="button"
            onClick={handleStartNextApplication}
            disabled={!job || isLoadingItems || exceedsContractValue || hasOverBilledItem}
            className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-navy hover:bg-gray-50 disabled:opacity-50"
          >
            Start next application
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!job || isSaving || isLoadingItems || exceedsContractValue || hasOverBilledItem || isLocked}
            className="rounded-lg border border-teal px-4 py-2.5 text-sm font-semibold text-teal hover:bg-teal/10 disabled:opacity-50"
          >
            {isSaving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={handleDownloadSOV}
            disabled={!job || exceedsContractValue || hasOverBilledItem}
            className="rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal/90 disabled:opacity-50"
          >
            Download SOV
          </button>
          {canRevise && (
            <button
              type="button"
              onClick={handleMarkCertifiedFromForm}
              disabled={certifyingId === currentPayApp?.id}
              className="rounded-lg border border-teal px-4 py-2.5 text-sm font-semibold text-teal hover:bg-teal/10 disabled:opacity-50"
            >
              {certifyingId === currentPayApp?.id ? "Marking certified…" : "Mark certified"}
            </button>
          )}
        </div>
      </div>

      {currentPayApp && (
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE_STYLE[currentPayApp.status]}`}>
            {STATUS_LABEL[currentPayApp.status]}
          </span>
          {isLocked && (
            <span className="text-xs text-gray-500">
              This application is certified and locked. To correct an amount, start the next application instead.
            </span>
          )}
        </div>
      )}
      {certifyError && <p className="text-sm text-red-600">{certifyError}</p>}

      {isReviseMode && !isLocked && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <label htmlFor="revisionReason" className="text-sm font-semibold text-navy">
            Reason for this revision <span className="text-amber-700">(required)</span>
          </label>
          <p className="mt-0.5 text-xs text-gray-500">e.g. &quot;GC requested reduction of $4,200 on line item 3.&quot;</p>
          <textarea
            id="revisionReason"
            value={revisionReason}
            onChange={(e) => { setRevisionReason(e.target.value); setRevisionReasonError(null); }}
            className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-navy focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30"
            rows={2}
          />
          {revisionReasonError && <p className="mt-1 text-xs text-red-600">{revisionReasonError}</p>}
        </div>
      )}

      {isLoadingItems && <p className="text-sm text-gray-500">Loading this job&apos;s schedule of values…</p>}
      {exceedsContractValue && (
        <p className="text-sm text-red-600">
          Contract line items total {currency.format(totalScheduledValue)}, which is {currency.format(totalScheduledValue - job!.contractValue)} over the original contract value of {currency.format(job!.contractValue)}. Reduce a line item&apos;s scheduled value, or add a change order instead if the contract amount actually changed.
        </p>
      )}
      {hasOverBilledItem && (
        <p className="text-sm text-red-600">
          {overBilledLineItems.length + overBilledChangeOrders.length === 1 ? "One row bills" : `${overBilledLineItems.length + overBilledChangeOrders.length} rows bill`}{" "}
          more than its Scheduled Value — Previous Applications + This Period + Stored Materials can&apos;t add up to more than the Scheduled Value for that row. Highlighted in red below.
        </p>
      )}
      {saveError && <p className="text-sm text-red-600">{saveError}</p>}
      {!saveError && savedAt && !isSaving && <p className="text-sm text-teal">Saved.</p>}
      {rolledForwardAt && !savedAt && (
        <p className="text-sm text-navy">
          Moved last period&apos;s This Period billing into Previous Applications and cleared This Period and Stored Materials for application #{applicationNumber}. Review the numbers below, then click Save to store this application.
        </p>
      )}
      {isUnsavedApplication && !rolledForwardAt && !savedAt && (
        <p className="text-sm text-gray-500">
          {`Application #${applicationNumber} hasn't been saved yet. Click Save to store it.`}
        </p>
      )}

      {job && (
        <div className="rounded-2xl border border-gray-100 bg-white px-5 py-4 shadow-sm">
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-500">
            <span>Retention — completed work: <span className="font-semibold text-navy">{job.retentionRateCW}%</span></span>
            <span>Retention — stored materials: <span className="font-semibold text-navy">{job.retentionRateSM}%</span></span>
            <span>Original contract value: <span className="font-semibold text-navy">{currency.format(job.contractValue)}</span></span>
            <span>Net change orders: <span className="font-semibold text-navy">{currency.format(netChangeOrders)}</span></span>
            <span>Revised contract value: <span className="font-semibold text-navy">{currency.format(revisedContractValue)}</span></span>
          </div>
        </div>
      )}

      <SOVTable
        title="Contract line items"
        itemLabel="Item"
        items={lineItems}
        cwRate={cwRate}
        smRate={smRate}
        onUpdateItem={updateLineItem}
        lockDefinition={contractLocked}
        readOnly={isLocked}
        addButtonLabel={contractLocked || isLocked ? undefined : "+ Add line item"}
        onAddItem={contractLocked || isLocked ? undefined : addLineItem}
      />

      <SOVTable
        title="Change orders"
        itemLabel="CO #"
        readOnly={isLocked}
        items={changeOrders}
        cwRate={cwRate}
        smRate={smRate}
        onUpdateItem={updateChangeOrder}
        lockDefinition
      />

      {showDownloadPrompt && (
        <DownloadPackagePromptModal
          onYes={handleGoToDownloadPackage}
          onClose={() => setShowDownloadPrompt(false)}
        />
      )}
    </div>
  );
}
