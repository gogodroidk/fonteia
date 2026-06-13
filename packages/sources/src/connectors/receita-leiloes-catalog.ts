// Catálogo COMPLETO dos leilões da Receita Federal (Sistema de Leilão Eletrônico)
// via a API JSON interna, pública e anônima do portal SLE.
//
// Contrato e amostras reais: docs/research/SLE_INGESTION_CONTRACT.md
//
// Estratégia JSON-first: a estrutura (valor, datas, cidade, descrição, fotos) já
// vem pronta no JSON — sem parsing de PDF nem OCR. O PDF do edital entra como
// EVIDÊNCIA (base64 -> bytes -> sha256), decodificado no job de ingestão (onde o
// runtime tem Web Crypto), não aqui no pacote compartilhado.
//
// Diferente do conector `receita-leiloes.ts` (que só conhece `destaques`,
// insuficiente: traz apenas os lotes promovidos), aqui varremos TODOS os editais
// e TODOS os lotes.

import type { ReceitaLeilaoLot } from "./receita-leiloes";

export const RECEITA_SLE_BASE = "https://www25.receita.fazenda.gov.br/sle-sociedade";

/** User-Agent honesto recomendado pelo contrato — não fingir navegador. */
export const RECEITA_USER_AGENT = "FonteiaBot/1.0 (+mailto:contato@fontebrasil.online)";

const DEFAULT_HEADERS: Record<string, string> = {
  accept: "application/json",
  "user-agent": RECEITA_USER_AGENT,
};

// ---------------------------------------------------------------------------
// edle = {unidade}/{numero}/{exercicio}  (ex.: "200100/1/2026")
// ---------------------------------------------------------------------------

export interface EdleParts {
  unidade: string;
  numero: string;
  exercicio: string;
}

export function parseEdle(edle: string): EdleParts {
  const [unidade, numero, exercicio] = edle.split("/");
  if (!unidade || !numero || !exercicio) {
    throw new Error(`edle inválido (esperado unidade/numero/exercicio): ${edle}`);
  }
  return { unidade, numero, exercicio };
}

export function editaisDisponiveisUrl(): string {
  return `${RECEITA_SLE_BASE}/api/editais-disponiveis`;
}

export function editalApiUrl(edle: string): string {
  const { unidade, numero, exercicio } = parseEdle(edle);
  return `${RECEITA_SLE_BASE}/api/edital/${unidade}/${numero}/${exercicio}`;
}

export function loteApiUrl(edle: string, lote: string | number): string {
  const { unidade, numero, exercicio } = parseEdle(edle);
  return `${RECEITA_SLE_BASE}/api/lote/${unidade}/${numero}/${exercicio}/${lote}`;
}

export function editalPdfApiUrl(edle: string): string {
  return `${editalApiUrl(edle)}/edital-completo`;
}

export function relacaoLotesPdfApiUrl(edle: string): string {
  return `${editalApiUrl(edle)}/relacao-lotes`;
}

/** URL humana da SPA (boa como `sourceUrl` clicável no produto). */
export function editalPortalUrl(edle: string): string {
  const { unidade, numero, exercicio } = parseEdle(edle);
  return `${RECEITA_SLE_BASE}/portal/edital/${unidade}/${numero}/${exercicio}`;
}

export function lotePortalUrl(edle: string, lote: string | number): string {
  return `${editalPortalUrl(edle)}/lote/${lote}`;
}

// ---------------------------------------------------------------------------
// Tipos crus (subset do que a API devolve; ver §3 do contrato)
// ---------------------------------------------------------------------------

export interface ReceitaEditalResumoRaw {
  edital: string;
  edle: string;
  codigoSituacao: number;
  permitePF: boolean;
  tipo?: string;
  uaNm?: string;
  orgao: string;
  cidade: string;
  dataInicioPropostas?: string;
  dataFimPropostas?: string;
  dataAberturaLances?: string;
  lotes?: number;
}

export interface ReceitaSituacaoGrupo {
  situacao: number;
  editaisEstaoLimitados?: boolean;
  lista: ReceitaEditalResumoRaw[];
}

