import { DbJob } from "@/lib/jobs";
import { nameSimilarity, DEFAULT_MATCH_THRESHOLD } from "@/lib/fuzzyNameMatch";

// Fuzzy-matches a job name/number pulled from an imported document (e.g. a
// change order request) against existing jobs, so Import Change Order (AI)
// can suggest "is this the same job?" instead of silently mis-linking or
// forcing a guess. Always just a suggestion — the caller must still get user
// confirmation. Matches against both job name and job number since a COR may
// reference either. See fuzzyNameMatch.ts for the underlying scoring engine
// (shared with GC matching on Import Contract).

export type JobMatch = { job: DbJob; score: number };

export function findBestJobMatch(
  query: string,
  jobs: DbJob[],
  threshold: number = DEFAULT_MATCH_THRESHOLD
): JobMatch | null {
  if (!query.trim() || jobs.length === 0) return null;

  let best: JobMatch | null = null;
  for (const job of jobs) {
    const score = Math.max(
      nameSimilarity(query, job.jobName || ""),
      nameSimilarity(query, job.jobNumber || "")
    );
    if (score >= threshold && (!best || score > best.score)) {
      best = { job, score };
    }
  }
  return best;
}
