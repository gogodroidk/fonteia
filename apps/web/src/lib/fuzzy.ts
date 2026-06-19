/**
 * fuzzy.ts — client-side fuzzy-text utilities for Fonte.ia search.
 *
 * Zero external dependencies. All functions are pure and deterministic.
 * Designed to run over a few hundred lots in the browser without allocation
 * pressure. Use normalizeText() on both sides before comparing.
 */

// ─── normalizeText ────────────────────────────────────────────────────────────

/** Lowercase, strip diacritics (NFD), trim, collapse internal whitespace. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

// ─── levenshtein ──────────────────────────────────────────────────────────────

/**
 * Classic iterative Levenshtein edit distance.
 * Uses a single rolling array — O(n*m) time, O(min(n,m)) space.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Keep the shorter string as the "row" to minimise allocation.
  if (a.length > b.length) {
    const tmp = a;
    a = b;
    b = tmp;
  }

  const lenA = a.length;
  const lenB = b.length;
  const row = new Uint16Array(lenA + 1);

  for (let i = 0; i <= lenA; i++) row[i] = i;

  for (let j = 1; j <= lenB; j++) {
    let prev = j;
    const bj = b[j - 1]!;
    for (let i = 1; i <= lenA; i++) {
      const cur =
        (a[i - 1] ?? "") === bj
          ? (row[i - 1] ?? 0)
          : 1 + Math.min(row[i - 1] ?? 0, row[i] ?? 0, prev);
      row[i - 1] = prev;
      prev = cur;
    }
    row[lenA] = prev;
  }

  return row[lenA] ?? 0;
}

// ─── similarity ───────────────────────────────────────────────────────────────

/**
 * Normalised similarity score in [0, 1].
 * 1 = identical, 0 = maximally different.
 * Inputs are normalised internally; two empty strings return 1.
 */
export function similarity(a: string, b: string): number {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  return Math.max(0, Math.min(1, 1 - levenshtein(na, nb) / maxLen));
}

// ─── fuzzyTokenMatch ──────────────────────────────────────────────────────────

/**
 * Returns true when `token` matches inside `haystack`.
 * Match is exact substring OR any space-split word in haystack has
 * similarity(word, token) >= threshold (default 0.8).
 * Both sides are normalised internally.
 */
export function fuzzyTokenMatch(
  haystack: string,
  token: string,
  threshold = 0.8,
): boolean {
  const nh = normalizeText(haystack);
  const nt = normalizeText(token);
  if (nt.length === 0) return true;

  // Fast path: exact substring.
  if (nh.includes(nt)) return true;

  // Per-word similarity.
  const words = nh.split(/\s+/);
  return words.some((w) => similarity(w, nt) >= threshold);
}

// ─── didYouMean ───────────────────────────────────────────────────────────────

/**
 * Returns the single closest vocabulary entry when the query is a near-miss
 * (best per-token similarity >= threshold, default 0.6) but NOT an exact
 * substring match. Returns null when nothing is close enough.
 *
 * Strategy: score each vocab entry as the average of the best-matching vocab
 * word for each query token; pick the entry with the highest score above the
 * threshold that doesn't already substring-match the raw query.
 */
export function didYouMean(
  query: string,
  vocabulary: string[],
  opts?: { threshold?: number },
): string | null {
  const threshold = opts?.threshold ?? 0.6;
  const nq = normalizeText(query);
  if (nq.length === 0 || vocabulary.length === 0) return null;

  const queryTokens = nq.split(/\s+/).filter((t) => t.length >= 2);
  if (queryTokens.length === 0) return null;

  let bestEntry: string | null = null;
  let bestScore = threshold - 1e-9; // must exceed, not just meet

  for (const entry of vocabulary) {
    const ne = normalizeText(entry);

    // Skip if it's already an exact substring match — no suggestion needed.
    if (nq.includes(ne) || ne.includes(nq)) continue;

    const entryWords = ne.split(/\s+/);

    // Average best-match similarity across query tokens.
    let totalSim = 0;
    for (const qt of queryTokens) {
      let best = 0;
      for (const ew of entryWords) {
        const s = similarity(qt, ew);
        if (s > best) best = s;
      }
      totalSim += best;
    }
    const score = queryTokens.length > 0 ? totalSim / queryTokens.length : 0;

    if (score > bestScore) {
      bestScore = score;
      bestEntry = entry;
    }
  }

  return bestEntry;
}

// ─── bestMatches ──────────────────────────────────────────────────────────────

/**
 * Rank `items` by fuzzy similarity of `query` vs `getText(item)`.
 * Returns items above `threshold` sorted descending by score, limited to `limit`.
 */
export function bestMatches<T>(
  query: string,
  items: T[],
  getText: (item: T) => string,
  opts?: { threshold?: number; limit?: number },
): Array<{ item: T; score: number }> {
  const threshold = opts?.threshold ?? 0.4;
  const limit = opts?.limit ?? 20;
  const nq = normalizeText(query);
  if (nq.length === 0) return [];

  const scored = items
    .map((item) => ({ item, score: similarity(nq, getText(item)) }))
    .filter((x) => x.score >= threshold);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
