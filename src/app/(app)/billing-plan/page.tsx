"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getCurrentUserContext } from "@/lib/currentUserContext";
import { fetchOrganizationMembers } from "@/lib/organizationMembersDb";
import { ANNUAL_DISCOUNT_LABEL, BillingInterval, PLAN_ANNUAL_PRICING, PLAN_LIMITS, Plan } from "@/lib/planLimits";
import Button from "@/components/Button";

type OrgBilling = {
  plan: Plan | null;
  subscriptionStatus: string | null;
  billingInterval: BillingInterval | null;
  currentPeriodEnd: string | null;
  pendingPlan: Plan | null;
  pendingPlanEffectiveAt: string | null;
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

const OTHER_PLAN: Record<Plan, Plan> = { basic: "pro", pro: "basic" };

export default function BillingPlanPage() {
  const [billing, setBilling] = useState<OrgBilling | null>(null);
  const [memberCount, setMemberCount] = useState(0);
  const [activeJobCount, setActiveJobCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [changingTo, setChangingTo] = useState<string | null>(null);
  const [changeError, setChangeError] = useState<string | null>(null);
  const [isCancelingDowngrade, setIsCancelingDowngrade] = useState(false);

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
            .select(
              "plan, subscription_status, billing_interval, current_period_end, pending_plan, pending_plan_effective_at"
            )
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
          billingInterval: org.billing_interval,
          currentPeriodEnd: org.current_period_end,
          pendingPlan: org.pending_plan,
          pendingPlanEffectiveAt: org.pending_plan_effective_at,
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

  async function handleChangePlan(plan: Plan, interval: BillingInterval) {
    const key = `${plan}-${interval}`;
    setChangingTo(key);
    setChangeError(null);
    try {
      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, interval }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not change plan.");
      if (data.url && data.url.includes("checkout.stripe.com")) {
        window.location.assign(data.url);
      } else {
        load();
      }
    } catch (err) {
      setChangeError(err instanceof Error ? err.message : "Could not change plan.");
    } finally {
      setChangingTo(null);
    }
  }

  async function handleCancelScheduledDowngrade() {
    setIsCancelingDowngrade(true);
    setChangeError(null);
    try {
      const res = await fetch("/api/stripe/cancel-scheduled-downgrade", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not cancel the scheduled downgrade.");
      load();
    } catch (err) {
      setChangeError(err instanceof Error ? err.message : "Could not cancel the scheduled downgrade.");
    } finally {
      setIsCancelingDowngrade(false);
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
  const isAnnual = billing?.billingInterval === "annual";
  const otherPlan = billing?.plan ? OTHER_PLAN[billing.plan] : null;

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
                  {billing.plan} {isAnnual ? "— Annual" : ""} —{" "}
                  {isAnnual ? PLAN_ANNUAL_PRICING[billing.plan].priceLabel : limits?.priceLabel}
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  Status: {STATUS_LABELS[billing.subscriptionStatus ?? ""] ?? billing.subscriptionStatus}
                  {billing.currentPeriodEnd &&
                    ` · renews ${new Date(billing.currentPeriodEnd).toLocaleDateString()}`}
                </p>
                {billing.pendingPlan && billing.pendingPlanEffectiveAt && (
                  <p className="mt-2 text-sm text-amber-700">
                    Downgrade to {billing.pendingPlan} scheduled for{" "}
                    {new Date(billing.pendingPlanEffectiveAt).toLocaleDateString()} (your current term&apos;s
                    renewal).{" "}
                    <button
                      type="button"
                      onClick={handleCancelScheduledDowngrade}
                      disabled={isCancelingDowngrade}
                      className="font-medium text-teal hover:underline disabled:opacity-50"
                    >
                      {isCancelingDowngrade ? "Canceling…" : "Cancel"}
                    </button>
                  </p>
                )}
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

            {changeError && <p className="text-sm text-red-600">{changeError}</p>}

            {billing.plan && otherPlan && (
              <div className="border-t border-gray-100 pt-6">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Change plan</p>
                <div className="mt-3 flex flex-wrap gap-3">
                  {!isAnnual && (
                    <button
                      type="button"
                      onClick={() => handleChangePlan(otherPlan, "monthly")}
                      disabled={changingTo !== null}
                      className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-navy hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {changingTo === `${otherPlan}-monthly`
                        ? "Switching…"
                        : `${otherPlan === "pro" ? "Upgrade" : "Downgrade"} to ${otherPlan === "pro" ? "Pro" : "Basic"} (${PLAN_LIMITS[otherPlan].priceLabel})`}
                    </button>
                  )}

                  {!isAnnual && (
                    <button
                      type="button"
                      onClick={() => handleChangePlan(billing.plan!, "annual")}
                      disabled={changingTo !== null}
                      className="rounded-lg border border-teal/40 bg-teal/5 px-4 py-2.5 text-sm font-medium text-teal hover:bg-teal/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {changingTo === `${billing.plan}-annual`
                        ? "Switching…"
                        : `Switch to annual (${PLAN_ANNUAL_PRICING[billing.plan].priceLabel} — ${ANNUAL_DISCOUNT_LABEL})`}
                    </button>
                  )}

                  {isAnnual && billing.plan === "basic" && (
                    <button
                      type="button"
                      onClick={() => handleChangePlan("pro", "annual")}
                      disabled={changingTo !== null}
                      className="rounded-lg border border-teal/40 bg-teal/5 px-4 py-2.5 text-sm font-medium text-teal hover:bg-teal/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {changingTo === "pro-annual"
                        ? "Upgrading…"
                        : `Upgrade to Pro Annual (${PLAN_ANNUAL_PRICING.pro.priceLabel}, prorated)`}
                    </button>
                  )}

                  {isAnnual && billing.plan === "pro" && !billing.pendingPlan && (
                    <button
                      type="button"
                      onClick={() => handleChangePlan("basic", "annual")}
                      disabled={changingTo !== null}
                      className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-navy hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {changingTo === "basic-annual"
                        ? "Scheduling…"
                        : "Downgrade to Basic Annual (at renewal)"}
                    </button>
                  )}
                </div>
                {isAnnual && (
                  <p className="mt-2 text-xs text-gray-400">
                    Your plan is on an annual term — downgrades take effect at renewal, not immediately.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
