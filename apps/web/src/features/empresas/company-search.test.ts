/**
 * company-search.test.ts — testes da busca nome→CNPJ + enriquecimento lazy.
 *
 * Usamos um `fetcher` injetado (o d1-client pula o cache quando o fetcher não é o
 * `fetch` global), respondendo no formato real do d1-bridge: `{ entities: [...] }`.
 */

import { describe, it, expect, vi } from "vitest";
import {
  searchCompaniesByName,
  requestCompanyEnrichment,
  type CompanyHit,
} from "./company-search";

// ─── Helpers de mock ──────────────────────────────────────────────────────────

interface FakeRow {
  id: string;
  kind: string;
  name?: string;
  cnpj?: string | null;
  attributes?: Record<string, unknown>;
}

/** Constrói um fetcher que devolve linhas por kind (lendo o param `kind` da URL). */
function makeFetcher(byKind: Record<string, FakeRow[]>): typeof fetch {
  return (async (input: RequestInfo | URL): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    const kind = url.searchParams.get("kind") ?? "";
    const rows = byKind[kind] ?? [];
    const entities = rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      name: r.name ?? "",
      normalized_name: (r.name ?? "").toLowerCase(),
      cnpj: r.cnpj ?? null,
      external_ids: {},
      attributes: r.attributes ?? {},
      source_ids: [],
    }));
    return new Response(JSON.stringify({ count: entities.length, entities }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

const BB_MATRIZ = "00000000000191";
const BB_FILIAL = "00000000028851"; // mesma raiz 00000000, estabelecimento != 0001

// ─── searchCompaniesByName ─────────────────────────────────────────────────────

describe("searchCompaniesByName", () => {
  it("retorna vazio para termos curtos demais (sem rede)", async () => {
    const fetcher = vi.fn();
    const hits = await searchCompaniesByName("a", fetcher as unknown as typeof fetch);
    expect(hits).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("colapsa matriz + filial pela raiz do CNPJ em um único resultado", async () => {
    const fetcher = makeFetcher({
      company: [
        { id: "1", kind: "company", name: "Banco do Brasil SA", cnpj: BB_MATRIZ, attributes: { uf: "DF" } },
      ],
      public_contract: [
        { id: "2", kind: "public_contract", name: "Banco do Brasil SA", cnpj: BB_FILIAL, attributes: { fornecedorNome: "Banco do Brasil SA" } },
        { id: "3", kind: "public_contract", name: "Banco do Brasil SA", cnpj: BB_MATRIZ, attributes: { fornecedorNome: "Banco do Brasil SA" } },
      ],
    });

    const hits = await searchCompaniesByName("banco do brasil", fetcher);
    // Uma única empresa (raiz 00000000), representada pela matriz (0001).
    expect(hits).toHaveLength(1);
    const hit = hits[0] as CompanyHit;
    expect(hit.cnpj).toBe(BB_MATRIZ);
    expect(hit.isMatriz).toBe(true);
    expect(hit.cnpjFormatado).toBe("00.000.000/0001-91");
    // Sublabel agrega múltiplos estabelecimentos.
    expect(hit.sublabel).toContain("estabelecimentos");
  });

  it("descarta CNPJ-placeholder (todos iguais) e linhas sem nome", async () => {
    const fetcher = makeFetcher({
      company: [
        { id: "1", kind: "company", name: "Empresa Boa", cnpj: "11222333000181", attributes: {} },
        { id: "2", kind: "company", name: "Lixo", cnpj: "00000000000000", attributes: {} },
        { id: "3", kind: "company", name: "", cnpj: "11444777000161", attributes: {} },
      ],
    });
    const hits = await searchCompaniesByName("empresa", fetcher);
    const cnpjs = hits.map((h) => h.cnpj);
    expect(cnpjs).toContain("11222333000181");
    expect(cnpjs).not.toContain("00000000000000");
    // Linha sem nome não vira hit.
    expect(cnpjs).not.toContain("11444777000161");
  });

  it("limpa rótulos de contrato ('CONTRATADA: …') no nome exibido", async () => {
    const fetcher = makeFetcher({
      public_contract: [
        {
          id: "1",
          kind: "public_contract",
          name: "CONTRATADA: ACME LTDA",
          cnpj: "11222333000181",
          attributes: {},
        },
      ],
    });
    const hits = await searchCompaniesByName("acme", fetcher);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.name).toBe("ACME LTDA");
  });

  it("não lança quando um kind falha (degrada para os demais)", async () => {
    const fetcher = (async (input: RequestInfo | URL): Promise<Response> => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      const kind = url.searchParams.get("kind");
      if (kind === "public_contract") {
        // Simula falha de rede + falha do fallback Supabase (resposta inválida).
        return new Response("erro", { status: 500 });
      }
      const entities =
        kind === "company"
          ? [
              {
                id: "1",
                kind: "company",
                name: "Empresa Resiliente",
                normalized_name: "empresa resiliente",
                cnpj: "11222333000181",
                external_ids: {},
                attributes: {},
                source_ids: [],
              },
            ]
          : [];
      return new Response(JSON.stringify({ entities }), { status: 200 });
    }) as unknown as typeof fetch;

    const hits = await searchCompaniesByName("empresa", fetcher);
    expect(hits.some((h) => h.cnpj === "11222333000181")).toBe(true);
  });
});

// ─── requestCompanyEnrichment ──────────────────────────────────────────────────

describe("requestCompanyEnrichment", () => {
  it("retorna false (sem chamar) para CNPJ inválido", async () => {
    const fetcher = vi.fn();
    const ok = await requestCompanyEnrichment("123", fetcher as unknown as typeof fetch);
    expect(ok).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("chama ingest-brasilapi com ?cnpjs= e o header apikey", async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : input.toString();
      const headers = (init?.headers ?? {}) as Record<string, string>;
      calls.push({ url, headers });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch;

    const ok = await requestCompanyEnrichment("11.222.333/0001-81", fetcher);
    expect(ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toContain("/ingest-brasilapi");
    expect(calls[0]?.url).toContain("cnpjs=11222333000181");
    expect(calls[0]?.headers["apikey"]).toBeTruthy();
  });

  it("degrada em silêncio (false) quando a rede falha", async () => {
    const fetcher = (async (): Promise<Response> => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const ok = await requestCompanyEnrichment("11222333000181", fetcher);
    expect(ok).toBe(false);
  });
});
