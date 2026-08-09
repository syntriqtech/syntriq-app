export type JobSetup = {
  jobName: string;
  jobNumber: string;
  customer: string;
  customerAddress: string;
  gcId: string | null;
  paymentTerms: string;
  owner: string;
  ownerAddress: string;
  jobAddress: string;
  architect: string;
  architectAddress: string;
  architectProjectNumber: string;
  contractFor: string;
  contractValue: number;
  contractDate: string;
  startDate: string;
  retentionRateCW: number;
  retentionRateSM: number;
  ctiPm: string;
  retentionStepdownThreshold: number | null;
  retentionStepdownRateCW: number | null;
  billingDueDay: number;
  billingCheckinMonth: string;
  billingPlatform: string;
  certifiedPayroll: boolean;
};

export const jobSetups: JobSetup[] = [
  {
    jobName: "Harbor Blvd Lobby & Restrooms",
    jobNumber: "J-2401",
    customer: "Pacific Coast Builders",
    customerAddress: "455 Harbor Way, San Pedro, CA 90731",
    gcId: null,
    paymentTerms: "",
    owner: "Pacific Coast Holdings LLC",
    ownerAddress: "1100 Harbor Blvd, San Pedro, CA 90731",
    jobAddress: "1100 Harbor Blvd, San Pedro, CA 90731",
    architect: "Hargrove & Lin Architects",
    architectAddress: "200 Ocean Gateway Plaza, Long Beach, CA 90802",
    architectProjectNumber: "HL-2025-114",
    contractFor: "Tile and flooring installation — lobby, restrooms, and common areas",
    contractValue: 1250000,
    contractDate: "2025-12-08",
    startDate: "2026-01-12",
    retentionRateCW: 10,
    retentionRateSM: 10,
    ctiPm: "Sarah Chen",
    retentionStepdownThreshold: null,
    retentionStepdownRateCW: null,
    billingDueDay: 15,
    billingCheckinMonth: "2026-07",
    billingPlatform: "",
    certifiedPayroll: false,
  },
  {
    jobName: "Meridian Plaza Kitchen & Dining",
    jobNumber: "J-2402",
    customer: "Meridian Construction",
    customerAddress: "1200 Bristol St, Irvine, CA 92618",
    gcId: null,
    paymentTerms: "",
    owner: "Meridian Plaza Partners",
    ownerAddress: "88 Meridian Plaza, Irvine, CA 92618",
    jobAddress: "88 Meridian Plaza, Irvine, CA 92618",
    architect: "Studio Renke",
    architectAddress: "455 Jamboree Rd, Newport Beach, CA 92660",
    architectProjectNumber: "SR-0231",
    contractFor: "Tile and flooring installation — kitchen, dining, and restrooms",
    contractValue: 640000,
    contractDate: "2026-01-15",
    startDate: "2026-02-01",
    retentionRateCW: 10,
    retentionRateSM: 10,
    ctiPm: "Michael Torres",
    retentionStepdownThreshold: null,
    retentionStepdownRateCW: null,
    billingDueDay: 15,
    billingCheckinMonth: "2026-07",
    billingPlatform: "",
    certifiedPayroll: false,
  },
  {
    jobName: "Summit Ridge Retail Floor",
    jobNumber: "J-2403",
    customer: "Granite Peak Developers",
    customerAddress: "3050 Summit Ridge Dr, Riverside, CA 92501",
    gcId: null,
    paymentTerms: "",
    owner: "Granite Peak Developers",
    ownerAddress: "3050 Summit Ridge Dr, Riverside, CA 92501",
    jobAddress: "3050 Summit Ridge Dr, Riverside, CA 92501",
    architect: "Bowen Architecture Group",
    architectAddress: "77 Canyon Crest Ave, Riverside, CA 92506",
    architectProjectNumber: "BAG-1187",
    contractFor: "Tile and flooring installation — retail floor and restrooms",
    contractValue: 980000,
    contractDate: "2026-02-10",
    startDate: "2026-03-03",
    retentionRateCW: 5,
    retentionRateSM: 5,
    ctiPm: "Alexandra Patel",
    retentionStepdownThreshold: null,
    retentionStepdownRateCW: null,
    billingDueDay: 15,
    billingCheckinMonth: "2026-07",
    billingPlatform: "",
    certifiedPayroll: false,
  },
];
