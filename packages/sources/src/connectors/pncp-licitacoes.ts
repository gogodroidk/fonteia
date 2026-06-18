// Conector do PNCP — Portal Nacional de Contratações Públicas.
// API pública, aberta e anônima de CONSULTA (sem auth, sem chave):
//   https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao
//
// Endpoint usado (contratações/licitações publicadas por data de publicação):
//   GET /v1/contratacoes/publicacao
//     ?dataInicial=AAAAMMDD
//     &dataFinal=AAAAMMDD
//     &codigoModalidadeContratacao={1..14}   (OBRIGATÓRIO — uma modalidade por chamada)
//     &pagina={n}                            (1-based)
//     &tamanhoPagina={n}                     (máx. 50)
//     [&uf=SP] [&codigoMunicipioIbge=...]    (filtros opcionais)
//
// A resposta vem paginada num envelope { data, totalRegistros, totalPaginas,
// numeroPagina, paginasRestantes, empty }. Cada item de `data` já traz a estrutura
// pronta (objeto, modalidade, valor estimado, datas, órgão, unidade/UF, link) — sem
// PDF, sem OCR. Normalizamos cada contratação num objeto estável guardado em
// entities.attributes (kind = bidding_opportunity).
//
// Estratégia JSON-first, igual ao conector da Receita (receita-leiloes-catalog.ts):
// a fonte oficial entrega tudo estruturado; só achatamos e normalizamos.

import { fetchWithRetry } from "../internal/http";

export const PNCP_CONSULTA_BASE = "https://pncp.gov.br/api/consulta";

/** Base humana do portal (para montar `sourceUrl` clicável). */
export const PNCP_PORTAL_BASE = "https://pncp.gov.br";

/** User-Agent honesto — não fingir navegador. */
export const PNCP_USER_AGENT = "FonteiaBot/1.0 (+mailto:contato@fontebrasil.online)";

/** Identificador da fonte gravado em cada item (espelha "receita-leiloes-sle"). */
export const PNCP_SOURCE_ID = "pncp-contratacoes";

/** Teto de página da API do PNCP (rejeita tamanhoPagina > 50). */
export const PNCP_MAX_PAGE_SIZE = 50;

const DEFAULT_HEADERS: Record<string, string> = {
  accept: "application/json",
  "user-agent": PNCP_USER_AGENT,
};

// ---------------------------------------------------------------------------
// Tabela de domínio — Modalidade de Contratação (Lei 14.133/2021).
// codigoModalidadeContratacao é OBRIGATÓRIO no endpoint /contratacoes/publicacao,
// então varremos modalidade a modalidade. Esta é a tabela oficial do PNCP.
// ---------------------------------------------------------------------------

