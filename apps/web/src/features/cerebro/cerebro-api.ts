/**
 * Cérebro — camada de dados do grafo de conhecimento.
 *
 * Duas portas de entrada:
 *   1) `expandCnpj(cnpj)` — empresa/pessoa por CNPJ vira o centro e puxamos, em
 *      PARALELO, tudo que existe sobre ela nos kinds com coluna `cnpj` no BULK
 *      (D1 primário, fallback Supabase — via `d1-client`). Também cruzamos por
 *      NOME (processos/contratos sem CNPJ casado) e abrimos o município de cada
 *      contrato/licitação (por código IBGE) como nó próprio.
 *   2) `searchEntities(termo)` — busca textual (param `q` do d1-bridge) para
 *      começar o grafo a partir de uma empresa/pessoa/marca achada por NOME.
 *   3) `expandNode(node)` — expande um nó-folha por CNPJ, por nome ou por IBGE,
 *      conforme o que ele carrega.
 *
 * Nenhum dado é fabricado: kinds sem fonte (ex.: `trademark` sem RPI ingerida)
 * voltam vazios e não geram nós. O caminho premium (InfoSimples) degrada em
 * silêncio quando dormente/indisponível.
 */

import { supabase } from "../../auth/supabase-client";
import {
  fetchD1Entities,
  type D1EntityRow,
} from "../../lib/d1-client";
import {
  getConfiguredApiUrl,
  getSupabasePublicConfig,
  trimTrailingSlash,
} from "../../lib/api-client";
import { sanitizeCnpj, formatCnpj } from "../../lib/cnpj";
import type { DetailField, EdgeKind, GraphKind, NodeKind } from "./types";

export { sanitizeCnpj, formatCnpj };

/** Kinds que buscamos POR CNPJ para montar as conexões diretas de uma empresa. */
const CNPJ_KINDS: GraphKind[] = [
  "sanction",
  "public_contract",
  "bidding_opportunity",
  "environmental_infraction",
  "organization",
  "trademark",
];

/**
 * Kinds que NÃO têm CNPJ casado no D1 e só poderiam ligar por NOME (busca textual).
 *
 * `legal_process`: realidade honesta — o dataset público do CNJ (DataJud) é
 * ANONIMIZADO; a linha não traz CNPJ nem o nome das partes (só classe, tribunal e
 * assunto). Então a busca por razão social quase sempre volta vazia — e é assim
 * que deve ser: NÃO inventamos um vínculo. Mantemos o kind aqui para que o dia em
 * que houver fonte com as partes (ou tribunais que as exponham), a ligação passe a
 * funcionar sem mudança de código. Hoje degrada para "nenhuma conexão".
 */
const NAME_KINDS: GraphKind[] = ["legal_process"];

/** Kinds que a busca textual `searchEntities` varre (para começar por nome). */
const SEARCH_KINDS: GraphKind[] = [
  "organization",
  "public_contract",
  "trademark",
  "politician",
  "legal_proposition",
  "municipality",
];

/** Teto de nós por kind — protege a performance do canvas (centenas, não milhares). */
const MAX_PER_KIND = 50;

/** Teto de municípios distintos abertos a partir de contratos/licitações. */
const MAX_MUNICIPIOS = 12;

/** Página pedida ao servidor por kind. O d1-bridge tem teto próprio; pedimos amplo. */
const PAGE_LIMIT = 1000;

/** Página menor para buscas textuais amplas (evita varrer demais por nó). */
const SEARCH_LIMIT = 60;

// ─── Tipos de saída ──────────────────────────────────────────────────────────────

/** Um nó-folha "cru" (antes de virar GraphNode com física). */
export interface RawLeaf {
  /** Id único no grafo (prefixado por kind). */
  id: string;
  kind: NodeKind;
  label: string;
  sublabel?: string | undefined;
  /** CNPJ próprio deste nó, quando expansível por CNPJ. */
  cnpj?: string | undefined;
  /** Código IBGE (7 dígitos) quando o nó é/refere um município. */
  codigoIbge?: string | undefined;
  /** Termo de busca para expandir por NOME (fornecedor sem CNPJ, político…). */
  searchTerm?: string | undefined;
  /** Link para a fonte oficial deste registro. */
  sourceUrl?: string | undefined;
  /** Dados completos do registro (painel de detalhe). */
  details?: DetailField[] | undefined;
  /** Como este nó se liga ao pai (cor/rótulo do fio). */
  rel: EdgeKind;
}

