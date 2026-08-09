"use client";

import { useState } from "react";
import {
  ChangeOrder,
  ChangeOrderStatus,
  setChangeOrderStatus,
  applyChangeOrder,
  updateChangeOrder,
  softDeleteChangeOrder,
  uploadCoDocument,
} from "@/lib/changeOrdersDb";
import { formatDate } from "@/lib/dateUtils";

const STATUS_FLOW: Record<ChangeOrderStatus, ChangeOrderStatus[]> = {
  pending: ["submitted", "void"],
  submitted: ["approved", "rejected", "void"],
  approved: ["void"],
  rejected: [],
  void: [],
};

const STATUS_LABEL: Record<ChangeOrderStatus, string> = {
  pending: "Pending",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
  void: "Void",
};

const STATUS_STYLE: Record<ChangeOrderStatus, string> = {
  pending: "bg-gray-100 text-gray-600",
  submitted: "bg-blue-50 text-blue-700",
  approved: "bg-green-50 text-green-700",
  rejected: "bg-red-50 text-red-700",
  void: "bg-gray-100 text-gray-400",
};

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 });

type Props = {
  co: ChangeOrder;
  jobLabel: string;
  onClose: () => void;
  onUpdated: (co: ChangeOrder) => void;
  onDeleted: (id: string) => void;
};

