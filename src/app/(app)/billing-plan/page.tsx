"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getCurrentUserContext } from "@/lib/currentUserContext";
import { fetchOrganizationMembers } from "@/lib/organizationMembersDb";
import { PLAN_LIMITS, Plan } from "@/lib/planLimits";
import Button from "@/components/Button";

type OrgBilling = {
  plan: Plan | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  trialing: "Trialing",
  active: "Active",
  past_due: "Payment failed",
  canceled: "Canceled",
  incomplete: "Incomplete",
  incomplete_expired: "Expired",
  unpaid: "Unpaid",
  paused: "Paused",
  grandfathered: "Active",
};

export default function BillingPlanPage() {
  const [billing, setBilling] = useState<OrgBilling | null>(null);
  const [memberCount, setMemberCount] = useState(0);
  const [activeJobCount, setActiveJobCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  function load() {
    setIsLoading(true);
    setError(null);
    const supabase = createClient();

    getCurrentUserContext()
      .then(async (ctx) => {
        if (!ctx.organizationId) {
          setBilling(null);
          return;
        }

        const [{ data: org, error: orgError }, members, { count: jobCount }] = await Promise.all([
          supabase
            .from("organizations")
            .select("plan, subscription_status, current_period_end")
            .eq("id", ctx.organizationId)
            .single(),
          fetchOrganizationMembers(),
          supabase
            .from("jobs")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", ctx.organizationId)
            .is("deleted_at", null)
            .is("archived_at", null),
        ]);

        if (orgError) throw new Error(orgError.message);

        setBilling({
          plan: org.plan,
          subscriptionStatus: org.subscription_status,
          currentPeriodEnd: org.current_period_end,
        });
        setMemberCount(members.length);
        setActiveJobCount(jobCount ?? 0);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load billing info."))
      .finally(() => setIsLoading(false));
  }

  useEffect(load, []);

  async function handleManageBilling() {
    setIsOpeningPortal(true);
    setPortalError(null);
    try {
      const res = await fetch("/api/stripe/create-portal-session", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "Could not open billing portal.");
      window.location.assign(data.url);
    } catch (err) {
      setPortalError(err instanceof Error ? err.message : "Could not open billing portal.");
      setIsOpeningPortal(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-navy">Billing & Plan</h1>
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  const limits = billing?.plan ? PLAN_LIMITS[billing.plan] : null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-navy">Billing & Plan</h1>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
        {!billing?.plan ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-600">You don&apos;t have a plan selected yet.</p>
            <a
              href="/choose-plan"
              className="w-fit rounded-lg bg-navy px-4 py-2.5 text-sm font-medium text-white hover:bg-navy/90"
            >
              Choose a plan
            </a>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Current plan</p>
                <p className="mt-1 text-xl font-bold text-navy capitalize">
                  {billing.plan} — {limits?.priceLabel}
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  Status: {STATUS_LABELS[billing.subscriptionStatus ?? ""] ?? billing.subscriptionStatus}
                  {billing.currentPeriodEnd &&
                    ` · renews ${new Date(billing.currentPeriodEnd).toLocaleDateString()}`}
                </p>
              </div>
              <Button
                type="button"
                onClick={handleManageBilling}
                disabled={isOpeningPortal}
                className="w-auto px-5"
              >
                {isOpeningPortal ? "Opening…" : "Manage billing"}
              </Button>
            </div>

            {portalError && <p className="text-sm text-red-600">{portalError}</p>}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-gray-100 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Team members</p>
                <p className="mt-1 text-lg font-semibold text-navy">
                  {memberCount} / {limits?.maxMembers}
                </p>
              </div>
              <div className="rounded-lg border border-gray-100 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Active jobs</p>
                <p className="mt-1 text-lg font-semibold text-navy">
                  {activeJobCount} / {limits?.maxActiveJobs ?? "Unlimited"}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
