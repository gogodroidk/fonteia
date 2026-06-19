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

/**
 * Marcador de origem usado em `crossEdges` quando a aresta deve partir do NÓ
 * CENTRAL (cujo id só a página conhece). A página (`mergeExpansion`) troca este
 * sentinela pelo id real do centro ao fundir a expansão. Ex.: sócios do QSA, que
 * ligam ao centro-empresa, não a um nó `company` solto.
 */
export const CENTER_SENTINEL = "__center__";

/**
 * Kinds que buscamos POR CNPJ para montar as conexões diretas de uma empresa.
 *
 * `company` (BrasilAPI) e `parliamentary_expense` casam pela coluna `cnpj`:
 *   • `company`               → o registro cadastral da PRÓPRIA empresa-centro
 *     (CNAE, capital, QSA…). Não vira nó solto: enriquece o centro e expõe sócios.
 *   • `parliamentary_expense` → despesas em que a empresa-centro foi FORNECEDORA
 *     (a coluna `cnpj` da despesa é o `cnpjFornecedor`). É a ponta empresa→político
 *     do "siga o dinheiro": cada despesa também abre o nó do deputado pagador.
 */
const CNPJ_KINDS: GraphKind[] = [
  "sanction",
  "public_contract",
  "bidding_opportunity",
  "environmental_infraction",
  "organization",
  "trademark",
  "parliamentary_expense",
  "company",
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
  "company",
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

/**
 * Teto de DEPUTADOS distintos abertos a partir das despesas de uma empresa
 * (ponta empresa→político do "siga o dinheiro"). Mantém o leque legível.
 */
const MAX_DEPUTADOS = 16;

/**
 * Teto de FORNECEDORES distintos abertos a partir das despesas de um político
 * (ponta político→empresa). Cada CNPJ vira um nó-empresa por baixo.
 */
const MAX_FORNECEDORES = 24;

/**
 * Teto de SÓCIOS (QSA) abertos a partir do cadastro de uma empresa. O QSA da
 * Receita costuma ter poucos sócios, mas grandes grupos podem ter dezenas.
 */
const MAX_SOCIOS = 20;

/**
 * Página varrida ao caçar votações de um deputado. As votações NÃO têm o nome do
 * deputado no texto (só nos `attributes.votos[]`), então não dá para filtrar por
 * `q`: pegamos as mais recentes e filtramos no cliente por `deputadoId`. Cap
 * deliberadamente modesto — é melhor mostrar as votações recentes do que varrer
 * dezenas de milhares de registros e travar o canvas.
 */
const VOTE_SCAN_LIMIT = 400;

/** Teto de votações ligadas a um deputado (depois do filtro client-side). */
const MAX_VOTES = 24;

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
  /** Id do deputado na Câmara (quando o nó é `politician`) — cruza despesas/votos. */
  deputadoId?: string | undefined;
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
  /**
   * Detalhes cadastrais do CENTRO (do registro `company` BrasilAPI, quando houver):
   * CNAE, capital social, natureza jurídica, situação, nº de sócios… A página os
   * funde no nó central para enriquecer o painel de detalhe da empresa pesquisada.
   */
  centerDetails?: DetailField[] | undefined;
  /** Link da fonte do CENTRO (cadastro CNPJ na BrasilAPI), quando houver. */
  centerSourceUrl?: string | undefined;
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
  /**
   * Arestas extra TIPADAS entre folhas (não passam pelo centro). Servem para os
   * cruzamentos do "siga o dinheiro" e da atividade legislativa:
   *   • despesa → empresa fornecedora (rel `fornecedor`)
   *   • despesa → deputado pagador     (rel `despesa`)
   *   • votação → proposição           (rel `voto`)
   *   • empresa → sócio do QSA         (rel `socio`)
   * A página liga `from`↔`to` com o `rel` informado (cor/comprimento do fio).
   */
  crossEdges?: Array<{ from: string; to: string; rel: EdgeKind }> | undefined;
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
  /**
   * Id do deputado na Câmara (`attributes.id`) quando o hit for `politician`.
   * Habilita o cruzamento por deputadoId (despesas + votações) ao centralizar.
   */
  deputadoId?: string | undefined;
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
    case "parliamentary_expense": {
      // Preferimos o comprovante real (urlDocumento); senão, a cota do deputado.
      const url = str(attr(row, "urlDocumento"));
      if (url) return url;
      const depId = str(row.external_ids?.["deputadoId"]) || str(attr(row, "deputadoId"));
      return depId
        ? `https://www.camara.leg.br/deputados/${depId}?ano=${str(attr(row, "ano"))}`
        : "https://www.camara.leg.br/transparencia/gastos-parlamentares";
    }
    case "legislative_vote": {
      const id = str(row.external_ids?.["votacaoId"]) || str(attr(row, "id"));
      return id
        ? `https://www.camara.leg.br/votacoes/${id}`
        : "https://www.camara.leg.br/votacoes";
    }
    case "company": {
      const cnpj = sanitizeCnpj(str(row.cnpj) || str(attr(row, "cnpj")));
      return cnpj ? `https://brasilapi.com.br/api/cnpj/v1/${cnpj}` : undefined;
    }
    default:
      return undefined;
  }
}