/** Resultado de uma expansão: o rótulo do centro + os nós-folha encontrados. */
export interface ExpandResult {
  /** CNPJ consultado (14 dígitos) ou "" quando a origem foi busca por nome. */
  cnpj: string;
  /** Rótulo legível do centro (razão social, quando descoberta). */
  centerLabel: string;
  /** CNPJ descoberto da entidade (quando achado por nome). */
  centerCnpj?: string | undefined;
  /** Nós conectados encontrados (já com teto por kind aplicado). */
  leaves: RawLeaf[];
  /** Contagem por kind (para a UI mostrar resumo/legenda). */
  counts: Partial<Record<NodeKind, number>>;
  /** Erros não-fatais por kind (a busca segue para os demais). */
  errors: string[];
  /** true quando o caminho premium (InfoSimples) trouxe as marcas. */
  trademarksPremium?: boolean;
  /**
   * Arestas extra folha↔município (por código IBGE), já resolvidas. A página as
   * adiciona ao grafo ligando cada contrato/licitação ao seu nó-município.
   */
  municipalityEdges?: Array<{ from: string; to: string }> | undefined;
}

/** Item da busca textual de entidades (para escolher o centro do grafo). */
export interface SearchHit {
  /** Id da entidade no D1 (UUID). */
  id: string;
  kind: GraphKind;
  /** Nome legível. */
  name: string;
  /** CNPJ (14 dígitos) quando houver — vira o centro expansível por CNPJ. */
  cnpj?: string | undefined;
  /** Código IBGE quando for município. */
  codigoIbge?: string | undefined;
  /** Subtítulo curto (UF, partido, status…) para desambiguar na lista. */
  sublabel?: string | undefined;
}

// ─── Helpers de extração ─────────────────────────────────────────────────────────

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Sanitiza um CNPJ E rejeita "lixo estrutural" (placeholders todos-iguais como
 * 00000000000000 / 99999999999999, comuns em bases municipais). Devolve "" nesses
 * casos — assim nunca centralizamos o grafo num CNPJ inexistente.
 */
function validCnpj(value: unknown): string {
  const cnpj = sanitizeCnpj(str(value));
  if (cnpj === "") return "";
  if (/^(\d)\1{13}$/.test(cnpj)) return ""; // todos os 14 dígitos iguais
  return cnpj;
}

function attrs(row: D1EntityRow): Record<string, unknown> {
  return (row.attributes as Record<string, unknown> | undefined) ?? {};
}

function attr(row: D1EntityRow, key: string): unknown {
  return attrs(row)[key];
}

