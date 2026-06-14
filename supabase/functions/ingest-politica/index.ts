// Supabase Edge Function: "ingest-politica"
// Ingestão de DEPUTADOS FEDERAIS em exercício — Câmara dos Deputados (Dados Abertos).
//
// Fonte: API pública de Dados Abertos da Câmara (sem auth, sem chave):
//   GET https://dadosabertos.camara.leg.br/api/v2/deputados
//       ?ordem=ASC&ordenarPor=nome[&pagina=N][&itens=N]
//
// Fluxo: varre todas as páginas seguindo o link HATEOAS rel="next" -> normaliza
// cada deputado -> chama a RPC public.ingest_politica em lotes. Espelha 1:1 a
// ingest-pncp.
//
// Idempotente: id = id do deputado na Câmara (perene), então rodar de novo não
// duplica (a RPC faz upsert por (external_ids->>'camaraId') where kind='politician').
//
// Secrets: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetados automaticamente
// pelo Supabase nas Edge Functions — não precisa configurar nada.
//
// Parâmetros de query (todos opcionais):
//   ?itens=N        -> itens por página da Câmara (default: deixa a API decidir)
//   ?maxPaginas=N   -> teto de páginas (0 = todas; default 0)
//
// Deploy: Edge Functions -> "ingest-politica". Verify JWT pode ficar LIGADO
// (o cron/admin manda Authorization, igual às outras).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const BASE = "https://dadosabertos.camara.leg.br/api/v2";
const UA = "FonteiaBot/1.0 (+mailto:contato@fontebrasil.online)";
const HEADERS = { accept: "application/json", "user-agent": UA };
const SOURCE_ID = "camara-dados-abertos";

// Itens por chamada de RPC (evita payload gigante).
const RPC_BATCH = 200;
// Pausa educada entre páginas (ms).
const RATE_MS = 250;

interface RawDeputado {
  id: number;
  nome: string;
  siglaPartido?: string;
  siglaUf?: string;
  urlFoto?: string;
  email?: string;
}
interface CamaraLink {
  rel: string;
  href: string;
}
interface CamaraPage {
  dados?: RawDeputado[];
  links?: CamaraLink[];
}

function deputadosUrl(itens: number | null): string {
  const search = new URLSearchParams({ ordem: "ASC", ordenarPor: "nome" });
  if (itens && itens > 0) search.set("itens", String(itens));
  return `${BASE}/deputados?${search.toString()}`;
}

function nextLink(links: CamaraLink[] | undefined): string | null {
  const next = (links ?? []).find((l) => l.rel === "next");
  return next?.href ?? null;
}

function normalize(raw: RawDeputado): Record<string, unknown> {
  return {
    id: String(raw.id),
    sourceId: SOURCE_ID,
    nome: (raw.nome ?? "").trim(),
    partido: (raw.siglaPartido ?? "").trim(),
    uf: (raw.siglaUf ?? "").trim(),
    foto: (raw.urlFoto ?? "").trim(),
    email: (raw.email ?? "").trim(),
    raw,
  };
}

async function getJson(url: string): Promise<CamaraPage> {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${res.status} em ${url}`);
  return (await res.json()) as CamaraPage;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const itens = Number(url.searchParams.get("itens") ?? "0") || null;
  const maxPaginas = Number(url.searchParams.get("maxPaginas") ?? "0"); // 0 = todas

  try {
    const collectedAt = new Date().toISOString();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const items: Array<Record<string, unknown>> = [];
    const errors: Array<{ pagina: number; error: string }> = [];
    const seen = new Set<string>(); // dedup por id dentro da execução

    let target: string | null = deputadosUrl(itens);
    let pagina = 0;
    while (target) {
      pagina += 1;
      try {
        const page = await getJson(target);
        for (const raw of page.dados ?? []) {
          if (raw?.id == null) continue;
          const id = String(raw.id);
          if (seen.has(id)) continue;
          seen.add(id);
          items.push(normalize(raw));
        }
        if ((page.dados ?? []).length === 0) break;
        target = nextLink(page.links);
      } catch (e) {
        errors.push({ pagina, error: String(e) });
        break;
      }
      if (maxPaginas > 0 && pagina >= maxPaginas) break;
      if (target && RATE_MS > 0) await sleep(RATE_MS);
    }

    // Grava em lotes via a RPC.
    let ingested = 0;
    for (let i = 0; i < items.length; i += RPC_BATCH) {
      const batch = items.slice(i, i + RPC_BATCH);
      const { data, error } = await supabase.rpc("ingest_politica", {
        p_payload: { collectedAt, items: batch },
      });
      if (error) throw error;
      ingested += typeof data === "number" ? data : batch.length;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        paginas: pagina,
        coletados: items.length,
        ingested,
        errors,
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