// ─── Conversão de linha → nó-folha (com detalhes para o painel) ──────────────────

/**
 * Identidade do nó CENTRAL (entidade pesquisada), passada ao construtor de folhas
 * para que contratos/licitações/despesas mostrem a CONTRAPARTE (o outro lado da
 * relação), nunca o nome do próprio centro. Ambos os campos são opcionais: quando
 * desconhecidos, caímos num rótulo seguro (órgão), sem repetir o centro.
 */
interface CenterRef {
  /** CNPJ (14 dígitos, já sanitizado) do centro, quando a origem foi por CNPJ. */
  cnpj?: string | undefined;
  /** Nome/razão social do centro (fallback de comparação quando falta CNPJ). */
  name?: string | undefined;
}

/**
 * Decide de que LADO de um contrato/licitação está o centro, para escolher a
 * contraparte a exibir como rótulo do nó:
 *   • "supplier" → centro é o fornecedor; o rótulo deve ser o ÓRGÃO contratante.
 *   • "buyer"    → centro é o órgão; o rótulo deve ser o FORNECEDOR.
 *   • "unknown"  → não dá para afirmar; o chamador usa o default (órgão), porque
 *     contratos quase sempre são consultados pelo CNPJ do fornecedor.
 * A comparação é só por CNPJ (preciso, sem falso positivo) — o nome é frágil aqui
 * (o centro PODE ter o mesmo nome do órgão em casos raros, mas isso é tratado pelo
 * default seguro). `fornCnpj`/`orgaoCnpj` já vêm sanitizados pelo chamador.
 */
function contractSide(
  center: CenterRef | undefined,
  fornCnpj: string,
  orgaoCnpj: string,
): "supplier" | "buyer" | "unknown" {
  const centerCnpj = center?.cnpj ?? "";
  if (centerCnpj !== "") {
    if (fornCnpj !== "" && fornCnpj === centerCnpj) return "supplier";
    if (orgaoCnpj !== "" && orgaoCnpj === centerCnpj) return "buyer";
  }
  return "unknown";
}

/**
 * Transforma uma linha do BULK num nó-folha conforme o kind, montando também os
 * `details` (rótulo→valor) para o painel e o `sourceUrl` da fonte oficial.
 * `rel` indica como o nó se liga ao pai (cor do fio). Devolve null quando a linha
 * não tem nada útil para mostrar (evita nós "vazios").
 *
 * `center` (opcional) é a identidade da entidade central: contratos, licitações e
 * despesas usam-na para rotular a CONTRAPARTE (o outro lado), nunca o próprio
 * centro — senão um grafo de uma empresa fornecedora mostraria dezenas de nós
 * todos com o nome dela mesma.
 */
