import { projects } from "@/lib/mockData";

export const kpiStrip = [
  {
    label: "Active projects",
    value: String(projects.filter((p) => p.status === "Active").length),
    delta: "1 this month",
    direction: "up" as const,
  },
  {
    label: "Total contract value",
    value: "$4.25M",
    delta: "6% vs last mo",
    direction: "up" as const,
  },
  {
    label: "Billed to date",
    value: "$2.55M",
    delta: "60% of contract",
    direction: "plain" as const,
  },
  {
    label: "Outstanding",
    value: "$1.70M",
    delta: "$210K past due",
    direction: "down" as const,
  },
];

export const needsAttention = [
  {
    icon: "dollar" as const,
    title: "Ready to bill — 2 projects",
    subtitle: "$1.24M billable · Pacific Coast 5 days behind",
    cta: "Create pay app",
    ctaStyle: "teal" as const,
  },
  {
    icon: "alert" as const,
    title: "Overdue invoices — 3",
    subtitle: "$310,500 past due 30+ days",
    cta: "Send reminders",
    ctaStyle: "red" as const,
  },
  {
    icon: "check" as const,
    title: "Waivers due — 2",
    subtitle: "Conditional progress for J-2401, J-2402",
    cta: "Generate",
    ctaStyle: "navy" as const,
  },
];

export const outstandingAging = {
  total: 1700500,
  buckets: [
    { label: "Current", amount: 980000, color: "#1D8F96" },
    { label: "1–30 days", amount: 410000, color: "#3FA9A0" },
    { label: "31–60 days", amount: 186500, color: "#956512" },
    { label: "61–90+ days", amount: 124000, color: "#B5443A" },
  ],
};

export const billedVsCollected = {
  collectionRate: "86%",
  billed: [320000, 335000, 400000, 380000, 460000, 440000],
  collected: [275000, 288000, 344000, 327000, 396000, 378000],
};

export const activeJobs = projects.map((project) => ({
  ...project,
  retention: Math.round(project.billedToDate * (project.status === "Closed" ? 0 : 0.1)),
  flagBanner:
    project.jobNumber === "J-2401"
      ? "Bill now — 5 days behind trend"
      : undefined,
}));
