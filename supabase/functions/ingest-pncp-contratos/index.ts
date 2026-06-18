// Supabase Edge Function: "ingest-pncp-contratos"
// Ingestão de CONTRATOS do PNCP — Portal Nacional de Contratações Públicas.
//
// Diferença-chave vs ingest-pncp (que ingere licitações/contratações):
//   Esta função coleta CONTRATOS já celebrados, que trazem o CNPJ do FORNECEDOR
//   (niFornecedor), habilitando "empresa ganhou contrato" (Lead com Motivo)
//   e enriquecendo o Raio-X de empresas.
//
// Fonte: API pública de CONSULTA do PNCP (sem auth, sem chave):
//   GET https://pncp.gov.br/api/consulta/v1/contratos
//       ?dataInicial=AAAAMMDD&dataFinal=AAAAMMDD&pagina={n}&tamanhoPagina=50
//
// Idempotente: dedup por numeroControlePNCP (índice único na migration).
//
// Parâmetros de query (todos opcionais):
//   ?dias=N            -> janela = [hoje - N, hoje]  (default 30)
//   ?dataInicial=...   -> AAAAMMDD (sobrepõe ?dias)
//   ?dataFinal=...     -> AAAAMMDD (default hoje)
//   ?uf=SP             -> filtra por UF (se suportado pela API)
//   ?maxPaginas=N      -> teto de páginas (0 = todas; default 0)
//
// Secrets: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetados
// automaticamente pelo Supabase — não requer configuração extra.
//
// Verify JWT: LIGADO (igual ao ingest-pncp). O cron manda Authorization Bearer.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { fetchWithRetry, sleep } from "../_shared/http.ts";
import { hasValidBearerSecret } from "../_shared/auth.ts";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { extractCnpj } from "../_shared/br.ts";

const BASE  = "https://pncp.gov.br/api/consulta";
const PORTAL = "https://pncp.gov.br";
const UA    = "FonteiaBot/1.0 (+mailto:contato@fontebrasil.online)";
const HEADERS = { accept: "application/json", "user-agent": UA };
const SOURCE_ID = "pncp-contratos";

const MAX_PAGE_SIZE = 50;
const RATE_MS = 400;   // pausa respeitosa entre chamadas
const RPC_BATCH = 150; // itens por lote de RPC

// ---- Interfaces ----------------------------------------------------------------

interface RawOrgao {
  cnpj?: string;
  razaoSocial?: string;
  poderId?: string;
  esferaId?: string;
}

interface RawUnidade {
  ufNome?: string;
  ufSigla?: string;
  municipioNome?: string;
  codigoIbge?: string;
  nomeUnidade?: string;
}

interface RawContrato {
  numeroControlePNCP: string;
  niFornecedor?: string;           // CNPJ ou CPF do fornecedor
  nomeRazaoSocialFornecedor?: string;
  tipoPessoa?: string;             // "PJ" | "PF"
  valorGlobal?: number | null;
  valorInicial?: number | null;
  objetoContrato?: string;
  informacaoComplementar?: string | null;
  dataAssinatura?: string | null;
  dataVigenciaInicio?: string | null;
  dataVigenciaFim?: string | null;
  dataPublicacaoPncp?: string;
  situacaoContrato?: { nome?: string; id?: number };
  tipoContrato?: { nome?: string; id?: number };
  modalidadeNome?: string;
  modalidadeId?: number;
  orgaoEntidade?: RawOrgao;
  unidadeOrgao?: RawUnidade;
  linkSistemaOrigem?: string | null;
  numeroContratoEmpenho?: string | null;
  anoContrato?: number;
  processo?: string | null;
}

interface PncpPage {
  data?: RawContrato[];
  totalRegistros?: number;
  totalPaginas?: number;
  numeroPagina?: number;
  paginasRestantes?: number;
  empty?: boolean;
}

// ---- Helpers ------------------------------------------------------------------

function parseDate(value: string | null | undefined): string {
  if (!value) return "";
  const t = value.trim();
  if (t === "") return "";
  if (/[zZ]$/.test(t) || /[+-]\d{2}:\d{2}$/.test(t)) return t;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(t)) return `${t}-03:00`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return `${t}T00:00:00-03:00`;
  return t;
}

function portalUrl(num: string): string {
  // Formato: {cnpjOrgao}-{sequencial}/{ano}  ex: 00394502000144-0001/2024
  const m = /^(\d{14})-(\d+)\/(\d{4})$/.exec(num.trim());
  if (m) {
    const [, cnpj, seq, ano] = m;
    return `${PORTAL}/app/contratos/${cnpj}/${ano}/${Number(seq)}`;
  }
  return `${PORTAL}/app/contratos?q=${encodeURIComponent(num)}`;
}

function ymd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

// ---- Normalização -------------------------------------------------------------

