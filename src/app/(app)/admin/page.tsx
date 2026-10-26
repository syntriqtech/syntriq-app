"use client";

import { useEffect, useMemo, useState } from "react";
import Button from "@/components/Button";
import GcLibrarySection from "./GcLibrarySection";

type Membership = {
  role: string;
  organizationId: string;
  organizationName: string;
  plan: string | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  billingInterval: string | null;
};

type AdminUser = {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
  memberships: Membership[];
};

const PLAN_OPTIONS = ["basic", "pro"];

const STATUS_OPTIONS = [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "unpaid",
  "paused",
  "grandfathered",
];

const STATUS_STYLES: Record<string, string> = {
  trialing: "bg-amber-50 text-amber-700",
  active: "bg-green-50 text-green-700",
  grandfathered: "bg-gray-100 text-gray-600",
  past_due: "bg-red-50 text-red-600",
  canceled: "bg-red-50 text-red-600",
  unpaid: "bg-red-50 text-red-600",
  paused: "bg-gray-100 text-gray-600",
  incomplete: "bg-gray-100 text-gray-600",
  incomplete_expired: "bg-gray-100 text-gray-600",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function isExpired(iso: string | null): boolean {
  if (!iso) return false;
  return new Date(iso).getTime() < Date.now();
}

// Pre-fills the date input (expects yyyy-mm-dd) from an ISO timestamp.
function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export default function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const [editingOrgId, setEditingOrgId] = useState<string | null>(null);
  const [editPlan, setEditPlan] = useState("basic");
  const [editStatus, setEditStatus] = useState("trialing");
  const [editDate, setEditDate] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  function load() {
    setIsLoading(true);
    setError(null);
    setForbidden(false);
    fetch("/api/admin/users")
      .then(async (res) => {
        if (res.status === 403) {
          setForbidden(true);
          return null;
        }
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Could not load users.");
        return body;
      })
      .then((body) => {
        if (body) setUsers(body.users);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load users."))
      .finally(() => setIsLoading(false));
  }

  useEffect(load, []);

  // Deduped org list for the GC Library's "enable for accounts" picker —
  // built from the memberships already fetched above rather than a second
  // API call.
  const organizations = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of users) {
      for (const m of u.memberships) {
        map.set(m.organizationId, m.organizationName);
      }
    }
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [users]);

  function startEdit(membership: Membership) {
    setEditingOrgId(membership.organizationId);
    setEditPlan(membership.plan ?? "basic");
    setEditStatus(membership.subscriptionStatus ?? "trialing");
    setEditDate(toDateInputValue(membership.currentPeriodEnd));
    setEditError(null);
  }

  function cancelEdit() {
    setEditingOrgId(null);
    setEditError(null);
  }

  async function saveEdit(organizationId: string) {
    setIsSaving(true);
    setEditError(null);
    try {
      const res = await fetch("/api/admin/trial", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          plan: editPlan,
          subscriptionStatus: editStatus,
          currentPeriodEnd: editDate ? new Date(`${editDate}T23:59:59Z`).toISOString() : null,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not save this change.");
      setEditingOrgId(null);
      load();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Could not save this change.");
    } finally {
      setIsSaving(false);
    }
  }

  if (forbidden) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold text-navy">Admin</h1>
        <div className="rounded-2xl border border-gray-100 bg-white p-12 text-center shadow-sm">
          <p className="text-sm font-semibold text-gray-400">Not authorized</p>
          <p className="mt-1 text-xs text-gray-400">This page is only available to the Syntriq team.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Admin</h1>
        <p className="mt-1 text-sm text-gray-500">Every signed-up user, their company, and trial status.</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
              <th className="px-5 py-3">Email</th>
              <th className="px-5 py-3">Company</th>
              <th className="px-5 py-3">Role</th>
              <th className="px-5 py-3">Plan</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Trial / period ends</th>
              <th className="px-5 py-3">Last sign-in</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? (
              <tr>
                <td colSpan={8} className="px-5 py-6 text-center text-sm text-gray-400">
                  Loading…
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-6 text-center text-sm text-gray-400">
                  No users yet.
                </td>
              </tr>
            ) : (
              users.map((u) =>
                u.memberships.length === 0 ? (
                  <tr key={u.id}>
                    <td className="px-5 py-3.5 font-medium text-navy">{u.email}</td>
                    <td className="px-5 py-3.5 text-gray-400" colSpan={4}>
                      No company yet
                    </td>
                    <td className="px-5 py-3.5 text-gray-400">—</td>
                    <td className="px-5 py-3.5 text-gray-600">{formatDate(u.lastSignInAt)}</td>
                    <td className="px-5 py-3.5"></td>
                  </tr>
                ) : (
                  u.memberships.map((m) => {
                    const isEditing = editingOrgId === m.organizationId;
                    return (
                      <tr key={`${u.id}-${m.organizationId}`}>
                        <td className="px-5 py-3.5 font-medium text-navy">{u.email}</td>
                        <td className="px-5 py-3.5 text-gray-600">{m.organizationName}</td>
                        <td className="px-5 py-3.5 text-gray-600 capitalize">{m.role.replace("_", " ")}</td>
                        <td className="px-5 py-3.5">
                          {isEditing ? (
                            <select
                              value={editPlan}
                              onChange={(e) => setEditPlan(e.target.value)}
                              className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-navy capitalize focus:border-teal focus:outline-none"
                            >
                              {PLAN_OPTIONS.map((p) => (
                                <option key={p} value={p}>
                                  {p}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="capitalize text-gray-600">{m.plan ?? "—"}</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          {isEditing ? (
                            <select
                              value={editStatus}
                              onChange={(e) => setEditStatus(e.target.value)}
                              className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-navy focus:border-teal focus:outline-none"
                            >
                              {STATUS_OPTIONS.map((s) => (
                                <option key={s} value={s}>
                                  {s.replace("_", " ")}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${
                                STATUS_STYLES[m.subscriptionStatus ?? ""] ?? "bg-gray-100 text-gray-600"
                              }`}
                            >
                              {m.subscriptionStatus?.replace("_", " ") ?? "—"}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          {isEditing ? (
                            <input
                              type="date"
                              value={editDate}
                              onChange={(e) => setEditDate(e.target.value)}
                              className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-navy focus:border-teal focus:outline-none"
                            />
                          ) : (
                            <span className={isExpired(m.currentPeriodEnd) ? "font-semibold text-red-600" : "text-gray-600"}>
                              {formatDate(m.currentPeriodEnd)}
                              {isExpired(m.currentPeriodEnd) ? " (expired)" : ""}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-gray-600">{formatDate(u.lastSignInAt)}</td>
                        <td className="px-5 py-3.5">
                          {isEditing ? (
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                onClick={() => saveEdit(m.organizationId)}
                                disabled={isSaving}
                                className="w-auto px-3 py-1.5 text-xs"
                              >
                                {isSaving ? "Saving…" : "Save"}
                              </Button>
                              <button
                                type="button"
                                onClick={cancelEdit}
                                className="text-xs font-medium text-gray-400 hover:text-gray-600"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startEdit(m)}
                              className="text-xs font-semibold text-teal hover:underline"
                            >
                              Edit
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )
              )
            )}
          </tbody>
        </table>
      </div>
      {editError && <p className="text-sm text-red-600">{editError}</p>}

      <GcLibrarySection organizations={organizations} />
    </div>
  );
}
