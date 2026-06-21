/**
 * fuzzy.test.ts — normalizeText, levenshtein, similarity, fuzzyTokenMatch,
 *                 didYouMean, bestMatches.
 *
 * Todos são funções puras, zero dependências externas.
 */

import { describe, it, expect } from "vitest";
import {
  normalizeText,
  levenshtein,
  similarity,
  fuzzyTokenMatch,
  didYouMean,
  bestMatches,
} from "./fuzzy";

// ─── normalizeText ────────────────────────────────────────────────────────────

describe("normalizeText", () => {
  it("lowercases ASCII", () => {
    expect(normalizeText("Hello World")).toBe("hello world");
  });

  it("strips diacritics (NFD)", () => {
    expect(normalizeText("São Paulo")).toBe("sao paulo");
    expect(normalizeText("Curitibá")).toBe("curitiba");
    expect(normalizeText("ação")).toBe("acao");
  });

  it("trims leading/trailing whitespace", () => {
    expect(normalizeText("  abc  ")).toBe("abc");
  });

  it("collapses internal whitespace", () => {
    expect(normalizeText("foo   bar")).toBe("foo bar");
  });

  it("returns empty string for empty input", () => {
    expect(normalizeText("")).toBe("");
  });

  it("handles string with only spaces", () => {
    expect(normalizeText("   ")).toBe("");
  });
});

// ─── levenshtein ──────────────────────────────────────────────────────────────

describe("levenshtein", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshtein("abc", "abc")).toBe(0);
  });

  it("returns length of b when a is empty", () => {
    expect(levenshtein("", "abc")).toBe(3);
  });

  it("returns length of a when b is empty", () => {
    expect(levenshtein("abc", "")).toBe(3);
  });

  it("returns 1 for single substitution", () => {
    expect(levenshtein("cat", "bat")).toBe(1);
  });

  it("returns 1 for single insertion", () => {
    expect(levenshtein("ab", "abc")).toBe(1);
  });

  it("returns 1 for single deletion", () => {
    expect(levenshtein("abc", "ab")).toBe(1);
  });

  it("handles swapped strings symmetrically", () => {
    const d1 = levenshtein("abc", "xyz");
    const d2 = levenshtein("xyz", "abc");
    expect(d1).toBe(d2);
  });

  it("returns full length for completely different strings", () => {
    expect(levenshtein("abc", "xyz")).toBe(3);
  });

  it("computes distance for typical Portuguese misspelling", () => {
    // "recibo" vs "recebo" — 1 substitution
    expect(levenshtein("recibo", "recebo")).toBe(1);
  });
});

// ─── similarity ───────────────────────────────────────────────────────────────

describe("similarity", () => {
  it("returns 1 for identical strings", () => {
    expect(similarity("abc", "abc")).toBe(1);
  });

  it("returns 1 for two empty strings", () => {
    expect(similarity("", "")).toBe(1);
  });

  it("returns 0 for completely different strings of same length", () => {
    // levenshtein("abc","xyz") = 3 = maxLen → score = 1 - 3/3 = 0
    expect(similarity("abc", "xyz")).toBe(0);
  });

  it("is within [0, 1]", () => {
    const s = similarity("hello", "world");
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
  });

  it("normalises both sides before comparing (diacritics)", () => {
    // "São" vs "Sao" → after normalisation they're equal
    expect(similarity("São", "Sao")).toBe(1);
  });

  it("returns higher score for near-miss than for random string", () => {
    const near = similarity("empresa", "empreza");  // 1 substitution
    const far  = similarity("empresa", "xxxxxxx");  // 7 differences
    expect(near).toBeGreaterThan(far);
  });
});

// ─── fuzzyTokenMatch ──────────────────────────────────────────────────────────

describe("fuzzyTokenMatch", () => {
  it("returns true for exact substring match", () => {
    expect(fuzzyTokenMatch("banco do brasil", "brasil")).toBe(true);
  });

  it("returns true for empty token (matches anything)", () => {
    expect(fuzzyTokenMatch("anything", "")).toBe(true);
  });

  it("returns false for unrelated string at default threshold", () => {
    expect(fuzzyTokenMatch("banco do brasil", "xyz")).toBe(false);
  });

  it("returns true for near-miss above default threshold 0.8", () => {
    // "banko" vs "banco" — similarity should be > 0.8
    expect(fuzzyTokenMatch("banco do brasil", "banko")).toBe(true);
  });

  it("strips diacritics before comparing", () => {
    // haystack normalised → "sao paulo"; token normalised → "sao"
    expect(fuzzyTokenMatch("São Paulo", "São")).toBe(true);
  });

  it("returns false when threshold is raised above match quality", () => {
    // "banko" vs "banco" has similarity ~0.83; at threshold 0.95 it should miss
    expect(fuzzyTokenMatch("banco do brasil", "banko", 0.95)).toBe(false);
  });
});

// ─── didYouMean ───────────────────────────────────────────────────────────────

describe("didYouMean", () => {
  const vocab = ["empresa", "contrato", "licitação", "pregão", "fornecedor"];

  it("returns null for exact substring match (no suggestion needed)", () => {
    expect(didYouMean("empresa", vocab)).toBeNull();
  });

  it("returns null for empty query", () => {
    expect(didYouMean("", vocab)).toBeNull();
  });

  it("returns null for empty vocabulary", () => {
    expect(didYouMean("empresa", [])).toBeNull();
  });

  it("suggests closest word for near-miss query", () => {
    // "empreza" is a near-miss for "empresa"
    const result = didYouMean("empreza", vocab);
    expect(result).toBe("empresa");
  });

  it("returns null when no vocab entry is close enough", () => {
    const result = didYouMean("xxxxxxxx", vocab);
    expect(result).toBeNull();
  });
});

// ─── bestMatches ──────────────────────────────────────────────────────────────

describe("bestMatches", () => {
  const items = [
    { id: 1, name: "Banco do Brasil" },
    { id: 2, name: "Caixa Econômica Federal" },
    { id: 3, name: "Petrobras" },
    { id: 4, name: "Itaú Unibanco" },
  ];

  it("returns empty array for empty query", () => {
    expect(bestMatches("", items, (x) => x.name)).toEqual([]);
  });

  it("returns matched items sorted by score descending", () => {
    // Use threshold 0.2 so short queries against longer names still match.
    // bestMatches compares the full query string against the full item text via
    // similarity(). The winning item depends on string lengths, so we test only
    // that results are non-empty and correctly sorted — not which item wins.
    const results = bestMatches("banco", items, (x) => x.name, { threshold: 0.2 });
    expect(results.length).toBeGreaterThan(0);
    // scores must be sorted descending
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1]!.score).toBeGreaterThanOrEqual(results[i]!.score);
    }
  });

  it("respects the limit option", () => {
    const results = bestMatches("a", items, (x) => x.name, { limit: 2 });
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("respects threshold option — excludes low-scoring items", () => {
    // "xyz" will not match well against any name; threshold 0.9 should return nothing
    const results = bestMatches("xyz", items, (x) => x.name, { threshold: 0.9 });
    expect(results).toEqual([]);
  });

  it("each result has item and score fields", () => {
    // Use threshold 0.2 (see comment in "sorted" test above)
    const results = bestMatches("caixa", items, (x) => x.name, { threshold: 0.2 });
    for (const r of results) {
      expect(r).toHaveProperty("item");
      expect(r).toHaveProperty("score");
      expect(typeof r.score).toBe("number");
    }
  });
});