function normalize(raw: RawContrato, collectedAt: string): Record<string, unknown> {
  const orgao   = raw.orgaoEntidade ?? {};
  const unidade = raw.unidadeOrgao ?? {};

  const fornecedorNome  = (raw.nomeRazaoSocialFornecedor ?? "").trim() || "Fornecedor não informado";
  const fornecedorCnpj  = raw.niFornecedor ?? null;
  const cnpj            = extractCnpj(fornecedorCnpj);

  const orgaoNome = (orgao.razaoSocial ?? unidade.nomeUnidade ?? "Órgão não informado").trim();
  const objeto    = (raw.objetoContrato ?? "").trim();

  const sourceUrl =
    raw.linkSistemaOrigem?.trim() || portalUrl(raw.numeroControlePNCP);

  const out: Record<string, unknown> = {
    id:              raw.numeroControlePNCP,
    sourceId:        SOURCE_ID,
    sourceUrl,
    collectedAt,

    fornecedorNome,
    fornecedorCnpj,
    orgao:           orgaoNome,
    orgaoCnpj:       orgao.cnpj ?? null,
    objeto,
    valorGlobal:     raw.valorGlobal ?? null,
    modalidade:      raw.modalidadeNome ?? null,
    modalidadeId:    raw.modalidadeId ?? null,
    dataVigenciaInicio: parseDate(raw.dataVigenciaInicio),
    dataVigenciaFim:    parseDate(raw.dataVigenciaFim),
    dataAssinatura:     parseDate(raw.dataAssinatura),
    dataPublicacaoPncp: parseDate(raw.dataPublicacaoPncp),
    uf:              unidade.ufSigla ?? null,
    ufNome:          unidade.ufNome ?? null,
    municipio:       unidade.municipioNome ?? null,
    codigoIbge:      unidade.codigoIbge ?? null,
    numeroControlePNCP: raw.numeroControlePNCP,
    tipoPessoa:      raw.tipoPessoa ?? null,
    situacaoContrato: raw.situacaoContrato?.nome ?? null,
    tipoContrato:    raw.tipoContrato?.nome ?? null,
    esfera:          orgao.esferaId ?? null,
    poder:           orgao.poderId ?? null,
  };

  if (raw.valorInicial !== undefined && raw.valorInicial !== null) out.valorInicial = raw.valorInicial;
  if (raw.informacaoComplementar) out.informacaoComplementar = raw.informacaoComplementar.trim();
  if (raw.numeroContratoEmpenho)  out.numeroContratoEmpenho  = raw.numeroContratoEmpenho;
  if (raw.anoContrato !== undefined) out.anoContrato = raw.anoContrato;
  if (raw.processo) out.processo = raw.processo;

  out.raw = raw;

  return out;
}

// ---- Fetch paginado ----------------------------------------------------------

function buildUrl(
  dataInicial: string,
  dataFinal: string,
  pagina: number,
  uf: string | null,
): string {
  const p = new URLSearchParams({
    dataInicial,
    dataFinal,
    pagina: String(pagina),
    tamanhoPagina: String(MAX_PAGE_SIZE),
  });
  if (uf) p.set("uf", uf);
  return `${BASE}/v1/contratos?${p.toString()}`;
}

async function getJson(url: string): Promise<PncpPage> {
  const res = await fetchWithRetry(url, {
    timeoutMs: 15000,
    retries: 3,
    backoffMs: 800,
    init: { headers: HEADERS },
  });
  if (res.status === 204 || res.status === 404) return { data: [], totalPaginas: 0, empty: true };
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  return (await res.json()) as PncpPage;
}

// ---- Handler principal -------------------------------------------------------

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  // Defense-in-depth: se INGEST_CRON_SECRET estiver definido, exige Bearer correspondente.
  const cronSecret = Deno.env.get("INGEST_CRON_SECRET");
  if (cronSecret) {
    if (!hasValidBearerSecret(req, cronSecret)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, { status: 401 }, req);
    }
  } else {
    console.warn("[ingest-pncp-contratos] INGEST_CRON_SECRET não definido — função sem segredo de cron.");
  }

  const url = new URL(req.url);

  const dias       = Number(url.searchParams.get("dias") ?? "30");
  const now        = new Date();
  const dataFinal  = url.searchParams.get("dataFinal")   ?? ymd(now);
  const dataInicial = url.searchParams.get("dataInicial") ??
    ymd(new Date(now.getTime() - Math.max(1, dias) * 86_400_000));
  const uf         = url.searchParams.get("uf") ?? null;
  const maxPaginas = Number(url.searchParams.get("maxPaginas") ?? "0"); // 0 = todas

  try {
    const collectedAt = new Date().toISOString();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const items: Array<Record<string, unknown>> = [];
    const errors: Array<{ pagina: number; error: string }> = [];
    const seen = new Set<string>(); // dedup intra-execução por numeroControlePNCP

    let pagina = 1;
    let totalPaginas = 1;

    do {
      const target = buildUrl(dataInicial, dataFinal, pagina, uf);
      try {
        const page = await getJson(target);
        totalPaginas = page.totalPaginas ?? 0;

        for (const raw of page.data ?? []) {
          if (!raw?.numeroControlePNCP || seen.has(raw.numeroControlePNCP)) continue;
          seen.add(raw.numeroControlePNCP);
          items.push(normalize(raw, collectedAt));
        }

        if ((page.data ?? []).length === 0) break;
      } catch (e) {
        errors.push({ pagina, error: String(e) });
        break; // aborta paginação ao primeiro erro
      }

      pagina += 1;
      if (maxPaginas > 0 && pagina > maxPaginas) break;
      if (pagina <= totalPaginas && RATE_MS > 0) await sleep(RATE_MS);
    } while (pagina <= totalPaginas);

    // Persiste em lotes via RPC
    let ingested = 0;
    for (let i = 0; i < items.length; i += RPC_BATCH) {
      const batch = items.slice(i, i + RPC_BATCH);
      const { data, error } = await supabase.rpc("ingest_pncp_contratos", {
        p_payload: { collectedAt, items: batch },
      });
      if (error) throw error;
      ingested += typeof data === "number" ? data : batch.length;
    }

    return jsonResponse({
      ok: true,
      janela: { dataInicial, dataFinal },
      uf: uf ?? null,
      coletadas: items.length,
      ingested,
      errors: errors.length > 0 ? errors : undefined,
    }, {}, req);
  } catch (e) {
    return jsonResponse({ ok: false, error: String(e) }, { status: 500 }, req);
  }
});

