// Supabase Edge Function: "ingest-pncp"
// Ingestão de LICITAÇÕES/CONTRATAÇÕES do PNCP — Portal Nacional de Contratações Públicas.
//
// Fonte: API pública de CONSULTA do PNCP (sem auth, sem chave):
//   GET https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao
//       ?dataInicial=AAAAMMDD&dataFinal=AAAAMMDD
//       &codigoModalidadeContratacao={1..14}&pagina={n}&tamanhoPagina=50
//
// Fluxo: para cada modalidade (default: licitações com disputa — 2..7), varre todas
// as páginas da janela de datas -> normaliza cada contratação -> chama a RPC
// public.ingest_pncp em lotes. Espelha 1:1 a ingest-receita-catalog.
//
// Idempotente: id da licitação = numeroControlePNCP (único e perene no PNCP),
// então rodar de novo na mesma janela não duplica (a RPC faz upsert por id).
//
// Secrets: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetados automaticamente
// pelo Supabase nas Edge Functions — não precisa configurar nada.
//
// Parâmetros de query (todos opcionais):
//   ?dias=N            -> janela = [hoje - N, hoje]  (default 3)
//   ?dataInicial=...   -> AAAAMMDD (sobrepõe ?dias)
//   ?dataFinal=...     -> AAAAMMDD (default hoje)
//   ?modalidades=6,8   -> CSV de códigos (default 2,3,4,5,6,7)
//   ?uf=SP             -> filtra por UF
//   ?maxPaginas=N      -> teto de páginas por modalidade (0 = todas; default 0)
//
// Deploy: Edge Functions -> Create function "ingest-pncp" -> cole este arquivo.
// (Verify JWT pode ficar LIGADO; o cron manda Authorization, igual às outras.)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { fetchWithRetry, sleep } from "../_shared/http.ts";
import { hasValidBearerSecret } from "../_shared/auth.ts";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";

const BASE = "https://pncp.gov.br/api/consulta";
const PORTAL = "https://pncp.gov.br";
const UA = "FonteiaBot/1.0 (+mailto:contato@fontebrasil.online)";
const HEADERS = { accept: "application/json", "user-agent": UA };
const SOURCE_ID = "pncp-contratacoes";

const MAX_PAGE_SIZE = 50;
// Pausa educada entre chamadas (ms).
const RATE_MS = 350;
// Itens por chamada de RPC (evita payload gigante).
const RPC_BATCH = 200;
// Default: licitações com disputa (concorrências, pregões, concurso, diálogo).
const DEFAULT_MODALIDADES = [2, 3, 4, 5, 6, 7];

const MODALIDADES: Record<number, string> = {
  1: "Leilão - Eletrônico",
  2: "Diálogo Competitivo",
  3: "Concurso",
  4: "Concorrência - Eletrônica",
  5: "Concorrência - Presencial",
  6: "Pregão - Eletrônico",
  7: "Pregão - Presencial",
  8: "Dispensa de Licitação",
  9: "Inexigibilidade",
  10: "Manifestação de Interesse",
  11: "Pré-qualificação",
  12: "Credenciamento",
  13: "Leilão - Presencial",
  14: "Inaplicabilidade da Licitação",
};

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
  codigoUnidade?: string;
  nomeUnidade?: string;
}
interface RawContratacao {
  numeroControlePNCP: string;
  numeroCompra?: string;
  anoCompra?: number;
  processo?: string;
  objetoCompra?: string;
  modalidadeId?: number;
  modalidadeNome?: string;
  modoDisputaNome?: string;
  situacaoCompraId?: number;
  situacaoCompraNome?: string;
  tipoInstrumentoConvocatorioNome?: string;
  valorTotalEstimado?: number | null;
  valorTotalHomologado?: number | null;
  srp?: boolean;
  dataPublicacaoPncp?: string;
  dataAberturaProposta?: string | null;
  dataEncerramentoProposta?: string | null;
  orgaoEntidade?: RawOrgao;
  unidadeOrgao?: RawUnidade;
  amparoLegal?: { nome?: string };
  linkSistemaOrigem?: string | null;
}
interface PncpPage {
  data?: RawContratacao[];
  totalRegistros?: number;
  totalPaginas?: number;
  numeroPagina?: number;
  paginasRestantes?: number;
  empty?: boolean;
}

