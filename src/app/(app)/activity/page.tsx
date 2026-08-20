"use client";

import { useEffect, useState } from "react";
import { ActivityLogEntry, fetchActivityLog } from "@/lib/activityLogDb";
import { fetchOrganizationMembers } from "@/lib/organizationMembersDb";
import { getCurrentUserContext } from "@/lib/currentUserContext";

const ACTION_LABELS: Record<string, string> = {
  "job.created": "created job",
  "job.deleted": "deleted job",
  "change_order.created": "added change order",
  "change_order.status_changed": "updated change order",
  "pay_application.submitted": "submitted pay application",
  "pay_application.certified": "certified pay application",
  "pay_application.uncertified": "uncertified pay application",
  "payment.recorded": "recorded payment",
  "retention_release.created": "created retention release",
  "retention_release.paid": "recorded retention payment",
  "lien_waiver.generated": "generated lien waiver",
  "team_member.added": "added team member",
  "team_member.removed": "removed team member",
  "team_member.role_changed": "changed role",
  "company.setup_completed": "completed company setup",
};

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ActivityPage() {
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setIsLoading(true);
    setError(null);
    // Owner-only: checked here first so a non-owner never even calls
    // fetchActivityLog() (which would raise an error) — mirrors the
    // proactive-check pattern used elsewhere in this app rather than
    // surfacing a raw permission error.
    Promise.all([fetchOrganizationMembers(), getCurrentUserContext()])
      .then(([members, ctx]) => {
        const ownerHere = members.find((m) => m.userId === ctx.userId)?.role === "owner";
        setIsOwner(ownerHere);
        if (!ownerHere) return [];
        return fetchActivityLog();
      })
      .then((data) => setEntries(data ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load activity."))
      .finally(() => setIsLoading(false));
  }

  useEffect(load, []);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-navy">Activity</h1>
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold text-navy">Activity</h1>
        <div className="rounded-2xl border border-gray-100 bg-white p-12 text-center shadow-sm">
          <p className="text-sm font-semibold text-gray-400">Owners only</p>
          <p className="mt-1 text-xs text-gray-400">Only the account owner can view the activity log.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Activity</h1>
        <p className="mt-1 text-sm text-gray-500">A record of what&apos;s happened across your company&apos;s account.</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {entries.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-12 text-center shadow-sm">
          <p className="text-sm font-semibold text-gray-400">No activity yet</p>
          <p className="mt-1 text-xs text-gray-400">Actions like creating a job or recording a payment will show up here.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                <th className="px-5 py-3">Who</th>
                <th className="px-5 py-3">Action</th>
                <th className="px-5 py-3">Detail</th>
                <th className="px-5 py-3">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-5 py-3.5 font-semibold text-navy">
                    {entry.actorName || <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-5 py-3.5 text-gray-600">{ACTION_LABELS[entry.action] ?? entry.action}</td>
                  <td className="px-5 py-3.5 text-gray-600">
                    {entry.detail || <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-gray-500">{formatTimestamp(entry.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
