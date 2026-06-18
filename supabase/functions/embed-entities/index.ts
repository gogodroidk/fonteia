import { fetchWithTimeout } from "../_shared/http.ts";

// Supabase Edge Function: "embed-entities" — gera embeddings das `entities`
// para a busca semântica (pgvector / RPC match_entities).
//
// IDEMPOTENTE: só preenche linhas com embedding IS NULL. Rodar de novo nunca
// reprocessa o que já tem vetor. Use ?kind= e ?limit= para fatiar o backfill.
//
// AUTH: verify_jwt=true (gateway exige JWT válido). Pensado para chamadas
// administrativas / cron com a service role ou um JWT autorizado.
//
// Embeddings GRÁTIS do Google: modelo gemini-embedding-001 com
// outputDimensionality=768 (Matryoshka) p/ casar com a coluna vector(768) e o
// índice HNSW. Endpoint:
//   POST https://generativelanguage.googleapis.com/v1beta/models/<model>:batchEmbedContents
// header x-goog-api-key (mesmo segredo GEMINI_API_KEY que o edge `fonteia` usa).
//
// RATE LIMIT (free tier): ~100 requests/min em embed_content e CADA item de um
// batchEmbedContents conta como 1 request. Por isso cada invocação processa no
// MÁXIMO um lote (<=100 itens) e retorna — o chamador (cron/loop) espaça ~60s
// entre chamadas. Assim nunca estoura a cota dentro de uma única invocação.
//
// Secrets necessários (injetados pelo Supabase, exceto GEMINI_API_KEY):
//   SUPABASE_URL                (injetado)
//   SUPABASE_SERVICE_ROLE_KEY   (injetado) — escreve entities.embedding
//   GEMINI_API_KEY              (você configura) — aistudio.google.com

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, apikey, x-client-info",
  "access-control-max-age": "86400",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS_HEADERS },
  });
}

// Modelo de embedding. Sobrescreva via secret GEMINI_EMBED_MODEL.
// gemini-embedding-001 é o GA atual e aceita outputDimensionality (Matryoshka).
const DEFAULT_EMBED_MODEL = "gemini-embedding-001";
const EMBED_DIM = 768;
// Itens por chamada batchEmbedContents. Cada item conta 1 request na cota free
// (~100/min). Mantemos <=100 e UMA chamada por invocação.
const GEMINI_BATCH = 100;
// Teto de linhas por invocação. Como cada item = 1 request e a cota é ~100/min,
// o default = GEMINI_BATCH (1 chamada/invocação). O chamador espaça ~60s.
const DEFAULT_LIMIT = GEMINI_BATCH;
const MAX_LIMIT = GEMINI_BATCH;
// Gemini limita ~2k tokens por request de embedding; cortamos o texto bem antes.
const MAX_TEXT_CHARS = 1800;

type Json = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v);
}