export default function ChangeOrderDetailModal({ co, jobLabel, onClose, onUpdated, onDeleted }: Props) {
  const [current, setCurrent] = useState<ChangeOrder>(co);
  const [gcRef, setGcRef] = useState(co.gcApprovalReference);
  const [gcCoNumber, setGcCoNumber] = useState(co.gcCoNumber ?? "");
  const [gcCoNumberSaving, setGcCoNumberSaving] = useState(false);
  const [approvalFile, setApprovalFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [confirmApply, setConfirmApply] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ description: string; amount: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const nextStatuses = STATUS_FLOW[current.status];
  const isApplied = !!current.appliedAt;
  const readyToApply = current.status === "approved" && !isApplied;

  async function handleStatusChange(newStatus: ChangeOrderStatus) {
    setError(null);
    setSaving(true);
    try {
      let docUrl: string | undefined;
      if (newStatus === "approved" && approvalFile) {
        docUrl = await uploadCoDocument(current.id, approvalFile);
      }
      const updated = await setChangeOrderStatus(current.id, newStatus, {
        gcApprovalReference: gcRef || undefined,
        approvalDocUrl: docUrl,
      });
      setCurrent(updated);
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status.");
    } finally {
      setSaving(false);
    }
  }

  async function handleApply() {
    setError(null);
    setApplying(true);
    try {
      await applyChangeOrder(current.id);
      const updated = { ...current, appliedAt: new Date().toISOString() };
      setCurrent(updated);
      onUpdated(updated);
      setConfirmApply(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply CO.");
    } finally {
      setApplying(false);
    }
  }

  async function handleSaveEdits() {
    if (!editing) return;
    setError(null);
    setSaving(true);
    try {
      const parsedAmount = parseFloat(editing.amount.replace(/[^0-9.\-]/g, ""));
      if (isNaN(parsedAmount)) { setError("Enter a valid amount."); setSaving(false); return; }
      const updated = await updateChangeOrder(current.id, {
        description: editing.description.trim(),
        amount: parsedAmount,
      });
      setCurrent(updated);
      onUpdated(updated);
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveGcCoNumber() {
    setGcCoNumberSaving(true);
    setError(null);
    try {
      const updated = await updateChangeOrder(current.id, { gcCoNumber: gcCoNumber.trim() || null });
      setCurrent(updated);
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save GC CO #.");
    } finally {
      setGcCoNumberSaving(false);
    }
  }

  async function handleDelete() {
    try {
      await softDeleteChangeOrder(current.id);
      onDeleted(current.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete.");
      setConfirmDelete(false);
    }
  }

  const displayId = current.coNumber ?? current.pcoNumber ?? "—";
  const amountColor = current.amount < 0 ? "text-red-600" : "text-navy";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-mono text-gray-500">{displayId}</span>
              {current.gcCoNumber && (
                <span className="text-sm font-mono text-teal">GC: {current.gcCoNumber}</span>
              )}
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[current.status]}`}>
                {STATUS_LABEL[current.status]}
              </span>
              {isApplied && (
                <span className="inline-flex items-center rounded-full bg-teal/10 px-2.5 py-0.5 text-xs font-semibold text-teal">
                  Applied
                </span>
              )}
            </div>
            <div className="mt-1 text-xs text-gray-400">{jobLabel}</div>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none mt-0.5">×</button>
        </div>

        <div className="flex flex-col gap-4 p-6">
          {/* Description + Amount */}
          {editing ? (
            <div className="flex flex-col gap-3">
              <textarea
                rows={3}
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-navy focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal resize-none"
              />
              <input
                type="text"
                value={editing.amount}
                onChange={(e) => setEditing({ ...editing, amount: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-navy focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
              />
              <div className="flex gap-2">
                <button onClick={() => setEditing(null)} className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
                <button onClick={handleSaveEdits} disabled={saving} className="flex-1 rounded-lg bg-teal px-3 py-2 text-sm font-semibold text-white hover:bg-teal/90 disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p className="text-sm text-navy leading-relaxed">{current.description || <span className="text-gray-400">No description</span>}</p>
                {current.dateSubmitted && <p className="mt-1 text-xs text-gray-400">Submitted {formatDate(current.dateSubmitted)}</p>}
                {current.dateApproved && <p className="text-xs text-gray-400">Approved {formatDate(current.dateApproved)}</p>}
              </div>
              <div className="text-right flex-none">
                <div className={`text-xl font-bold ${amountColor}`}>{currency.format(current.amount)}</div>
                {!isApplied && current.status !== "rejected" && current.status !== "void" && (
                  <button
                    onClick={() => setEditing({ description: current.description, amount: String(current.amount) })}
                    className="mt-1 text-xs text-gray-400 hover:text-teal"
                  >
                    Edit
                  </button>
                )}
              </div>
            </div>
          )}

          {/* GC CO # — editable once approved */}
          {current.status === "approved" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 uppercase tracking-wide">GC CO #</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={gcCoNumber}
                  onChange={(e) => setGcCoNumber(e.target.value)}
                  placeholder="e.g. CO-007 (enter once GC issues it)"
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-navy placeholder-gray-400 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                />
                <button
                  type="button"
                  onClick={handleSaveGcCoNumber}
                  disabled={gcCoNumberSaving}
                  className="rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal/90 disabled:opacity-50"
                >
                  {gcCoNumberSaving ? "…" : "Save"}
                </button>
              </div>
              {current.gcCoNumber && gcCoNumber === current.gcCoNumber && (
                <p className="mt-1 text-xs text-gray-400">Saved: {current.gcCoNumber}</p>
              )}
            </div>
          )}

          {/* GC reference (shown when approved or when moving to approved) */}
          {(current.status === "submitted" || current.status === "approved") && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 uppercase tracking-wide">GC Approval Reference</label>
              <input
                type="text"
                value={gcRef}
                onChange={(e) => setGcRef(e.target.value)}
                placeholder="Email thread, doc #, name, etc."
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-navy placeholder-gray-400 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
              />
            </div>
          )}

          {/* Approval doc */}
          {current.status === "submitted" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 uppercase tracking-wide">Approval doc (attach when approving)</label>
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.heic"
                onChange={(e) => setApprovalFile(e.target.files?.[0] ?? null)}
                className="text-sm text-gray-500"
              />
            </div>
          )}

          {current.approvalDocUrl && (
            <a href={current.approvalDocUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-teal hover:underline">
              📎 View approval doc
            </a>
          )}

          {/* Status change buttons */}
          {nextStatuses.length > 0 && !isApplied && (
            <div>
              <div className="mb-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Change status</div>
              <div className="flex flex-wrap gap-2">
                {nextStatuses.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleStatusChange(s)}
                    disabled={saving}
                    className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${
                      s === "approved"
                        ? "border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
                        : s === "rejected"
                        ? "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                        : s === "void"
                        ? "border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100"
                        : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                    }`}
                  >
                    {saving ? "…" : `Mark ${STATUS_LABEL[s]}`}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Ready to Apply */}
          {readyToApply && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              {confirmApply ? (
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-semibold text-amber-900">Confirm — this will add a new SOV line item to the current application and cannot be undone.</p>
                  <div className="flex gap-2 mt-1">
                    <button onClick={() => setConfirmApply(false)} className="flex-1 rounded-lg border border-amber-200 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100">Go back</button>
                    <button onClick={handleApply} disabled={applying} className="flex-1 rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50">
                      {applying ? "Applying…" : "Yes, apply to SOV"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-amber-900">Ready to apply to SOV</p>
                    <p className="text-xs text-amber-700 mt-0.5">This will add a new change order line in the current application.</p>
                  </div>
                  <button
                    onClick={() => setConfirmApply(true)}
                    className="flex-none rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"
                  >
                    Apply →
                  </button>
                </div>
              )}
            </div>
          )}

          {isApplied && (
            <p className="text-xs text-gray-400">
              Applied to SOV on {formatDate(current.appliedAt)}
            </p>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          {/* Delete */}
          {confirmDelete ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-sm font-semibold text-red-800">Delete this change order?</p>
              <p className="mt-0.5 text-xs text-red-600">It will move to Recently Deleted and can be restored.</p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700"
                >
                  Yes, delete
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="mt-2 w-full rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-100 transition-colors"
            >
              Delete Change Order
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
