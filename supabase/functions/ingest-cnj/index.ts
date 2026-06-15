// Supabase Edge Function: "ingest-cnj"
// Ingestão de PROCESSOS JUDICIAIS da API Pública do DataJud/CNJ.
//
// Fonte: API Pública do DataJud (CNJ) — chave pública, sem segredo:
//   POST https://api-publica.datajud.cnj.jus.br/api_publica_<alias>/_search
//   Header: Authorization: APIKey cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==
//   Body: Elasticsearch DSL
//
// A chave é PÚBLICA e publicada pelo CNJ na wiki oficial:
//   https://datajud-wiki.cnj.jus.br/api-publica/acesso
// Pode ser trocada pelo CNJ a qualquer momento — se houver 401, atualizar aqui.
//
// Fluxo: para cada tribunal configurado, busca processos atualizados na janela
// de datas (padrão: últimos 2 dias) -> normaliza -> chama RPC public.ingest_cnj
// em lotes de 100. Idempotente: dedup por numeroProcesso via índice único parcial.
//
// Secrets: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetados automaticamente
// pelo Supabase nas Edge Functions.
//
// Parâmetros de query (todos opcionais):
//   ?dias=N              -> janela = [agora - N dias, agora] (default 2)
//   ?tribunais=tjsp,tjdft -> CSV de aliases (default tjsp,tjdft)
//   ?size=N              -> processos por página ES (default 100, máx 10000)
//   ?maxPaginas=N        -> teto de páginas por tribunal (0 = sem teto; default 5)
//
// Deploy: Verify JWT LIGADO (igual ao ingest-pncp). O cron manda Authorization
// com Bearer <anon_key>, idêntico ao padrão do projeto.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Chave PÚBLICA do DataJud — publicada pelo CNJ em:
// https://datajud-wiki.cnj.jus.br/api-publica/acesso
const DATAJUD_API_KEY =
  "cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==";

const DATAJUD_BASE = "https://api-publica.datajud.cnj.jus.br";
const UA = "FonteiaBot/1.0 (+mailto:contato@fontebrasil.online)";

const SOURCE_ID = "cnj-datajud";

// Aliases padrão: TJSP (maior tribunal estadual) + TJDFT (DF)
const DEFAULT_TRIBUNAIS = ["tjsp", "tjdft"];
const DEFAULT_SIZE = 100;
const DEFAULT_MAX_PAGINAS = 5;
const DEFAULT_DIAS = 2;

// Pausa educada entre chamadas (ms)
const RATE_MS = 500;
// Itens por chamada de RPC
const RPC_BATCH = 100;

interface EsHit {
  _id: string;
  _source: Record<string, unknown>;
}