export interface ReceitaEditaisDisponiveisPayload {
  agora: string;
  situacoes: ReceitaSituacaoGrupo[];
  unidadeInvalida?: unknown;
}

export interface ReceitaLoteImagemRaw {
  imllNrSq?: number;
  src: string;
  min?: string;
  w?: number;
  h?: number;
}

export interface ReceitaEditalLoteRaw {
  loleNrSq: number;
  nrAtribuido: number;
  tipo?: string;
  situacaoLote?: number;
  valorMinimo: number;
  valorAvaliacao?: number;
  possuiImagens?: boolean;
  destaque?: boolean;
  permitePF?: boolean;
  nrAvisos?: number;
  nrErratas?: number;
  imagens?: ReceitaLoteImagemRaw[];
}

export interface ReceitaAvisoErrataRaw {
  data?: string;
  codigoTipo?: number;
  tipo?: string;
  texto?: string;
}

export interface ReceitaEditalCompletoRaw {
  edital: string;
  edle: string;
  situacao?: number;
  permitePF?: boolean;
  tipo?: number;
  orgao: string;
  cidade: string;
  dataInicioPropostas?: string;
  dataFimPropostas?: string;
  dataClassificacao?: string;
  dataAberturaLances?: string;
  formaContato?: string;
  dadosPublicacao?: string;
  numeroAvisos?: number;
  numeroErratas?: number;
  mercadoriasApreendidas?: boolean;
  permissoes?: string[];
  avisosErratas?: ReceitaAvisoErrataRaw[];
  listaLotes: ReceitaEditalLoteRaw[];
}

export interface ReceitaLoteItemRaw {
  recintoArmazenador?: string;
  nrReferencia?: string | null;
  quantidade?: number;
  unMedida?: string;
  descricao?: string;
}

export interface ReceitaLoteDetalheRaw {
  loleNrSq: number;
  nrAtribuido: number;
  edle: string;
  edital: string;
  orgao?: string;
  tipo?: string;
  situacaoLote?: number;
  cidade?: string;
  valorMinimo?: number;
  avisosErratas?: ReceitaAvisoErrataRaw[];
  itensDetalhesLote?: ReceitaLoteItemRaw[];
  imagens?: ReceitaLoteImagemRaw[];
}

/** Envelope do PDF (base64 em JSON). Decodificar no job, não aqui. */
export interface ReceitaPdfEnvelope {
  data: string;
  name?: string;
  length?: number;
}

// ---------------------------------------------------------------------------
// Lote do catálogo: superset compatível com ReceitaLeilaoLot (o que o web já lê),
// com campos extras (avaliação, categoria, fotos). Guardado em entities.attributes.
// ---------------------------------------------------------------------------

export interface ReceitaCatalogLot extends Omit<ReceitaLeilaoLot, "raw"> {
  valorAvaliacaoCents?: number;
  category?: string;
  lotSituacao?: number;
  imageUrls?: string[];
  raw: ReceitaEditalLoteRaw;
}

// ---------------------------------------------------------------------------
// Datas: "YYYY-MM-DD HH:mm" -> ISO com offset BRT (-03:00)
// ---------------------------------------------------------------------------

function parseReceitaDate(value: string | undefined): string {
  if (!value) return "";
  const [datePart, timePart = "00:00"] = value.split(" ");
  const [year, month, day] = datePart?.split("-") ?? [];
  if (!year || !month || !day) return value;
  return `${year}-${month}-${day}T${timePart}:00-03:00`;
}

// ---------------------------------------------------------------------------
// Fetch (somente Web `fetch`, como o conector existente)
// ---------------------------------------------------------------------------

async function getJson<T>(url: string, fetcher: typeof fetch): Promise<T> {
  const response = await fetcher(url, { headers: DEFAULT_HEADERS });
  if (!response.ok) {
    throw new Error(`Receita SLE respondeu ${response.status} em ${url}`);
  }
  return (await response.json()) as T;
}

/** #1 do contrato — catálogo completo de editais (porta de entrada da varredura). */
export function fetchEditaisDisponiveis(
  fetcher: typeof fetch = fetch,
): Promise<ReceitaEditaisDisponiveisPayload> {
  return getJson(editaisDisponiveisUrl(), fetcher);
}

