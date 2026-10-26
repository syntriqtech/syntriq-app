"use client";

import { useEffect, useState } from "react";
import TextField from "@/components/TextField";
import Button from "@/components/Button";

export type LibraryGc = {
  id: string;
  name: string;
  billingAddress: string;
  paymentTerms: string;
  defaultRetentionPct: number | null;
  billingPlatform: string;
  phone: string;
  fax: string;
  pmName: string;
  pmEmail: string;
  pmMobile: string;
};

type LibraryGcRow = {
  id: string;
  name: string;
  billing_address: string;
  payment_terms: string;
  default_retention_pct: number | null;
  billing_platform: string;
  phone: string;
  fax: string;
  pm_name: string;
  pm_email: string;
  pm_mobile: string;
};

function rowToGc(row: LibraryGcRow): LibraryGc {
  return {
    id: row.id,
    name: row.name,
    billingAddress: row.billing_address ?? "",
    paymentTerms: row.payment_terms ?? "",
    defaultRetentionPct: row.default_retention_pct != null ? Number(row.default_retention_pct) : null,
    billingPlatform: row.billing_platform ?? "",
    phone: row.phone ?? "",
    fax: row.fax ?? "",
    pmName: row.pm_name ?? "",
    pmEmail: row.pm_email ?? "",
    pmMobile: row.pm_mobile ?? "",
  };
}

type FormFields = {
  name: string;
  billingAddress: string;
  paymentTerms: string;
  defaultRetentionPct: string;
  billingPlatform: string;
  phone: string;
  fax: string;
  pmName: string;
  pmEmail: string;
  pmMobile: string;
};

const EMPTY_FORM: FormFields = {
  name: "",
  billingAddress: "",
  paymentTerms: "",
  defaultRetentionPct: "",
  billingPlatform: "",
  phone: "",
  fax: "",
  pmName: "",
  pmEmail: "",
  pmMobile: "",
};

type FormModalState = { mode: "create" } | { mode: "edit"; gc: LibraryGc };

export type AdminOrg = { id: string; name: string };