/** Valor monetário "R$ 1.234,56" a partir de reais (number|string) ou ""; "" se inválido. */
function moneyFromReais(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Valor monetário a partir de CENTAVOS (number) ou ""; "" se inválido. */
function moneyFromCents(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "";
  return (n / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Formata "yyyy-mm-dd"/ISO para dd/mm/aaaa; devolve a string original se não casar. */
function formatDate(value: unknown): string {
  const s = str(value);
  if (s === "") return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  // "AAAAMMDD..." (DataJud) → dd/mm/aaaa
  const d = /^(\d{4})(\d{2})(\d{2})/.exec(s);
  if (d) return `${d[3]}/${d[2]}/${d[1]}`;
  return s;
}

/** Primeiro assunto/classe legível (assuntos pode ser string|objeto|array). */
function firstNamed(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value) && value.length > 0) return firstNamed(value[0]);
  if (value !== null && typeof value === "object") {
    const o = value as Record<string, unknown>;
    const nome = o["nome"] ?? o["descricao"] ?? o["titulo"] ?? o["assunto"];
    if (typeof nome === "string" && nome.trim() !== "") return nome.trim();
  }
  return "";
}

/** Acrescenta um campo ao detalhe se o valor não for vazio. */
function pushField(out: DetailField[], label: string, value: string): void {
  if (value && value.trim() !== "") out.push({ label, value });
}

/** Máscara de CPF/CNPJ best-effort (alguns kinds guardam o doc com máscara). */
function maskDoc(value: unknown): string {
  const s = str(value);
  const digits = s.replace(/\D/g, "");
  if (digits.length === 14) return formatCnpj(digits);
  return s; // mantém a forma original (ex.: CPF mascarado do IBAMA)
}

// ─── Links para a fonte oficial por kind ─────────────────────────────────────────

/** Busca oficial do INPI por marcas (pePI exige sessão; levamos à pesquisa). */
const INPI_BUSCA_URL =
  "https://busca.inpi.gov.br/pePI/jsp/marcas/Pesquisa_classe_basica.jsp";

/**
 * Resolve o link da fonte oficial de uma linha. Prioriza `attributes.sourceUrl`
 * (vários kinds já trazem o deep-link real do PNCP / Portal da Transparência /
 * portais municipais); quando ausente, monta um link estável por kind.
 */
function sourceUrlFor(kind: GraphKind, row: D1EntityRow): string | undefined {
  const explicit = str(attr(row, "sourceUrl"));
  if (explicit !== "") return explicit;

  switch (kind) {
    case "organization": {
      const cnpj = sanitizeCnpj(str(row.cnpj) || str(attr(row, "cnpj")));
      // Painel do órgão no PNCP por CNPJ.
      return cnpj ? `https://pncp.gov.br/app/orgaos/${cnpj}` : undefined;
    }
    case "sanction": {
      const cnpj = sanitizeCnpj(str(row.cnpj) || str(attr(row, "cnpj")));
      return cnpj
        ? `https://portaldatransparencia.gov.br/sancoes/consulta?cadastro=1&cpfCnpj=${cnpj}`
        : "https://portaldatransparencia.gov.br/sancoes";
    }
    case "environmental_infraction":
      return "https://dadosabertos.ibama.gov.br/dataset/fiscalizacao-auto-de-infracao";
    case "legal_process": {
      const numero = str(row.external_ids?.["numeroProcesso"]);
      // Consulta unificada do CNJ por número (quando houver).
      return numero
        ? `https://www.cnj.jus.br/pjecnj/ConsultaPublica/listView.seam?numeroProcesso=${numero}`
        : undefined;
    }
    case "trademark":
      return INPI_BUSCA_URL;
    case "municipality": {
      const ibge = str(attr(row, "codigoIbge")) || str(row.external_ids?.["codigoIbge"]);
      return ibge ? `https://cidades.ibge.gov.br/brasil/${ibge}/panorama` : undefined;
    }
    case "politician": {
      const id = str(row.external_ids?.["camaraId"]) || str(attr(row, "id"));
      return id ? `https://www.camara.leg.br/deputados/${id}` : undefined;
    }
    case "legal_proposition": {
      const raw = attr(row, "raw") as Record<string, unknown> | undefined;
      const uri = str(raw?.["uri"]);
      const id = str(row.external_ids?.["proposicaoId"]) || str(attr(row, "id"));
      if (uri) return uri;
      return id
        ? `https://www.camara.leg.br/propostas-legislativas/${id}`
        : undefined;
    }
    default:
      return undefined;
  }
}

// ─── Conversão de linha → nó-folha (com detalhes para o painel) ──────────────────

/**
 * Transforma uma linha do BULK num nó-folha conforme o kind, montando também os
 * `details` (rótulo→valor) para o painel e o `sourceUrl` da fonte oficial.
 * `rel` indica como o nó se liga ao pai (cor do fio). Devolve null quando a linha
 * não tem nada útil para mostrar (evita nós "vazios").
 */
function leafFromRow(kind: GraphKind, row: D1EntityRow, rel: EdgeKind): RawLeaf | null {
  const id = `${kind}:${row.id}`;
  const name = str(row.name);
  const sourceUrl = sourceUrlFor(kind, row);
  const details: DetailField[] = [];

  switch (kind) {
    case "sanction": {
      const origem = str(attr(row, "origem")) || "Sanção";
      const tipo = str(attr(row, "tipoSancao"));
      const orgao = str(attr(row, "orgaoSancionador"));
      pushField(details, "Origem", origem);
      pushField(details, "Tipo de sanção", tipo);
      pushField(details, "Órgão sancionador", orgao);
      pushField(details, "Início", formatDate(attr(row, "dataInicioSancao")));
      pushField(details, "Fim", formatDate(attr(row, "dataFimSancao")));
      pushField(details, "Multa", moneyFromReais(attr(row, "valorMulta")));
      pushField(details, "Fundamentação", str(attr(row, "fundamentacao")).slice(0, 220));
      pushField(details, "CNPJ/CPF", maskDoc(str(row.cnpj) || str(attr(row, "cnpj"))));
      return {
        id,
        kind,
        rel,
        label: name || origem,
        sublabel: tipo || origem,
        sourceUrl,
        details,
      };
    }
    case "public_contract": {
      const orgao = str(attr(row, "orgao"));
      const valor = moneyFromReais(attr(row, "valorGlobal"));
      const fornecedor = str(attr(row, "fornecedorNome")) || name;
      const municipio = str(attr(row, "municipio"));
      const uf = str(attr(row, "uf"));
      const objeto = str(attr(row, "objeto"));
      const ibge = str(attr(row, "codigoIbge"));
      const orgaoCnpj = validCnpj(str(attr(row, "orgaoCnpj")));
      pushField(details, "Fornecedor", fornecedor);
      pushField(details, "Órgão", orgao);
      pushField(details, "Objeto", objeto.slice(0, 220));
      pushField(details, "Valor", valor);
      pushField(details, "Modalidade", str(attr(row, "modalidade")));
      pushField(details, "Município/UF", [municipio, uf].filter(Boolean).join(" / "));
      pushField(details, "Assinatura", formatDate(attr(row, "dataAssinatura")));
      return {
        id,
        kind,
        rel,
        label: fornecedor || orgao || "Contrato",
        sublabel: [orgao, valor].filter(Boolean).join(" · ") || objeto.slice(0, 60),
        codigoIbge: ibge || undefined,
        // O órgão do contrato é expansível por CNPJ próprio quando houver.
        cnpj: orgaoCnpj || undefined,
        sourceUrl,
        details,
      };
    }
    case "bidding_opportunity": {
      const objeto = str(attr(row, "objeto"));
      const orgao = str(attr(row, "orgao"));
      const valor = moneyFromCents(attr(row, "valorEstimadoCents"));
      const municipio = str(attr(row, "municipio"));
      const uf = str(attr(row, "uf"));
      const ibge = str(attr(row, "codigoIbge"));
      const orgaoCnpj = validCnpj(str(attr(row, "orgaoCnpj")) || str(row.cnpj));
      pushField(details, "Objeto", objeto.slice(0, 220));
      pushField(details, "Órgão", orgao);
      pushField(details, "Valor estimado", valor);
      pushField(details, "Modalidade", str(attr(row, "modalidade")));
      pushField(details, "Município/UF", [municipio, uf].filter(Boolean).join(" / "));
      pushField(details, "Abertura", formatDate(attr(row, "dataAbertura")));
      pushField(details, "Situação", str(attr(row, "situacao")));
      return {
        id,
        kind,
        rel,
        label: objeto ? objeto.slice(0, 64) : orgao || "Licitação",
        sublabel: [orgao, valor].filter(Boolean).join(" · ") || undefined,
        codigoIbge: ibge || undefined,
        cnpj: orgaoCnpj || undefined,
        sourceUrl,
        details,
      };
    }
    case "legal_process": {
      const numero = str(row.external_ids?.["numeroProcesso"]) || name;
      const tribunal = str(attr(row, "tribunal"));
      const assunto = firstNamed(attr(row, "assuntos"));
      const classe = firstNamed(attr(row, "classe"));
      const grau = str(attr(row, "grau"));
      pushField(details, "Número", numero);
      pushField(details, "Tribunal", tribunal);
      pushField(details, "Grau", grau);
      pushField(details, "Classe", classe);
      pushField(details, "Assunto", assunto);
      pushField(details, "Ajuizamento", formatDate(attr(row, "dataAjuizamento")));
      return {
        id,
        kind,
        rel,
        label: numero || "Processo",
        sublabel: [tribunal, assunto || classe].filter(Boolean).join(" · ") || undefined,
        sourceUrl,
        details,
      };
    }
    case "environmental_infraction": {
      const tipo = str(attr(row, "tipoInfracao"));
      const multa = moneyFromCents(attr(row, "valorMultaCents"));
      const uf = str(attr(row, "uf"));
      const municipio = str(attr(row, "municipio"));
      const ibge = str(attr(row, "codigoIbge"));
      pushField(details, "Infrator", name);
      pushField(details, "Tipo", tipo);
      pushField(details, "Descrição", str(attr(row, "descricao")).slice(0, 220));
      pushField(details, "Multa", multa);
      pushField(details, "Município/UF", [municipio, uf].filter(Boolean).join(" / "));
      pushField(details, "Processo", str(attr(row, "numProcesso")));
      pushField(details, "CNPJ/CPF", maskDoc(str(attr(row, "cpfCnpj")) || str(row.cnpj)));
      pushField(details, "Data", formatDate(attr(row, "data")));
      return {
        id,
        kind,
        rel,
        label: name || tipo || "Infração ambiental",
        sublabel: [tipo, multa, uf].filter(Boolean).join(" · ") || undefined,
        codigoIbge: ibge || undefined,
        sourceUrl,
        details,
      };
    }
    case "organization": {
      const uf = str(attr(row, "uf"));
      const ownCnpj = validCnpj(str(row.cnpj) || str(attr(row, "cnpj")));
      pushField(details, "Órgão", name);
      pushField(details, "CNPJ", ownCnpj ? formatCnpj(ownCnpj) : "");
      pushField(details, "UF", uf || str(attr(row, "ufNome")));
      return {
        id,
        kind,
        rel,
        label: name || "Órgão público",
        sublabel: uf || undefined,
        cnpj: ownCnpj || undefined,
        sourceUrl,
        details,
      };
    }
    case "municipality": {
      const uf = str(attr(row, "uf")) || str(attr(row, "ufNome"));
      const ibge = str(attr(row, "codigoIbge")) || str(row.external_ids?.["codigoIbge"]);
      pushField(details, "Município", name);
      pushField(details, "UF", uf);
      pushField(details, "Código IBGE", ibge);
      pushField(details, "Mesorregião", str(attr(row, "mesorregiao")));
      pushField(details, "Microrregião", str(attr(row, "microrregiao")));
      return {
        id,
        kind,
        rel,
        label: name || "Município",
        sublabel: uf || undefined,
        codigoIbge: ibge || undefined,
        searchTerm: name || undefined,
        sourceUrl,
        details,
      };
    }
    case "politician": {
      const partido = str(attr(row, "partido"));
      const uf = str(attr(row, "uf"));
      pushField(details, "Nome", name);
      pushField(details, "Partido", partido);
      pushField(details, "UF", uf);
      pushField(details, "E-mail", str(attr(row, "email")));
      return {
        id,
        kind,
        rel,
        label: name || "Político",
        sublabel: [partido, uf].filter(Boolean).join("-") || undefined,
        searchTerm: name || undefined,
        sourceUrl,
        details,
      };
    }
    case "legal_proposition": {
      const tipo = str(attr(row, "tipo"));
      const ementa = str(attr(row, "ementa"));
      const numero = String(attr(row, "numero") ?? "");
      pushField(details, "Proposição", name);
      pushField(details, "Tipo", tipo);
      pushField(details, "Número", numero);
      pushField(details, "Ementa", ementa.slice(0, 240));
      return {
        id,
        kind,
        rel,
        label: name || "Proposição",
        sublabel: ementa ? ementa.slice(0, 60) : tipo || undefined,
        sourceUrl,
        details,
      };
    }
    case "trademark": {
      const status = str(attr(row, "status"));
      const classes = attr(row, "niceClasses");
      const classesStr = Array.isArray(classes) ? classes.join(", ") : str(classes);
      const titular = str(attr(row, "titularNome"));
      const proc = str(attr(row, "processNumber")) || row.id;
      pushField(details, "Marca", name);
      pushField(details, "Processo INPI", proc);
      pushField(details, "Situação", status);
      pushField(details, "Classes NICE", classesStr);
      pushField(details, "Titular", titular);
      return {
        id,
        kind,
        rel,
        label: name || "Marca",
        sublabel: status || undefined,
        sourceUrl,
        details,
      };
    }
    default:
      return null;
  }
}

// ─── Caminho premium: marcas via Edge "infosimples-proxy" ────────────────────────
//
// A Edge "infosimples-proxy" é um agregador PAGO por consulta e fica DORMENTE até
// o dono configurar o segredo. Enquanto dormente responde { configured:false } e
// não gastamos nada. Auth: header `apikey` (publishable) + Bearer de SESSÃO do
// usuário (plano pago é checado no servidor). Sem sessão/plano, a Edge recusa e
// caímos no comportamento normal (RPI ingerida), sem quebrar o grafo.

interface InfosimplesTrademark {
  numero?: string;
  marca?: string;
  classe?: string;
  situacao?: string;
  titular?: string;
}
interface InfosimplesProxyResponse {
  ok?: boolean;
  configured?: boolean;
  trademarks?: InfosimplesTrademark[];
}

function infosimplesProxyUrl(cnpj: string): string | null {
  const fonteiaUrl = getConfiguredApiUrl();
  if (!fonteiaUrl) return null;
  const base = trimTrailingSlash(fonteiaUrl).replace(/\/[^/]+$/, "/infosimples-proxy");
  return `${base}?kind=${encodeURIComponent("inpi-marcas-cnpj")}&cnpj=${cnpj}`;
}

/**
 * Tenta buscar marcas vivas do INPI por CNPJ via o proxy PAGO. Retorna:
 *   - RawLeaf[] (possivelmente vazio) quando o proxy está ATIVO (configured:true);
 *   - null quando DORMENTE/indisponível/recusado — sinal para usar a base RPI.
 * NUNCA lança.
 */
async function fetchTrademarksPremium(
  cnpj: string,
  fetcher: typeof fetch,
): Promise<RawLeaf[] | null> {
  const target = infosimplesProxyUrl(cnpj);
  if (!target) return null;

  const { key } = getSupabasePublicConfig();
  let bearer = key;
  try {
    const sessionToken = (await supabase?.auth.getSession())?.data.session?.access_token;
    if (sessionToken) bearer = sessionToken;
  } catch {
    // sem sessão — a Edge recusa e caímos no fallback.
  }

  try {
    const response = await fetcher(target, {
      headers: { accept: "application/json", apikey: key, authorization: `Bearer ${bearer}` },
    });
    const body = (await response.json()) as InfosimplesProxyResponse;
    if (body.configured !== true || body.ok !== true) return null;
    const list = Array.isArray(body.trademarks) ? body.trademarks : [];
    return list.slice(0, MAX_PER_KIND).map((t, i) => {
      const details: DetailField[] = [];
      pushField(details, "Marca", str(t.marca));
      pushField(details, "Processo INPI", str(t.numero));
      pushField(details, "Situação", str(t.situacao));
      pushField(details, "Classe", str(t.classe));
      pushField(details, "Titular", str(t.titular));
      return {
        id: `trademark:premium:${str(t.numero) || i}`,
        kind: "trademark" as NodeKind,
        rel: "cnpj" as EdgeKind,
        label: str(t.marca) || "Marca",
        sublabel: str(t.situacao) || undefined,
        sourceUrl: INPI_BUSCA_URL,
        details,
      };
    });
  } catch (error) {
    console.warn("[cerebro] infosimples-proxy indisponível:", toErrorMessage(error));
    return null;
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ─── Busca por CNPJ / por NOME por kind ──────────────────────────────────────────

/** Busca um kind por CNPJ, devolvendo nós-folha + candidato a rótulo do centro. */
async function fetchKindByCnpj(
  kind: GraphKind,
  cnpj: string,
  fetcher: typeof fetch,
): Promise<{ leaves: RawLeaf[]; centerLabel: string }> {
  const { rows } = await fetchD1Entities({ kind, cnpj, limit: PAGE_LIMIT }, fetcher);

  const leaves: RawLeaf[] = [];
  let centerLabel = "";
  for (const row of rows) {
    if (centerLabel === "") {
      const candidate = str(attr(row, "fornecedorNome")) || str(row.name);
      if (candidate) centerLabel = candidate;
    }
    const leaf = leafFromRow(kind, row, "cnpj");
    if (leaf) leaves.push(leaf);
    if (leaves.length >= MAX_PER_KIND) break;
  }
  return { leaves, centerLabel };
}

/**
 * Busca um kind por NOME (param `q`), para os kinds sem CNPJ casado. Filtra no
 * cliente para evitar falsos positivos do LIKE (exige que o termo apareça mesmo).
 */
async function fetchKindByName(
  kind: GraphKind,
  termo: string,
  fetcher: typeof fetch,
  rel: EdgeKind = "name",
): Promise<RawLeaf[]> {
  const q = termo.trim();
  if (q.length < 3) return [];
  const { rows } = await fetchD1Entities({ kind, q, limit: SEARCH_LIMIT }, fetcher);

  const leaves: RawLeaf[] = [];
  for (const row of rows) {
    const leaf = leafFromRow(kind, row, rel);
    if (leaf) leaves.push(leaf);
    if (leaves.length >= MAX_PER_KIND) break;
  }
  return leaves;
}

/**
 * Abre os MUNICÍPIOS distintos referenciados por contratos/licitações (via código
 * IBGE), buscando a entidade `municipality` de cada um pelo nome do próprio
 * registro. Cap rígido (`MAX_MUNICIPIOS`) — alguns municípios têm dezenas de
 * milhares de contratos, então NUNCA varremos o kind inteiro: só resolvemos o nó
 * município a partir dos códigos já presentes nas folhas.
 */
async function fetchMunicipiosForLeaves(
  leaves: RawLeaf[],
  fetcher: typeof fetch,
): Promise<{ municipios: RawLeaf[]; edges: Array<{ from: string; to: string }> }> {
  // Coleta os códigos IBGE distintos das folhas (contratos/licitações/infrações).
  const ibgeToLeaves = new Map<string, string[]>();
  for (const leaf of leaves) {
    const ibge = leaf.codigoIbge;
    if (!ibge) continue;
    const arr = ibgeToLeaves.get(ibge) ?? [];
    arr.push(leaf.id);
    ibgeToLeaves.set(ibge, arr);
  }
  const codes = [...ibgeToLeaves.keys()].slice(0, MAX_MUNICIPIOS);
  if (codes.length === 0) return { municipios: [], edges: [] };

  // Para cada código, achamos o nome do município numa das folhas e buscamos a
  // entidade `municipality` correspondente por nome (depois casamos pelo IBGE).
  const nameByIbge = new Map<string, string>();
  for (const leaf of leaves) {
    if (leaf.codigoIbge && !nameByIbge.has(leaf.codigoIbge)) {
      const mun = leaf.details?.find((d) => d.label === "Município/UF")?.value.split(" / ")[0];
      if (mun) nameByIbge.set(leaf.codigoIbge, mun);
    }
  }

  const results = await Promise.allSettled(
    codes.map(async (ibge) => {
      const nome = nameByIbge.get(ibge) ?? "";
      if (nome === "") return null;
      const { rows } = await fetchD1Entities(
        { kind: "municipality", q: nome, limit: 20 },
        fetcher,
      );
      // Casa pelo código IBGE exato (o LIKE por nome pode trazer homônimos).
      const match =
        rows.find(
          (r) =>
            str(attr(r, "codigoIbge")) === ibge ||
            str(r.external_ids?.["codigoIbge"]) === ibge,
        ) ?? rows[0];
      if (!match) return null;
      const leaf = leafFromRow("municipality", match, "municipio");
      return leaf ? { leaf, ibge } : null;
    }),
  );

  const municipios: RawLeaf[] = [];
  const edges: Array<{ from: string; to: string }> = [];
  const seen = new Set<string>();
  for (const r of results) {
    if (r.status !== "fulfilled" || r.value === null) continue;
    const { leaf, ibge } = r.value;
    if (!seen.has(leaf.id)) {
      seen.add(leaf.id);
      municipios.push(leaf);
    }
    // Liga cada contrato/licitação daquele IBGE ao nó-município.
    for (const fromId of ibgeToLeaves.get(ibge) ?? []) {
      edges.push({ from: fromId, to: leaf.id });
    }
  }
  return { municipios, edges };
}

// ─── API pública: busca textual (começar por nome) ───────────────────────────────

/**
 * Busca textual de entidades por NOME (param `q` do d1-bridge) para o usuário
 * escolher o centro do grafo. Varre os kinds "âncora" (empresa/órgão/marca/
 * político/proposição/município) em paralelo e mescla os resultados.
 * Tolerante a falhas — um kind que falha não derruba os demais.
 */
export async function searchEntities(
  termo: string,
  fetcher: typeof fetch = fetch,
): Promise<SearchHit[]> {
  const q = termo.trim();
  if (q.length < 2) return [];

  const results = await Promise.allSettled(
    SEARCH_KINDS.map(async (kind) => {
      const { rows } = await fetchD1Entities({ kind, q, limit: 25 }, fetcher);
      return rows.map<SearchHit>((row) => {
        const cnpj = validCnpj(str(row.cnpj) || str(attr(row, "cnpj")));
        const ibge =
          str(attr(row, "codigoIbge")) || str(row.external_ids?.["codigoIbge"]);
        const uf = str(attr(row, "uf")) || str(attr(row, "ufNome"));
        const partido = str(attr(row, "partido"));
        const sub =
          kind === "politician"
            ? [partido, uf].filter(Boolean).join("-")
            : kind === "municipality"
              ? uf
              : kind === "trademark"
                ? str(attr(row, "status"))
                : uf;
        return {
          id: row.id,
          kind,
          name: str(attr(row, "fornecedorNome")) || str(row.name) || "—",
          cnpj: cnpj || undefined,
          codigoIbge: ibge || undefined,
          sublabel: sub || undefined,
        };
      });
    }),
  );

  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const hit of r.value) {
      // Deduplica por CNPJ+kind (contratos repetem muito a mesma empresa).
      const dedupe = hit.cnpj ? `${hit.kind}:${hit.cnpj}` : `${hit.kind}:${hit.id}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      if (hit.name !== "—") hits.push(hit);
    }
  }

  // Empresas/órgãos com CNPJ primeiro (são os centros mais ricos), depois o resto.
  hits.sort((a, b) => {
    const aw = a.cnpj ? 0 : 1;
    const bw = b.cnpj ? 0 : 1;
    if (aw !== bw) return aw - bw;
    return a.name.localeCompare(b.name, "pt-BR");
  });
  return hits.slice(0, 40);
}

// ─── API pública: expandir um CNPJ (centro = empresa/pessoa) ─────────────────────

/**
 * Expande um CNPJ: busca todos os kinds por CNPJ em paralelo, cruza por NOME os
 * kinds sem CNPJ casado (processos), abre os municípios referenciados (por IBGE)
 * e tenta o caminho premium (InfoSimples) para marcas. Tolerante a falhas.
 */
export async function expandCnpj(
  rawCnpj: string,
  fetcher: typeof fetch = fetch,
): Promise<ExpandResult> {
  const cnpj = sanitizeCnpj(rawCnpj);
  if (cnpj === "") {
    throw new Error("CNPJ inválido: digite os 14 números (com ou sem máscara).");
  }

  const cnpjResults = await Promise.allSettled(
    CNPJ_KINDS.map((kind) => fetchKindByCnpj(kind, cnpj, fetcher)),
  );

  const leaves: RawLeaf[] = [];
  const counts: Partial<Record<NodeKind, number>> = {};
  const errors: string[] = [];
  let centerLabel = "";

  cnpjResults.forEach((result, i) => {
    const kind = CNPJ_KINDS[i]!;
    if (result.status === "fulfilled") {
      const { leaves: kindLeaves, centerLabel: candidate } = result.value;
      if (centerLabel === "" && candidate) centerLabel = candidate;
      if (kindLeaves.length > 0) counts[kind] = kindLeaves.length;
      leaves.push(...kindLeaves);
    } else {
      errors.push(`${kind}: ${toErrorMessage(result.reason)}`);
    }
  });

  // Cruza por NOME (processos sem CNPJ) — só quando já temos um rótulo de empresa.
  if (centerLabel !== "" && centerLabel !== formatCnpj(cnpj)) {
    const nameResults = await Promise.allSettled(
      NAME_KINDS.map((kind) => fetchKindByName(kind, centerLabel, fetcher, "name")),
    );
    nameResults.forEach((result, i) => {
      const kind = NAME_KINDS[i]!;
      if (result.status === "fulfilled" && result.value.length > 0) {
        counts[kind] = (counts[kind] ?? 0) + result.value.length;
        leaves.push(...result.value);
      } else if (result.status === "rejected") {
        errors.push(`${kind}: ${toErrorMessage(result.reason)}`);
      }
    });
  }

  // Caminho premium de marcas (InfoSimples). Quando ATIVO, substitui as marcas da
  // base RPI (fonte mais completa). Quando dormente/indisponível, mantém as da base.
  let trademarksPremium = false;
  try {
    const premium = await fetchTrademarksPremium(cnpj, fetcher);
    if (premium !== null) {
      // Remove as marcas vindas da base RPI e usa as premium.
      for (let i = leaves.length - 1; i >= 0; i--) {
        if (leaves[i]!.kind === "trademark") leaves.splice(i, 1);
      }
      leaves.push(...premium);
      if (premium.length > 0) counts["trademark"] = premium.length;
      else delete counts["trademark"];
      trademarksPremium = true;
    }
  } catch {
    /* degrada para a base RPI já carregada */
  }

  // Abre os municípios referenciados pelas folhas (por código IBGE) como nós.
  const municipalityEdges: Array<{ from: string; to: string }> = [];
  try {
    const { municipios, edges } = await fetchMunicipiosForLeaves(leaves, fetcher);
    if (municipios.length > 0) {
      counts["municipality"] = municipios.length;
      leaves.push(...municipios);
      municipalityEdges.push(...edges);
    }
  } catch (error) {
    errors.push(`municipality: ${toErrorMessage(error)}`);
  }

  return {
    cnpj,
    centerLabel: centerLabel || formatCnpj(cnpj),
    leaves,
    counts,
    errors,
    trademarksPremium,
    municipalityEdges: municipalityEdges.length > 0 ? municipalityEdges : undefined,
  };
}

// ─── API pública: expandir um nó-folha qualquer ──────────────────────────────────

/**
 * Expande um nó-folha conforme o que ele carrega:
 *   • tem CNPJ próprio  → `expandCnpj` (rede completa do órgão/empresa).
 *   • tem searchTerm    → busca por NOME nos kinds âncora (político, município…).
 * Quando não há por onde expandir, devolve vazio (a página trata).
 */
export async function expandLeaf(
  node: { cnpj?: string | undefined; searchTerm?: string | undefined; label: string },
  fetcher: typeof fetch = fetch,
): Promise<ExpandResult> {
  if (node.cnpj && sanitizeCnpj(node.cnpj) !== "") {
    return expandCnpj(node.cnpj, fetcher);
  }
  const termo = (node.searchTerm ?? node.label).trim();
  if (termo.length < 3) {
    return { cnpj: "", centerLabel: node.label, leaves: [], counts: {}, errors: [] };
  }

  // Expansão por nome: varre os kinds âncora e liga tudo por "name".
  const results = await Promise.allSettled(
    SEARCH_KINDS.filter((k) => k !== "municipality").map((kind) =>
      fetchKindByName(kind, termo, fetcher, "name"),
    ),
  );
  const leaves: RawLeaf[] = [];
  const counts: Partial<Record<NodeKind, number>> = {};
  const errors: string[] = [];
  results.forEach((r) => {
    if (r.status === "fulfilled") {
      for (const leaf of r.value) {
        counts[leaf.kind] = (counts[leaf.kind] ?? 0) + 1;
        leaves.push(leaf);
      }
    } else {
      errors.push(toErrorMessage(r.reason));
    }
  });

  return { cnpj: "", centerLabel: node.label, leaves, counts, errors };
}

/** CNPJ de exemplo para o estado inicial — escolhido por ter rede rica de dados. */
export const EXEMPLO_CNPJ = "00000000000191"; // Banco do Brasil S.A.
