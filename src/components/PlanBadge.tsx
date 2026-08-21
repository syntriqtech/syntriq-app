import { BillingInterval, Plan } from "@/lib/planLimits";

export default function PlanBadge({ plan, interval }: { plan: Plan; interval?: BillingInterval | null }) {
  const isPro = plan === "pro";
  return (
    <span
      className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        isPro ? "bg-teal/15 text-teal" : "bg-gray-100 text-gray-500"
      }`}
    >
      {isPro ? "Pro" : "Basic"}
      {interval === "annual" ? " · Annual" : ""}
    </span>
  );
}
