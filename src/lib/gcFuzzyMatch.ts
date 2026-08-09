import { GeneralContractor } from "@/lib/generalContractorsDb";
import { nameSimilarity, findBestNameMatch } from "@/lib/fuzzyNameMatch";

// Fuzzy-matches a GC name pulled from an imported document against the saved
// GC directory, so Import Contract (AI) can suggest "is this the same GC?"
// instead of silently creating duplicates. Always just a suggestion — the
// caller must still get user confirmation. See fuzzyNameMatch.ts for the
// underlying scoring engine (shared with job matching on Import Change Order).

export const gcNameSimilarity = nameSimilarity;

export type GcMatch = { gc: GeneralContractor; score: number };

export function findBestGcMatch(query: string, gcs: GeneralContractor[]): GcMatch | null {
  const match = findBestNameMatch(query, gcs, (gc) => gc.name);
  return match ? { gc: match.item, score: match.score } : null;
}
