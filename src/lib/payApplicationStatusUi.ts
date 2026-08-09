import { PayApplicationStatus } from "@/lib/payApplicationsDb";

export const STATUS_LABEL: Record<PayApplicationStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  revised: "Revised",
  certified: "Certified",
  paid: "Paid",
};

export const STATUS_BADGE_STYLE: Record<PayApplicationStatus, string> = {
  draft: "bg-gray-100 text-gray-600",
  submitted: "bg-blue-100 text-blue-700",
  revised: "bg-amber-100 text-amber-700",
  certified: "bg-teal/15 text-teal",
  paid: "bg-green-100 text-green-700",
};
