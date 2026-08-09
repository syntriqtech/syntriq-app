export type SOVLineItem = {
  item: string;
  description: string;
  scheduledValue: number;
  previousApplications: number;
  thisPeriod: number;
  storedMaterials: number;
};

export const sovLineItems: Record<string, SOVLineItem[]> = {
  "J-2401": [
    { item: "1", description: "Demo & substrate prep", scheduledValue: 125000, previousApplications: 125000, thisPeriod: 0, storedMaterials: 0 },
    { item: "2", description: "Tile — lobby & common areas", scheduledValue: 410000, previousApplications: 287000, thisPeriod: 82000, storedMaterials: 25000 },
    { item: "3", description: "Tile — restrooms", scheduledValue: 260000, previousApplications: 156000, thisPeriod: 52000, storedMaterials: 0 },
    { item: "4", description: "Grout & sealant", scheduledValue: 180000, previousApplications: 54000, thisPeriod: 36000, storedMaterials: 18000 },
    { item: "5", description: "Punch list & final clean", scheduledValue: 275000, previousApplications: 0, thisPeriod: 0, storedMaterials: 0 },
  ],
  "J-2402": [
    { item: "1", description: "Demo & substrate prep", scheduledValue: 64000, previousApplications: 64000, thisPeriod: 0, storedMaterials: 0 },
    { item: "2", description: "Tile — kitchen & dining", scheduledValue: 230000, previousApplications: 184000, thisPeriod: 23000, storedMaterials: 0 },
    { item: "3", description: "Tile — restrooms", scheduledValue: 156000, previousApplications: 93600, thisPeriod: 31200, storedMaterials: 10400 },
    { item: "4", description: "Grout & sealant", scheduledValue: 96000, previousApplications: 28800, thisPeriod: 19200, storedMaterials: 0 },
    { item: "5", description: "Punch list & final clean", scheduledValue: 94000, previousApplications: 0, thisPeriod: 0, storedMaterials: 0 },
  ],
  "J-2403": [
    { item: "1", description: "Demo & substrate prep", scheduledValue: 98000, previousApplications: 58800, thisPeriod: 19600, storedMaterials: 0 },
    { item: "2", description: "Tile — retail floor", scheduledValue: 392000, previousApplications: 117600, thisPeriod: 58800, storedMaterials: 39200 },
    { item: "3", description: "Tile — restrooms", scheduledValue: 196000, previousApplications: 0, thisPeriod: 0, storedMaterials: 0 },
    { item: "4", description: "Grout & sealant", scheduledValue: 147000, previousApplications: 0, thisPeriod: 0, storedMaterials: 0 },
    { item: "5", description: "Punch list & final clean", scheduledValue: 147000, previousApplications: 0, thisPeriod: 0, storedMaterials: 0 },
  ],
};

export const changeOrderItems: Record<string, SOVLineItem[]> = {
  "J-2401": [
    { item: "CO-1", description: "Upgraded tile — lobby (owner request)", scheduledValue: 38000, previousApplications: 38000, thisPeriod: 0, storedMaterials: 0 },
  ],
  "J-2402": [],
  "J-2403": [],
};