/** #3 do contrato — edital completo + todos os lotes (resumidos) em `listaLotes[]`. */
export function fetchEditalCompleto(
  edle: string,
  fetcher: typeof fetch = fetch,
): Promise<ReceitaEditalCompletoRaw> {
  return getJson(editalApiUrl(edle), fetcher);
}

/** #6 do contrato — detalhe rico de um lote (itens, recinto, fotos). */
export function fetchLoteDetalhe(
  edle: string,
  lote: string | number,
  fetcher: typeof fetch = fetch,
): Promise<ReceitaLoteDetalheRaw> {
  return getJson(loteApiUrl(edle, lote), fetcher);
}

/** #4 do contrato — envelope do PDF do edital (base64). Decodificar/hashear no job. */
export function fetchEditalPdfEnvelope(
  edle: string,
  fetcher: typeof fetch = fetch,
): Promise<ReceitaPdfEnvelope> {
  return getJson(editalPdfApiUrl(edle), fetcher);
}

// ---------------------------------------------------------------------------
// Achatamento + normalização
// ---------------------------------------------------------------------------

/** Achata `situacoes[].lista[]` em uma lista única de editais (chave = edle). */
export function listAllEditais(
  payload: ReceitaEditaisDisponiveisPayload,
): ReceitaEditalResumoRaw[] {
  return (payload.situacoes ?? []).flatMap((grupo) => grupo.lista ?? []);
}

/** Reais inteiros -> centavos (o portal não publica casas decimais aqui). */
function toCents(reais: number | undefined): number {
  if (typeof reais !== "number" || !Number.isFinite(reais)) return 0;
  return Math.round(reais * 100);
}

/** Id estável do lote: `{edle com - no lugar de /}-{loleNrSq}`. */
export function buildCatalogLotId(edle: string, loleNrSq: number): string {
  return `${edle.replaceAll("/", "-")}-${loleNrSq}`;
}

export function normalizeEditalLot(
  edital: ReceitaEditalCompletoRaw,
  loteRaw: ReceitaEditalLoteRaw,
  collectedAt: string,
): ReceitaCatalogLot {
  const eligiblePF = loteRaw.permitePF ?? edital.permitePF ?? false;
  const images = (loteRaw.imagens ?? []).map((img) => img.src).filter((src) => Boolean(src));

  const lot: ReceitaCatalogLot = {
    id: buildCatalogLotId(edital.edle, loteRaw.loleNrSq),
    sourceId: "receita-leiloes-sle",
    edital: edital.edital,
    edle: edital.edle,
    lotNumber: String(loteRaw.loleNrSq),
    displayNumber: String(loteRaw.nrAtribuido),
    city: edital.cidade,
    agency: edital.orgao,
    minimumBidCents: toCents(loteRaw.valorMinimo),
    proposalDeadline: parseReceitaDate(edital.dataFimPropostas),
    eligiblePersonTypes: eligiblePF ? ["pf", "pj"] : ["pj"],
    sourceUrl: lotePortalUrl(edital.edle, loteRaw.nrAtribuido),
    collectedAt,
    raw: loteRaw,
  };

  if (loteRaw.valorAvaliacao !== undefined) {
    lot.valorAvaliacaoCents = toCents(loteRaw.valorAvaliacao);
  }
  if (loteRaw.tipo) {
    lot.category = loteRaw.tipo;
  }
  if (loteRaw.situacaoLote !== undefined) {
    lot.lotSituacao = loteRaw.situacaoLote;
  }
  if (images.length > 0) {
    lot.imageUrl = images[0];
    lot.imageUrls = images;
  }

  return lot;
}

/** Normaliza TODOS os lotes de um edital completo. */
export function normalizeEditalLots(
  edital: ReceitaEditalCompletoRaw,
  collectedAt: string,
): ReceitaCatalogLot[] {
  return (edital.listaLotes ?? []).map((loteRaw) => normalizeEditalLot(edital, loteRaw, collectedAt));
}
