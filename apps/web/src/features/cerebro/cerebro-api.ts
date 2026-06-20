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
  "fiscal_report",
  "federal_transfer",
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

/**
 * Teto MAIOR de nós aplicado SÓ ao kind dominante da entidade-centro
 * (normalmente `public_contract`). Empresas grandes — Banco do Brasil, Vivo —
 * têm dezenas a centenas de contratos no MESMO CNPJ; cortar em 50 fazia o grafo
 * parecer "pobre". 120 ainda renderiza liso no canvas (viewport culling).
 */
const MAX_PER_PRIMARY_KIND = 120;

/**
 * Teto de ESTABELECIMENTOS irmãos (mesmo CNPJ-raiz de 8 dígitos) abertos como
 * "empresas relacionadas". Matriz + filiais compartilham os 8 primeiros dígitos
 * do CNPJ (ex.: Banco do Brasil aparece em `00000000000191`, `00000000288519`,
 * `00000000005746`…). Cada CNPJ irmão distinto vira um nó-empresa expansível —
 * é o vínculo mais forte que existe entre dois CNPJs e 100% factual (a Receita
 * define filial pela mesma raiz). Sem isso, contratos de filiais ficam invisíveis.
 */
const MAX_RELATED_ESTABLISHMENTS = 10;

/**
 * Página varrida ao caçar estabelecimentos irmãos. O d1-bridge não filtra por
 * prefixo de CNPJ, então varremos `public_contract` (o kind com mais CNPJs) por
 * NOME da entidade-centro e agrupamos os CNPJs que compartilham a raiz de 8
 * dígitos. Cap modesto: queremos os irmãos mais frequentes, não varrer tudo.
 */
const RELATED_SCAN_LIMIT = 400;

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
  if (/^(.)\1{13}$/.test(cnpj)) return ""; // todos os 14 caracteres iguais (dígitos ou letras)
  return cnpj;
}

/**
 * Raiz do CNPJ (8 primeiros caracteres) — identifica a EMPRESA, e os 4 dígitos
 * seguintes o ESTABELECIMENTO (0001 = matriz, 0002+ = filiais). Dois CNPJs com a
 * mesma raiz são, por definição da Receita, a mesma pessoa jurídica. Devolve "" se
 * o CNPJ for inválido (não confiamos numa raiz derivada de lixo estrutural).
 */