interface EsResponse {
  hits?: {
    total?: { value: number; relation: string };
    hits?: EsHit[];
  };
  error?: unknown;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isoWindowFromDias(dias: number): { gte: string; lte: string } {
  const now = new Date();
  const from = new Date(now.getTime() - Math.max(0, dias) * 86_400_000);
  return {
    gte: from.toISOString(),
    lte: now.toISOString(),
  };
}

function buildSearchBody(
  window: { gte: string; lte: string },
  size: number,
  from: number,
): string {
  return JSON.stringify({
    size,
    from,
    query: {
      range: {
        dataHoraUltimaAtualizacao: {
          gte: window.gte,
          lte: window.lte,
        },
      },
    },
    sort: [{ dataHoraUltimaAtualizacao: { order: "desc" } }],
    // Exclude movimentos from response to keep payloads tractable.
    // Movimentos can be hundreds of entries per process.
    // The raw record stored in the DB will include only _source minus movimentos.
    _source: {
      excludes: ["movimentos"],
    },
  });
}

async function searchTribunal(
  alias: string,
  window: { gte: string; lte: string },
  size: number,
  maxPaginas: number,
): Promise<{ items: Record<string, unknown>[]; seen: number; errors: string[] }> {
  const url = `${DATAJUD_BASE}/api_publica_${alias}/_search`;
  const headers = {
    "Authorization": `APIKey ${DATAJUD_API_KEY}`,
    "Content-Type": "application/json",
    "User-Agent": UA,
  };

  const items: Record<string, unknown>[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  let pagina = 0;

  while (true) {
    const body = buildSearchBody(window, size, pagina * size);

    let res: Response;
    try {
      res = await fetch(url, { method: "POST", headers, body });
    } catch (e) {
      errors.push(`${alias} pág ${pagina + 1}: fetch error — ${String(e)}`);
      break;
    }

    if (res.status === 401) {
      errors.push(
        `${alias}: 401 Unauthorized — a chave pública do DataJud pode ter sido trocada pelo CNJ. ` +
          `Verifique https://datajud-wiki.cnj.jus.br/api-publica/acesso`,
      );
      break;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      errors.push(`${alias} pág ${pagina + 1}: HTTP ${res.status} — ${text.slice(0, 200)}`);
      break;
    }

    let data: EsResponse;
    try {
      data = (await res.json()) as EsResponse;
    } catch (e) {
      errors.push(`${alias} pág ${pagina + 1}: JSON parse error — ${String(e)}`);
      break;
    }

    if (data.error) {
      errors.push(`${alias} pág ${pagina + 1}: ES error — ${JSON.stringify(data.error).slice(0, 300)}`);
      break;
    }

    const hits = data.hits?.hits ?? [];

    for (const hit of hits) {
      const src = hit._source ?? {};
      const numero = (src["numeroProcesso"] as string | undefined) ?? hit._id;
      if (!numero || seen.has(numero)) continue;
      seen.add(numero);
      // Add the ES _id and tribunal alias to the record for traceability
      items.push({ ...src, _esId: hit._id, _tribunalAlias: alias });
    }

    pagina += 1;

    const total = data.hits?.total?.value ?? 0;
    const fetched = pagina * size;

    // Stop if no more results, hit the page cap, or fetched everything
    if (hits.length === 0 || fetched >= total) break;
    if (maxPaginas > 0 && pagina >= maxPaginas) break;

    if (RATE_MS > 0) await sleep(RATE_MS);
  }

  return { items, seen: seen.size, errors };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  const dias = Math.max(1, Number(url.searchParams.get("dias") ?? DEFAULT_DIAS));

  const tribunaisParam = url.searchParams.get("tribunais");
  const tribunais = tribunaisParam
    ? tribunaisParam.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
    : DEFAULT_TRIBUNAIS;

  const size = Math.min(
    10000,
    Math.max(1, Number(url.searchParams.get("size") ?? DEFAULT_SIZE)),
  );
  const maxPaginas = Number(url.searchParams.get("maxPaginas") ?? DEFAULT_MAX_PAGINAS);

  try {
    const collectedAt = new Date().toISOString();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const window = isoWindowFromDias(dias);
    const allItems: Record<string, unknown>[] = [];
    const allErrors: string[] = [];
    const tribunalStats: Record<string, number> = {};

    for (const alias of tribunais) {
      const { items, seen, errors } = await searchTribunal(alias, window, size, maxPaginas);
      allItems.push(...items);
      allErrors.push(...errors);
      tribunalStats[alias] = seen;
      if (RATE_MS > 0) await sleep(RATE_MS);
    }

    // Grava em lotes via RPC (que faz upsert em raw_records + entities + evidence)
    let ingested = 0;
    for (let i = 0; i < allItems.length; i += RPC_BATCH) {
      const batch = allItems.slice(i, i + RPC_BATCH);
      const { data, error } = await supabase.rpc("ingest_cnj", {
        p_payload: { collectedAt, items: batch },
      });
      if (error) throw error;
      ingested += typeof data === "number" ? data : batch.length;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        janela: window,
        dias,
        tribunais,
        tribunalStats,
        coletados: allItems.length,
        ingested,
        errors: allErrors,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
