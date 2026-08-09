export type Project = {
  jobName: string;
  jobNumber: string;
  customer: string;
  contractValue: number;
  billedToDate: number;
  percentComplete: number;
  status: "Active" | "On Hold" | "Closed";
};

export const projects: Project[] = [
  {
    jobName: "Harbor Blvd Lobby & Restrooms",
    jobNumber: "J-2401",
    customer: "Pacific Coast Builders",
    contractValue: 1250000,
    billedToDate: 875000,
    percentComplete: 70,
    status: "Active",
  },
  {
    jobName: "Meridian Plaza Kitchen & Dining",
    jobNumber: "J-2402",
    customer: "Meridian Construction",
    contractValue: 640000,
    billedToDate: 512000,
    percentComplete: 80,
    status: "Active",
  },
  {
    jobName: "Summit Ridge Retail Floor",
    jobNumber: "J-2403",
    customer: "Granite Peak Developers",
    contractValue: 980000,
    billedToDate: 294000,
    percentComplete: 30,
    status: "Active",
  },
  {
    jobName: "Cascade Property Group Project",
    jobNumber: "J-2405",
    customer: "Cascade Property Group",
    contractValue: 720000,
    billedToDate: 396000,
    percentComplete: 55,
    status: "Active",
  },
  {
    jobName: "Ironclad Builders Project",
    jobNumber: "J-2398",
    customer: "Ironclad Builders",
    contractValue: 250000,
    billedToDate: 62500,
    percentComplete: 25,
    status: "On Hold",
  },
  {
    jobName: "Bayview General Contracting Project",
    jobNumber: "J-2390",
    customer: "Bayview General Contracting",
    contractValue: 410000,
    billedToDate: 410000,
    percentComplete: 100,
    status: "Closed",
  },
];
