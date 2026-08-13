"use client";

import { useEffect, useState } from "react";
import {
  GeneralContractor,
  LinkedJob,
  fetchGeneralContractors,
  fetchJobCountsByGc,
  fetchJobsLinkedToGc,
  createGeneralContractor,
  updateGeneralContractor,
  deleteGeneralContractor,
  reassignJobsToGc,
} from "@/lib/generalContractorsDb";
import TextField from "@/components/TextField";
import Button from "@/components/Button";

type FormModalState =
  | { mode: "create" }
  | { mode: "edit"; gc: GeneralContractor };

type FormFields = {
  name: string;
  billingAddress: string;
  paymentTerms: string;
  defaultRetentionPct: string;
  billingPlatform: string;
};

const EMPTY_FORM: FormFields = {
  name: "",
  billingAddress: "",
  paymentTerms: "",
  defaultRetentionPct: "",
  billingPlatform: "",
};

type DeleteFlowState = {
  gc: GeneralContractor;
  stage: "confirm" | "reassign";
  linkedJobs: LinkedJob[];
  isLoadingLinked: boolean;
};

export default function CustomersPage() {
  const [gcs, setGcs] = useState<GeneralContractor[]>([]);
  const [jobCounts, setJobCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formModal, setFormModal] = useState<FormModalState | null>(null);
  const [formFields, setFormFields] = useState<FormFields>(EMPTY_FORM);
  const [isSavingForm, setIsSavingForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteFlow, setDeleteFlow] = useState<DeleteFlowState | null>(null);
  const [reassignToId, setReassignToId] = useState("");
  const [isProcessingDelete, setIsProcessingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function load() {
    setIsLoading(true);
    setError(null);
    Promise.all([fetchGeneralContractors(), fetchJobCountsByGc()])
      .then(([gcData, counts]) => {
        setGcs(gcData);
        setJobCounts(counts);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load customers."))
      .finally(() => setIsLoading(false));
  }

  useEffect(load, []);

  // ── Create / Edit ────────────────────────────────────────────────────────

  function openCreate() {
    setFormFields(EMPTY_FORM);
    setFormError(null);
    setFormModal({ mode: "create" });
  }

  function openEdit(gc: GeneralContractor) {
    setFormFields({
      name: gc.name,
      billingAddress: gc.billingAddress,
      paymentTerms: gc.paymentTerms,
      defaultRetentionPct: gc.defaultRetentionPct != null ? String(gc.defaultRetentionPct) : "",
      billingPlatform: gc.billingPlatform,
    });
    setFormError(null);
    setFormModal({ mode: "edit", gc });
  }

  function closeForm() {
    setFormModal(null);
    setFormError(null);
  }

  async function handleSaveForm() {
    if (!formModal) return;
    if (!formFields.name.trim()) {
      setFormError("Customer name is required.");
      return;
    }
    setIsSavingForm(true);
    setFormError(null);
    const input = {
      name: formFields.name,
      billingAddress: formFields.billingAddress,
      paymentTerms: formFields.paymentTerms,
      defaultRetentionPct: formFields.defaultRetentionPct.trim() !== "" ? Number(formFields.defaultRetentionPct) : null,
      billingPlatform: formFields.billingPlatform,
    };
    try {
      if (formModal.mode === "create") {
        await createGeneralContractor(input);
      } else {
        await updateGeneralContractor(formModal.gc.id, input);
      }
      closeForm();
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save this customer.");
    } finally {
      setIsSavingForm(false);
    }
  }

  // ── Delete / Reassign ────────────────────────────────────────────────────

  async function openDelete(gc: GeneralContractor) {
    setDeleteError(null);
    setReassignToId("");
    const count = jobCounts[gc.id] ?? 0;
    if (count === 0) {
      setDeleteFlow({ gc, stage: "confirm", linkedJobs: [], isLoadingLinked: false });
      return;
    }
    setDeleteFlow({ gc, stage: "reassign", linkedJobs: [], isLoadingLinked: true });
    try {
      const linked = await fetchJobsLinkedToGc(gc.id);
      setDeleteFlow({ gc, stage: "reassign", linkedJobs: linked, isLoadingLinked: false });
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not load linked jobs.");
      setDeleteFlow({ gc, stage: "reassign", linkedJobs: [], isLoadingLinked: false });
    }
  }

  function closeDelete() {
    setDeleteFlow(null);
    setDeleteError(null);
    setReassignToId("");
  }

  async function handleConfirmDelete() {
    if (!deleteFlow) return;
    setIsProcessingDelete(true);
    setDeleteError(null);
    try {
      await deleteGeneralContractor(deleteFlow.gc.id);
      closeDelete();
      load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete this customer.");
    } finally {
      setIsProcessingDelete(false);
    }
  }

  async function handleReassignAndDelete() {
    if (!deleteFlow || !reassignToId) return;
    const target = gcs.find((g) => g.id === reassignToId);
    if (!target) return;
    setIsProcessingDelete(true);
    setDeleteError(null);
    try {
      await reassignJobsToGc(deleteFlow.gc.id, target);
      await deleteGeneralContractor(deleteFlow.gc.id);
      closeDelete();
      load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not reassign and delete.");
    } finally {
      setIsProcessingDelete(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-navy">Customers</h1>
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">Customers</h1>
          <p className="mt-1 text-sm text-gray-500">
            GC / customer records used in Job Setup. Edit details here, or clean up duplicates by reassigning their jobs.
          </p>
        </div>
        <Button type="button" onClick={openCreate} className="w-auto px-5">
          + New customer
        </Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {gcs.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-12 text-center shadow-sm">
          <p className="text-sm font-semibold text-gray-400">No customers yet</p>
          <p className="mt-1 text-xs text-gray-400">Customers are also created inline from the Job Setup form.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Billing Address</th>
                <th className="px-5 py-3">Payment Terms</th>
                <th className="px-5 py-3 text-right">Retention %</th>
                <th className="px-5 py-3">Billing Platform</th>
                <th className="px-5 py-3 text-right">Jobs</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {gcs.map((gc) => (
                <tr key={gc.id}>
                  <td className="px-5 py-3.5 font-semibold text-navy">{gc.name}</td>
                  <td className="px-5 py-3.5 text-gray-600">{gc.billingAddress || <span className="text-gray-300">—</span>}</td>
                  <td className="px-5 py-3.5 text-gray-600">{gc.paymentTerms || <span className="text-gray-300">—</span>}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums text-gray-600">
                    {gc.defaultRetentionPct != null ? `${gc.defaultRetentionPct}%` : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-5 py-3.5 text-gray-600">{gc.billingPlatform || <span className="text-gray-300">—</span>}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums text-gray-600">{jobCounts[gc.id] ?? 0}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => openEdit(gc)}
                        className="text-xs font-semibold text-teal hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => openDelete(gc)}
                        className="text-xs font-semibold text-red-500 hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit modal */}
      {formModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={isSavingForm ? undefined : closeForm}
        >
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
              <h2 className="text-lg font-bold text-navy">
                {formModal.mode === "create" ? "New customer" : "Edit customer"}
              </h2>
              {!isSavingForm && (
                <button type="button" onClick={closeForm} className="text-gray-400 hover:text-gray-600 text-xl leading-none mt-0.5">
                  ×
                </button>
              )}
            </div>

            <div className="flex flex-col gap-4 p-6">
              <TextField
                label="Customer name"
                id="gcName"
                required
                value={formFields.name}
                onChange={(e) => setFormFields((prev) => ({ ...prev, name: e.target.value }))}
              />
              <TextField
                label="Billing address"
                id="gcBillingAddress"
                value={formFields.billingAddress}
                onChange={(e) => setFormFields((prev) => ({ ...prev, billingAddress: e.target.value }))}
              />
              <TextField
                label="Payment terms"
                id="gcPaymentTerms"
                placeholder="e.g. Net 30"
                value={formFields.paymentTerms}
                onChange={(e) => setFormFields((prev) => ({ ...prev, paymentTerms: e.target.value }))}
              />
              <TextField
                label="Default retention %"
                id="gcRetention"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={formFields.defaultRetentionPct}
                onChange={(e) => setFormFields((prev) => ({ ...prev, defaultRetentionPct: e.target.value }))}
                onWheel={(e) => e.currentTarget.blur()}
              />
              <TextField
                label="Billing platform"
                id="gcBillingPlatform"
                placeholder="e.g. Procore, GCPay, Textura"
                value={formFields.billingPlatform}
                onChange={(e) => setFormFields((prev) => ({ ...prev, billingPlatform: e.target.value }))}
              />

              {formModal.mode === "edit" && (
                <p className="text-xs text-gray-400">
                  Changes here update the customer record only — jobs that already copied this info won&apos;t update
                  automatically. To fix a job&apos;s displayed customer info, use Delete → Reassign on the duplicate instead.
                </p>
              )}

              {formError && <p className="text-sm text-red-600">{formError}</p>}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={closeForm}
                  disabled={isSavingForm}
                  className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-navy hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveForm}
                  disabled={isSavingForm}
                  className="flex-1 rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal/90 disabled:opacity-50"
                >
                  {isSavingForm ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete / Reassign modal */}
      {deleteFlow && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={isProcessingDelete ? undefined : closeDelete}
        >
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
              <h2 className="text-lg font-bold text-navy">Delete customer</h2>
              {!isProcessingDelete && (
                <button type="button" onClick={closeDelete} className="text-gray-400 hover:text-gray-600 text-xl leading-none mt-0.5">
                  ×
                </button>
              )}
            </div>

            <div className="flex flex-col gap-4 p-6">
              {deleteFlow.stage === "confirm" ? (
                <>
                  <p className="text-sm text-gray-600">
                    Delete <strong className="text-navy">{deleteFlow.gc.name}</strong>? No jobs are linked to it. This can&apos;t be
                    undone.
                  </p>
                  {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}
                  <div className="flex gap-3 pt-1">
                    <button
                      type="button"
                      onClick={closeDelete}
                      disabled={isProcessingDelete}
                      className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-navy hover:bg-gray-50 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmDelete}
                      disabled={isProcessingDelete}
                      className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {isProcessingDelete ? "Deleting…" : "Yes, delete"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-600">
                    <strong className="text-navy">{deleteFlow.gc.name}</strong> has{" "}
                    {jobCounts[deleteFlow.gc.id] ?? deleteFlow.linkedJobs.length} job(s) linked to it. Reassign them to another
                    customer before deleting.
                  </p>

                  {deleteFlow.isLoadingLinked ? (
                    <p className="text-xs text-gray-400">Loading linked jobs…</p>
                  ) : deleteFlow.linkedJobs.length > 0 ? (
                    <div className="max-h-32 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                      {deleteFlow.linkedJobs.map((job) => (
                        <p key={job.id} className="text-xs text-gray-600">
                          #{job.jobNumber} — {job.jobName || "No name"}
                        </p>
                      ))}
                    </div>
                  ) : null}

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Reassign to</label>
                    <select
                      value={reassignToId}
                      onChange={(e) => setReassignToId(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-navy focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                    >
                      <option value="">Select a customer…</option>
                      {gcs
                        .filter((g) => g.id !== deleteFlow.gc.id)
                        .map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                    </select>
                  </div>

                  {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}

                  <div className="flex gap-3 pt-1">
                    <button
                      type="button"
                      onClick={closeDelete}
                      disabled={isProcessingDelete}
                      className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-navy hover:bg-gray-50 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleReassignAndDelete}
                      disabled={isProcessingDelete || !reassignToId}
                      className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {isProcessingDelete ? "Working…" : "Reassign & Delete"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