function reais(cents: unknown): string {
  const n = typeof cents === "number" ? cents : Number(cents);
  if (!Number.isFinite(n)) return "";
  return (n / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Junta partes não vazias, deduplicando espaços, com rótulos legíveis.
function compose(parts: Array<string | null | undefined>): string {
  return parts
    .map((p) => (p == null ? "" : String(p).trim()))
    .filter((p) => p.length > 0)
    .join(". ")
    .replace(/\s+/g, " ")
    .slice(0, MAX_TEXT_CHARS);
}

interface EntityRow {
  id: string;
  kind: string;
  name: string;
  attributes: Json | null;
}

// Monta um texto representativo por kind, a partir de name + attributes.
// Quanto mais "semântico" e específico, melhor a busca por similaridade.
function buildText(row: EntityRow): string {
  const a: Json = row.attributes ?? {};
  const name = str(row.name);

  switch (row.kind) {
    case "auction_lot": {
      // Leilão da Receita: categoria + cidade + órgão + valores + quem pode.
      const valor = reais(a["minimumBidCents"]);
      const aval = reais(a["valorAvaliacaoCents"]);
      const pf = Array.isArray(a["eligiblePersonTypes"]) &&
        (a["eligiblePersonTypes"] as unknown[]).includes("pf");
      return compose([
        `Lote de leilão da Receita Federal: ${name}`,
        a["category"] ? `Categoria ${str(a["category"])}` : null,
        a["city"] ? `Cidade ${str(a["city"])}` : null,
        a["agency"] ? `Órgão ${str(a["agency"])}` : null,
        a["edital"] ? `Edital ${str(a["edital"])}` : null,
        valor ? `Lance mínimo ${valor}` : null,
        aval ? `Valor de avaliação ${aval}` : null,
        `Quem pode dar lance: ${pf ? "pessoa física e jurídica" : "apenas pessoa jurídica"}`,
      ]);
    }

    case "bidding_opportunity": {
      // Licitação (PNCP): objeto + órgão + modalidade + cidade/UF + valor + amparo.
      const valor = reais(a["valorEstimadoCents"]);
      const local = [str(a["municipio"]), str(a["ufNome"]) || str(a["uf"])]
        .filter(Boolean)
        .join("/");
      return compose([
        `Licitação pública: ${str(a["objeto"]) || name}`,
        a["orgao"] ? `Órgão ${str(a["orgao"])}` : null,
        a["unidade"] ? `Unidade ${str(a["unidade"])}` : null,
        a["modalidade"] ? `Modalidade ${str(a["modalidade"])}` : null,
        a["modoDisputa"] ? `Modo de disputa ${str(a["modoDisputa"])}` : null,
        local ? `Local ${local}` : null,
        valor ? `Valor estimado ${valor}` : null,
        a["amparoLegal"] ? `Amparo legal ${str(a["amparoLegal"])}` : null,
        a["situacao"] ? `Situação ${str(a["situacao"])}` : null,
      ]);
    }

    case "municipality": {
      // Município (IBGE): nome + UF + região + meso/microrregião.
      return compose([
        `Município de ${str(a["nome"]) || name}`,
        a["ufNome"] ? `Estado ${str(a["ufNome"])}` : null,
        a["uf"] ? `UF ${str(a["uf"])}` : null,
        a["regiao"] ? `Região ${str(a["regiao"])}` : null,
        a["mesorregiao"] ? `Mesorregião ${str(a["mesorregiao"])}` : null,
        a["microrregiao"] ? `Microrregião ${str(a["microrregiao"])}` : null,
      ]);
    }

    case "politician": {
      // Deputado (Câmara): nome + partido + UF.
      return compose([
        `Político: ${str(a["nome"]) || name}`,
        a["partido"] ? `Partido ${str(a["partido"])}` : null,
        a["uf"] ? `Estado ${str(a["uf"])}` : null,
        a["email"] ? `Contato ${str(a["email"])}` : null,
      ]);
    }

    case "organization": {
      // Órgão público: razão social + UF + CNPJ.
      return compose([
        `Órgão / entidade pública: ${str(a["nome"]) || name}`,
        a["ufNome"] ? `Estado ${str(a["ufNome"])}` : null,
        a["uf"] ? `UF ${str(a["uf"])}` : null,
        a["cnpj"] ? `CNPJ ${str(a["cnpj"])}` : null,
      ]);
    }

    case "environmental_infraction": {
      // Infração ambiental (IBAMA): infrator + descrição + tipo + município + multa.
      const multa = reais(a["valorMultaCents"]);
      const local = [str(a["municipio"]), str(a["uf"])].filter(Boolean).join("/");
      return compose([
        `Infração ambiental do IBAMA. Infrator: ${str(a["infrator"]) || name}`,
        a["tipoInfracao"] ? `Tipo ${str(a["tipoInfracao"])}` : null,
        a["descricao"] ? `Descrição ${str(a["descricao"])}` : null,
        local ? `Local ${local}` : null,
        multa ? `Valor da multa ${multa}` : null,
      ]);
    }

    case "legal_proposition": {
      // Proposição legislativa (Câmara): título + tipo + ementa.
      return compose([
        `Proposição legislativa: ${str(a["titulo"]) || name}`,
        a["tipo"] ? `Tipo ${str(a["tipo"])}` : null,
        a["ementa"] ? `Ementa ${str(a["ementa"])}` : null,
      ]);
    }

    default: {
      // Fallback genérico: name + um resumo curto dos atributos textuais.
      const extra = Object.entries(a)
        .filter(([k, v]) => typeof v === "string" && v.length > 0 && k !== "raw")
        .slice(0, 6)
        .map(([k, v]) => `${k} ${String(v)}`)
        .join(". ");
      return compose([`${row.kind}: ${name}`, extra]);
    }
  }
}

interface GeminiBatchResponse {
  embeddings?: Array<{ values?: number[] }>;
  error?: { message?: string; status?: string };
}

// Chama batchEmbedContents para UM modelo específico. Devolve os vetores na
// mesma ordem dos textos, ou lança com a mensagem de erro da API.
async function embedBatchWithModel(
  model: string,
  apiKey: string,
  texts: string[],
): Promise<number[][]> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents`;
  const body = {
    requests: texts.map((t) => ({
      model: `models/${model}`,
      content: { parts: [{ text: t }] },
      // taskType melhora a qualidade p/ indexação de documentos.
      taskType: "RETRIEVAL_DOCUMENT",
      // Matryoshka: corta o vetor p/ 768 dims (casa com vector(768) + HNSW).
      outputDimensionality: EMBED_DIM,
    })),
  };
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
  }, 30000);
  const data = (await res.json()) as GeminiBatchResponse;
  if (!res.ok || data.error) {
    throw new Error(`${model} -> ${res.status}: ${data.error?.message ?? "erro"}`);
  }
  const out = (data.embeddings ?? []).map((e) => e.values ?? []);
  if (out.length !== texts.length) {
    throw new Error(`${model}: retornou ${out.length} vetores para ${texts.length} textos`);
  }
  for (const v of out) {
    if (v.length !== EMBED_DIM) {
      throw new Error(`${model}: dimensão inesperada ${v.length} (esperado ${EMBED_DIM})`);
    }
  }
  return out;
}

// Formata um array de floats no literal aceito pelo pgvector: "[0.1,0.2,...]".
function toVectorLiteral(values: number[]): string {
  if (!values.every((n) => Number.isFinite(n))) {
    throw new Error("embedding inválido: componente não-finito");
  }
  return `[${values.join(",")}]`;
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!supabaseUrl || !serviceKey) {
    return json({ error: "config_ausente", message: "SUPABASE_URL/SERVICE_ROLE_KEY ausentes." }, 500);
  }
  if (!apiKey) {
    return json(
      { error: "ia_nao_configurada", message: "Configure o secret GEMINI_API_KEY." },
      503,
    );
  }

  const url = new URL(request.url);
  const kind = url.searchParams.get("kind")?.trim() || null;
  const limitRaw = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0
    ? Math.min(Math.floor(limitRaw), MAX_LIMIT)
    : DEFAULT_LIMIT;

  // 1) Seleciona linhas SEM embedding (idempotência), opcionalmente por kind.
  const restBase = `${supabaseUrl}/rest/v1/entities`;
  const params = new URLSearchParams({
    select: "id,kind,name,attributes",
    embedding: "is.null",
    order: "updated_at.desc",
    limit: String(limit),
  });
  if (kind) params.set("kind", `eq.${kind}`);

  let rows: EntityRow[];
  try {
    const res = await fetchWithTimeout(`${restBase}?${params.toString()}`, {
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        accept: "application/json",
      },
    }, 15000);
    if (!res.ok) {
      return json({ error: "select_falhou", detail: await res.text() }, 502);
    }
    rows = (await res.json()) as EntityRow[];
  } catch (e) {
    return json({ error: "select_erro", detail: String(e) }, 502);
  }

  if (rows.length === 0) {
    return json({ ok: true, kind, scanned: 0, embedded: 0, message: "Nada para embedar." });
  }

  // 2) Monta os textos; descarta linhas que não geraram texto útil.
  const items = rows
    .map((r) => ({ id: r.id, text: buildText(r) }))
    .filter((it) => it.text.length > 0);

  let embedded = 0;
  const errors: string[] = [];
  const model = (Deno.env.get("GEMINI_EMBED_MODEL") ?? "").trim() || DEFAULT_EMBED_MODEL;

  // 3) UMA chamada de embedding por invocação (respeita a cota free de ~100/min).
  //    O cap MAX_LIMIT garante que `items` já tem no máximo GEMINI_BATCH itens.
  if (items.length > 0) {
    let vectors: number[][];
    try {
      vectors = await embedBatchWithModel(model, apiKey, items.map((s) => s.text));
    } catch (e) {
      // 429/erro: NÃO falha em silêncio — devolve p/ o chamador esperar e repetir.
      const msg = String(e);
      const isRateLimit = msg.includes("429");
      return json(
        {
          ok: false,
          kind,
          model,
          dim: EMBED_DIM,
          scanned: rows.length,
          embedded: 0,
          rate_limited: isRateLimit,
          retry_after_seconds: isRateLimit ? 60 : undefined,
          errors: [msg],
        },
        isRateLimit ? 429 : 502,
      );
    }

    // UPDATE por linha (PATCH PostgREST). Mantém idempotência: filtra embedding=is.null.
    const updates: Promise<number>[] = items.map((s, idx) => {
      const patchParams = new URLSearchParams({ id: `eq.${s.id}`, embedding: "is.null" });
      return fetchWithTimeout(`${restBase}?${patchParams.toString()}`, {
        method: "PATCH",
        headers: {
          apikey: serviceKey,
          authorization: `Bearer ${serviceKey}`,
          "content-type": "application/json",
          prefer: "return=minimal",
        },
        body: JSON.stringify({ embedding: toVectorLiteral(vectors[idx]) }),
      }, 15000).then(async (r) => {
        if (r.ok) return 1;
        errors.push(`update ${s.id} -> ${r.status}: ${(await r.text().catch(() => "")).slice(0, 120)}`);
        return 0;
      }).catch((e) => {
        errors.push(`update ${s.id} -> ${String(e)}`);
        return 0;
      });
    });

    const results = await Promise.all(updates);
    embedded += results.reduce((n: number, v: number) => n + v, 0);
  }

  return json({
    ok: errors.length === 0,
    kind,
    model,
    dim: EMBED_DIM,
    scanned: rows.length,
    embedded,
    // Se encheu o lote, provavelmente há mais — o chamador deve repetir (após ~60s).
    more: rows.length >= limit,
    errors: errors.length > 0 ? errors : undefined,
  });
});
