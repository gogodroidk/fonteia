// Módulo INPI — Propriedade Industrial (marcas / patentes).
//
// REALIDADE DA FONTE (honesta, junho/2026):
// O INPI NÃO oferece uma API REST pública de busca de marcas por CNPJ. A fonte
// gratuita oficial é a RPI — Revista da Propriedade Industrial — em XML, semanal
// (https://revistas.inpi.gov.br/rpi/, arquivo RM<n>.zip por edição). É um boletim
// das movimentações da semana. A Edge Function "ingest-inpi" faz streaming dessa
// RPI, normaliza para kind='trademark' e grava em `entities` (espelhada no D1),
// então AQUI lemos as marcas já ingeridas via fetchD1Entities / fetchAllD1Entities.
//
// LIMITAÇÃO REAL da fonte: o XML da RPI NÃO traz CPF/CNPJ estruturado do titular
// (só razão social, país e UF). A ingestão extrai o CNPJ best-effort quando ele
// vem embutido no nome (caso comum de MEI/EI). Por isso a busca POR CNPJ só acha
// as marcas cujo titular trouxe o CNPJ no nome; as demais ficam sem CNPJ ligado
// (mas continuam na base). A busca por NOME/titular/classe é a principal — cobre
// todos os registros ingeridos da RPI. Nenhuma marca falsa é fabricada.
//
// As APIs que consultam marca por CNPJ de forma completa são de TERCEIROS PAGOS
// (Infosimples, Netrin, Apify) que raspam o pePI. Decisão do dono pendente.

import {
  getConfiguredApiUrl,
  getSupabasePublicConfig,
  trimTrailingSlash,
} from "../../lib/api-client";
import { sanitizeCnpj as _sanitizeCnpj } from "../../lib/cnpj";
import { fetchAllD1Entities, fetchD1Entities } from "../../lib/d1-client";

// ─── Tipos ─────────────────────────────────────────────────────────────────────

/** Resultado da busca de CNPJ na tela do INPI. */
export type InpiSearchSource = "empresas-cnpj" | "empty";

/**
 * Marca normalizada (kind='trademark', espelha TrademarkEntity do @fonteia/domain).
 * Campos vindos do XML da RPI via Edge Function ingest-inpi.
 */
export interface InpiTrademark {
  /** Id estável — número do processo do INPI quando houver. */
  id: string;
  sourceId: string;
  /** Marca (nome / elemento nominativo). */
  nome: string;
  /** Número do processo no INPI (ex.: "900000000"). */
  processNumber: string;
  /** Classes de Nice (ex.: ["35", "42"]). */
  niceClasses: string[];
  /** Situação/status do processo (ex.: "Registro em vigor"). */
  status: string;
  /** CNPJ do titular (14 dígitos) — preenchido só quando embutido no nome na RPI. */
  titularCnpj: string;
  /** Razão social / nome do titular. */
  titularNome: string;
  /** UF do titular (ex.: "SP") — vem da RPI quando presente. */
  titularUf: string;
}

/** Contexto da empresa titular (subset do perfil da Receita via empresas-cnpj). */
export interface InpiTitular {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  situacao: string;
  uf: string;
  municipio: string;
  sourceUrl: string;
}

export interface InpiSearchResult {
  source: InpiSearchSource;
  /** Empresa titular (contexto real da Receita). null quando não consultado/achado. */
  titular: InpiTitular | null;
  /** Marcas do titular. SEMPRE [] enquanto não houver fonte gratuita do INPI. */
  trademarks: InpiTrademark[];
  /** true quando a integração de marcas ainda não tem fonte (estado honesto). */
  trademarksPending: boolean;
  /** Link direto para a busca oficial do INPI por este CNPJ. */
  inpiBuscaUrl: string;
  message: string;
}

// ─── Constantes da fonte ─────────────────────────────────────────────────────────

/** Identificador da fonte (espelha o catálogo @fonteia/sources). */
export const INPI_SOURCE_ID = "inpi-dados-abertos";

/** Busca pública oficial do INPI (pePI). É a fonte de verdade humana. */
export const INPI_BUSCA_BASE = "https://busca.inpi.gov.br/pePI/jsp/marcas/Pesquisa_classe_basica.jsp";

/** Portal de dados abertos do INPI (marcas em RPI XML, sem API REST). */
export const INPI_DADOS_ABERTOS_URL = "https://dadosabertos.inpi.gov.br/";

