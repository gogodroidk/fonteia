/**
 * Reprodução do bug "Processos" (Jurídico): os dados reais do CNJ DataJud trazem
 * `classe` e `orgaoJulgador` como OBJETOS ({nome, codigo}), não strings. O card
 * renderizava `{attributes.classe}` direto no JSX → "Objects are not valid as a
 * React child" → ErrorBoundary. Este teste fixa a forma real e garante que o
 * mapeamento normaliza para string (sem quebrar a tela).
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { assuntoPrincipal, listProcessos } from "../../features/juridico/juridico-api";
import { ProcessoCardForTest } from "./page";

// Forma REAL de uma linha legal_process no D1 (classe/orgaoJulgador = objeto).
const REAL_PROCESS_ROW = {
  id: "a6adc5f5-8b1a-4d54-932b-bcf4af74d97b",
  kind: "legal_process",
  name: "Abertura, Registro e Cumprimento de Testamento — TJSP/G1 (10017393620248260394)",
  normalized_name: "abertura tjsp",
  cnpj: null,
  external_ids: { numeroProcesso: "10017393620248260394" },
  attributes: {
    grau: "G1",
    classe: { nome: "Abertura, Registro e Cumprimento de Testamento", codigo: 51 },
    tribunal: "TJSP",
    orgaoJulgador: { nome: "02 CUMULATIVA DE NOVA ODESSA", codigo: 16912, codigoMunicipioIBGE: null },
    assuntos: [{ nome: "Inventário e Partilha", codigo: 7687 }],
    dataAjuizamento: "20240630095315",
  },
  source_ids: ["cnj-datajud"],
};

// Devolve `rows` na 1ª página (offset=0) e vazio nas seguintes — assim a
// paginação de `fetchAllD1Entities` termina (ela para quando uma página vem vazia).
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

describe("Jurídico — Processos (forma real do CNJ DataJud)", () => {
  it("normaliza classe/órgão (objeto) e numeroProcesso a partir de external_ids", async () => {
    const result = await listProcessos(makeFetcher([REAL_PROCESS_ROW]));
    expect(result.processos).toHaveLength(1);
    const p = result.processos[0]!;
    expect(p.numeroProcesso).toBe("10017393620248260394");
    // classe normalizada para string legível (não objeto cru)
    expect(typeof p.attributes.classe).toBe("string");
    expect(p.attributes.classe).toBe("Abertura, Registro e Cumprimento de Testamento");
    expect(typeof p.attributes.orgaoJulgador).toBe("string");
    expect(assuntoPrincipal(p.attributes)).toBe("Inventário e Partilha");
  });

  it("renderiza o card SEM lançar (classe objeto não pode ir cru pro JSX)", async () => {
    const { processos } = await listProcessos(makeFetcher([REAL_PROCESS_ROW]));
    const p = processos[0]!;
    // Antes do fix isto lançava "Objects are not valid as a React child".
    const html = renderToStaticMarkup(<ProcessoCardForTest processo={p} />);
    expect(html).toContain("Abertura, Registro e Cumprimento de Testamento");
    expect(html).toContain("TJSP");
    expect(html).toContain("10017393620248260394");
  });

  it("erro honesto quando o D1 cai (origem Supabase + vazio), não '0 resultados'", async () => {
    // Fetcher que faz a rota D1 (path /d1-bridge/query) FALHAR (500) e a rota
    // Supabase REST (/rest/v1/) devolver vazio — exatamente o cenário "D1 fora,
    // processos não existem no Supabase".
    const fetcher = (async (input: RequestInfo | URL): Promise<Response> => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/d1-bridge/query")) {
        return new Response(JSON.stringify({ error: "boom" }), { status: 500 });
      }
      // Supabase REST fallback → lista vazia (kind não existe lá).
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    await expect(listProcessos(fetcher)).rejects.toThrow(/temporariamente indisponível/);
  });
});