function cnpjRoot(value: unknown): string {
  const cnpj = validCnpj(value);
  return cnpj === "" ? "" : cnpj.slice(0, 8);
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
  // formatCnpj já chama sanitizeCnpj internamente, que preserva letras e
  // remove apenas caracteres de máscara. Se não tiver 14 chars limpos,
  // devolve s inalterado (ex.: CPF mascarado do IBAMA).
  const formatted = formatCnpj(s);
  return formatted !== s ? formatted : s;
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
    case "environmental_alert":
      return "https://queimadas.dgi.inpe.br/queimadas/portal";
    case "fiscal_report":
      return "https://siconfi.tesouro.gov.br/siconfi/pages/public/declaracao/declaracao_list.jsf";
    case "federal_transfer":
      return "https://www.transferegov.gov.br/";
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
    case "environmental_alert": {
      const municipio = str(attr(row, "municipio"));
      const uf = str(attr(row, "uf"));
      const anoMes = str(attr(row, "anoMes"));
      const bioma = str(attr(row, "bioma"));
      const totalFocos = attr(row, "totalFocos");
      const maxRisco = attr(row, "maxRiscoFogo");
      const ibge = str(attr(row, "codigoIbge"));
      // Formata "YYYYMM" → "YYYY/MM"
      const periodo =
        anoMes.length === 6 ? `${anoMes.slice(0, 4)}/${anoMes.slice(4)}` : anoMes;
      pushField(details, "Município/UF", [municipio, uf].filter(Boolean).join(" / "));
      pushField(details, "Período", periodo);
      pushField(details, "Total de focos", totalFocos != null ? String(totalFocos) : "");
      pushField(details, "Risco máximo de fogo", maxRisco != null ? String(maxRisco) : "");
      pushField(details, "Bioma", bioma);
      return {
        id,
        kind,
        rel,
        label: name || `Focos de incêndio — ${municipio || ""}${uf ? ` (${uf})` : ""}${periodo ? ` — ${periodo}` : ""}`.trim() || "Alerta de queimada",
        sublabel: [bioma, periodo].filter(Boolean).join(" · ") || undefined,
        codigoIbge: ibge || undefined,
        sourceUrl,
        details,
      };
    }
    case "fiscal_report": {
      const uf = str(attr(row, "uf"));
      const esfera = str(attr(row, "esfera"));
      const exercicio = attr(row, "exercicio");
      const ownCnpj = validCnpj(str(row.cnpj) || str(attr(row, "cnpj")));
      const ibge = str(attr(row, "codigoIbge"));
      pushField(details, "Ente", name);
      pushField(details, "UF", uf);
      pushField(details, "CNPJ", ownCnpj ? formatCnpj(ownCnpj) : "");
      pushField(details, "Esfera", esfera);
      pushField(details, "Exercício", exercicio != null ? String(exercicio) : "");
      return {
        id,
        kind,
        rel,
        label: name || "Relatório fiscal",
        sublabel: [esfera, uf, exercicio != null ? String(exercicio) : ""].filter(Boolean).join(" · ") || undefined,
        cnpj: ownCnpj || undefined,
        codigoIbge: ibge || undefined,
        sourceUrl,
        details,
      };
    }
    case "federal_transfer": {
      const municipio = str(attr(row, "municipio"));
      const uf = str(attr(row, "uf"));
      const orgaoRepassador = str(attr(row, "orgaoRepassador"));
      const orgaoRecebedor = str(attr(row, "orgaoRecebedor")) || name;
      const valorTotal = moneyFromReais(attr(row, "valorTotal"));
      const valorRepasse = moneyFromReais(attr(row, "valorRepasse"));
      const situacao = str(attr(row, "situacao"));
      const ownCnpj = validCnpj(str(row.cnpj) || str(attr(row, "cnpj")));
      const ibge = str(attr(row, "codigoIbge"));
      pushField(details, "Recebedor", orgaoRecebedor);
      pushField(details, "Órgão repassador", orgaoRepassador);
      pushField(details, "Município/UF", [municipio, uf].filter(Boolean).join(" / "));
      pushField(details, "CNPJ recebedor", ownCnpj ? formatCnpj(ownCnpj) : "");
      pushField(details, "Valor total", valorTotal);
      pushField(details, "Valor repasse", valorRepasse);
      pushField(details, "Situação", situacao);
      return {
        id,
        kind,
        rel,
        label: orgaoRecebedor || "Transferência federal",
        sublabel: [orgaoRepassador, valorRepasse || valorTotal].filter(Boolean).join(" · ") || undefined,
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
/**
 * Normaliza um rótulo cru de empresa (vindo de contratos/despesas) em um nome
 * apresentável para o nó-centro. Sem isto, o centro herdava textos como
 * "CONTRATADA: BANCO DO BRASIL S/A." (contrato) ou
 * "COMBUSTÍVEIS E LUBRIFICANTES. — POSTO X" (categoria CEAP + fornecedor).
 * Conservador: se não conseguir limpar, devolve o texto original aparado.
 */
function cleanCompanyName(raw: string): string {
  let s = raw.trim();
  if (s === "") return s;
  // Despesas CEAP vêm como "CATEGORIA DA DESPESA — FORNECEDOR": fica com o fornecedor.
  const emDash = s.lastIndexOf(" — ");
  if (emDash !== -1) {
    const after = s.slice(emDash + 3).trim();
    if (after !== "") s = after;
  }
  // Remove prefixos de contrato comuns ("CONTRATADA:", "FORNECEDOR -", …).
  s = s.replace(
    /^(contratad[ao]|contratante|contrato|fornecedor|empresa|benefici[áa]ri[ao]|raz[ãa]o social)\s*[:\-–]\s*/i,
    "",
  );
  // Colapsa espaços e remove pontuação solta nas pontas.
  s = s.replace(/\s+/g, " ").replace(/^[\s.,;:–-]+|[\s.,;:–-]+$/g, "").trim();
  return s === "" ? raw.trim() : s;
}

async function fetchKindByCnpj(
  kind: GraphKind,
  cnpj: string,
  fetcher: typeof fetch,
  rel: EdgeKind = "cnpj",
  maxLeaves: number = MAX_PER_KIND,
): Promise<{ leaves: RawLeaf[]; centerLabel: string; rows: D1EntityRow[] }> {
  const { rows } = await fetchD1Entities({ kind, cnpj, limit: PAGE_LIMIT }, fetcher);

  // O centro desta busca É o CNPJ consultado: passamos sua identidade às folhas
  // para que contratos/licitações/despesas rotulem a contraparte, não o centro.
  const center: CenterRef = { cnpj };
  const leaves: RawLeaf[] = [];
  const kept: D1EntityRow[] = [];
  // Rótulo do centro: votamos no nome mais FREQUENTE entre as linhas (não o
  // primeiro), porque o 1º contrato pode trazer um rótulo ruim ("CONTRATADA: …")
  // enquanto a maioria traz a razão social limpa. Mais estável p/ o name-cross.
  const nameVotes = new Map<string, number>();
  for (const row of rows) {
    const candidate = cleanCompanyName(str(attr(row, "fornecedorNome")) || str(row.name));
    if (candidate && candidate.length >= 3) {
      nameVotes.set(candidate, (nameVotes.get(candidate) ?? 0) + 1);
    }
    const leaf = leafFromRow(kind, row, rel, center);
    if (leaf) {
      leaves.push(leaf);
      kept.push(row);
    }
    if (leaves.length >= maxLeaves) break;
  }
  let centerLabel = "";
  let bestVotes = 0;
  for (const [name, votes] of nameVotes) {
    if (votes > bestVotes) {
      bestVotes = votes;
      centerLabel = name;
    }
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

// ─── Estabelecimentos relacionados (matriz/filiais por raiz de CNPJ) ──────────────

/**
 * Descobre os ESTABELECIMENTOS irmãos da empresa-centro: outros CNPJs que
 * compartilham a mesma raiz de 8 dígitos (matriz + filiais). Como o d1-bridge não
 * filtra por prefixo de CNPJ, varremos `public_contract` por NOME da entidade
 * (o kind com de longe mais CNPJs distintos) e agrupamos os CNPJs por raiz,
 * mantendo só os que batem com a raiz do centro e que NÃO são o próprio CNPJ.
 *
 * Cada irmão vira um nó `company` expansível (rel `cnpj` ligado ao centro) — clicar
 * nele abre a rede daquele estabelecimento. É 100% factual (mesma raiz = mesma PJ
 * na Receita) e o vínculo mais forte possível entre dois CNPJs. Degrada para vazio
 * quando não há nome de centro, a raiz é inválida, ou não há irmãos — nunca fabrica.
 *
 * @returns nós-empresa irmãos (sem o próprio centro) ordenados por frequência.
 */
async function fetchRelatedEstablishments(
  centerCnpj: string,
  centerName: string,
  fetcher: typeof fetch,
): Promise<RawLeaf[]> {
  const root = cnpjRoot(centerCnpj);
  const nome = cleanCompanyName(centerName).trim();
  if (root === "" || nome.length < 3) return [];

  let rows: D1EntityRow[];
  try {
    const res = await fetchD1Entities(
      { kind: "public_contract", q: nome, limit: RELATED_SCAN_LIMIT },
      fetcher,
    );
    rows = res.rows;
  } catch {
    return []; // sem rede de contratos por nome — degrada em silêncio
  }

  // Agrupa por CNPJ irmão (mesma raiz, ≠ centro), contando frequência e guardando
  // o melhor rótulo (razão social mais "limpa") e um exemplo de UF/município.
  interface Sibling {
    cnpj: string;
    count: number;
    label: string;
    uf: string;
    municipio: string;
  }
  const byCnpj = new Map<string, Sibling>();
  for (const row of rows) {
    const cnpj = validCnpj(str(attr(row, "fornecedorCnpj")) || str(row.cnpj));
    if (cnpj === "" || cnpj === centerCnpj) continue;
    if (cnpj.slice(0, 8) !== root) continue;
    const label = cleanCompanyName(str(attr(row, "fornecedorNome")) || str(row.name));
    const entry = byCnpj.get(cnpj) ?? {
      cnpj,
      count: 0,
      label: label || formatCnpj(cnpj),
      uf: str(attr(row, "uf")),
      municipio: str(attr(row, "municipio")),
    };
    entry.count += 1;
    // Prefere um rótulo de razão social plausível (>4 chars, com letra).
    if (entry.label.length < 5 && label.length >= 5) entry.label = label;
    byCnpj.set(cnpj, entry);
  }

  const siblings = [...byCnpj.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_RELATED_ESTABLISHMENTS);

  return siblings.map((s) => {
    const ehMatriz = s.cnpj.slice(8, 12) === "0001";
    const details: DetailField[] = [];
    pushField(details, "Empresa", s.label);
    pushField(details, "CNPJ", formatCnpj(s.cnpj));
    pushField(details, "Estabelecimento", ehMatriz ? "Matriz (0001)" : `Filial (${s.cnpj.slice(8, 12)})`);
    pushField(details, "Município/UF", [s.municipio, s.uf].filter(Boolean).join(" / "));
    pushField(details, "Contratos públicos (amostra)", String(s.count));
    return {
      id: `company:related:${s.cnpj}`,
      kind: "company",
      rel: "cnpj",
      label: s.label,
      sublabel: `${ehMatriz ? "Matriz" : "Filial"} · ${formatCnpj(s.cnpj)}`,
      cnpj: s.cnpj,
      // Fonte: PNCP/portais (onde os contratos com este CNPJ foram encontrados).
      sourceUrl: `https://pncp.gov.br/app/contratos?q=${encodeURIComponent(s.cnpj)}`,
      details,
    };
  });
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
  const qn = norm(q);

  // Kinds cujos hits são EMPRESAS por nome (carregam CNPJ no registro): contratos
  // e órgãos. Para esses, deduplicamos por RAIZ de CNPJ (8 dígitos) — assim "Banco
  // do Brasil" aparece UMA vez (matriz), não 5 (uma por filial). Pedimos uma página
  // maior nesses kinds para ter material suficiente p/ escolher a matriz/mais comum.
  const companyByNameKinds = new Set<GraphKind>([
    "public_contract",
    "organization",
    "bidding_opportunity",
  ]);

  const results = await Promise.allSettled(
    SEARCH_KINDS.map(async (kind) => {
      const limit = companyByNameKinds.has(kind) ? 80 : 25;
      const { rows } = await fetchD1Entities({ kind, q, limit }, fetcher);
      return rows.map<SearchHit>((row) => {
        const cnpj = validCnpj(str(row.cnpj) || str(attr(row, "fornecedorCnpj")) || str(attr(row, "cnpj")));
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
        const rawName = str(attr(row, "fornecedorNome")) || str(row.name) || "—";
        return {
          id: row.id,
          kind,
          // Para empresas vindas de contratos, limpamos o rótulo ("CONTRATADA: …").
          name: companyByNameKinds.has(kind) ? cleanCompanyName(rawName) || rawName : rawName,
          cnpj: cnpj || undefined,
          codigoIbge: ibge || undefined,
          deputadoId: deputadoId || undefined,
          sublabel: sub || undefined,
        };
      });
    }),
  );

  // Conta a frequência por RAIZ de CNPJ (entre os kinds-empresa) para escolher o
  // estabelecimento mais relevante quando o usuário busca por nome.
  const rootCount = new Map<string, number>();
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const hit of r.value) {
      if (!hit.cnpj || !companyByNameKinds.has(hit.kind)) continue;
      const root = hit.cnpj.slice(0, 8);
      rootCount.set(root, (rootCount.get(root) ?? 0) + 1);
    }
  }

  // Dedup + escolha do melhor representante por chave.
  const chosen = new Map<string, { hit: SearchHit; score: number }>();
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const hit of r.value) {
      if (hit.name === "—" || hit.name.trim() === "") continue;

      // Chave de dedupe:
      //   • empresa por nome COM CNPJ → RAIZ de CNPJ (colapsa matriz+filiais);
      //   • outros COM CNPJ          → CNPJ+kind;
      //   • sem CNPJ                 → NOME normalizado+kind (ou IBGE p/ município).
      const dedupe =
        hit.cnpj && companyByNameKinds.has(hit.kind)
          ? `company-root:${hit.cnpj.slice(0, 8)}`
          : hit.cnpj
            ? `${hit.kind}:${hit.cnpj}`
            : hit.codigoIbge
              ? `${hit.kind}:ibge:${hit.codigoIbge}`
              : `${hit.kind}:name:${norm(hit.name)}`;

      // Score do representante: prioriza a MATRIZ (0001), depois a raiz mais
      // frequente, e por fim a melhor correspondência de nome com a busca.
      const isMatriz = hit.cnpj ? hit.cnpj.slice(8, 12) === "0001" : false;
      const nameHit = norm(hit.name).includes(qn) ? 1 : 0;
      const freq = hit.cnpj && companyByNameKinds.has(hit.kind)
        ? rootCount.get(hit.cnpj.slice(0, 8)) ?? 0
        : 0;
      const score = (isMatriz ? 1000 : 0) + freq * 4 + nameHit * 2;

      const prev = chosen.get(dedupe);
      if (!prev || score > prev.score) {
        // Ao escolher a matriz como representante de uma empresa-por-nome, normaliza
        // o kind para `company` (centro rico expansível por CNPJ).
        const repr: SearchHit =
          hit.cnpj && companyByNameKinds.has(hit.kind)
            ? { ...hit, kind: "company" }
            : hit;
        chosen.set(dedupe, { hit: repr, score });
      }
    }
  }

  const hits = [...chosen.values()].map((c) => c.hit);

  // Empresas/órgãos com CNPJ primeiro (são os centros mais ricos); dentro de cada
  // grupo, correspondência exata de nome antes de parcial, depois alfabético.
  hits.sort((a, b) => {
    const aw = a.cnpj ? 0 : 1;
    const bw = b.cnpj ? 0 : 1;
    if (aw !== bw) return aw - bw;
    const ae = norm(a.name) === qn ? 0 : 1;
    const be = norm(b.name) === qn ? 0 : 1;
    if (ae !== be) return ae - be;
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

  // Contratos públicos são o kind dominante de empresas grandes — damos a ele um
  // teto maior para o grafo não parecer "pobre" (ex.: BB tem 68 contratos no CNPJ).
  const capForKind = (kind: GraphKind): number =>
    kind === "public_contract" ? MAX_PER_PRIMARY_KIND : MAX_PER_KIND;

  const cnpjResults = await Promise.allSettled(
    CNPJ_KINDS.map((kind) =>
      fetchKindByCnpj(kind, cnpj, fetcher, relForKind(kind), capForKind(kind)),
    ),
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

  // Estabelecimentos relacionados (matriz/filiais por raiz de CNPJ). Cada CNPJ
  // irmão vira um nó-empresa expansível ligado ao CENTRO por `cnpj` (vínculo mais
  // forte). Sem cadastro `company` na base, este é o principal enriquecedor do
  // grafo de grandes empresas — e é 100% factual (mesma raiz = mesma PJ). O fio
  // centro→empresa é criado pelo linking padrão de `mergeExpansion` (rel `cnpj`),
  // por isso NÃO adicionamos crossEdge redundante aqui.
  try {
    if (centerLabel !== "" && centerLabel !== formatCnpj(cnpj)) {
      const related = await fetchRelatedEstablishments(cnpj, centerLabel, fetcher);
      // Evita duplicar um irmão que já apareceu como nó (ex.: via outro kind).
      const existingIds = new Set(leaves.map((l) => l.id));
      const fresh = related.filter((r) => !existingIds.has(r.id));
      if (fresh.length > 0) {
        counts["company"] = (counts["company"] ?? 0) + fresh.length;
        leaves.push(...fresh);
      }
    }
  } catch (error) {
    errors.push(`company(relacionadas): ${toErrorMessage(error)}`);
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

/**
 * CNPJs de exemplo para o estado inicial do Cérebro — escolhidos por terem rede
 * RICA no D1 (contratos públicos + despesas CEAP de vários deputados → demonstram
 * o "siga o dinheiro"). Verificado em produção (jun/2026): Banco do Brasil sozinho
 * tem poucos contratos; Vivo/Uber rendem grafos muito mais densos.
 */
export const EXEMPLOS_CNPJ: ReadonlyArray<{ cnpj: string; label: string }> = [
  { cnpj: "02558157000162", label: "Telefônica / Vivo" },
  { cnpj: "17895646000187", label: "Uber do Brasil" },
  { cnpj: "00000000000191", label: "Banco do Brasil" },
];

/** Exemplo padrão (primeiro da lista). */
export const EXEMPLO_CNPJ = EXEMPLOS_CNPJ[0]!.cnpj;

// ─── API pública: Beneficiário Final (UBO) ───────────────────────────────────────

/**
 * Teto de profundidade do BFS de propriedade societária. Protege contra loops
 * (participação cruzada entre holdings) e contra buscas longas demais.
 *   4 níveis = A → B → C → D → PF (suficiente para quase toda estrutura brasileira).
 */
const UBO_MAX_DEPTH = 4;

/**
 * Teto total de nós visitados durante o BFS (inclui PJ e PF). Impede que um
 * conglomerado gigante (ex.: grupo com 200 holdings) paralise o browser.
 */
const UBO_MAX_NODES = 40;

/**
 * Um salto na cadeia de propriedade: de qual empresa veio → qual sócio encontrado.
 * A cadeia completa é um array ordenado de UBOHop (do centro até o beneficiário).
 */
export interface UBOHop {
  /** CNPJ da empresa que tem este sócio em seu QSA (14 dígitos). */
  empresaCnpj: string;
  /** Razão social da empresa (quando disponível na base). */
  empresaNome: string;
  /** Nome do sócio encontrado nesta empresa. */
  socioNome: string;
  /** Qualificação do sócio (ex.: "Sócio-Administrador"). */
  qualificacao: string;
  /** "PF" = pessoa física (fim da cadeia) | "PJ" = pessoa jurídica (continua). */
  tipo: "PF" | "PJ";
  /**
   * CNPJ do sócio quando ele próprio é uma empresa (PJ). Ausente quando não
   * disponível na base pública — indica cadeia incompleta.
   */
  socioEmpresaCnpj?: string | undefined;
  /** Link da fonte oficial deste registro (BrasilAPI/Minha Receita). */
  sourceUrl: string;
}

/**
 * Um beneficiário final encontrado: a pessoa física no fim de uma cadeia + a
 * cadeia completa de sociedade que leva até ela a partir da empresa consultada.
 */
export interface UBOBeneficiary {
  /** Nome da pessoa física. */
  nome: string;
  /** Qualificação na última empresa da cadeia. */
  qualificacao: string;
  /**
   * Cadeia de saltos da empresa-centro até esta pessoa. O primeiro hop é sempre a
   * empresa-centro; o último é o hop em que `tipo === "PF"`.
   */
  chain: UBOHop[];
}

/**
 * Resultado completo do `resolveUBO`: beneficiários encontrados + diagnóstico honesto.
 */
export interface UBOResult {
  /** CNPJ da empresa consultada (14 dígitos). */
  cnpj: string;
  /** Razão social da empresa consultada (quando disponível). */
  empresaNome: string;
  /** Beneficiários finais identificados (pessoas físicas). */
  beneficiaries: UBOBeneficiary[];
  /**
   * Ramos da cadeia que ficaram incompletos — cadeia parou antes de chegar em PF
   * porque não havia CNPJ disponível na base pública para o sócio PJ.
   * Cada item é uma cadeia parcial até o ponto de interrupção.
   */
  incomplete: UBOHop[][];
  /**
   * Erros não-fatais encontrados durante o BFS (ex.: falha ao buscar uma empresa).
   * O resultado pode ser parcial mas honesto.
   */
  errors: string[];
  /**
   * true quando o teto de nós (UBO_MAX_NODES) foi atingido antes de completar o
   * grafo inteiro — avisa o usuário que pode haver mais sócios não exibidos.
   */
  truncated: boolean;
}

/**
 * Busca o registro `company` de um CNPJ no D1 e devolve as linhas cruas (a mesma
 * lógica de `fetchKindByCnpj` mas restrita ao kind `company`). Retorna [] em falha.
 */
async function fetchCompanyRows(
  cnpj: string,
  fetcher: typeof fetch,
): Promise<D1EntityRow[]> {
  try {
    const { rows } = await fetchD1Entities({ kind: "company", cnpj, limit: 5 }, fetcher);
    return rows;
  } catch {
    return [];
  }
}

/**
 * Extrai os sócios do QSA de um conjunto de linhas `company`, classificando cada
 * um como PF ou PJ via o campo `identificador` (armazenado pelo ingest-brasilapi:
 *   "1" = Pessoa Física, "2" = Pessoa Jurídica, "3" = Estrangeiro sem CNPJ).
 * O CNPJ do sócio PJ é extraído do campo `raw.qsa[i].cnpj_cpf_do_socio` (Minha
 * Receita) quando disponível — o BrasilAPI não o expõe no qsa normalizado.
 */
interface QsaMember {
  nome: string;
  qualificacao: string;
  tipo: "PF" | "PJ" | "unknown";
  cnpjPj: string; // "" quando PF ou quando PJ sem CNPJ público
}

function extractQsa(rows: D1EntityRow[]): QsaMember[] {
  const members: QsaMember[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const qsa = attr(row, "qsa");
    const rawObj = attr(row, "raw") as Record<string, unknown> | null | undefined;
    const rawQsa = Array.isArray(rawObj?.["qsa"])
      ? (rawObj!["qsa"] as Array<Record<string, unknown>>)
      : [];

    if (!Array.isArray(qsa)) continue;
    qsa.forEach((s, i) => {
      if (s == null || typeof s !== "object") return;
      const m = s as Record<string, unknown>;
      const nome = str(m["nomeSocio"]);
      if (nome === "") return;
      const key = norm(nome);
      if (seen.has(key)) return;
      seen.add(key);

      const identificador = str(m["identificador"]);
      // "2" = PJ no schema do ingest-brasilapi. Outros casos → PF (ou desconhecido).
      let tipo: "PF" | "PJ" | "unknown" = "unknown";
      if (identificador === "2") tipo = "PJ";
      else if (identificador === "1" || identificador === "3") tipo = "PF";

      // Tenta extrair o CNPJ do sócio PJ a partir do campo raw da Minha Receita.
      let cnpjPj = "";
      if (tipo === "PJ") {
        const rawSocio = rawQsa[i] as Record<string, unknown> | undefined;
        const docRaw = str(rawSocio?.["cnpj_cpf_do_socio"]);
        cnpjPj = validCnpj(docRaw);
      }

      members.push({ nome, qualificacao: str(m["qualificacao"]), tipo, cnpjPj });
    });
  }
  return members;
}

/**
 * BFS/DFS iterativo que percorre a cadeia de propriedade a partir de um CNPJ,
 * coletando os beneficiários finais (PF) e as cadeias incompletas.
 * Bounded: respeita UBO_MAX_DEPTH e UBO_MAX_NODES.
 *
 * Cada item da fila é uma entrada (cnpj, razaoSocial, cadeia atual até aqui).
 */
async function bfsOwnership(
  startCnpj: string,
  startNome: string,
  fetcher: typeof fetch,
): Promise<{
  beneficiaries: UBOBeneficiary[];
  incomplete: UBOHop[][];
  errors: string[];
  truncated: boolean;
}> {
  const beneficiaries: UBOBeneficiary[] = [];
  const incomplete: UBOHop[][] = [];
  const errors: string[] = [];
  let nodesVisited = 0;
  let truncated = false;

  // Conjunto de CNPJs já visitados (evita loops de participação cruzada).
  const visitedCnpjs = new Set<string>([startCnpj]);

  // Fila do BFS: [ { cnpj, nome, chain, depth } ]
  interface QueueItem {
    cnpj: string;
    nome: string;
    chain: UBOHop[];
    depth: number;
  }
  const queue: QueueItem[] = [{ cnpj: startCnpj, nome: startNome, chain: [], depth: 0 }];

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) break;

    if (nodesVisited >= UBO_MAX_NODES) {
      truncated = true;
      break;
    }
    nodesVisited++;

    const { cnpj, nome, chain, depth } = item;
    const sourceUrl = `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`;

    // Busca o cadastro desta empresa no D1.
    const rows = await fetchCompanyRows(cnpj, fetcher);
    if (rows.length === 0) {
      // Sem dados no D1 para esta empresa — cadeia incompleta neste ramo.
      if (chain.length > 0) {
        incomplete.push(chain);
      }
      continue;
    }

    // Razão social real (pode diferir do `nome` estimado).
    const razao =
      str(attr(rows[0]!, "razaoSocial")) || nome || formatCnpj(cnpj);

    const members = extractQsa(rows);
    if (members.length === 0) {
      // Empresa existe no D1 mas sem QSA — cadeia incompleta neste ramo.
      if (chain.length > 0) {
        incomplete.push(chain);
      }
      continue;
    }

    for (const member of members) {
      if (nodesVisited >= UBO_MAX_NODES) {
        truncated = true;
        break;
      }

      const hop: UBOHop = {
        empresaCnpj: cnpj,
        empresaNome: razao,
        socioNome: member.nome,
        qualificacao: member.qualificacao,
        tipo: member.tipo === "unknown" ? "PF" : member.tipo, // incerteza → PF (conservador)
        socioEmpresaCnpj: member.cnpjPj || undefined,
        sourceUrl,
      };
      const currentChain = [...chain, hop];

      if (member.tipo !== "PJ") {
        // Pessoa física (ou desconhecida) = beneficiário final.
        beneficiaries.push({
          nome: member.nome,
          qualificacao: member.qualificacao,
          chain: currentChain,
        });
        continue;
      }

      // Sócio é PJ. Precisamos do CNPJ dele para continuar o BFS.
      if (member.cnpjPj === "") {
        // CNPJ do sócio PJ não está na base pública → cadeia incompleta neste ramo.
        incomplete.push(currentChain);
        continue;
      }

      // Loop: este CNPJ já foi visitado (participação cruzada).
      if (visitedCnpjs.has(member.cnpjPj)) {
        incomplete.push(currentChain);
        continue;
      }

      // Profundidade máxima atingida.
      if (depth + 1 >= UBO_MAX_DEPTH) {
        incomplete.push(currentChain);
        continue;
      }

      visitedCnpjs.add(member.cnpjPj);
      queue.push({
        cnpj: member.cnpjPj,
        nome: member.nome, // nome do sócio PJ como estimativa provisória
        chain: currentChain,
        depth: depth + 1,
      });
    }
  }

  return { beneficiaries, incomplete, errors, truncated };
}

/**
 * Descobre o "dono de verdade" por trás de uma empresa: percorre a cadeia de
 * propriedade societária (QSA), recursivamente por sócios PJ (holding → sub-holding
 * → PF), até os beneficiários finais — as pessoas físicas que controlam a empresa.
 *
 * Limitações honestas:
 *   - O campo `cnpj_cpf_do_socio` (CNPJ do sócio PJ) vem da Minha Receita e pode
 *     não estar disponível para todas as empresas na base atual. Nesses casos o
 *     ramo é marcado como "cadeia incompleta".
 *   - Empresas com participação cruzada (A→B→A) param no segundo loop detectado.
 *   - O BFS tem teto de profundidade (4 níveis) e de nós visitados (40) para
 *     proteger a performance.
 *   - Nenhum dado é fabricado: onde não há dado público, declaramos honestamente.
 *
 * @param rawCnpj CNPJ da empresa a investigar (com ou sem máscara).
 * @param fetcher Injeção de fetch (default: global fetch).
 */
export async function resolveUBO(
  rawCnpj: string,
  fetcher: typeof fetch = fetch,
): Promise<UBOResult> {
  const cnpj = sanitizeCnpj(rawCnpj);
  if (cnpj === "") {
    return {
      cnpj: "",
      empresaNome: "",
      beneficiaries: [],
      incomplete: [],
      errors: ["CNPJ inválido."],
      truncated: false,
    };
  }

  // Busca o nome da empresa-raiz para exibir no resultado.
  const rootRows = await fetchCompanyRows(cnpj, fetcher);
  const empresaNome =
    rootRows.length > 0
      ? str(attr(rootRows[0]!, "razaoSocial")) || formatCnpj(cnpj)
      : formatCnpj(cnpj);

  try {
    const { beneficiaries, incomplete, errors, truncated } = await bfsOwnership(
      cnpj,
      empresaNome,
      fetcher,
    );
    return { cnpj, empresaNome, beneficiaries, incomplete, errors, truncated };
  } catch (error) {
    return {
      cnpj,
      empresaNome,
      beneficiaries: [],
      incomplete: [],
      errors: [toErrorMessage(error)],
      truncated: false,
    };
  }
}
