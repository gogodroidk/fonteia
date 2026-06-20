/**
 * source-health.test.ts — testes da derivação de saúde da página /sources.
 *
 * Garante a regra de ouro: SEM dado de saúde → "sem dados de saúde", NUNCA
 * "conectado". E que sucesso recente = verde, sucesso obsoleto = amarelo/vermelho,
 * falha recente = degradado.
 */

import { describe, it, expect } from "vitest";
import type { PublicSource } from "@fonteia/domain";
import { deriveHealth, humanizeAge } from "./source-health";

const NOW = Date.parse("2026-06-20T12:00:00Z");

function daysAgo(days: number): string {
  return new Date(NOW - days * 86_400_000).toISOString();
}

function makeSource(overrides: Partial<PublicSource> = {}): PublicSource {
  return {
    id: "test-source",
    name: "Fonte de Teste",
    owner: "Órgão",
    sourceUrl: "https://example.gov.br",
    status: "integrating",
    accessKind: "open",
    reliability: "official_stable",
    modules: ["empresas"],
    refreshCadence: "daily",
    commercialRisk: "low",
    notes: "",
    ...overrides,
  };
}

describe("deriveHealth", () => {
  it("returns unknown (never connected) when there is no health data", () => {
    const h = deriveHealth(makeSource({ status: "integrating" }), [], NOW);
    expect(h.level).toBe("unknown");
    expect(h.effectiveStatus).toBe("integrating");
    expect(h.effectiveStatus).not.toBe("connected");
    expect(h.note).toMatch(/sem dados de saúde/i);
  });

  it("promotes a stable source with a fresh success to connected (green)", () => {
    const h = deriveHealth(
      makeSource({ refreshCadence: "daily", reliability: "official_stable", status: "integrating" }),
      [{ source_id: "x", last_success_at: daysAgo(1), last_run_at: daysAgo(1), last_status: "success", last_inserted: 200, success_runs: 10 }],
      NOW,
    );
    expect(h.level).toBe("green");
    expect(h.effectiveStatus).toBe("connected");
    expect(h.lastInserted).toBe(200);
    expect(h.successRuns).toBe(10);
  });

  it("keeps a fragile source as fragile_operational even when healthy", () => {
    const h = deriveHealth(
      makeSource({ refreshCadence: "daily", reliability: "official_fragile", status: "fragile_operational" }),
      [{ source_id: "x", last_success_at: daysAgo(1), last_run_at: daysAgo(1), last_status: "success", last_inserted: 50, success_runs: 100 }],
      NOW,
    );
    expect(h.level).toBe("green");
    expect(h.effectiveStatus).toBe("fragile_operational");
  });

  it("marks a stale success as yellow and does NOT promote to connected", () => {
    const h = deriveHealth(
      makeSource({ refreshCadence: "daily", reliability: "official_stable", status: "integrating" }),
      [{ source_id: "x", last_success_at: daysAgo(10), last_run_at: daysAgo(10), last_status: "success", last_inserted: 5, success_runs: 3 }],
      NOW,
    );
    expect(h.level).toBe("yellow");
    expect(h.effectiveStatus).not.toBe("connected");
    expect(h.effectiveStatus).toBe("integrating");
  });

  it("marks a very stale success as red", () => {
    const h = deriveHealth(
      makeSource({ refreshCadence: "daily" }), // window 4d, 3x = 12d
      [{ source_id: "x", last_success_at: daysAgo(60), last_run_at: daysAgo(60), last_status: "success", last_inserted: 1, success_runs: 1 }],
      NOW,
    );
    expect(h.level).toBe("red");
  });

  it("marks last-run failure with a recent prior success as yellow (degraded)", () => {
    const h = deriveHealth(
      makeSource({ refreshCadence: "daily", reliability: "official_stable" }),
      [{ source_id: "x", last_success_at: daysAgo(2), last_run_at: daysAgo(1), last_status: "failed", last_inserted: 100, success_runs: 5 }],
      NOW,
    );
    expect(h.level).toBe("yellow");
    expect(h.note).toMatch(/falhou/i);
  });

  it("marks runs-but-never-succeeded as red", () => {
    const h = deriveHealth(
      makeSource(),
      [{ source_id: "x", last_success_at: null, last_run_at: daysAgo(1), last_status: "failed", last_inserted: null, success_runs: 0 }],
      NOW,
    );
    expect(h.level).toBe("red");
    expect(h.lastSuccessAt).toBeUndefined();
  });

  it("aggregates multiple collectors and uses the freshest success", () => {
    const h = deriveHealth(
      makeSource({ refreshCadence: "daily", reliability: "official_stable" }),
      [
        { source_id: "a", last_success_at: daysAgo(30), last_run_at: daysAgo(30), last_status: "success", last_inserted: 10, success_runs: 4 },
        { source_id: "b", last_success_at: daysAgo(1), last_run_at: daysAgo(1), last_status: "success", last_inserted: 99, success_runs: 6 },
      ],
      NOW,
    );
    expect(h.level).toBe("green");
    expect(h.lastSuccessAt).toBe(daysAgo(1));
    expect(h.lastInserted).toBe(99);
    expect(h.successRuns).toBe(10); // 4 + 6
  });

  it("respects the monthly cadence window (45d) before going stale", () => {
    const h = deriveHealth(
      makeSource({ refreshCadence: "monthly", reliability: "official_stable", status: "integrating" }),
      [{ source_id: "x", last_success_at: daysAgo(30), last_run_at: daysAgo(30), last_status: "success", last_inserted: 7, success_runs: 2 }],
      NOW,
    );
    expect(h.level).toBe("green");
    expect(h.effectiveStatus).toBe("connected");
  });
});

describe("humanizeAge", () => {
  it("handles today / yesterday / days", () => {
    expect(humanizeAge(new Date(NOW).toISOString(), NOW)).toBe("hoje");
    expect(humanizeAge(daysAgo(1), NOW)).toBe("ontem");
    expect(humanizeAge(daysAgo(5), NOW)).toBe("há 5 dias");
  });
  it("returns em-dash for undefined/invalid", () => {
    expect(humanizeAge(undefined, NOW)).toBe("—");
    expect(humanizeAge("not-a-date", NOW)).toBe("—");
  });
});