function parseDate(value: string | null | undefined): string {
  if (!value) return "";
  const t = value.trim();
  if (t === "") return "";
  if (/[zZ]$/.test(t) || /[+-]\d{2}:\d{2}$/.test(t)) return t;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(t)) return `${t}-03:00`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return `${t}T00:00:00-03:00`;
  return t;
}

function toCents(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function parseNumeroControle(num: string): { cnpj: string; sequencial: string; ano: string } | null {
  // [0-9A-Z]{14} — suporte a CNPJ alfanumérico (IN RFB 2.229/2026, vigência 01/07/2026)
  const m = /^([0-9A-Z]{14})-\d+-(\d+)\/(\d{4})$/.exec(num.trim().toUpperCase());
  if (!m) return null;
  const cnpj = m[1], seq = m[2], ano = m[3];
  if (!cnpj || !seq || !ano) return null;
  return { cnpj, sequencial: String(Number(seq)), ano };
}

function portalUrl(num: string): string {
  const p = parseNumeroControle(num);
  if (p) return `${PORTAL}/app/editais/${p.cnpj}/${p.ano}/${p.sequencial}`;
  return `${PORTAL}/app/editais?q=${encodeURIComponent(num)}`;
}

function ymd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function normalize(raw: RawContratacao, collectedAt: string): Record<string, unknown> {
  const orgao = raw.orgaoEntidade ?? {};
  const unidade = raw.unidadeOrgao ?? {};
  const modalidade =
    raw.modalidadeNome ??
    (raw.modalidadeId !== undefined ? MODALIDADES[raw.modalidadeId] ?? `Modalidade ${raw.modalidadeId}` : "Não informado");
  const sourceUrl =
    raw.linkSistemaOrigem && raw.linkSistemaOrigem.trim() !== ""
      ? raw.linkSistemaOrigem.trim()
      : portalUrl(raw.numeroControlePNCP);

  const out: Record<string, unknown> = {
    id: raw.numeroControlePNCP,
    sourceId: SOURCE_ID,
    numeroControlePNCP: raw.numeroControlePNCP,
    objeto: (raw.objetoCompra ?? "").trim(),
    orgao: (orgao.razaoSocial ?? unidade.nomeUnidade ?? "Órgão não informado").trim(),
    modalidade,
    valorEstimadoCents: toCents(raw.valorTotalEstimado),
    dataPublicacao: parseDate(raw.dataPublicacaoPncp),
    dataAbertura: parseDate(raw.dataAberturaProposta),
    dataEncerramento: parseDate(raw.dataEncerramentoProposta),
    sourceUrl,
    collectedAt,
    raw,
  };
  if (raw.numeroCompra) out.numeroCompra = raw.numeroCompra;
  if (raw.anoCompra !== undefined) out.anoCompra = raw.anoCompra;
  if (raw.processo) out.processo = raw.processo;
  if (orgao.cnpj) out.orgaoCnpj = orgao.cnpj;
  if (unidade.nomeUnidade) out.unidade = unidade.nomeUnidade.trim();
  if (unidade.ufSigla) out.uf = unidade.ufSigla;
  if (unidade.ufNome) out.ufNome = unidade.ufNome;
  if (unidade.municipioNome) out.municipio = unidade.municipioNome;
  if (unidade.codigoIbge) out.codigoIbge = unidade.codigoIbge;
  if (orgao.esferaId) out.esfera = orgao.esferaId;
  if (orgao.poderId) out.poder = orgao.poderId;
  if (raw.modalidadeId !== undefined) out.modalidadeId = raw.modalidadeId;
  if (raw.modoDisputaNome) out.modoDisputa = raw.modoDisputaNome;
  if (raw.situacaoCompraId !== undefined) out.situacaoId = raw.situacaoCompraId;
  if (raw.situacaoCompraNome) out.situacao = raw.situacaoCompraNome;
  if (raw.tipoInstrumentoConvocatorioNome) out.instrumento = raw.tipoInstrumentoConvocatorioNome;
  if (raw.valorTotalHomologado !== undefined && raw.valorTotalHomologado !== null) {
    out.valorHomologadoCents = toCents(raw.valorTotalHomologado);
  }
  if (raw.srp !== undefined) out.srp = raw.srp;
  if (raw.amparoLegal?.nome) out.amparoLegal = raw.amparoLegal.nome;
  return out;
}

function buildUrl(
  dataInicial: string,
  dataFinal: string,
  modalidade: number,
  pagina: number,
  uf: string | null,
): string {
  const search = new URLSearchParams({
    dataInicial,
    dataFinal,
    codigoModalidadeContratacao: String(modalidade),
    pagina: String(pagina),
    tamanhoPagina: String(MAX_PAGE_SIZE),
  });
  if (uf) search.set("uf", uf);
  return `${BASE}/v1/contratacoes/publicacao?${search.toString()}`;
}

async function getJson(url: string): Promise<PncpPage> {
  const res = await fetchWithRetry(url, {
    timeoutMs: 15000,
    retries: 3,
    backoffMs: 800,
    init: { headers: HEADERS },
  });
  if (res.status === 204) return { data: [], totalPaginas: 0, empty: true };
  if (!res.ok) throw new Error(`${res.status} em ${url}`);
  return (await res.json()) as PncpPage;
}

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
    console.warn("[ingest-pncp] INGEST_CRON_SECRET não definido — função sem segredo de cron.");
  }

  const url = new URL(req.url);

  // Janela de datas.
  const dias = Number(url.searchParams.get("dias") ?? "3");
  const now = new Date();
  const dataFinal = url.searchParams.get("dataFinal") ?? ymd(now);
  const dataInicial =
    url.searchParams.get("dataInicial") ??
    ymd(new Date(now.getTime() - Math.max(0, dias) * 86_400_000));

  // Modalidades.
  const modParam = url.searchParams.get("modalidades");
  const modalidades = modParam
    ? modParam
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= 14)
    : DEFAULT_MODALIDADES;

  const uf = url.searchParams.get("uf");
  const maxPaginas = Number(url.searchParams.get("maxPaginas") ?? "0"); // 0 = todas

  try {
    const collectedAt = new Date().toISOString();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const items: Array<Record<string, unknown>> = [];
    const errors: Array<{ modalidade: number; pagina: number; error: string }> = [];
    const seen = new Set<string>(); // dedup por numeroControlePNCP dentro da execução

    for (const modalidade of modalidades) {
      let pagina = 1;
      let totalPaginas = 1;
      do {
        const target = buildUrl(dataInicial, dataFinal, modalidade, pagina, uf);
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
          errors.push({ modalidade, pagina, error: String(e) });
          break; // não insiste numa modalidade que falhou
        }
        pagina += 1;
        if (maxPaginas > 0 && pagina > maxPaginas) break;
        if (pagina <= totalPaginas && RATE_MS > 0) await sleep(RATE_MS);
      } while (pagina <= totalPaginas);
      if (RATE_MS > 0) await sleep(RATE_MS);
    }

    // Grava em lotes via a RPC.
    let ingested = 0;
    for (let i = 0; i < items.length; i += RPC_BATCH) {
      const batch = items.slice(i, i + RPC_BATCH);
      const { data, error } = await supabase.rpc("ingest_pncp", {
        p_payload: { collectedAt, items: batch },
      });
      if (error) throw error;
      ingested += typeof data === "number" ? data : batch.length;
    }

    return jsonResponse({
      ok: true,
      janela: { dataInicial, dataFinal },
      modalidades,
      uf: uf ?? null,
      coletadas: items.length,
      ingested,
      errors,
    }, {}, req);
  } catch (e) {
    return jsonResponse({ ok: false, error: String(e) }, { status: 500 }, req);
  }
});