export default function GcLibrarySection({ organizations }: { organizations: AdminOrg[] }) {
  const [gcs, setGcs] = useState<LibraryGc[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formModal, setFormModal] = useState<FormModalState | null>(null);
  const [formFields, setFormFields] = useState<FormFields>(EMPTY_FORM);
  const [isSavingForm, setIsSavingForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<LibraryGc | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [enableTarget, setEnableTarget] = useState<LibraryGc | null>(null);
  const [selectedOrgIds, setSelectedOrgIds] = useState<Set<string>>(new Set());
  const [isEnabling, setIsEnabling] = useState(false);
  const [enableError, setEnableError] = useState<string | null>(null);
  const [enableResult, setEnableResult] = useState<{ enabled: string[]; skipped: { organizationId: string; reason: string }[] } | null>(
    null
  );

  function load() {
    setIsLoading(true);
    setError(null);
    fetch("/api/admin/gc-library")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Could not load the GC library.");
        return body;
      })
      .then((body) => setGcs((body.gcs ?? []).map(rowToGc)))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the GC library."))
      .finally(() => setIsLoading(false));
  }

  useEffect(load, []);

  // ── Create / edit ───────────────────────────────────────────────────────

  function openCreate() {
    setFormFields(EMPTY_FORM);
    setFormError(null);
    setFormModal({ mode: "create" });
  }

  function openEdit(gc: LibraryGc) {
    setFormFields({
      name: gc.name,
      billingAddress: gc.billingAddress,
      paymentTerms: gc.paymentTerms,
      defaultRetentionPct: gc.defaultRetentionPct != null ? String(gc.defaultRetentionPct) : "",
      billingPlatform: gc.billingPlatform,
      phone: gc.phone,
      fax: gc.fax,
      pmName: gc.pmName,
      pmEmail: gc.pmEmail,
      pmMobile: gc.pmMobile,
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
      setFormError("Name is required.");
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
      phone: formFields.phone,
      fax: formFields.fax,
      pmName: formFields.pmName,
      pmEmail: formFields.pmEmail,
      pmMobile: formFields.pmMobile,
    };
    try {
      const url = formModal.mode === "create" ? "/api/admin/gc-library" : `/api/admin/gc-library/${formModal.gc.id}`;
      const res = await fetch(url, {
        method: formModal.mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not save this GC.");
      closeForm();
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save this GC.");
    } finally {
      setIsSavingForm(false);
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/admin/gc-library/${deleteTarget.id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not delete this GC.");
      setDeleteTarget(null);
      load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete this GC.");
    } finally {
      setIsDeleting(false);
    }
  }

  // ── Enable for accounts ────────────────────────────────────────────────

  function openEnable(gc: LibraryGc) {
    setEnableTarget(gc);
    setSelectedOrgIds(new Set());
    setEnableError(null);
    setEnableResult(null);
  }

  function closeEnable() {
    setEnableTarget(null);
    setEnableResult(null);
  }

  function toggleOrg(orgId: string) {
    setSelectedOrgIds((prev) => {
      const next = new Set(prev);
      if (next.has(orgId)) next.delete(orgId);
      else next.add(orgId);
      return next;
    });
  }

  async function handleEnable() {
    if (!enableTarget || selectedOrgIds.size === 0) return;
    setIsEnabling(true);
    setEnableError(null);
    try {
      const res = await fetch("/api/admin/gc-library/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ libraryId: enableTarget.id, organizationIds: Array.from(selectedOrgIds) }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not enable this GC.");
      setEnableResult(body);
      setSelectedOrgIds(new Set());
    } catch (err) {
      setEnableError(err instanceof Error ? err.message : "Could not enable this GC.");
    } finally {
      setIsEnabling(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-navy">GC Library</h2>
          <p className="mt-1 text-sm text-gray-500">
            Set up a GC once here, then enable it for any account&apos;s Customers list instead of re-typing it.
          </p>
        </div>
        <Button type="button" onClick={openCreate} className="w-auto px-5">
          + Add GC
        </Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Billing Platform</th>
              <th className="px-5 py-3 text-right">Retention %</th>
              <th className="px-5 py-3">Payment Terms</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-center text-sm text-gray-400">
                  Loading…
                </td>
              </tr>
            ) : gcs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-center text-sm text-gray-400">
                  No GCs in the library yet.
                </td>
              </tr>
            ) : (
              gcs.map((gc) => (
                <tr key={gc.id}>
                  <td className="px-5 py-3.5 font-semibold text-navy">{gc.name}</td>
                  <td className="px-5 py-3.5 text-gray-600">{gc.billingPlatform || <span className="text-gray-300">—</span>}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums text-gray-600">
                    {gc.defaultRetentionPct != null ? `${gc.defaultRetentionPct}%` : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-5 py-3.5 text-gray-600">{gc.paymentTerms || <span className="text-gray-300">—</span>}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => openEnable(gc)}
                        className="text-xs font-semibold text-teal hover:underline"
                      >
                        Enable for accounts…
                      </button>
                      <button type="button" onClick={() => openEdit(gc)} className="text-xs font-semibold text-gray-500 hover:underline">
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteTarget(gc);
                          setDeleteError(null);
                        }}
                        className="text-xs font-semibold text-red-500 hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create / edit modal */}
      {formModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={isSavingForm ? undefined : closeForm}>
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-none items-start justify-between border-b border-gray-100 px-6 py-4">
              <h2 className="text-lg font-bold text-navy">{formModal.mode === "create" ? "New library GC" : "Edit library GC"}</h2>
              {!isSavingForm && (
                <button type="button" onClick={closeForm} className="mt-0.5 text-xl leading-none text-gray-400 hover:text-gray-600">
                  ×
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <TextField
                    label="GC name"
                    id="libGcName"
                    required
                    value={formFields.name}
                    onChange={(e) => setFormFields((prev) => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div className="sm:col-span-2">
                  <TextField
                    label="Billing address"
                    id="libGcBillingAddress"
                    value={formFields.billingAddress}
                    onChange={(e) => setFormFields((prev) => ({ ...prev, billingAddress: e.target.value }))}
                  />
                </div>
                <TextField
                  label="Payment terms"
                  id="libGcPaymentTerms"
                  value={formFields.paymentTerms}
                  onChange={(e) => setFormFields((prev) => ({ ...prev, paymentTerms: e.target.value }))}
                />
                <TextField
                  label="Default retention %"
                  id="libGcRetention"
                  type="number"
                  value={formFields.defaultRetentionPct}
                  onChange={(e) => setFormFields((prev) => ({ ...prev, defaultRetentionPct: e.target.value }))}
                />
                <div className="sm:col-span-2">
                  <TextField
                    label="Billing platform"
                    id="libGcBillingPlatform"
                    value={formFields.billingPlatform}
                    onChange={(e) => setFormFields((prev) => ({ ...prev, billingPlatform: e.target.value }))}
                  />
                </div>
                <TextField
                  label="Phone"
                  id="libGcPhone"
                  value={formFields.phone}
                  onChange={(e) => setFormFields((prev) => ({ ...prev, phone: e.target.value }))}
                />
                <TextField
                  label="Fax"
                  id="libGcFax"
                  value={formFields.fax}
                  onChange={(e) => setFormFields((prev) => ({ ...prev, fax: e.target.value }))}
                />
                <TextField
                  label="PM name"
                  id="libGcPmName"
                  value={formFields.pmName}
                  onChange={(e) => setFormFields((prev) => ({ ...prev, pmName: e.target.value }))}
                />
                <TextField
                  label="PM email"
                  id="libGcPmEmail"
                  type="email"
                  value={formFields.pmEmail}
                  onChange={(e) => setFormFields((prev) => ({ ...prev, pmEmail: e.target.value }))}
                />
                <TextField
                  label="PM mobile"
                  id="libGcPmMobile"
                  value={formFields.pmMobile}
                  onChange={(e) => setFormFields((prev) => ({ ...prev, pmMobile: e.target.value }))}
                />
              </div>
              {formError && <p className="mt-4 text-sm text-red-600">{formError}</p>}
            </div>

            <div className="flex flex-none items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
              <button type="button" onClick={closeForm} disabled={isSavingForm} className="text-sm font-medium text-gray-500 hover:text-gray-700">
                Cancel
              </button>
              <Button type="button" onClick={handleSaveForm} disabled={isSavingForm} className="w-auto px-5">
                {isSavingForm ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={isDeleting ? undefined : () => setDeleteTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-navy">Delete {deleteTarget.name}?</h2>
            <p className="mt-2 text-sm text-gray-500">
              This only removes it from the library — it won&apos;t affect any account that already enabled it.
            </p>
            {deleteError && <p className="mt-2 text-sm text-red-600">{deleteError}</p>}
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="text-sm font-medium text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isDeleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Enable for accounts */}
      {enableTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={isEnabling ? undefined : closeEnable}>
          <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-none items-start justify-between border-b border-gray-100 px-6 py-4">
              <h2 className="text-lg font-bold text-navy">Enable {enableTarget.name} for…</h2>
              {!isEnabling && (
                <button type="button" onClick={closeEnable} className="mt-0.5 text-xl leading-none text-gray-400 hover:text-gray-600">
                  ×
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {enableResult ? (
                <div className="flex flex-col gap-3 text-sm">
                  {enableResult.enabled.length > 0 && (
                    <p className="text-green-700">Enabled for: {enableResult.enabled.join(", ")}</p>
                  )}
                  {enableResult.skipped.length > 0 && (
                    <div className="text-amber-700">
                      Skipped:
                      <ul className="mt-1 list-disc pl-5">
                        {enableResult.skipped.map((s) => (
                          <li key={s.organizationId}>
                            {s.organizationId} — {s.reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : organizations.length === 0 ? (
                <p className="text-sm text-gray-400">No accounts yet.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {organizations.map((org) => (
                    <label key={org.id} className="flex items-center gap-2 text-sm text-navy">
                      <input
                        type="checkbox"
                        checked={selectedOrgIds.has(org.id)}
                        onChange={() => toggleOrg(org.id)}
                        className="h-4 w-4 rounded border-gray-300 text-teal focus:ring-teal"
                      />
                      {org.name}
                    </label>
                  ))}
                </div>
              )}
              {enableError && <p className="mt-4 text-sm text-red-600">{enableError}</p>}
            </div>

            <div className="flex flex-none items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
              {enableResult ? (
                <Button type="button" onClick={closeEnable} className="w-auto px-5">
                  Done
                </Button>
              ) : (
                <>
                  <button type="button" onClick={closeEnable} disabled={isEnabling} className="text-sm font-medium text-gray-500 hover:text-gray-700">
                    Cancel
                  </button>
                  <Button type="button" onClick={handleEnable} disabled={isEnabling || selectedOrgIds.size === 0} className="w-auto px-5">
                    {isEnabling ? "Enabling…" : `Enable for ${selectedOrgIds.size || ""}`.trim()}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
