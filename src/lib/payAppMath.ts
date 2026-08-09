import { SOVLineItem } from "@/lib/sovData";

export type ComputedLine = SOVLineItem & {
  totalCompleted: number;
  percentComplete: number;
  balanceToFinish: number;
  retention: number;
};

export function computeLine(line: SOVLineItem, cwRate: number, smRate: number): ComputedLine {
  const totalCompleted = line.previousApplications + line.thisPeriod + line.storedMaterials;
  const percentComplete = line.scheduledValue !== 0 ? (totalCompleted / line.scheduledValue) * 100 : 0;
  const balanceToFinish = line.scheduledValue - totalCompleted;
  const retention = cwRate * (line.previousApplications + line.thisPeriod) + smRate * line.storedMaterials;
  return { ...line, totalCompleted, percentComplete, balanceToFinish, retention };
}

export function sumLines(lines: ComputedLine[]) {
  const totals = lines.reduce(
    (acc, line) => ({
      scheduledValue: acc.scheduledValue + line.scheduledValue,
      previousApplications: acc.previousApplications + line.previousApplications,
      thisPeriod: acc.thisPeriod + line.thisPeriod,
      storedMaterials: acc.storedMaterials + line.storedMaterials,
      totalCompleted: acc.totalCompleted + line.totalCompleted,
      balanceToFinish: acc.balanceToFinish + line.balanceToFinish,
      retention: acc.retention + line.retention,
    }),
    { scheduledValue: 0, previousApplications: 0, thisPeriod: 0, storedMaterials: 0, totalCompleted: 0, balanceToFinish: 0, retention: 0 }
  );
  const percentComplete = totals.scheduledValue !== 0 ? (totals.totalCompleted / totals.scheduledValue) * 100 : 0;
  return { ...totals, percentComplete };
}

/** What would have been certified as of the previous application: prior-period completed work, less retention on that amount (stored materials are re-entered fresh each period, so they're excluded). */
export function previousCertificates(lines: SOVLineItem[], cwRate: number) {
  const previouslyCompleted = lines.reduce((sum, line) => sum + line.previousApplications, 0);
  return previouslyCompleted - cwRate * previouslyCompleted;
}
