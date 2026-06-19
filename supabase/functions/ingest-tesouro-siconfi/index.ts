// Supabase Edge Function: "ingest-tesouro-siconfi"
// Ingestão de dados fiscais/contábeis do Tesouro Nacional — API Siconfi (ORDS).
//
// Fontes:
//   - Entes cadastrados: GET /tt/entes
//   - DCA (Demonstrativo Contábil Anual): GET /tt/dca
//     Parâmetros obrigatórios: id_ente, an_exercicio
//     Parâmetros do relatório: in_periodicidade=A, nr_periodo=1 (anual)
//
// Estratégia de cursor — dois níveis:
//   1. O cursor externo percorre o índice de entes via offset na /tt/entes
//      (ORDS nativo: ?limit=N&offset=O).
//   2. Para cada ente do lote, busca os dados DCA do exercício escolhido.
//      O DCA pode ter muitas linhas; paginamos com offset interno também.
//
// Cada ente vira um único registro consolidado em `kind = "fiscal_report"`.
// As linhas de conta DCA são armazenadas compactadas em `attributes.dca`.
//
// Idempotência: chave natural = (cod_ibge, exercicio, "dca"). A RPC faz
// upsert por source_id único (sourceId = "siconfi-dca-{cod_ibge}-{exercicio}").
// Rodar duas vezes não duplica dados.
//
// Timeout: Edge Functions têm ~150 s. Processamos no máximo `limit` entes por
// chamada e devolvemos `nextCursor` para a chamada seguinte.
//
// Secrets: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetados pelo Supabase.
//          INGEST_CRON_SECRET é lido de env — sem hardcode.
//
// Parâmetros de query (todos opcionais):
//   ?cursor=<offset>       Offset no índice de entes (padrão 0).
//   ?limit=<n>             Entes a processar nesta chamada (padrão 20, máx 50).
//   ?exercicio=<ano>       Ano fiscal do DCA (padrão: ano corrente - 1).
//   ?esfera=M|E|U          Filtra esfera: M=municipal, E=estadual, U=federal.
//   ?uf=SP                 Filtra por UF (sigla, 2 letras).
//
// Deploy: Supabase Edge Functions com verify_jwt = true (igual às demais
//   ingest-*). O cron invoca com Authorization: Bearer <ANON_KEY> — o gateway
//   valida o JWT. O segredo OPCIONAL de defense-in-depth (INGEST_CRON_SECRET)
//   viaja em header próprio (x-ingest-cron-secret), NUNCA no Authorization.
//
// Invocação manual (curl):
//   curl -X GET \
//     "https://<project>.supabase.co/functions/v1/ingest-tesouro-siconfi?exercicio=2023&uf=SP&limit=20" \
//     -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
//     -H "x-ingest-cron-secret: $INGEST_CRON_SECRET"   # opcional, se definido
//
// Retorno JSON:
//   { ok, exercicio, uf, esfera, cursor, limit, processed, errors, nextCursor, sample }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { fetchWithRetry } from "../_shared/http.ts";
import { hasValidCronSecret } from "../_shared/auth.ts";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";

// ── Constantes ───────────────────────────────────────────────────────────────

const SICONFI_BASE = "https://apidatalake.tesouro.gov.br/ords/siconfi/tt";
const PORTAL = "https://siconfi.tesouro.gov.br";
const UA = "FonteiaBot/1.0 (+mailto:contato@fontebrasil.online)";
const HEADERS = { accept: "application/json", "user-agent": UA };

const DEFAULT_ENTES_LIMIT = 20;
const MAX_ENTES_LIMIT = 50;
const DCA_PAGE_SIZE = 500; // linhas de conta por página DCA
const RPC_BATCH = 500; // upserts por chamada de RPC

// ── Tipos da API Siconfi ──────────────────────────────────────────────────────

interface SiconfiEnvelope<T> {
  items: T[];
  hasMore: boolean;
  limit: number;
  offset: number;
  count: number;
}

interface EnteRaw {
  cod_ibge: number;
  ente: string;
  capital: string;
  regiao: string;
  uf: string;
  esfera: string;
  exercicio: number;
  populacao: number;
  cnpj: string;
}

interface DcaRowRaw {
  exercicio: number;
  instituicao: string;
  cod_ibge: number;
  uf: string;
  anexo: string;
  rotulo: string;
  coluna: string;
  cod_conta: string;
  conta: string;
  valor: number | null;
  populacao: number;
}

