import { describe, expect, it } from "vitest";
import {
  dedupeOpportunities,
  fetchGazettes,
  gazettesSearchUrl,
  normalizeGazette,
  normalizeGazettes,
  opportunityId,
  stableHash,
  type QueridoDiarioGazetteRaw,
  type QueridoDiarioSearchResponse,
} from "./querido-diario";

// Payload de exemplo — espelha a resposta real confirmada por fetch ao vivo em
// api.queridodiario.ok.org.br/gazettes?querystring=pregão&size=2 (2026-07-07).
const samplePayload: QueridoDiarioSearchResponse = {
  total_gazettes: 10000,
  gazettes: [
    {
      territory_id: "3522703",
      date: "2024-01-05",
      scraped_at: "2024-01-06T01:28:06.407883",
      url: "https://data.queridodiario.ok.org.br/3522703/2024-01-05/46a3dc8c.pdf",
      territory_name: "Itápolis",
      state_code: "SP",
      excerpts: ["PREGÃO PRESENCIAL 1736 2017 -54,60 10.585.856/0001-20 DISTRIBUIDORA DE GAS"],
      edition: "2132",
      is_extra_edition: false,
      txt_url: "https://data.queridodiario.ok.org.br/3522703/2024-01-05/46a3dc8c.txt",
    },
    {
      territory_id: "3522901",
      date: "2022-05-23",
      scraped_at: "2023-10-31T07:20:18.376904",
      url: "https://data.queridodiario.ok.org.br/3522901/2022-05-23/1db5ac79.pdf",
      territory_name: "Itapuí",
      state_code: "SP",
      excerpts: ["Extrato de Contrato nº 039/2022, Processo nº 085/2022, Pregão nº 043/2022."],
      edition: "893",
      is_extra_edition: false,
      txt_url: "https://data.queridodiario.ok.org.br/3522901/2022-05-23/1db5ac79.txt",
    },
  ],
};

describe("Querido Diário connector", () => {
  it("builds the search URL with expected params and clamps page size", () => {
    const url = gazettesSearchUrl({ querystring: "pregão eletrônico", size: 999, offset: 20 });
    expect(url).toContain("https://api.queridodiario.ok.org.br/gazettes?");
    expect(url).toContain("querystring=preg%C3%A3o+eletr%C3%B4nico");
    expect(url).toContain("size=50"); // clamp no teto de 50
    expect(url).toContain("offset=20");
  });

  it("appends territory_ids and date filters when provided", () => {
    const url = gazettesSearchUrl({
      querystring: "tomada de preços",
      territoryIds: ["3550308", "3304557"],
      publishedSince: "2026-01-01",
      publishedUntil: "2026-07-01",
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.getAll("territory_ids")).toEqual(["3550308", "3304557"]);
    expect(parsed.searchParams.get("published_since")).toBe("2026-01-01");
    expect(parsed.searchParams.get("published_until")).toBe("2026-07-01");
  });

  it("produces a stable, deterministic hash for the same input", () => {
    expect(stableHash("abc")).toBe(stableHash("abc"));
    expect(stableHash("abc")).not.toBe(stableHash("abd"));
  });

  it("derives a stable opportunity id from territory+date+edition+termo", () => {
    const gazette = samplePayload.gazettes[0] as QueridoDiarioGazetteRaw;
    const id1 = opportunityId(gazette, "pregão presencial");
    const id2 = opportunityId(gazette, "pregão presencial");
    const id3 = opportunityId(gazette, "tomada de preços"); // termo diferente -> id diferente
    expect(id1).toBe(id2);
    expect(id1).not.toBe(id3);
    expect(id1).toMatch(/^qd-[0-9a-f]{8}$/);
  });

  it("normalizes a single gazette into an opportunity with traceable fields", () => {
    const gazette = samplePayload.gazettes[0] as QueridoDiarioGazetteRaw;
    const opp = normalizeGazette(gazette, "pregão presencial", "2026-07-07T12:00:00.000Z");

    expect(opp).toMatchObject({
      sourceId: "querido-diario",
      municipio: "Itápolis",
      uf: "SP",
      ibgeCode: "3522703",
      data: "2024-01-05",
      termo: "pregão presencial",
      edicao: "2132",
      extraEdicao: false,
      sourceUrl: "https://data.queridodiario.ok.org.br/3522703/2024-01-05/46a3dc8c.pdf",
      txtUrl: "https://data.queridodiario.ok.org.br/3522703/2024-01-05/46a3dc8c.txt",
    });
    expect(opp.trecho).toContain("PREGÃO PRESENCIAL");
    expect(opp.raw).toBe(gazette);
  });

  it("falls back to a safe default municipio name when territory_name is missing", () => {
    const gazette: QueridoDiarioGazetteRaw = { territory_id: "9999999", date: "2026-01-01", url: "https://x" };
    const opp = normalizeGazette(gazette, "pregão", "2026-07-07T00:00:00.000Z");
    expect(opp.municipio).toBe("Município não informado");
    expect(opp.uf).toBe("");
    expect(opp.trecho).toBe("");
  });

  it("normalizes a whole batch tagging every item with the searched termo", () => {
    const opps = normalizeGazettes(samplePayload.gazettes, "pregão", "2026-07-07T00:00:00.000Z");
    expect(opps).toHaveLength(2);
    expect(opps.every((o) => o.termo === "pregão")).toBe(true);
    expect(opps.map((o) => o.municipio)).toEqual(["Itápolis", "Itapuí"]);
  });

  it("dedupes opportunities by stable id (same gazette matched by the same termo twice)", () => {
    const gazette = samplePayload.gazettes[0] as QueridoDiarioGazetteRaw;
    const opp = normalizeGazette(gazette, "pregão presencial", "2026-07-07T00:00:00.000Z");
    const deduped = dedupeOpportunities([opp, { ...opp }, opp]);
    expect(deduped).toHaveLength(1);
  });

  it("uses an injected fetcher so tests never depend on Querido Diário uptime", async () => {
    const fakeFetch = (async () =>
      ({
        ok: true,
        status: 200,
        json: async () => samplePayload,
      }) as Response) as typeof fetch;

    const page = await fetchGazettes({ querystring: "pregão", size: 2 }, fakeFetch);
    expect(page.total_gazettes).toBe(10000);
    expect(page.gazettes).toHaveLength(2);
  });

  it("throws a clear error when the payload shape is unexpected", async () => {
    const badFetch = (async () =>
      ({ ok: true, status: 200, json: async () => ({ unexpected: true }) }) as Response) as typeof fetch;

    await expect(fetchGazettes({ querystring: "pregão" }, badFetch)).rejects.toThrow(/payload inesperado/);
  });
});
