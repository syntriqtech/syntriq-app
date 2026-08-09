// Generic fuzzy name-matching engine — shared by every "does this extracted
// name match something we already have on file?" feature (GC matching on
// Import Contract, job matching on Import Change Order, etc.). Names from
// imported documents get typed/abbreviated inconsistently ("CVG" vs "Cody
// Vermette Group" vs "CVG Builders"), so a single similarity score combines
// several signals rather than relying on exact or substring matches alone.

const STOPWORDS = new Set(["inc", "llc", "corp", "co", "the", "and", "of"]);

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,'&]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function words(name: string): string[] {
  return normalize(name)
    .split(" ")
    .filter((w) => w.length > 0 && !STOPWORDS.has(w));
}

function acronym(name: string): string {
  return words(name)
    .map((w) => w[0])
    .join("");
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array(n + 1);
  const curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

function levenshteinSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

function jaccard(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const w of setA) if (setB.has(w)) intersection++;
  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
}

/** Similarity score in [0, 1] between a query name and a candidate name. */
export function nameSimilarity(query: string, candidate: string): number {
  const nQuery = normalize(query);
  const nCandidate = normalize(candidate);
  if (!nQuery || !nCandidate) return 0;
  if (nQuery === nCandidate) return 1;

  const scores: number[] = [];

  // "CVG" vs "CVG Builders" — one name contains the other
  if (nCandidate.includes(nQuery) || nQuery.includes(nCandidate)) {
    scores.push(0.9);
  }

  // "CVG" vs "Cody Vermette Group" — acronym of one matches the other's text
  const queryAcronym = acronym(query);
  const candidateAcronym = acronym(candidate);
  const queryIsAcronymForm = words(query).length === 1 && nQuery.length <= 5;
  const candidateIsAcronymForm = words(candidate).length === 1 && nCandidate.length <= 5;
  if (queryIsAcronymForm && candidateAcronym === nQuery.replace(/\s/g, "")) scores.push(0.85);
  if (candidateIsAcronymForm && queryAcronym === nCandidate.replace(/\s/g, "")) scores.push(0.85);

  scores.push(0.75 * jaccard(words(query), words(candidate)));
  scores.push(0.7 * levenshteinSimilarity(nQuery, nCandidate));

  return Math.max(0, ...scores);
}

export type NameMatch<T> = { item: T; score: number };

export const DEFAULT_MATCH_THRESHOLD = 0.6;

/** Best fuzzy match for `query` among `items`, or null if nothing clears the threshold. */
export function findBestNameMatch<T>(
  query: string,
  items: T[],
  getName: (item: T) => string,
  threshold: number = DEFAULT_MATCH_THRESHOLD
): NameMatch<T> | null {
  if (!query.trim() || items.length === 0) return null;

  let best: NameMatch<T> | null = null;
  for (const item of items) {
    const score = nameSimilarity(query, getName(item));
    if (score >= threshold && (!best || score > best.score)) {
      best = { item, score };
    }
  }
  return best;
}