// ── Tipo normalizado que vai para a RPC ───────────────────────────────────────

interface FiscalReportEntity {
  id: string;
  sourceId: string;
  kind: "fiscal_report";
  name: string;
  cnpj: string;
  codigoIbge: string;
  uf: string;
  esfera: string;
  regiao: string;
  exercicio: number;
  populacao: number;
  dcaLinhas: DcaLinha[];
  sourceUrl: string;
  collectedAt: string;
}

interface DcaLinha {
  anexo: string;
  coluna: string;
  codConta: string;
  conta: string;
  valor: number | null;
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetchWithRetry(url, {
    timeoutMs: 20000,
    retries: 3,
    backoffMs: 1000,
    init: { headers: HEADERS },
  });
  if (!res.ok) {
    throw new Error(`Siconfi respondeu ${res.status} em ${url}`);
  }
  return (await res.json()) as T;
}

/** Busca a página de entes (paginação ORDS). */
async function fetchEntes(
  limit: number,
  offset: number,
  esfera?: string,
  uf?: string,
): Promise<SiconfiEnvelope<EnteRaw>> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  if (esfera) params.set("co_tipo_esfera", esfera);
  if (uf) params.set("co_uf", uf);
  const url = `${SICONFI_BASE}/entes?${params}`;
  return fetchJson<SiconfiEnvelope<EnteRaw>>(url);
}

/** Busca TODAS as linhas DCA de um ente/exercício, paginando internamente. */
async function fetchDcaAllPages(
  codIbge: number,
  exercicio: number,
): Promise<DcaRowRaw[]> {
  const all: DcaRowRaw[] = [];
  let offset = 0;
  for (;;) {
    const params = new URLSearchParams({
      id_ente: String(codIbge),
      an_exercicio: String(exercicio),
      in_periodicidade: "A",
      nr_periodo: "1",
      limit: String(DCA_PAGE_SIZE),
      offset: String(offset),
    });
    const url = `${SICONFI_BASE}/dca?${params}`;
    const page = await fetchJson<SiconfiEnvelope<DcaRowRaw>>(url);
    if (page.items.length > 0) {
      all.push(...page.items);
    }
    if (!page.hasMore) break;
    offset += DCA_PAGE_SIZE;
    // Proteção anti-loop infinito: no máximo 20 páginas (~10k linhas por ente)
    if (offset >= DCA_PAGE_SIZE * 20) break;
  }
  return all;
}

// ── Normalização ──────────────────────────────────────────────────────────────

function normalizeEnte(
  ente: EnteRaw,
  dcaLinhas: DcaRowRaw[],
  exercicio: number,
  collectedAt: string,
): FiscalReportEntity {
  const codigoIbge = String(ente.cod_ibge);

  // Chave natural: tipo + cod_ibge + exercicio (imutável, perene)
  const sourceId = `siconfi-dca-${codigoIbge}-${exercicio}`;

  // URL que um analista pode visitar para confirmar a origem
  const sourceUrl = `${SICONFI_BASE}/dca?id_ente=${ente.cod_ibge}&an_exercicio=${exercicio}&in_periodicidade=A&nr_periodo=1`;

  const linhas: DcaLinha[] = dcaLinhas.map((row) => ({
    anexo: (row.anexo ?? "").trim(),
    coluna: (row.coluna ?? "").trim(),
    codConta: (row.cod_conta ?? "").trim(),
    conta: (row.conta ?? "").trim(),
    valor: typeof row.valor === "number" ? row.valor : null,
  }));

  return {
    id: sourceId,
    sourceId,
    kind: "fiscal_report",
    name: (ente.ente ?? "").trim(),
    cnpj: (ente.cnpj ?? "").replace(/\D/g, ""),
    codigoIbge,
    uf: (ente.uf ?? "").trim().toUpperCase(),
    esfera: (ente.esfera ?? "").trim().toUpperCase(),
    regiao: (ente.regiao ?? "").trim().toUpperCase(),
    exercicio,
    populacao: ente.populacao ?? 0,
    dcaLinhas: linhas,
    sourceUrl,
    collectedAt,
  };
}