/** Resposta da Edge Function empresas-cnpj (subset usado aqui). */
interface CnpjOkResponse {
  ok: true;
  empresa: {
    cnpj: string;
    razaoSocial: string;
    nomeFantasia: string;
    situacao: string;
    uf: string;
    municipio: string;
    sourceUrl: string;
  };
}
interface CnpjErrResponse {
  ok: false;
  error: string;
  detail?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────────

/** Mantém só os dígitos do CNPJ; "" se não restarem 14. Re-exporta de lib/cnpj.ts. */
export const sanitizeCnpj: (value: string) => string = _sanitizeCnpj;

/** Link para a busca oficial do INPI (pePI). Sem deep-link por CNPJ estável —
 * o pePI exige sessão — então levamos o usuário à pesquisa de marcas oficial. */
export function inpiBuscaUrl(): string {
  return INPI_BUSCA_BASE;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ─── Consulta de marcas por CNPJ ─────────────────────────────────────────────────

/**
 * Forma de `entities.attributes` para kind='trademark', como a RPC
 * `public.ingest_inpi` grava (espelha o payload da Edge ingest-inpi). Todos os
 * campos além de processNumber são opcionais — a RPI varia por movimentação.
 */
interface TrademarkAttributes {
  sourceId?: string;
  processNumber?: string;
  /** Nome / elemento nominativo da marca. */
  nome?: string;
  niceClasses?: unknown;
  status?: string;
  titularNome?: string;
  titularCnpj?: string;
  /** UF do titular, conforme publicado na RPI. */
  titularUf?: string;
  /** Apresentação da marca (ex.: "Nominativa", "Mista"). */
  apresentacao?: string;
  /** Natureza do registro (ex.: "Produto", "Serviço"). */
  natureza?: string;
  /** Data do depósito no formato "DD/MM/AAAA". */
  dataDeposito?: string;
}

/** Normaliza niceClasses (pode vir array, string única, ou ausente) → string[]. */
function toNiceClasses(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter((v) => v !== "");
  }
  if (typeof value === "string" && value.trim() !== "") return [value.trim()];
  return [];
}

/**
 * Converte uma linha D1 (kind='trademark') para `InpiTrademark`.
 * `cnpjFallback` é o CNPJ do contexto de busca (quando buscamos por CNPJ);
 * na busca por nome não há fallback, então passamos "".
 */
function rowToTrademark(
  row: { id: string; name: string; cnpj: string | null; attributes: TrademarkAttributes },
  cnpjFallback: string,
): InpiTrademark {
  const a = row.attributes;
  const processNumber = a.processNumber ?? row.id;
  return {
    id: processNumber,
    sourceId: a.sourceId ?? INPI_SOURCE_ID,
    nome: a.nome ?? row.name ?? "",
    processNumber,
    niceClasses: toNiceClasses(a.niceClasses),
    status: a.status ?? "",
    titularCnpj: a.titularCnpj ?? (row.cnpj ?? cnpjFallback),
    titularNome: a.titularNome ?? "",
    titularUf: a.titularUf ?? "",
  };
}

/**
 * Lê as marcas do titular já ingeridas (kind='trademark') do D1 (com fallback
 * Supabase), filtrando por CNPJ. Mapeia `attributes` → `InpiTrademark`.
 *
 * Observação honesta: como a RPI não traz CNPJ estruturado, só retornam marcas
 * cujo titular trouxe o CNPJ embutido no nome (extraído na ingestão). Para os
 * demais CNPJs a lista vem vazia e a tela mostra o estado pendente + link oficial.
 */
async function fetchTrademarksByCnpj(
  cnpj: string,
  fetcher: typeof fetch,
): Promise<InpiTrademark[]> {
  const { rows } = await fetchAllD1Entities<TrademarkAttributes>(
    { kind: "trademark", cnpj },
    { maxPages: 10, fetcher },
  );

  const out: InpiTrademark[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    // Garante a fonte certa (entities mistura kinds/fontes) e o CNPJ casado.
    const a = row.attributes ?? ({} as TrademarkAttributes);
    if (a.sourceId !== undefined && a.sourceId !== INPI_SOURCE_ID) continue;
    if (row.cnpj != null && row.cnpj !== "" && row.cnpj !== cnpj) continue;

    const processNumber = a.processNumber ?? row.id;
    if (seen.has(processNumber)) continue;
    seen.add(processNumber);

    out.push(rowToTrademark(row, cnpj));
  }
  return out;
}

/**
 * Busca marcas por NOME, titular ou classe NICE — a forma principal de busca.
 *
 * O servidor faz `name LIKE %q%` (busca textual no `d1-bridge`). Com `limit: 100`
 * pedimos uma página ampla; o retorno pode ser vazio se ainda não houver edições
 * da RPI ingeridas — a tela trata esse estado com mensagem honesta.
 *
 * @param termo - Nome da marca, nome do titular ou número de classe NICE.
 * @param fetcher - Implementação de fetch (padrão: global fetch).
 */
export async function fetchTrademarksByQuery(
  termo: string,
  fetcher: typeof fetch = fetch,
): Promise<InpiTrademark[]> {
  const q = termo.trim();
  if (q === "") return [];

  const { rows } = await fetchD1Entities<TrademarkAttributes>(
    { kind: "trademark", q, limit: 100 },
    fetcher,
  );

  const out: InpiTrademark[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const a = row.attributes ?? ({} as TrademarkAttributes);
    // Descarta outras fontes que possam ter sido misturadas no mesmo kind.
    if (a.sourceId !== undefined && a.sourceId !== INPI_SOURCE_ID) continue;

    const processNumber = a.processNumber ?? row.id;
    if (seen.has(processNumber)) continue;
    seen.add(processNumber);

    out.push(rowToTrademark(row, ""));
  }
  return out;
}

/**
 * Busca o CONTEXTO da empresa titular (Receita Federal) pela Edge Function
 * "empresas-cnpj", reaproveitando a mesma infra do módulo Empresas (auth por
 * header `apikey`, sem CORS no browser). A parte de MARCAS fica pendente até
 * existir fonte — devolvemos trademarksPending=true e o link oficial do INPI.
 */
export async function searchInpiByCnpj(
  rawCnpj: string,
  fetcher: typeof fetch = fetch,
): Promise<InpiSearchResult> {
  const cnpj = sanitizeCnpj(rawCnpj);
  if (cnpj === "") {
    throw new Error("CNPJ inválido: digite os 14 números (com ou sem máscara).");
  }

  const buscaUrl = inpiBuscaUrl();

  // 1) Contexto da empresa titular via a Edge Function empresas-cnpj.
  const fonteiaUrl = getConfiguredApiUrl();
  if (!fonteiaUrl) throw new Error("API não configurada para consultar o CNPJ.");
  const base = trimTrailingSlash(fonteiaUrl).replace(/\/[^/]+$/, "/empresas-cnpj");

  const { key } = getSupabasePublicConfig();
  const response = await fetcher(`${base}?cnpj=${cnpj}`, {
    headers: {
      accept: "application/json",
      apikey: key,
      authorization: `Bearer ${key}`,
    },
  });

  let body: CnpjOkResponse | CnpjErrResponse;
  try {
    body = (await response.json()) as CnpjOkResponse | CnpjErrResponse;
  } catch {
    throw new Error(`Falha ao consultar o CNPJ (HTTP ${response.status}).`);
  }

  if (!response.ok || body.ok === false) {
    const message =
      body && "error" in body && body.error
        ? body.error
        : `Erro ${response.status} ao consultar o CNPJ.`;
    throw new Error(message);
  }

  const e = body.empresa;
  const titular: InpiTitular = {
    cnpj: e.cnpj,
    razaoSocial: e.razaoSocial,
    nomeFantasia: e.nomeFantasia,
    situacao: e.situacao,
    uf: e.uf,
    municipio: e.municipio,
    sourceUrl: e.sourceUrl,
  };

  // 2) Marcas do titular — lidas da base ingerida da RPI (kind='trademark') por
  // CNPJ. Pode vir vazio: a RPI não traz CNPJ estruturado, então só casam as
  // marcas cujo titular trouxe o CNPJ no nome. Nunca inventar.
  let trademarks: InpiTrademark[] = [];
  try {
    trademarks = await fetchTrademarksByCnpj(cnpj, fetcher);
  } catch (error) {
    // Falha silenciosa: a empresa ainda é útil; marca segue pendente.
    console.warn("[inpi-api] Falha ao buscar marcas:", toErrorMessage(error));
  }

  const trademarksPending = trademarks.length === 0;

  return {
    source: "empresas-cnpj",
    titular,
    trademarks,
    trademarksPending,
    inpiBuscaUrl: buscaUrl,
    message: trademarksPending
      ? "Empresa identificada na Receita Federal. Sem marcas ligadas a este CNPJ na RPI do INPI — a fonte oficial não vincula CNPJ ao titular. Consulte a busca oficial do INPI."
      : "Marcas encontradas para o titular na RPI do INPI.",
  };
}
