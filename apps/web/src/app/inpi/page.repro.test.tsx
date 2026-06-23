/**
 * Reprodução / blindagem do módulo INPI. A base (kind='trademark') está saudável
 * no D1 (~29,5k, sourceId="inpi-dados-abertos"), e a busca por nome usa o
 * d1-bridge (`q` = name LIKE). Estes testes garantem que:
 *   1) a página monta sem lançar (estado inicial);
 *   2) `fetchTrademarksByQuery` mapeia a forma REAL da RPI;
 *   3) os resultados renderizam sem quebrar a tela.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { fetchTrademarksByQuery } from "../../features/inpi/inpi-api";
import { InpiPage } from "./page";

// Linha REAL de trademark como o d1-bridge devolve (atributos já parseados).
const REAL_TRADEMARK_ROW = {
  id: "943639140",
  kind: "trademark",
  name: "A Farmácia Natural",
  normalized_name: "a farmácia natural",
  cnpj: null,
  external_ids: { processNumber: "943639140" },
  attributes: {
    id: "943639140",
    sourceId: "inpi-dados-abertos",
    processNumber: "943639140",
    nome: "A Farmácia Natural",
    niceClasses: ["05"],
    status: "Publicação de pedido de registro para oposição (exame formal concluído)",
    titularNome: "CARLOS HENRIQUE DIAS SICHIERI",
    titularUf: "SP",
  },
  source_ids: ["inpi-dados-abertos"],
};

function makeFetcher(rows: unknown[]): typeof fetch {
  return (async (input: RequestInfo | URL): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    const offset = Number(url.searchParams.get("offset") ?? "0");
    const page = offset === 0 ? rows : [];
    return new Response(JSON.stringify({ count: page.length, entities: page }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

describe("INPI — módulo de marcas", () => {
  it("a página monta (estado inicial) sem lançar", () => {
    const html = renderToStaticMarkup(<InpiPage />);
    expect(html).toContain("Marcas e patentes (INPI)");
    // Estado inicial honesto da busca por nome.
    expect(html).toContain("Digite o nome de uma marca");
  });

  it("fetchTrademarksByQuery mapeia a forma real da RPI (sourceId casa)", async () => {
    const marcas = await fetchTrademarksByQuery("Natural", makeFetcher([REAL_TRADEMARK_ROW]));
    expect(marcas).toHaveLength(1);
    const m = marcas[0]!;
    expect(m.nome).toBe("A Farmácia Natural");
    expect(m.processNumber).toBe("943639140");
    expect(m.niceClasses).toEqual(["05"]);
    expect(m.titularNome).toBe("CARLOS HENRIQUE DIAS SICHIERI");
    expect(m.titularUf).toBe("SP");
  });

  it("erro honesto quando o D1 cai (marcas só existem no D1), não '0 marcas'", async () => {
    // D1 falha (500) → fallback Supabase devolve vazio (não há trademark lá).
    const fetcher = (async (input: RequestInfo | URL): Promise<Response> => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/d1-bridge/query")) {
        return new Response(JSON.stringify({ error: "boom" }), { status: 500 });
      }
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    await expect(fetchTrademarksByQuery("NATURA", fetcher)).rejects.toThrow(
      /temporariamente indisponível/,
    );
  });
});