export const PNCP_MODALIDADES: Readonly<Record<number, string>> = {
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

/**
 * Modalidades relevantes para licitação por padrão (as que geram disputa/edital
 * com prazo: concorrências, pregões, concurso e diálogo competitivo). Dispensa,
 * inexigibilidade, credenciamento etc. ficam de fora do default — incluí-las
 * explicitamente quando o produto quiser "contratações diretas".
 */
export const PNCP_MODALIDADES_LICITACAO: readonly number[] = [2, 3, 4, 5, 6, 7];

/** Nome amigável de uma modalidade (fallback para o código quando desconhecida). */
export function modalidadeNome(codigo: number): string {
  return PNCP_MODALIDADES[codigo] ?? `Modalidade ${codigo}`;
}

// ---------------------------------------------------------------------------
// Tipos crus (subset do que /contratacoes/publicacao devolve — amostra real).
// ---------------------------------------------------------------------------

export interface PncpOrgaoEntidadeRaw {
  cnpj?: string;
  razaoSocial?: string;
  poderId?: string;
  esferaId?: string;
}

export interface PncpUnidadeOrgaoRaw {
  ufNome?: string;
  ufSigla?: string;
  municipioNome?: string;
  codigoIbge?: string;
  codigoUnidade?: string;
  nomeUnidade?: string;
}

export interface PncpAmparoLegalRaw {
  codigo?: number;
  nome?: string;
  descricao?: string;
}

export interface PncpContratacaoRaw {
  numeroControlePNCP: string;
  numeroCompra?: string;
  anoCompra?: number;
  sequencialCompra?: number;
  processo?: string;
  objetoCompra?: string;
  informacaoComplementar?: string;
  modalidadeId?: number;
  modalidadeNome?: string;
  modoDisputaId?: number;
  modoDisputaNome?: string;
  situacaoCompraId?: number;
  situacaoCompraNome?: string;
  tipoInstrumentoConvocatorioCodigo?: number;
  tipoInstrumentoConvocatorioNome?: string;
  valorTotalEstimado?: number | null;
  valorTotalHomologado?: number | null;
  srp?: boolean;
  dataPublicacaoPncp?: string;
  dataInclusao?: string;
  dataAtualizacao?: string;
  dataAberturaProposta?: string | null;
  dataEncerramentoProposta?: string | null;
  orgaoEntidade?: PncpOrgaoEntidadeRaw;
  unidadeOrgao?: PncpUnidadeOrgaoRaw;
  amparoLegal?: PncpAmparoLegalRaw;
  linkSistemaOrigem?: string | null;
  linkProcessoEletronico?: string | null;
}

/** Envelope paginado padrão das consultas do PNCP. */
export interface PncpPaginatedResponse<T> {
  data: T[];
  totalRegistros: number;
  totalPaginas: number;
  numeroPagina: number;
  paginasRestantes: number;
  empty: boolean;
}

// ---------------------------------------------------------------------------
// Licitação normalizada — o que o produto lê (guardado em entities.attributes).
// Campos claros em pt-BR-friendly camelCase; valores em centavos (inteiros).
// ---------------------------------------------------------------------------

export interface PncpLicitacao {
  /** Id estável = numeroControlePNCP (único e perene no PNCP). */
  id: string;
  sourceId: string;
  /** Mesmo valor de `id`; explícito para leitura/depuração. */
  numeroControlePNCP: string;
  /** "075/2023" — número da compra no sistema de origem. */
  numeroCompra?: string;
  anoCompra?: number;
  /** Número do processo administrativo, quando informado. */
  processo?: string;
  /** Descrição do objeto da contratação (texto livre). */
  objeto: string;
  orgao: string;
  orgaoCnpj?: string;
  /** Unidade compradora (ex.: "Prefeitura Municipal de ..."). */
  unidade?: string;
  uf?: string;
  ufNome?: string;
  municipio?: string;
  codigoIbge?: string;
  /** Esfera: F (federal), E (estadual), M (municipal), D (distrital). */
  esfera?: string;
  /** Poder: E (executivo), L (legislativo), J (judiciário), N (não se aplica). */
  poder?: string;
  modalidadeId?: number;
  modalidade: string;
  modoDisputa?: string;
  situacaoId?: number;
  situacao?: string;
  /** Tipo do instrumento convocatório (ex.: "Edital"). */
  instrumento?: string;
  /** Valor total estimado em centavos. 0 quando não informado. */
  valorEstimadoCents: number;
  /** Valor homologado em centavos, quando já houver. */
  valorHomologadoCents?: number;
  /** Sistema de Registro de Preços? */
  srp?: boolean;
  /** Datas em ISO com offset BRT (-03:00). "" quando ausente. */
  dataPublicacao: string;
  dataAbertura: string;
  dataEncerramento: string;
  /** Link clicável: sistema de origem quando houver, senão a página do PNCP. */
  sourceUrl: string;
  /** Fundamento legal (ex.: "Lei 14.133/2021, Art. 28, I"). */
  amparoLegal?: string;
  /** Quando este registro foi coletado (ISO). */
  collectedAt: string;
  /** Eco cru do item da API (auditoria/trilha de fonte). */
  raw: PncpContratacaoRaw;
}

// ---------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------

export interface FetchContratacoesParams {
  /** Data inicial (AAAAMMDD). */
  dataInicial: string;
  /** Data final (AAAAMMDD). */
  dataFinal: string;
  /** Código da modalidade (OBRIGATÓRIO). */
  codigoModalidade: number;
  /** Página 1-based. Default 1. */
  pagina?: number;
  /** Itens por página (máx. 50). Default 50. */
  tamanhoPagina?: number;
  /** Filtro opcional por UF (ex.: "SP"). */
  uf?: string;
  /** Filtro opcional por município (código IBGE de 7 dígitos). */
  codigoMunicipioIbge?: string;
}

export function contratacoesPublicacaoUrl(params: FetchContratacoesParams): string {
  const search = new URLSearchParams({
    dataInicial: params.dataInicial,
    dataFinal: params.dataFinal,
    codigoModalidadeContratacao: String(params.codigoModalidade),
    pagina: String(params.pagina ?? 1),
    tamanhoPagina: String(Math.min(params.tamanhoPagina ?? PNCP_MAX_PAGE_SIZE, PNCP_MAX_PAGE_SIZE)),
  });
  if (params.uf) search.set("uf", params.uf);
  if (params.codigoMunicipioIbge) search.set("codigoMunicipioIbge", params.codigoMunicipioIbge);
  return `${PNCP_CONSULTA_BASE}/v1/contratacoes/publicacao?${search.toString()}`;
}

/**
 * URL humana da contratação no portal do PNCP. O numeroControlePNCP tem o formato
 * "{cnpj}-{seq?}-{sequencial}/{ano}"; a página do portal é
 * /app/editais/{cnpj}/{ano}/{sequencial}. Quando não conseguimos derivar, caímos
 * na busca do portal (nunca devolvemos link quebrado).
 */
export function contratacaoPortalUrl(numeroControlePNCP: string): string {
  const parsed = parseNumeroControle(numeroControlePNCP);
  if (parsed) {
    return `${PNCP_PORTAL_BASE}/app/editais/${parsed.cnpj}/${parsed.ano}/${parsed.sequencial}`;
  }
  return `${PNCP_PORTAL_BASE}/app/editais?q=${encodeURIComponent(numeroControlePNCP)}`;
}

export interface NumeroControleParts {
  cnpj: string;
  sequencial: string;
  ano: string;
}

/**
 * Quebra o numeroControlePNCP "cnpj-X-sequencial/ano" (ex.:
 * "01612612000106-1-000001/2024"). O sequencial é a parte numérica após o último
 * "-" e antes da "/"; o ano vem depois da "/". Devolve null se não casar.
 */
export function parseNumeroControle(numeroControlePNCP: string): NumeroControleParts | null {
  const match = /^(\d{14})-\d+-(\d+)\/(\d{4})$/.exec(numeroControlePNCP.trim());
  if (!match) return null;
  const [, cnpj, sequencial, ano] = match;
  if (!cnpj || !sequencial || !ano) return null;
  // Remove zeros à esquerda do sequencial (a rota do portal usa o número "limpo").
  const seqClean = String(Number(sequencial));
  return { cnpj, sequencial: seqClean, ano };
}

// ---------------------------------------------------------------------------
// Datas: o PNCP devolve ISO local sem timezone ("2024-01-02T08:00:00").
// Anexamos o offset BRT (-03:00) para o app exibir o horário correto.
// ---------------------------------------------------------------------------

export function parsePncpDate(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (trimmed === "") return "";
  // Já tem timezone (Z ou ±hh:mm)? Mantém.
  if (/[zZ]$/.test(trimmed) || /[+-]\d{2}:\d{2}$/.test(trimmed)) return trimmed;
  // "AAAA-MM-DDTHH:mm[:ss]" sem tz -> assume BRT.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed)) return `${trimmed}-03:00`;
  // "AAAA-MM-DD" puro -> meia-noite BRT.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return `${trimmed}T00:00:00-03:00`;
  return trimmed;
}

/** Reais (com casas decimais) -> centavos inteiros. Tolerante a string/null. */
export function reaisToCents(value: number | string | null | undefined): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/**
 * AAAAMMDD a partir de um Date, para os parâmetros de data da API do PNCP.
 *
 * ATENÇÃO: o PNCP opera em BRT (UTC-3). Este helper lê os campos UTC do Date
 * (getUTCFullYear/Month/Date). Para datas corretas, passe um Date que já
 * represente a data desejada em BRT — ou converta antes de chamar.
 * Exemplo correto: `toPncpDateParam(new Date("2026-01-02T00:00:00-03:00"))`
 * produz "20260102" (BRT), não "20260101" (erro se usar UTC puro).
 */
export function toPncpDateParam(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

async function getJson<T>(
  url: string,
  fetcher: typeof fetch | undefined,
  validate?: (raw: unknown) => T,
): Promise<T> {
  const response = await fetchWithRetry(url, {
    init: { headers: DEFAULT_HEADERS },
    fetcher,
  });
  // 204 = sem conteúdo na página (o PNCP usa isso quando não há registros).
  if (response.status === 204) {
    const empty = {
      data: [],
      totalRegistros: 0,
      totalPaginas: 0,
      numeroPagina: 1,
      paginasRestantes: 0,
      empty: true,
    } as T;
    return empty;
  }
  if (!response.ok) {
    throw new Error(`PNCP respondeu ${response.status} em ${url}`);
  }
  const raw = (await response.json()) as unknown;
  if (validate) return validate(raw);
  return raw as T;
}

/** Guarda mínima: o envelope paginado deve ter `data` array. */
function validatePaginatedResponse<T>(raw: unknown): PncpPaginatedResponse<T> {
  if (
    typeof raw !== "object" ||
    raw === null ||
    !("data" in raw) ||
    !Array.isArray((raw as Record<string, unknown>).data)
  ) {
    throw new Error(
      "PNCP /contratacoes/publicacao: payload inesperado — esperado envelope com 'data' (array).",
    );
  }
  return raw as PncpPaginatedResponse<T>;
}

/** Uma página de contratações publicadas para uma modalidade. */
export function fetchContratacoesPublicacao(
  params: FetchContratacoesParams,
  fetcher?: typeof fetch,
): Promise<PncpPaginatedResponse<PncpContratacaoRaw>> {
  return getJson(
    contratacoesPublicacaoUrl(params),
    fetcher,
    validatePaginatedResponse<PncpContratacaoRaw>,
  );
}

// ---------------------------------------------------------------------------
// Normalização
// ---------------------------------------------------------------------------

export function normalizeContratacao(
  raw: PncpContratacaoRaw,
  collectedAt: string,
): PncpLicitacao {
  const orgao = raw.orgaoEntidade ?? {};
  const unidade = raw.unidadeOrgao ?? {};
  const modalidade = raw.modalidadeNome ?? (raw.modalidadeId !== undefined ? modalidadeNome(raw.modalidadeId) : "Não informado");

  // fix #3: só aceitar linkSistemaOrigem se começar com "https://" (protege contra
  // valores malformados, relativos ou vazios vindos da API).
  const linkOrigem = raw.linkSistemaOrigem?.trim() ?? "";
  const sourceUrl = linkOrigem.startsWith("https://")
    ? linkOrigem
    : contratacaoPortalUrl(raw.numeroControlePNCP);

  const licitacao: PncpLicitacao = {
    id: raw.numeroControlePNCP,
    sourceId: PNCP_SOURCE_ID,
    numeroControlePNCP: raw.numeroControlePNCP,
    objeto: (raw.objetoCompra ?? "").trim(),
    orgao: (orgao.razaoSocial ?? unidade.nomeUnidade ?? "Órgão não informado").trim(),
    modalidade,
    valorEstimadoCents: reaisToCents(raw.valorTotalEstimado),
    dataPublicacao: parsePncpDate(raw.dataPublicacaoPncp),
    dataAbertura: parsePncpDate(raw.dataAberturaProposta),
    dataEncerramento: parsePncpDate(raw.dataEncerramentoProposta),
    sourceUrl,
    collectedAt,
    raw,
  };

  if (raw.numeroCompra) licitacao.numeroCompra = raw.numeroCompra;
  if (raw.anoCompra !== undefined) licitacao.anoCompra = raw.anoCompra;
  if (raw.processo) licitacao.processo = raw.processo;
  if (orgao.cnpj) licitacao.orgaoCnpj = orgao.cnpj;
  if (unidade.nomeUnidade) licitacao.unidade = unidade.nomeUnidade.trim();
  if (unidade.ufSigla) licitacao.uf = unidade.ufSigla;
  if (unidade.ufNome) licitacao.ufNome = unidade.ufNome;
  if (unidade.municipioNome) licitacao.municipio = unidade.municipioNome;
  if (unidade.codigoIbge) licitacao.codigoIbge = unidade.codigoIbge;
  if (orgao.esferaId) licitacao.esfera = orgao.esferaId;
  if (orgao.poderId) licitacao.poder = orgao.poderId;
  if (raw.modalidadeId !== undefined) licitacao.modalidadeId = raw.modalidadeId;
  if (raw.modoDisputaNome) licitacao.modoDisputa = raw.modoDisputaNome;
  if (raw.situacaoCompraId !== undefined) licitacao.situacaoId = raw.situacaoCompraId;
  if (raw.situacaoCompraNome) licitacao.situacao = raw.situacaoCompraNome;
  if (raw.tipoInstrumentoConvocatorioNome) licitacao.instrumento = raw.tipoInstrumentoConvocatorioNome;
  if (raw.valorTotalHomologado !== undefined && raw.valorTotalHomologado !== null) {
    licitacao.valorHomologadoCents = reaisToCents(raw.valorTotalHomologado);
  }
  if (raw.srp !== undefined) licitacao.srp = raw.srp;
  if (raw.amparoLegal?.nome) licitacao.amparoLegal = raw.amparoLegal.nome;

  return licitacao;
}

/** Normaliza um lote inteiro de itens crus. */
export function normalizeContratacoes(
  items: PncpContratacaoRaw[],
  collectedAt: string,
): PncpLicitacao[] {
  return items.map((raw) => normalizeContratacao(raw, collectedAt));
}