// ── Handler principal ─────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  // Auth: o gateway já valida o JWT (verify_jwt=true). Se INGEST_CRON_SECRET
  // estiver definido, exige também o header dedicado x-ingest-cron-secret
  // (defense-in-depth que NÃO colide com o JWT do Authorization).
  const cronSecret = Deno.env.get("INGEST_CRON_SECRET");
  if (cronSecret) {
    if (!hasValidCronSecret(req, cronSecret)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, { status: 401 }, req);
    }
  } else {
    console.warn("[ingest-tesouro-siconfi] INGEST_CRON_SECRET não definido — função sem segredo de cron.");
  }

  const qp = new URL(req.url).searchParams;

  // Cursor de offset no índice de entes
  const cursor = Math.max(0, Number(qp.get("cursor") ?? "0") || 0);

  // Quantidade de entes a processar nesta invocação (máx 50 para respeitar timeout)
  const rawLimit = Number(qp.get("limit") ?? "") || DEFAULT_ENTES_LIMIT;
  const limit = Math.min(Math.max(1, rawLimit), MAX_ENTES_LIMIT);

  // Exercício (ano fiscal). Padrão: ano anterior ao corrente.
  const currentYear = new Date().getFullYear();
  const exercicio = Number(qp.get("exercicio") ?? "") || (currentYear - 1);

  // Filtros opcionais
  const esfera = (qp.get("esfera") ?? "").trim().toUpperCase() || undefined;
  const uf = (qp.get("uf") ?? "").trim().toUpperCase() || undefined;

  const collectedAt = new Date().toISOString();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) Busca a página de entes para este cursor
    const entesPage = await fetchEntes(limit, cursor, esfera, uf);

    if (entesPage.items.length === 0) {
      // Cursor além do fim da lista — ingestão concluída
      return jsonResponse({
        ok: true,
        fonte: PORTAL,
        exercicio,
        uf: uf ?? null,
        esfera: esfera ?? null,
        cursor,
        limit,
        processed: 0,
        errors: 0,
        nextCursor: null,
        sample: [],
      }, {}, req);
    }

    // 2) Para cada ente, busca o DCA do exercício (com retry interno)
    const entities: FiscalReportEntity[] = [];
    const errorList: Array<{ cod_ibge: number; ente: string; error: string }> = [];

    for (const ente of entesPage.items) {
      try {
        const dcaRows = await fetchDcaAllPages(ente.cod_ibge, exercicio);
        // Se não há DCA para este ente/exercício, ainda registramos o ente
        // com dcaLinhas vazio — isso documenta que a consulta foi feita.
        const entity = normalizeEnte(ente, dcaRows, exercicio, collectedAt);
        entities.push(entity);
      } catch (err) {
        // Falha parcial: logar e seguir para o próximo ente
        errorList.push({
          cod_ibge: ente.cod_ibge,
          ente: ente.ente ?? "",
          error: String(err),
        });
        console.error(
          `[ingest-tesouro-siconfi] Erro DCA ente=${ente.cod_ibge}:`,
          String(err),
        );
      }
    }

    // 3) Persiste em lotes via RPC (mesma mecânica de ingest-municipios)
    let ingested = 0;
    for (let i = 0; i < entities.length; i += RPC_BATCH) {
      const batch = entities.slice(i, i + RPC_BATCH);
      const { data, error } = await supabase.rpc("ingest_siconfi", {
        p_payload: { collectedAt, items: batch },
      });
      if (error) throw error;
      ingested += typeof data === "number" ? data : batch.length;
    }

    // 4) Calcula próximo cursor
    // Se a API ORDS indicar hasMore=true, há mais entes disponíveis.
    const nextCursor = entesPage.hasMore ? cursor + limit : null;

    // Amostra dos primeiros 3 registros para diagnóstico (sem dcaLinhas completo)
    const sample = entities.slice(0, 3).map((e) => ({
      sourceId: e.sourceId,
      name: e.name,
      codigoIbge: e.codigoIbge,
      uf: e.uf,
      esfera: e.esfera,
      exercicio: e.exercicio,
      dcaLinhasCount: e.dcaLinhas.length,
      sourceUrl: e.sourceUrl,
    }));

    return jsonResponse({
      ok: true,
      fonte: PORTAL,
      exercicio,
      uf: uf ?? null,
      esfera: esfera ?? null,
      cursor,
      limit,
      processed: ingested,
      errors: errorList.length,
      nextCursor,
      errorSample: errorList.slice(0, 5),
      sample,
    }, {}, req);
  } catch (e) {
    // Falha total (ex.: Siconfi fora do ar, Supabase indisponível)
    return jsonResponse(
      { ok: false, fonte: PORTAL, error: String(e) },
      { status: 502 },
      req,
    );
  }
});
