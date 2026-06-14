// Módulo INPI — Propriedade Industrial (marcas / patentes).
//
// REALIDADE DA FONTE (honesta, junho/2026):
// O INPI NÃO oferece uma API REST pública e gratuita de busca de marcas. O que
// existe oficialmente é:
//   1. Dados Abertos (https://dadosabertos.inpi.gov.br): só a RPI — Revista da
//      Propriedade Industrial — em XML, publicada SEMANALMENTE. É um boletim das
//      movimentações da semana (não uma base consultável), em arquivos grandes
//      que precisariam ser baixados e acumulados por semanas. Sem consulta por
//      CNPJ/processo. Inviável como espelho limpo dos outros módulos hoje.
//   2. Busca oficial humana (https://busca.inpi.gov.br/pePI) — exige sessão/
//      captcha, sem API.
// As únicas APIs que consultam marca por CNPJ/processo são de TERCEIROS PAGOS
// (Infosimples, Netrin, Apify) que raspam o pePI. Decisão do dono pendente.
//
// O QUE ESTE MÓDULO FAZ (sem inventar dado):
// Oferece uma busca por CNPJ que reúne o CONTEXTO REAL da empresa titular (via a
// Edge Function "empresas-cnpj" → Receita Federal/Minha Receita) e exibe um
// estado honesto para a parte de marcas — "Integração de marcas do INPI em
// andamento — fonte oficial sem API pública" — com link direto para a busca
// oficial do INPI por aquele CNPJ. Nenhuma marca falsa é fabricada.
//
// COMO PLUGAR A FONTE DEPOIS (estrutura pronta):
// Quando houver uma fonte viável (paga ou um conector próprio de RPI XML),
// implemente `fetchTrademarksByCnpj` para devolver `InpiTrademark[]` populado;
// o restante (tipos, estado da tela) já está preparado. Se a fonte virar uma
// base ingerível, espelhe os outros módulos: conector em @fonteia/sources +
// RPC `ingest_inpi` + Edge `ingest-inpi`, gravando entities kind='trademark'.

import {
  getConfiguredApiUrl,
  getSupabasePublicConfig,
  trimTrailingSlash,
} from "../../lib/api-client";

// ─── Tipos ─────────────────────────────────────────────────────────────────────

/** Resultado da busca de CNPJ na tela do INPI. */
export type InpiSearchSource = "empresas-cnpj" | "empty";

/**
 * Marca normalizada (kind='trademark', espelha TrademarkEntity do @fonteia/domain).
 * Hoje a lista vem SEMPRE vazia (sem fonte gratuita); o tipo existe para quando
 * uma fonte for plugada.
 */
export interface InpiTrademark {
  /** Id estável — número do processo do INPI quando houver. */
  id: string;
  sourceId: string;
  /** Marca (nome). */
  nome: string;
  /** Número do processo no INPI (ex.: "900000000"). */
  processNumber: string;
  /** Classes de Nice (ex.: ["35", "42"]). */
  niceClasses: string[];
  /** Situação/status do processo (ex.: "Registro em vigor"). */
  status: string;
  /** CNPJ do titular (14 dígitos). */
  titularCnpj: string;
  /** Razão social do titular, quando conhecida. */
  titularNome: string;
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

/** Mantém só os dígitos do CNPJ; "" se não restarem 14. */
export function sanitizeCnpj(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length === 14 ? digits : "";
}

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
 * Ponto de extensão: hoje devolve [] porque NÃO há fonte gratuita de marcas do
 * INPI. Implemente aqui quando uma fonte (paga ou conector próprio) existir.
 */
async function fetchTrademarksByCnpj(
  _cnpj: string,
  _fetcher: typeof fetch,
): Promise<InpiTrademark[]> {
  // Sem fonte oficial com API pública gratuita → sem dados. Nunca fabricar.
  return [];
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

  // 2) Marcas do titular — vazio enquanto não houver fonte. Não inventar.
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
      ? "Empresa identificada na Receita Federal. Integração de marcas do INPI em andamento — fonte oficial sem API pública gratuita."
      : "Marcas encontradas para o titular.",
  };
}
