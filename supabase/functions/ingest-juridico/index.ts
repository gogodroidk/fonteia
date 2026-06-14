// Supabase Edge Function: "ingest-juridico"
// Ingestão de PROPOSIÇÕES (projetos de lei / legislação em tramitação) —
// Câmara dos Deputados, Dados Abertos.
//
// Fonte: API pública da Câmara (sem auth, sem chave):
//   GET https://dadosabertos.camara.leg.br/api/v2/proposicoes
//       ?ano={ano}&ordem=DESC&ordenarPor=id&itens=100
//   Resposta: envelope { dados, links } com paginação HATEOAS (rel="next").
//   Cada item: { id, siglaTipo (ex PL/PEC), numero, ano, ementa }.
//
// Fluxo: para cada ano configurado, segue o link `next` acumulando itens ->
// normaliza cada proposição -> chama a RPC public.ingest_juridico em lotes.
// Espelha 1:1 a ingest-municipios.
//
// Idempotente: id = id da proposição na Câmara (perene), então rodar de novo
// não duplica (a RPC faz upsert por id via índice único parcial).
//
// Secrets: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetados automaticamente
// pelo Supabase nas Edge Functions — não precisa configurar nada.
//
// Parâmetros de query (todos opcionais):
//   ?anos=2025,2026   -> anos a coletar (default: 2025,2026).
//   ?maxPaginas=40    -> teto de páginas POR ANO (default 40 → ~4.000/ano).
//
// Deploy: Verify JWT LIGADO (o invocador manda Authorization, igual às outras).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const BASE = "https://dadosabertos.camara.leg.br/api/v2";
const PORTAL = "https://www.camara.leg.br/busca-portal";
const UA = "FonteiaBot/1.0 (+mailto:contato@fontebrasil.online)";
const HEADERS = { accept: "application/json", "user-agent": UA };
const SOURCE_ID = "camara-dados-abertos";

// Itens por chamada de RPC (evita payload gigante).
const RPC_BATCH = 500;
// Anos coletados por padrão (proposições recentes).
const DEFAULT_ANOS = [2025, 2026];
// Teto de páginas POR ANO (segurança contra loop; ~100 itens/página).
const DEFAULT_MAX_PAGINAS = 40;

interface RawProposicao {
  id: number;
  siglaTipo?: string;
  numero?: number;
  ano?: number;
  ementa?: string;
  [key: string]: unknown;
}

interface Link {
  rel: string;
  href: string;
}

interface Envelope {
  dados: RawProposicao[];
  links: Link[];
}

function normalize(raw: RawProposicao): Record<string, unknown> {
  const tipo = (raw.siglaTipo ?? "").trim();
  const numero = Number(raw.numero);
  const ano = Number(raw.ano);
  return {
    id: String(raw.id),
    sourceId: SOURCE_ID,
    tipo,
    numero,
    ano,
    titulo: `${tipo} ${numero}/${ano}`.trim(),
    ementa: (raw.ementa ?? "").trim(),
    raw,
  };
}

async function getJson(url: string): Promise<Envelope> {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${res.status} em ${url}`);
  return (await res.json()) as Envelope;
}

function nextLink(links: Link[] | undefined): string | null {
  const next = (links ?? []).find((l) => l.rel === "next");
  return next?.href ?? null;
}

function proposicoesUrl(ano: number): string {
  const search = new URLSearchParams({
    ano: String(ano),
    ordem: "DESC",
    ordenarPor: "id",
    itens: "100",
  });
  return `${BASE}/proposicoes?${search.toString()}`;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const anosParam = (url.searchParams.get("anos") ?? "").trim();
  const anos = anosParam
    ? anosParam.split(",").map((a) => Number(a.trim())).filter((n) => Number.isFinite(n))
    : DEFAULT_ANOS;
  const maxPaginas = Number(url.searchParams.get("maxPaginas") ?? DEFAULT_MAX_PAGINAS) ||
    DEFAULT_MAX_PAGINAS;

  try {
    const collectedAt = new Date().toISOString();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const seen = new Set<string>(); // dedup por id da proposição (entre anos/páginas)
    const items: Array<Record<string, unknown>> = [];

    for (const ano of anos) {
      let pageUrl: string | null = proposicoesUrl(ano);
      let paginas = 0;
      while (pageUrl) {
        const page = await getJson(pageUrl);
        for (const p of page.dados ?? []) {
          if (p?.id === undefined || p?.id === null) continue;
          const item = normalize(p);
          const id = item.id as string;
          if (seen.has(id)) continue;
          seen.add(id);
          items.push(item);
        }
        paginas += 1;
        if (paginas >= maxPaginas) break;
        if ((page.dados ?? []).length === 0) break;
        pageUrl = nextLink(page.links);
      }
    }

    // Grava em lotes via a RPC.
    let ingested = 0;
    for (let i = 0; i < items.length; i += RPC_BATCH) {
      const batch = items.slice(i, i + RPC_BATCH);
      const { data, error } = await supabase.rpc("ingest_juridico", {
        p_payload: { collectedAt, items: batch },
      });
      if (error) throw error;
      ingested += typeof data === "number" ? data : batch.length;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        fonte: PORTAL,
        anos,
        coletados: items.length,
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
