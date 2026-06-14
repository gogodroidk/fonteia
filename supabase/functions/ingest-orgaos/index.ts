// Supabase Edge Function: "ingest-orgaos"
// Ingestão dos ÓRGÃOS PÚBLICOS — derivados das licitações (PNCP) já no banco.
//
// Diferente das outras ingestões, esta NÃO bate em API externa: ela DERIVA a
// lista de órgãos públicos distintos a partir das entidades `bidding_opportunity`
// (licitações) já presentes em `entities`. Cada licitação traz o órgão contratante
// (razão social + CNPJ + UF) em attributes; aqui agregamos os órgãos únicos e
// chamamos a RPC public.ingest_orgaos em lotes. Espelha 1:1 a ingest-municipios.
//
// Idempotente: id do órgão = CNPJ (14 dígitos) quando houver; senão, "nome:<slug>".
// A RPC faz upsert por (external_ids->>'orgaoKey') where kind='organization'.
//
// Secrets: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetados automaticamente
// pelo Supabase nas Edge Functions — não precisa configurar nada.
//
// Parâmetros de query (todos opcionais):
//   ?uf=SP   -> filtra (nesta função) só os órgãos da UF.
//
// Deploy: Edge Functions -> "ingest-orgaos". Verify JWT LIGADO (o cron/admin
// manda Authorization, igual à ingest-municipios/ingest-politica).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SOURCE_ID = "orgaos-publicos";
// Itens por chamada de RPC (evita payload gigante).
const RPC_BATCH = 500;
// Páginas para ler as licitações (PostgREST corta em 1000 linhas/página).
const READ_PAGE = 1000;
const MAX_READ_PAGES = 50; // até 50.000 licitações

interface BiddingAttributes {
  orgao?: string;
  orgaoCnpj?: string;
  uf?: string;
  ufNome?: string;
}
interface BiddingRow {
  attributes?: BiddingAttributes;
}

interface OrgaoItem {
  id: string;
  sourceId: string;
  cnpj: string;
  nome: string;
  uf: string;
  ufNome: string;
  licitacoesCount: number;
}

/** Mantém só os dígitos de um CNPJ; "" se não restarem 14. */
function normalizeCnpj(value: string | undefined): string {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length === 14 ? digits : "";
}

/** Slug estável do nome do órgão (chave quando não há CNPJ). */
function slugifyOrgao(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const ufFilter = (url.searchParams.get("uf") ?? "").trim().toUpperCase();

  try {
    const collectedAt = new Date().toISOString();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // 1) Lê as licitações (kind=bidding_opportunity), só o campo attributes, paginando.
    const byKey = new Map<string, OrgaoItem>();
    let totalLidas = 0;
    for (let page = 0; page < MAX_READ_PAGES; page++) {
      const offset = page * READ_PAGE;
      const res = await fetch(
        `${supabaseUrl}/rest/v1/entities?kind=eq.bidding_opportunity&select=attributes`,
        {
          headers: {
            apikey: serviceKey,
            authorization: `Bearer ${serviceKey}`,
            accept: "application/json",
            Range: `${offset}-${offset + READ_PAGE - 1}`,
            "Range-Unit": "items",
          },
        },
      );
      if (!res.ok) throw new Error(`Leitura de licitações falhou: ${res.status}`);
      const rows = (await res.json()) as BiddingRow[];
      totalLidas += rows.length;

      for (const row of rows) {
        const a = row.attributes ?? {};
        const cnpj = normalizeCnpj(a.orgaoCnpj);
        const nome = (a.orgao ?? "").trim();
        if (cnpj === "" && nome === "") continue;

        const uf = (a.uf ?? "").trim();
        if (ufFilter && uf.toUpperCase() !== ufFilter) continue;

        const id = cnpj !== "" ? cnpj : `nome:${slugifyOrgao(nome)}`;
        if (id === "nome:") continue;

        const existing = byKey.get(id);
        if (existing) {
          existing.licitacoesCount += 1;
          if (existing.nome === "" && nome !== "") existing.nome = nome;
          if (existing.uf === "" && uf !== "") existing.uf = uf;
          if (existing.ufNome === "" && (a.ufNome ?? "").trim() !== "") {
            existing.ufNome = (a.ufNome ?? "").trim();
          }
          continue;
        }

        byKey.set(id, {
          id,
          sourceId: SOURCE_ID,
          cnpj,
          nome,
          uf,
          ufNome: (a.ufNome ?? "").trim(),
          licitacoesCount: 1,
        });
      }

      if (rows.length < READ_PAGE) break;
    }

    const items = Array.from(byKey.values());

    // 2) Grava em lotes via a RPC.
    let ingested = 0;
    for (let i = 0; i < items.length; i += RPC_BATCH) {
      const batch = items.slice(i, i + RPC_BATCH);
      const { data, error } = await supabase.rpc("ingest_orgaos", {
        p_payload: { collectedAt, items: batch },
      });
      if (error) throw error;
      ingested += typeof data === "number" ? data : batch.length;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        uf: ufFilter || null,
        licitacoesLidas: totalLidas,
        orgaosDistintos: items.length,
        ingested,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
