// =============================================================================
// precos-historicos-api.test.ts — testes da feature de referência de preço.
//
// Garante: (1) caso ok COM arremate normaliza centavos e expõe finalValue;
// (2) caso n>0 SEM arremate (n_with_final=0) NÃO expõe finalValue; (3) erros
// de rede/HTTP/ok=false/n=0 viram null (degradação graciosa, nunca lança).
// fetch é 100% mockado — o teste não toca a rede.
// =============================================================================

import { describe, it, expect, vi } from "vitest";
import { fetchPrecoHistorico } from "./precos-historicos-api";

/** Constrói um fetch falso que devolve `payload` como JSON 200 (ou status custom). */
function okFetch(payload: unknown, status = 200): typeof fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json" },
    }),
  ) as unknown as typeof fetch;
}

/** Payload completo COM arremate publicado (valores em centavos). */
function payloadComArremate() {
  return {
    ok: true,
    stats: {
      category: "Veículos",
      category_norm: "veiculos",
      city: null,
      uf: null,
      months: 36,
      n: 120,
      n_with_final: 47,
      minimum_bid: { n: 120, min: 500_00, p25: 1_000_00, median: 2_500_00, p75: 5_000_00, max: 40_000_00 },
      appraisal: { n: 110, min: 1_000_00, p25: 3_000_00, median: 6_000_00, p75: 12_000_00, max: 90_000_00 },
      final_value: { n: 47, min: 1_200_00, median: 3_800_00, max: 55_000_00 },
    },
    sample: [
      {
        receita_lot_id: "lot-1",
        title: "Fiat Uno 2012",
        category: "Veículos",
        city: "São Paulo",
        minimum_bid_cents: 2_500_00,
        appraisal_cents: 6_000_00,
        final_value_cents: 3_800_00,
        closed_at: "2026-03-01T12:00:00Z",
        source_url: "https://venda.estaleiro.serpro.gov.br/lot-1",
        content_hash: "abc123",
      },
    ],
    citation: {
      source_id: "receita-leiloes-sle",
      source_name: "Receita Federal — SLE",
      note: "Lotes encerrados nos últimos 36 meses.",
    },
  };
}

describe("fetchPrecoHistorico", () => {
  it("normaliza um caso ok COM arremate (centavos preservados, finalValue presente)", async () => {
    const result = await fetchPrecoHistorico("Veículos", { fetcher: okFetch(payloadComArremate()) });

    expect(result).not.toBeNull();
    if (!result) return; // narrowing para TS

    expect(result.stats.category).toBe("Veículos");
    expect(result.stats.n).toBe(120);
    expect(result.stats.nWithFinal).toBe(47);

    // Faixa do lance mínimo: quartis e mediana em centavos.
    expect(result.stats.minimumBid).not.toBeNull();
    expect(result.stats.minimumBid?.medianCents).toBe(2_500_00);
    expect(result.stats.minimumBid?.p25Cents).toBe(1_000_00);
    expect(result.stats.minimumBid?.p75Cents).toBe(5_000_00);

    // Arremate REAL presente porque n_with_final > 0.
    expect(result.stats.finalValue).not.toBeNull();
    expect(result.stats.finalValue?.n).toBe(47);
    expect(result.stats.finalValue?.medianCents).toBe(3_800_00);

    // Amostra auditável.
    expect(result.sample).toHaveLength(1);
    expect(result.sample[0]?.receitaLotId).toBe("lot-1");
    expect(result.sample[0]?.finalValueCents).toBe(3_800_00);
    expect(result.sample[0]?.sourceUrl).toContain("lot-1");

    // Citação da fonte oficial.
    expect(result.citation.sourceName).toBe("Receita Federal — SLE");
  });

  it("envia os parâmetros corretos para a RPC (categoria, meses, sample)", async () => {
    const spy = okFetch(payloadComArremate());
    await fetchPrecoHistorico("Veículos", { months: 36, sample: 6, fetcher: spy });

    expect(spy).toHaveBeenCalledTimes(1);
    const [endpoint, init] = (spy as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(endpoint).toContain("/rest/v1/rpc/auction_price_intelligence");
    expect(init.method).toBe("POST");
    const sent = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(sent.p_category).toBe("Veículos");
    expect(sent.p_months).toBe(36);
    expect(sent.p_sample).toBe(6);
    // Sem cidade → a chave NÃO deve ser enviada (exactOptionalPropertyTypes).
    expect("p_city" in sent).toBe(false);
  });

  it("não expõe arremate quando n>0 mas n_with_final=0 (sem venda publicada)", async () => {
    const payload = {
      ok: true,
      stats: {
        category: "Imóveis",
        category_norm: "imoveis",
        city: null,
        uf: null,
        months: 36,
        n: 30,
        n_with_final: 0,
        minimum_bid: { n: 30, min: 50_000_00, p25: 80_000_00, median: 120_000_00, p75: 200_000_00, max: 900_000_00 },
        appraisal: { n: 28, min: 100_000_00, p25: 150_000_00, median: 250_000_00, p75: 400_000_00, max: 1_500_000_00 },
        final_value: { n: 0, min: null, median: null, max: null },
      },
      sample: [
        {
          receita_lot_id: "imovel-9",
          title: "Apartamento 70m²",
          category: "Imóveis",
          city: "Curitiba",
          minimum_bid_cents: 120_000_00,
          appraisal_cents: 250_000_00,
          final_value_cents: null,
          closed_at: "2026-02-01T00:00:00Z",
          source_url: "https://venda.estaleiro.serpro.gov.br/imovel-9",
          content_hash: "def456",
        },
      ],
      citation: { source_id: "receita-leiloes-sle", source_name: "Receita Federal — SLE", note: null },
    };

    const result = await fetchPrecoHistorico("Imóveis", { fetcher: okFetch(payload) });

    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.stats.nWithFinal).toBe(0);
    // Sem arremate publicado → finalValue null (não fabrica venda).
    expect(result.stats.finalValue).toBeNull();
    // Mas mínimo e avaliação seguem presentes.
    expect(result.stats.minimumBid?.medianCents).toBe(120_000_00);
    expect(result.stats.appraisal?.medianCents).toBe(250_000_00);
    // A amostra não traz finalValueCents quando ausente.
    expect(result.sample[0]?.finalValueCents).toBeUndefined();
  });

  it("retorna null quando ok=false", async () => {
    const result = await fetchPrecoHistorico("Veículos", {
      fetcher: okFetch({ ok: false, error: "categoria desconhecida" }),
    });
    expect(result).toBeNull();
  });

  it("retorna null quando n=0 (categoria sem lotes encerrados)", async () => {
    const result = await fetchPrecoHistorico("Categoria rara", {
      fetcher: okFetch({ ok: true, stats: { category: "Categoria rara", n: 0, n_with_final: 0 } }),
    });
    expect(result).toBeNull();
  });

  it("retorna null em erro de rede (fetch rejeita) sem lançar", async () => {
    const failing = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const result = await fetchPrecoHistorico("Veículos", { fetcher: failing });
    expect(result).toBeNull();
  });

  it("retorna null em HTTP 404 (RPC ainda não publicada)", async () => {
    const result = await fetchPrecoHistorico("Veículos", { fetcher: okFetch({}, 404) });
    expect(result).toBeNull();
  });

  it("retorna null para categoria vazia sem chamar a rede", async () => {
    const spy = okFetch(payloadComArremate());
    const result = await fetchPrecoHistorico("   ", { fetcher: spy });
    expect(result).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});
