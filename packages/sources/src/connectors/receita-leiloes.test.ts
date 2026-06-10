import { describe, expect, it } from "vitest";
import {
  fetchReceitaLeiloesDestaques,
  normalizeReceitaDestaquesPayload,
  type ReceitaLeiloesDestaquesPayload,
} from "./receita-leiloes";

const fixture: ReceitaLeiloesDestaquesPayload = {
  agora: "2026-06-10 02:40",
  destaques: [
    {
      permitePF: false,
      orgao: "Receita Federal",
      cidade: "BELEM",
      edital: "0200100/0000001/2026",
      edle: "200100/1/2026",
      dtFimProposta: "2026-07-06 20:00",
      destaque: true,
      imagemDestaque: "https://example.test/foto.jpg",
      numero: 136,
      lote: 136,
      valor: 4000,
    },
  ],
};

describe("Receita Leiloes connector", () => {
  it("normalizes destaque payload into Fonte.ia lots", () => {
    const [lot] = normalizeReceitaDestaquesPayload(fixture);

    expect(lot).toMatchObject({
      id: "200100-1-2026-136",
      sourceId: "receita-leiloes-sle",
      edital: "0200100/0000001/2026",
      city: "BELEM",
      minimumBidCents: 400000,
      proposalDeadline: "2026-07-06T20:00:00-03:00",
      eligiblePersonTypes: ["pj"],
    });
  });

  it("uses injected fetcher so tests do not depend on Receita uptime", async () => {
    const fakeFetch = async () =>
      ({
        ok: true,
        json: async () => fixture,
      }) as Response;

    const lots = await fetchReceitaLeiloesDestaques(fakeFetch as typeof fetch);

    expect(lots).toHaveLength(1);
    expect(lots[0]?.sourceUrl).toContain("/api/portal/destaques");
  });
});