function leafFromRow(
  kind: GraphKind,
  row: D1EntityRow,
  rel: EdgeKind,
  center?: CenterRef | undefined,
): RawLeaf | null {
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
      // No PNCP, `row.cnpj` é o CNPJ do fornecedor (extraído de niFornecedor).
      const fornCnpj = validCnpj(str(attr(row, "fornecedorCnpj")) || str(row.cnpj));
      const munUf = [municipio, uf].filter(Boolean).join("/");
      pushField(details, "Fornecedor", fornecedor);
      pushField(details, "Órgão", orgao);
      pushField(details, "Objeto", objeto.slice(0, 220));
      pushField(details, "Valor", valor);
      pushField(details, "Modalidade", str(attr(row, "modalidade")));
      pushField(details, "Município/UF", [municipio, uf].filter(Boolean).join(" / "));
      pushField(details, "Assinatura", formatDate(attr(row, "dataAssinatura")));
      // Rótulo = a CONTRAPARTE em relação ao centro. Quando o centro é o
      // fornecedor (caso típico — contratos são buscados pelo CNPJ do fornecedor),
      // mostramos o ÓRGÃO contratante; quando o centro é o órgão, mostramos o
      // fornecedor. Nunca repetimos o nome do próprio centro.
      const side = contractSide(center, fornCnpj, orgaoCnpj);
      const counterparty =
        side === "buyer"
          ? fornecedor || orgao
          : orgao || fornecedor; // "supplier" e "unknown" → órgão (default seguro)
      // O nó é expansível pela CONTRAPARTE quando ela tem CNPJ próprio: se o centro
      // é o fornecedor, abrimos o órgão (orgaoCnpj); se é o órgão, abrimos o
      // fornecedor (fornCnpj). Assim clicar no nó navega para o outro lado.
      const counterpartyCnpj = side === "buyer" ? fornCnpj : orgaoCnpj;
      // Sublabel distingue dois contratos do mesmo órgão (objeto/valor/município).
      const sub =
        [objeto ? objeto.slice(0, 48) : "", valor, munUf].filter(Boolean).join(" · ") ||
        undefined;
      return {
        id,
        kind,
        rel,
        label: counterparty || "Contrato",
        sublabel: sub,
        codigoIbge: ibge || undefined,
        cnpj: counterpartyCnpj || undefined,
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
      const munUf = [municipio, uf].filter(Boolean).join("/");
      pushField(details, "Objeto", objeto.slice(0, 220));
      pushField(details, "Órgão", orgao);
      pushField(details, "Valor estimado", valor);
      pushField(details, "Modalidade", str(attr(row, "modalidade")));
      pushField(details, "Município/UF", [municipio, uf].filter(Boolean).join(" / "));
      pushField(details, "Abertura", formatDate(attr(row, "dataAbertura")));
      pushField(details, "Situação", str(attr(row, "situacao")));
      // Licitação é pré-contrato (sem fornecedor adjudicado), então o objeto é o
      // dado mais descritivo. Quando o centro É o próprio órgão da licitação,
      // mostrar o objeto também evita repetir o nome do centro; senão preferimos
      // o objeto e, na falta dele, o órgão (a contraparte) — nunca o centro.
      const centerIsOrgao =
        (center?.cnpj ?? "") !== "" && orgaoCnpj !== "" && orgaoCnpj === center?.cnpj;
      const label = objeto
        ? objeto.slice(0, 64)
        : centerIsOrgao
          ? "Licitação"
          : orgao || "Licitação";
      const sub =
        [orgao, valor, munUf].filter(Boolean).join(" · ") || undefined;
      return {
        id,
        kind,
        rel,
        label,
        sublabel: sub,
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
      const depId = str(attr(row, "id")) || str(row.external_ids?.["camaraId"]);
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
        deputadoId: depId || undefined,
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
    case "parliamentary_expense": {
      const deputado = str(attr(row, "deputadoNome"));
      const partido = str(attr(row, "partido"));
      const uf = str(attr(row, "uf"));
      const tipo = str(attr(row, "tipo"));
      const fornecedor = str(attr(row, "fornecedor"));
      const fornCnpj = validCnpj(str(attr(row, "cnpjFornecedor")) || str(row.cnpj));
      const valor = moneyFromReais(attr(row, "valorLiquido")) || moneyFromReais(attr(row, "valorDocumento"));
      pushField(details, "Deputado(a)", deputado);
      pushField(details, "Partido/UF", [partido, uf].filter(Boolean).join("-"));
      pushField(details, "Tipo de gasto", tipo);
      pushField(details, "Fornecedor", fornecedor);
      pushField(details, "CNPJ fornecedor", fornCnpj ? formatCnpj(fornCnpj) : "");
      pushField(details, "Valor", valor);
      pushField(details, "Data", formatDate(attr(row, "dataDocumento")));
      // Mostra a CONTRAPARTE em relação ao centro. Quando o centro é a EMPRESA
      // fornecedora (a despesa casou pelo CNPJ do fornecedor), a contraparte é o
      // DEPUTADO pagador → rótulo = deputado. Quando o centro é o POLÍTICO, a
      // contraparte é o FORNECEDOR → rótulo = fornecedor. Sem centro/indefinido,
      // preferimos o fornecedor (o tipo de gasto sozinho é pouco informativo).
      const centerIsSupplier =
        (center?.cnpj ?? "") !== "" && fornCnpj !== "" && fornCnpj === center?.cnpj;
      const counterparty = centerIsSupplier
        ? deputado || fornecedor
        : fornecedor || deputado;
      const sub =
        [tipo, valor].filter(Boolean).join(" · ") || undefined;
      return {
        id,
        kind,
        rel,
        label: counterparty || tipo || "Despesa parlamentar",
        sublabel: sub,
        // A despesa carrega o CNPJ do FORNECEDOR — assim ela é expansível e a
        // página pode ligar a despesa à empresa fornecedora (siga o dinheiro).
        cnpj: fornCnpj || undefined,
        sourceUrl,
        details,
      };
    }
    case "legislative_vote": {
      const orgao = str(attr(row, "siglaOrgao"));
      const descricao = str(attr(row, "descricao"));
      const aprov = attr(row, "aprovacao");
      const resultado =
        aprov === true ? "Aprovado" : aprov === false ? "Rejeitado" : "";
      const prop = attr(row, "proposicao") as Record<string, unknown> | undefined;
      const propLabel = prop
        ? [str(prop["siglaTipo"]), str(prop["numero"])].filter(Boolean).join(" ") +
          (str(prop["ano"]) ? `/${str(prop["ano"])}` : "")
        : "";
      const placar = [
        str(attr(row, "placarSim")) ? `Sim ${str(attr(row, "placarSim"))}` : "",
        str(attr(row, "placarNao")) ? `Não ${str(attr(row, "placarNao"))}` : "",
        str(attr(row, "placarAbstencoes")) ? `Abst. ${str(attr(row, "placarAbstencoes"))}` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      pushField(details, "Órgão", orgao);
      pushField(details, "Descrição", descricao.slice(0, 220));
      pushField(details, "Proposição", propLabel);
      pushField(details, "Resultado", resultado);
      pushField(details, "Placar", placar);
      pushField(details, "Data", formatDate(attr(row, "data")));
      return {
        id,
        kind,
        rel,
        label: descricao ? descricao.slice(0, 64) : orgao || "Votação",
        sublabel: [propLabel || orgao, resultado].filter(Boolean).join(" · ") || undefined,
        sourceUrl,
        details,
      };
    }
    case "company": {
      const razao = str(attr(row, "razaoSocial")) || name;
      const fantasia = str(attr(row, "nomeFantasia"));
      const ownCnpj = validCnpj(str(row.cnpj) || str(attr(row, "cnpj")));
      const cnae = attr(row, "cnaePrincipal") as Record<string, unknown> | undefined;
      const cnaeStr = cnae
        ? [str(cnae["codigo"]), str(cnae["descricao"])].filter(Boolean).join(" — ")
        : "";
      const capital = moneyFromReais(attr(row, "capitalSocial"));
      const natureza = str(attr(row, "naturezaJuridica"));
      const situacao = str(attr(row, "situacaoCadastral"));
      const municipio = str(attr(row, "municipio"));
      const uf = str(attr(row, "uf"));
      const ibge = str(attr(row, "codigoIbge"));
      const simples = attr(row, "simples");
      const mei = attr(row, "mei");
      const qsa = attr(row, "qsa");
      const nSocios = Array.isArray(qsa) ? qsa.length : 0;
      pushField(details, "Razão social", razao);
      pushField(details, "Nome fantasia", fantasia);
      pushField(details, "CNPJ", ownCnpj ? formatCnpj(ownCnpj) : "");
      pushField(details, "Situação", situacao);
      pushField(details, "CNAE principal", cnaeStr);
      pushField(details, "Natureza jurídica", natureza);
      pushField(details, "Capital social", capital);
      pushField(
        details,
        "Regime",
        [simples === true ? "Simples" : "", mei === true ? "MEI" : ""].filter(Boolean).join(" · "),
      );
      pushField(details, "Município/UF", [municipio, uf].filter(Boolean).join(" / "));
      pushField(details, "Sócios (QSA)", nSocios > 0 ? String(nSocios) : "");
      return {
        id,
        kind,
        rel,
        label: razao || "Empresa",
        sublabel: [cnaeStr.split(" — ")[1] || cnaeStr, situacao].filter(Boolean).join(" · ") || undefined,
        cnpj: ownCnpj || undefined,
        codigoIbge: ibge || undefined,
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

/**
 * Busca um kind por CNPJ, devolvendo nós-folha + candidato a rótulo do centro +
 * as linhas cruas (para os cruzamentos que precisam de attributes além da folha,
 * ex.: QSA de `company`, deputado de `parliamentary_expense`). `rel` define como
 * a folha se liga ao centro (despesas de fornecedor usam `fornecedor`, não `cnpj`).
 */
async function fetchKindByCnpj(
  kind: GraphKind,
  cnpj: string,
  fetcher: typeof fetch,
  rel: EdgeKind = "cnpj",
): Promise<{ leaves: RawLeaf[]; centerLabel: string; rows: D1EntityRow[] }> {
  const { rows } = await fetchD1Entities({ kind, cnpj, limit: PAGE_LIMIT }, fetcher);

  // O centro desta busca É o CNPJ consultado: passamos sua identidade às folhas
  // para que contratos/licitações/despesas rotulem a contraparte, não o centro.
  const center: CenterRef = { cnpj };
  const leaves: RawLeaf[] = [];
  const kept: D1EntityRow[] = [];
  let centerLabel = "";
  for (const row of rows) {
    if (centerLabel === "") {
      const candidate = str(attr(row, "fornecedorNome")) || str(row.name);
      if (candidate) centerLabel = candidate;
    }
    const leaf = leafFromRow(kind, row, rel, center);
    if (leaf) {
      leaves.push(leaf);
      kept.push(row);
    }
    if (leaves.length >= MAX_PER_KIND) break;
  }
  return { leaves, centerLabel, rows: kept };
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

// ─── Cruzamentos "siga o dinheiro" e atividade legislativa ───────────────────────

/** Nó-pessoa (sócio do QSA) — não é um kind do D1, é derivado de `company.qsa`. */
function personLeaf(
  socio: Record<string, unknown>,
  ownerCnpj: string,
  index: number,
): RawLeaf | null {
  const nome = str(socio["nomeSocio"]);
  if (nome === "") return null;
  const qualificacao = str(socio["qualificacao"]);
  const dataEntrada = str(socio["dataEntrada"]);
  const repr = str(socio["nomeRepresentante"]);
  const details: DetailField[] = [];
  pushField(details, "Sócio", nome);
  pushField(details, "Qualificação", qualificacao);
  pushField(details, "Entrada na sociedade", formatDate(dataEntrada));
  pushField(details, "Representante legal", repr);
  return {
    // Id estável por (CNPJ da empresa + nome do sócio): evita colisão entre
    // sócios homônimos de empresas diferentes e deduplica o mesmo sócio.
    id: `person:${ownerCnpj}:${norm(nome).replace(/\s+/g, "-")}:${index}`,
    kind: "person",
    rel: "socio",
    label: nome,
    sublabel: qualificacao || undefined,
    // Pessoas físicas não têm CNPJ; expandir por nome cruza outras bases (raro,
    // mas habilita o caso de um sócio que também seja político/fornecedor PF).
    searchTerm: nome,
    details,
  };
}

/** Normaliza texto p/ ids/keys (minúsculas, sem acento). Local — sem DOM. */
function norm(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/**
 * A partir das linhas `company` cruas (cadastro BrasilAPI da empresa-centro),
 * extrai os SÓCIOS do QSA como nós-pessoa. A ligação é feita ao CENTRO pelo
 * chamador (não há nó `company` solto — o cadastro enriquece o próprio centro).
 * Degrada para vazio quando não há `company` ou o QSA está vazio.
 */
function sociosFromCompanyRows(rows: D1EntityRow[]): RawLeaf[] {
  const socios: RawLeaf[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const ownerCnpj = sanitizeCnpj(str(row.cnpj) || str(attr(row, "cnpj")));
    const qsa = attr(row, "qsa");
    if (!Array.isArray(qsa)) continue;
    qsa.slice(0, MAX_SOCIOS).forEach((s, i) => {
      if (s == null || typeof s !== "object") return;
      const person = personLeaf(s as Record<string, unknown>, ownerCnpj, i);
      if (!person || seen.has(person.id)) return;
      seen.add(person.id);
      socios.push(person);
    });
  }
  return socios;
}

/**
 * Ponta EMPRESA → POLÍTICO do "siga o dinheiro": a partir das despesas em que a
 * empresa-centro foi fornecedora (`parliamentary_expense` casadas por CNPJ),
 * resolve os DEPUTADOS pagadores como nós `politician` (buscando por `deputadoId`)
 * e devolve as arestas despesa→deputado. Cap por `MAX_DEPUTADOS`.
 */
async function deputadosFromExpenseLeaves(
  expenseLeaves: Array<{ leaf: RawLeaf; deputadoId: string; deputadoNome: string }>,
  fetcher: typeof fetch,
): Promise<{
  politicians: RawLeaf[];
  edges: Array<{ from: string; to: string; rel: EdgeKind }>;
}> {
  // Agrupa as despesas por deputadoId (cada deputado vira um único nó).
  const byDeputado = new Map<string, { ids: string[]; nome: string }>();
  for (const e of expenseLeaves) {
    if (e.deputadoId === "") continue;
    const entry = byDeputado.get(e.deputadoId) ?? { ids: [], nome: e.deputadoNome };
    entry.ids.push(e.leaf.id);
    if (entry.nome === "" && e.deputadoNome) entry.nome = e.deputadoNome;
    byDeputado.set(e.deputadoId, entry);
  }
  const deputadoIds = [...byDeputado.keys()].slice(0, MAX_DEPUTADOS);
  if (deputadoIds.length === 0) return { politicians: [], edges: [] };

  // Os deputados da Câmara são ~513 — buscamos a lista UMA vez e casamos todos os
  // ids no cliente (o d1-bridge não filtra por external_ids). Bem mais barato que
  // uma chamada por deputado.
  const byId = await fetchPoliticiansById(fetcher);

  const politicians: RawLeaf[] = [];
  const edges: Array<{ from: string; to: string; rel: EdgeKind }> = [];
  const seen = new Set<string>();
  for (const depId of deputadoIds) {
    const group = byDeputado.get(depId)!;
    const row = byId.get(depId);
    let leaf: RawLeaf | null = row ? leafFromRow("politician", row, "despesa") : null;
    if (!leaf && group.nome) {
      // Sem registro `politician` na base: sintetiza um nó mínimo a partir do nome
      // embutido na despesa (degrada com elegância, sem fabricar dados).
      leaf = {
        id: `politician:depid:${depId}`,
        kind: "politician",
        rel: "despesa",
        label: group.nome,
        searchTerm: group.nome,
        deputadoId: depId,
        sourceUrl: `https://www.camara.leg.br/deputados/${depId}`,
        details: [{ label: "Deputado(a)", value: group.nome }],
      };
    }
    if (!leaf) continue;
    if (!seen.has(leaf.id)) {
      seen.add(leaf.id);
      politicians.push(leaf);
    }
    for (const fromId of group.ids) {
      edges.push({ from: fromId, to: leaf.id, rel: "despesa" });
    }
  }
  return { politicians, edges };
}

/**
 * Carrega os `politician` da base UMA vez e indexa por deputadoId (attributes.id /
 * external_ids.camaraId). Devolve um Map vazio em qualquer falha (degrada sem
 * quebrar — os deputados caem para o nó sintético a partir do nome da despesa).
 */
async function fetchPoliticiansById(
  fetcher: typeof fetch,
): Promise<Map<string, D1EntityRow>> {
  const byId = new Map<string, D1EntityRow>();
  try {
    const { rows } = await fetchD1Entities(
      { kind: "politician", limit: PAGE_LIMIT },
      fetcher,
    );
    for (const r of rows) {
      const id = str(attr(r, "id")) || str(r.external_ids?.["camaraId"]);
      if (id !== "" && !byId.has(id)) byId.set(id, r);
    }
  } catch {
    /* sem lista — usa os nós sintéticos por nome */
  }
  return byId;
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
        const deputadoId =
          kind === "politician"
            ? str(attr(row, "id")) || str(row.external_ids?.["camaraId"])
            : "";
        return {
          id: row.id,
          kind,
          name: str(attr(row, "fornecedorNome")) || str(row.name) || "—",
          cnpj: cnpj || undefined,
          codigoIbge: ibge || undefined,
          deputadoId: deputadoId || undefined,
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
      if (hit.name === "—") continue;
      // Chave de dedupe:
      //   • com CNPJ → CNPJ+kind (contratos/empresas repetem muito a mesma empresa);
      //   • sem CNPJ → NOME normalizado+kind. Sem isso, marcas idênticas (ex.: a
      //     mesma "PETROBRAS ENERGIAS" em vários processos INPI) apareceriam N vezes,
      //     pois cada registro tem id (UUID) distinto. Município mantém o IBGE como
      //     desempate quando houver (homônimos legítimos em UFs diferentes).
      const dedupe = hit.cnpj
        ? `${hit.kind}:${hit.cnpj}`
        : hit.codigoIbge
          ? `${hit.kind}:ibge:${hit.codigoIbge}`
          : `${hit.kind}:name:${norm(hit.name)}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      hits.push(hit);
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
 * kinds sem CNPJ casado (processos), abre os municípios referenciados (por IBGE),
 * tenta o caminho premium (InfoSimples) para marcas e monta os cruzamentos novos:
 *   • cadastro `company` → enriquece o CENTRO + abre os SÓCIOS do QSA (rel `socio`);
 *   • despesas `parliamentary_expense` em que a empresa foi FORNECEDORA → liga ao
 *     centro por `fornecedor` e abre os DEPUTADOS pagadores (rel `despesa`).
 * Tolerante a falhas: cada cruzamento que falhar/vier vazio degrada em silêncio.
 */
export async function expandCnpj(
  rawCnpj: string,
  fetcher: typeof fetch = fetch,
): Promise<ExpandResult> {
  const cnpj = sanitizeCnpj(rawCnpj);
  if (cnpj === "") {
    throw new Error("CNPJ inválido: digite os 14 números (com ou sem máscara).");
  }

  // A despesa liga ao centro como "pagamento a fornecedor"; os demais por "cnpj".
  const relForKind = (kind: GraphKind): EdgeKind =>
    kind === "parliamentary_expense" ? "fornecedor" : "cnpj";

  const cnpjResults = await Promise.allSettled(
    CNPJ_KINDS.map((kind) => fetchKindByCnpj(kind, cnpj, fetcher, relForKind(kind))),
  );

  const leaves: RawLeaf[] = [];
  const counts: Partial<Record<NodeKind, number>> = {};
  const errors: string[] = [];
  let centerLabel = "";
  // Linhas cruas retidas para os cruzamentos que precisam de attributes.
  let companyRows: D1EntityRow[] = [];
  let expenseRows: D1EntityRow[] = [];

  cnpjResults.forEach((result, i) => {
    const kind = CNPJ_KINDS[i]!;
    if (result.status !== "fulfilled") {
      errors.push(`${kind}: ${toErrorMessage(result.reason)}`);
      return;
    }
    const { leaves: kindLeaves, centerLabel: candidate, rows } = result.value;
    if (centerLabel === "" && candidate) centerLabel = candidate;

    // `company` é o cadastro da PRÓPRIA empresa-centro: não vira nó solto (seria um
    // duplicado do centro) — enriquece o centro e alimenta o QSA. Guardamos as rows.
    if (kind === "company") {
      companyRows = rows;
      return;
    }
    if (kind === "parliamentary_expense") expenseRows = rows;

    if (kindLeaves.length > 0) counts[kind] = kindLeaves.length;
    leaves.push(...kindLeaves);
  });

  // Enriquecimento do CENTRO a partir do cadastro `company` (razão, CNAE, capital…).
  let centerDetails: DetailField[] | undefined;
  let centerSourceUrl: string | undefined;
  if (companyRows.length > 0) {
    const companyLeaf = leafFromRow("company", companyRows[0]!, "cnpj");
    if (companyLeaf) {
      centerDetails = companyLeaf.details;
      centerSourceUrl = companyLeaf.sourceUrl;
      if (centerLabel === "" || centerLabel === formatCnpj(cnpj)) {
        centerLabel = companyLeaf.label;
      }
    }
  }

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

  const crossEdges: Array<{ from: string; to: string; rel: EdgeKind }> = [];

  // Sócios do QSA (a partir do cadastro `company` do centro) — ligados ao CENTRO.
  // Não há nó `company` solto (o cadastro enriquece o próprio centro), então cada
  // sócio liga ao centro via o sentinela CENTER_SENTINEL, resolvido na página.
  try {
    const socios = sociosFromCompanyRows(companyRows);
    if (socios.length > 0) {
      counts["person"] = (counts["person"] ?? 0) + socios.length;
      leaves.push(...socios);
      // Liga cada sócio diretamente ao CENTRO. Usamos o id sentinela CENTER_SENTINEL
      // no `from`: a página o resolve para o id real do nó central em `mergeExpansion`.
      for (const s of socios) {
        crossEdges.push({ from: CENTER_SENTINEL, to: s.id, rel: "socio" });
      }
    }
  } catch (error) {
    errors.push(`person(QSA): ${toErrorMessage(error)}`);
  }

  // Ponta empresa→político do "siga o dinheiro": deputados pagadores das despesas.
  try {
    const expenseInfo = expenseRows
      .map((row) => ({
        leaf: leaves.find((l) => l.id === `parliamentary_expense:${row.id}`),
        deputadoId: str(row.external_ids?.["deputadoId"]) || str(attr(row, "deputadoId")),
        deputadoNome: str(attr(row, "deputadoNome")),
      }))
      .filter((e): e is { leaf: RawLeaf; deputadoId: string; deputadoNome: string } =>
        e.leaf != null,
      );
    const { politicians, edges } = await deputadosFromExpenseLeaves(expenseInfo, fetcher);
    if (politicians.length > 0) {
      counts["politician"] = (counts["politician"] ?? 0) + politicians.length;
      leaves.push(...politicians);
      crossEdges.push(...edges);
    }
  } catch (error) {
    errors.push(`politician(despesa): ${toErrorMessage(error)}`);
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
    centerDetails,
    centerSourceUrl,
    leaves,
    counts,
    errors,
    trademarksPremium,
    municipalityEdges: municipalityEdges.length > 0 ? municipalityEdges : undefined,
    crossEdges: crossEdges.length > 0 ? crossEdges : undefined,
  };
}

// ─── API pública: expandir um POLÍTICO (centro = deputado) ───────────────────────

/**
 * Expande um deputado por `deputadoId`: monta a ponta político→empresa do "siga o
 * dinheiro" (despesas CEAP do parlamentar → empresas fornecedoras por CNPJ) e a
 * atividade legislativa (votações de que participou → proposições votadas).
 *
 * Limitações honestas das fontes (degradam com elegância, sem fabricar vínculo):
 *   • Despesas: o d1-bridge não filtra por `deputadoId`; buscamos por NOME (`q`) e
 *     filtramos no cliente por `attributes.deputadoId` para precisão.
 *   • Votações: NÃO trazem o nome do deputado no texto (só em `attributes.votos[]`),
 *     então varremos um lote das mais recentes (`VOTE_SCAN_LIMIT`) e filtramos por
 *     `deputadoId` — mostramos as recentes, não o histórico inteiro.
 */
export async function expandPolitician(
  deputadoId: string,
  nome: string,
  fetcher: typeof fetch = fetch,
): Promise<ExpandResult> {
  const leaves: RawLeaf[] = [];
  const counts: Partial<Record<NodeKind, number>> = {};
  const errors: string[] = [];
  const crossEdges: Array<{ from: string; to: string; rel: EdgeKind }> = [];

  // ── Despesas do parlamentar → empresas fornecedoras ──
  try {
    const q = nome.trim();
    const { rows } = q.length >= 3
      ? await fetchD1Entities(
          { kind: "parliamentary_expense", q, limit: PAGE_LIMIT },
          fetcher,
        )
      : { rows: [] as D1EntityRow[] };

    // Filtra por deputadoId (precisão) ou, na ausência do id, pelo nome casado.
    const mine = rows.filter((r) => {
      const rid = str(r.external_ids?.["deputadoId"]) || str(attr(r, "deputadoId"));
      if (deputadoId !== "") return rid === deputadoId;
      return norm(str(attr(r, "deputadoNome"))) === norm(nome);
    });

    // Agrupa fornecedores distintos (1 nó-empresa por CNPJ, não 1 por documento).
    const fornByCnpj = new Map<string, { nome: string; expenseIds: string[] }>();
    for (const row of mine.slice(0, MAX_PER_KIND)) {
      const leaf = leafFromRow("parliamentary_expense", row, "despesa");
      if (!leaf) continue;
      leaves.push(leaf);
      counts["parliamentary_expense"] = (counts["parliamentary_expense"] ?? 0) + 1;
      const fornCnpj = validCnpj(str(attr(row, "cnpjFornecedor")) || str(row.cnpj));
      if (fornCnpj === "") continue;
      const entry = fornByCnpj.get(fornCnpj) ?? {
        nome: str(attr(row, "fornecedor")),
        expenseIds: [],
      };
      entry.expenseIds.push(leaf.id);
      fornByCnpj.set(fornCnpj, entry);
    }

    // Cria um nó-empresa por fornecedor e liga despesa→empresa (rel `fornecedor`).
    let fornCount = 0;
    for (const [fornCnpj, info] of fornByCnpj) {
      if (fornCount >= MAX_FORNECEDORES) break;
      fornCount++;
      const companyId = `company:fornecedor:${fornCnpj}`;
      leaves.push({
        id: companyId,
        kind: "company",
        rel: "fornecedor",
        label: info.nome || formatCnpj(fornCnpj),
        sublabel: formatCnpj(fornCnpj),
        cnpj: fornCnpj,
        sourceUrl: `https://brasilapi.com.br/api/cnpj/v1/${fornCnpj}`,
        details: [
          { label: "Fornecedor", value: info.nome || "—" },
          { label: "CNPJ", value: formatCnpj(fornCnpj) },
          { label: "Documentos de despesa", value: String(info.expenseIds.length) },
        ],
      });
      counts["company"] = (counts["company"] ?? 0) + 1;
      for (const expenseId of info.expenseIds) {
        crossEdges.push({ from: expenseId, to: companyId, rel: "fornecedor" });
      }
    }
  } catch (error) {
    errors.push(`parliamentary_expense: ${toErrorMessage(error)}`);
  }

  // ── Votações de que o deputado participou → proposições ──
  try {
    const { rows } = await fetchD1Entities(
      { kind: "legislative_vote", limit: VOTE_SCAN_LIMIT },
      fetcher,
    );
    let voteCount = 0;
    const propSeen = new Set<string>();
    for (const row of rows) {
      if (voteCount >= MAX_VOTES) break;
      const votos = attr(row, "votos");
      if (!Array.isArray(votos) || votos.length === 0) continue;
      const voto = votos.find(
        (v) =>
          v != null &&
          typeof v === "object" &&
          str((v as Record<string, unknown>)["deputadoId"]) === deputadoId,
      ) as Record<string, unknown> | undefined;
      if (!voto && deputadoId !== "") continue;

      const voteLeaf = leafFromRow("legislative_vote", row, "voto");
      if (!voteLeaf) continue;
      // Anexa COMO o deputado votou (Sim/Não/Abstenção) ao detalhe da votação.
      const comoVotou = str(voto?.["voto"]);
      if (comoVotou && voteLeaf.details) {
        voteLeaf.details.push({ label: "Voto do parlamentar", value: comoVotou });
      }
      leaves.push(voteLeaf);
      counts["legislative_vote"] = (counts["legislative_vote"] ?? 0) + 1;
      voteCount++;

      // Proposição votada → nó próprio (rel `voto`), deduplicada por id.
      const prop = attr(row, "proposicao") as Record<string, unknown> | undefined;
      if (prop) {
        const propId = str(prop["id"]);
        const sigla = [str(prop["siglaTipo"]), str(prop["numero"])]
          .filter(Boolean)
          .join(" ");
        const ano = str(prop["ano"]);
        const ementa = str(prop["ementa"]);
        const label = (sigla + (ano ? `/${ano}` : "")).trim() || ementa.slice(0, 40);
        if (label !== "") {
          const nodeId = `legal_proposition:${propId || norm(label).replace(/\s+/g, "-")}`;
          if (!propSeen.has(nodeId)) {
            propSeen.add(nodeId);
            leaves.push({
              id: nodeId,
              kind: "legal_proposition",
              rel: "voto",
              label,
              sublabel: ementa ? ementa.slice(0, 60) : undefined,
              searchTerm: label,
              sourceUrl: propId
                ? `https://www.camara.leg.br/propostas-legislativas/${propId}`
                : undefined,
              details: [
                { label: "Proposição", value: label },
                ...(ementa ? [{ label: "Ementa", value: ementa.slice(0, 240) }] : []),
              ],
            });
            counts["legal_proposition"] = (counts["legal_proposition"] ?? 0) + 1;
          }
          crossEdges.push({ from: voteLeaf.id, to: nodeId, rel: "voto" });
        }
      }
    }
  } catch (error) {
    errors.push(`legislative_vote: ${toErrorMessage(error)}`);
  }

  return {
    cnpj: "",
    centerLabel: nome,
    leaves,
    counts,
    errors,
    crossEdges: crossEdges.length > 0 ? crossEdges : undefined,
  };
}

// ─── API pública: expandir um nó-folha qualquer ──────────────────────────────────

/**
 * Expande um nó-folha conforme o que ele carrega:
 *   • tem CNPJ próprio  → `expandCnpj` (rede completa do órgão/empresa).
 *   • é um deputado     → `expandPolitician` (despesas → fornecedores + votações).
 *   • tem searchTerm    → busca por NOME nos kinds âncora (político, município…).
 * Quando não há por onde expandir, devolve vazio (a página trata).
 */
export async function expandLeaf(
  node: {
    cnpj?: string | undefined;
    searchTerm?: string | undefined;
    deputadoId?: string | undefined;
    kind?: NodeKind | undefined;
    label: string;
  },
  fetcher: typeof fetch = fetch,
): Promise<ExpandResult> {
  if (node.cnpj && sanitizeCnpj(node.cnpj) !== "") {
    return expandCnpj(node.cnpj, fetcher);
  }
  // Deputado: cruzamento dedicado (despesas → fornecedores + votações → proposições).
  if (node.kind === "politician" && (node.deputadoId || node.label)) {
    return expandPolitician(node.deputadoId ?? "", node.searchTerm ?? node.label, fetcher);
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
