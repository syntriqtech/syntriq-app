"use client";

import { useEffect, useMemo, useState } from "react";
import Button from "@/components/Button";
import type { AdminOrg } from "./GcLibrarySection";

type BillingFormRow = {
  id: string;
  organizationId: string;
  organizationName: string;
  name: string;
  enabled: boolean;
  hasFile: boolean;
  hasMapping: boolean;
};

type ApiRow = {
  id: string;
  organization_id: string;
  name: string;
  enabled: boolean;
  file_path: string | null;
  field_mapping: Record<string, unknown> | null;
  organizations: { name: string } | null;
};

function rowFromApi(r: ApiRow): BillingFormRow {
  return {
    id: r.id,
    organizationId: r.organization_id,
    organizationName: r.organizations?.name ?? "Unknown",
    name: r.name,
    enabled: r.enabled,
    hasFile: !!r.file_path,
    hasMapping: !!r.field_mapping,
  };
}

export default function BillingFormsSection({ organizations }: { organizations: AdminOrg[] }) {
  const [rows, setRows] = useState<BillingFormRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [enableTarget, setEnableTarget] = useState<BillingFormRow | null>(null);
  const [selectedOrgIds, setSelectedOrgIds] = useState<Set<string>>(new Set());
  const [isEnabling, setIsEnabling] = useState(false);
  const [enableError, setEnableError] = useState<string | null>(null);
  const [enableResult, setEnableResult] = useState<{ enabled: string[]; skipped: { organizationId: string; reason: string }[] } | null>(
    null
  );

  function load() {
    setIsLoading(true);
    setError(null);
    fetch("/api/admin/billing-forms")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Could not load billing forms.");
        return body;
      })
      .then((body) => setRows((body.templates ?? []).map(rowFromApi)))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load billing forms."))
      .finally(() => setIsLoading(false));
  }

  useEffect(load, []);

  // One representative (fully-configured) row per distinct form name —
  // what "Enable for accounts..." copies from. If several orgs have the
  // same named form, any one of them is an equally valid source since
  // they're all copies of the same uploaded file/mapping by design.
  const templateTypes = useMemo(() => {
    const byName = new Map<string, BillingFormRow[]>();
    for (const r of rows) {
      const list = byName.get(r.name) ?? [];
      list.push(r);
      byName.set(r.name, list);
    }
    return Array.from(byName.entries())
      .map(([name, group]) => ({
        name,
        source: group.find((r) => r.hasFile && r.hasMapping) ?? group[0],
        enabledIn: group.filter((r) => r.enabled).map((r) => r.organizationName),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  async function handleToggle(row: BillingFormRow) {
    setTogglingId(row.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/billing-forms/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !row.enabled }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not update this form.");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update this form.");
    } finally {
      setTogglingId(null);
    }
  }

  function openEnable(row: BillingFormRow) {
    setEnableTarget(row);
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
      const res = await fetch("/api/admin/billing-forms/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceTemplateId: enableTarget.id, organizationIds: Array.from(selectedOrgIds) }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not enable this form.");
      setEnableResult(body);
      setSelectedOrgIds(new Set());
      load();
    } catch (err) {
      setEnableError(err instanceof Error ? err.message : "Could not enable this form.");
    } finally {
      setIsEnabling(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-bold text-navy">Custom Billing Forms</h2>
        <p className="mt-1 text-sm text-gray-500">
          GC-specific billing forms (COBE, Axis Mechanical, etc.), which accounts have them, and a one-click way to copy an
          already-configured one into another account.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
              <th className="px-5 py-3">Form</th>
              <th className="px-5 py-3">Enabled for</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? (
              <tr>
                <td colSpan={3} className="px-5 py-6 text-center text-sm text-gray-400">
                  Loading…
                </td>
              </tr>
            ) : templateTypes.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-5 py-6 text-center text-sm text-gray-400">
                  No custom billing forms set up yet.
                </td>
              </tr>
            ) : (
              templateTypes.map((t) => (
                <tr key={t.name}>
                  <td className="px-5 py-3.5 font-semibold text-navy">{t.name}</td>
                  <td className="px-5 py-3.5 text-gray-600">
                    {t.enabledIn.length > 0 ? t.enabledIn.join(", ") : <span className="text-gray-300">Nobody yet</span>}
                  </td>
                  <td className="px-5 py-3.5">
                    <button
                      type="button"
                      onClick={() => openEnable(t.source)}
                      className="text-xs font-semibold text-teal hover:underline"
                    >
                      Enable for accounts…
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Per-account detail + toggle */}
      <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
              <th className="px-5 py-3">Account</th>
              <th className="px-5 py-3">Form</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-5 py-3.5 text-gray-600">{r.organizationName}</td>
                <td className="px-5 py-3.5 text-gray-600">{r.name}</td>
                <td className="px-5 py-3.5">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                      r.enabled ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {r.enabled ? "Enabled" : "Disabled"}
                  </span>
                  {!r.hasFile || !r.hasMapping ? (
                    <span className="ml-2 text-xs text-amber-600">not fully configured</span>
                  ) : null}
                </td>
                <td className="px-5 py-3.5">
                  <button
                    type="button"
                    onClick={() => handleToggle(r)}
                    disabled={togglingId === r.id || (!r.enabled && (!r.hasFile || !r.hasMapping))}
                    className="text-xs font-semibold text-teal hover:underline disabled:cursor-not-allowed disabled:text-gray-300"
                  >
                    {togglingId === r.id ? "Saving…" : r.enabled ? "Disable" : "Enable"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Enable for accounts modal */}
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
