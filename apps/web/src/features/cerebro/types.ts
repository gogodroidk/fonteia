/**
 * Cérebro — tipos do grafo de conhecimento + paleta por módulo.
 *
 * O "Cérebro" é um grafo interativo (estilo Obsidian) que liga uma entidade
 * central (empresa / pessoa / marca) a tudo que existe sobre ela nos módulos da
 * Fonte.ia: sanções, contratos, licitações, infrações ambientais, processos
 * judiciais, marcas (INPI), municípios, políticos e proposições legislativas.
 *
 * Estes tipos são puros (sem React, sem DOM) e servem tanto o motor de força
 * (`force-graph.ts`) quanto a camada de dados (`cerebro-api.ts`) e a página.
 */

// ─── Kinds & nós ─────────────────────────────────────────────────────────────────

/**
 * Kinds de entidade do BULK (D1) que viram NÓS no grafo. Todos têm dados reais
 * no D1 hoje (exceto `trademark`, que depende da RPI ingerida / consulta premium
 * InfoSimples — degrada sem quebrar quando vazio).
 */
export type GraphKind =
  | "organization"
  | "sanction"
  | "environmental_infraction"
  | "legal_process"
  | "public_contract"
  | "bidding_opportunity"
  | "municipality"
  | "politician"
  | "legal_proposition"
  | "trademark"
  // ── Novos kinds (ingeridos em paralelo — degradam sem quebrar quando vazios) ──
  | "parliamentary_expense" // despesas/cota parlamentar (CEAP) — "siga o dinheiro"
  | "legislative_vote" // votações nominais da Câmara
  | "company" // enriquecimento BrasilAPI por CNPJ (CNAE, QSA, capital…)
  | "environmental_alert"  // focos de incêndio INPE (queimadas por município)
  | "fiscal_report"        // relatório fiscal SICONFI/Tesouro Nacional
  | "federal_transfer";    // transferências federais Transferegov

/**
 * Tipo lógico de um nó no grafo. `entity` é o nó central (empresa/pessoa).
 * `person` é um nó-folha de pessoa física (ex.: sócio do QSA de uma empresa) —
 * não é um GraphKind buscável no D1, só um nó derivado de `company.attributes.qsa`.
 */
export type NodeKind = GraphKind | "entity" | "person";

/**
 * Como dois nós ficaram ligados — define a COR e o RÓTULO do fio (legenda de
 * relações). Não confundir com `NodeKind` (cor do nó): aqui é a SEMÂNTICA da
 * aresta. Mantém o grafo legível quando há muitos tipos de conexão.
 */
export type EdgeKind =
  | "cnpj" // mesma empresa (CNPJ) — sanção, contrato, licitação, marca…
  | "name" // mesmo nome/razão social (processos e contratos sem CNPJ casado)
  | "municipio" // mesmo município (código IBGE) — licitações/contratos ↔ município
  | "orgao" // órgão público ligado ao contrato/licitação
  | "derived" // expansão a partir de um nó-folha (recentralização leve)
  // ── Novas semânticas de relação ──
  | "despesa" // político → despesa (cota parlamentar / CEAP)
  | "fornecedor" // despesa → empresa fornecedora (por CNPJ) — "siga o dinheiro"
  | "voto" // político ↔ votação ↔ proposição (atividade legislativa)
  | "socio"; // empresa → sócio do QSA (pessoa)

/**
 * Nó do grafo. As coordenadas/velocidade são mutadas pelo motor de força
 * (por isso `x/y/vx/vy` não são readonly). O restante descreve o dado.
 */
export interface GraphNode {
  /** Id único e estável no grafo (prefixado por kind para evitar colisão). */
  id: string;
  /** Tipo lógico — define cor, raio e ícone. */
  kind: NodeKind;
  /** Rótulo curto exibido ao lado do nó. */
  label: string;
  /** Subtítulo/segunda linha (ex.: tipo da sanção, órgão, valor). */
  sublabel?: string | undefined;
  /** CNPJ (14 dígitos) deste nó, quando ele próprio for expansível por CNPJ. */
  cnpj?: string | undefined;
  /** Código IBGE (7 dígitos) quando o nó for um município — habilita cruzamento. */
  codigoIbge?: string | undefined;
  /**
   * Termo de busca textual para expandir este nó por NOME (ex.: razão social de
   * um fornecedor sem CNPJ, ou nome de um político). Habilita expandir nós que
   * não têm CNPJ próprio.
   */
  searchTerm?: string | undefined;
  /**
   * Id do deputado na Câmara (quando o nó é `politician`). Habilita o cruzamento
   * por deputadoId — despesas (fornecedores) e votações (proposições).
   */
  deputadoId?: string | undefined;
  /** Link para a fonte oficial deste registro (quando houver). */
  sourceUrl?: string | undefined;
  /** Pares rótulo→valor com os dados completos do registro (painel de detalhe). */
  details?: DetailField[] | undefined;
  /** true para o nó central (entidade pesquisada/recentralizada). */
  isCenter: boolean;
  /** true depois que este nó já teve suas conexões puxadas (expandido). */
  expanded: boolean;

  // ── Estado físico (mutado pelo motor) ──
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Raio de desenho (px no espaço do grafo). */
  radius: number;
  /** Massa para a simulação (centro é mais pesado → âncora estável). */
  mass: number;
  /** Quando true, o nó está sendo arrastado e ignora a física. */
  fixed: boolean;
}

/** Aresta (fio) entre dois nós, por id, com a semântica da relação. */
export interface GraphEdge {
  source: string;
  target: string;
  /** Comprimento de repouso da mola (px). */
  length: number;
  /** Semântica da relação — define a cor/rótulo do fio. */
  rel: EdgeKind;
}

/** O grafo inteiro: nós + arestas. */
export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** Par rótulo→valor para o painel de detalhe (já formatado para exibição). */
export interface DetailField {
  label: string;
  value: string;
}

// ─── Paleta por módulo (cor do NÓ) ───────────────────────────────────────────────

/** Metadados visuais de um módulo/kind: cor (HEX p/ canvas), rótulo, fonte. */
export interface ModuleMeta {
  kind: NodeKind;
  /** Rótulo curto para a legenda (PT-BR). */
  label: string;
  /**
   * Cor base. Usamos valores HEX fixos (não vars CSS) porque o canvas precisa
   * de cores resolvidas; foram escolhidos para casar com a paleta do app em
   * dark e light (são as mesmas famílias de --brand/--accent/--danger/etc.).
   */
  color: string;
  /** Fonte oficial de onde o dado vem (para a legenda/aria). */
  fonte: string;
}

/**
 * Paleta por módulo — uma cor por kind, alinhada às famílias do design system.
 * `entity` (centro) usa o azul de marca; os demais distribuem o espectro para
 * leitura rápida. Mantida como Record para acesso O(1) e exaustividade.
 */
export const MODULE_META: Record<NodeKind, ModuleMeta> = {
  entity: {
    kind: "entity",
    label: "Empresa / pessoa (centro)",
    color: "#1D5FE0", // --brand
    fonte: "Receita Federal (Minha Receita)",
  },
  organization: {
    kind: "organization",
    label: "Órgão público",
    color: "#7C5CFF", // roxo PNCP (igual ao módulo Empresas)
    fonte: "PNCP — órgãos públicos",
  },
  sanction: {
    kind: "sanction",
    label: "Sanção (CEIS/CNEP)",
    color: "#EF4444", // --danger
    fonte: "Portal da Transparência (CGU)",
  },
  environmental_infraction: {
    kind: "environmental_infraction",
    label: "Infração ambiental",
    color: "#0FB7A0", // --accent (verde)
    fonte: "IBAMA — Dados Abertos",
  },
  legal_process: {
    kind: "legal_process",
    label: "Processo judicial",
    color: "#E0A93B", // --gold
    fonte: "Tribunais (CNJ DataJud)",
  },
  public_contract: {
    kind: "public_contract",
    label: "Contrato público",
    color: "#3D8BFF", // --brand-2
    fonte: "PNCP / portais de transparência",
  },
  bidding_opportunity: {
    kind: "bidding_opportunity",
    label: "Licitação",
    color: "#F59E0B", // --warn (laranja)
    fonte: "PNCP — contratações",
  },
  municipality: {
    kind: "municipality",
    label: "Município",
    color: "#22A7F0", // azul claro (IBGE)
    fonte: "IBGE — Localidades",
  },
  politician: {
    kind: "politician",
    label: "Político (deputado)",
    color: "#D946EF", // magenta (Câmara)
    fonte: "Câmara dos Deputados — Dados Abertos",
  },
  legal_proposition: {
    kind: "legal_proposition",
    label: "Proposição legislativa",
    color: "#A855F7", // roxo (Câmara)
    fonte: "Câmara dos Deputados — Dados Abertos",
  },
  trademark: {
    kind: "trademark",
    label: "Marca (INPI)",
    color: "#14CBB1", // --accent-2
    fonte: "INPI (RPI / InfoSimples premium)",
  },
  parliamentary_expense: {
    kind: "parliamentary_expense",
    label: "Despesa parlamentar (CEAP)",
    color: "#F472B6", // rosa (cota parlamentar — família política/Câmara)
    fonte: "Câmara dos Deputados — Cota Parlamentar (CEAP)",
  },
  legislative_vote: {
    kind: "legislative_vote",
    label: "Votação legislativa",
    color: "#C084FC", // lilás (votações — família política/Câmara)
    fonte: "Câmara dos Deputados — Votações",
  },
  company: {
    kind: "company",
    label: "Empresa (Cadastro CNPJ)",
    color: "#2DD4BF", // teal (enriquecimento cadastral — família empresas)
    fonte: "BrasilAPI — Cadastro CNPJ (espelho Receita Federal)",
  },
  environmental_alert: {
    kind: "environmental_alert",
    label: "Alerta de queimada (INPE)",
    color: "#F97316", // laranja fogo — família de risco/alerta
    fonte: "INPE — Programa de Queimadas",
  },
  fiscal_report: {
    kind: "fiscal_report",
    label: "Relatório fiscal (SICONFI)",
    color: "#6366F1", // índigo — finanças públicas
    fonte: "Tesouro Nacional — SICONFI (DCA)",
  },
  federal_transfer: {
    kind: "federal_transfer",
    label: "Transferência federal",
    color: "#10B981", // esmeralda — repasse de recursos
    fonte: "Ministério da Fazenda — Transferegov",
  },
  person: {
    kind: "person",
    label: "Pessoa / sócio (QSA)",
    color: "#FB923C", // âmbar quente (pessoa física — distinto de empresa)
    fonte: "BrasilAPI — Quadro de Sócios e Administradores (QSA)",
  },
};

/** Ordem de exibição na legenda / lista (centro primeiro, depois por relevância). */
export const LEGEND_ORDER: NodeKind[] = [
  "entity",
  "company",
  "person",
  "sanction",
  "public_contract",
  "bidding_opportunity",
  "parliamentary_expense",
  "legal_process",
  "environmental_infraction",
  "environmental_alert",
  "fiscal_report",
  "federal_transfer",
  "trademark",
  "organization",
  "municipality",
  "politician",
  "legislative_vote",
  "legal_proposition",
];

/**
 * Todos os kinds-folha que servem de CAMADA filtrável (sem o centro). `person` é
 * excluído: é um nó DERIVADO (sócio do QSA), não um kind buscável no D1, então não
 * vira um toggle de camada — mas continua aparecendo na legenda e na lista lateral.
 */
export const FILTERABLE_KINDS: GraphKind[] = LEGEND_ORDER.filter(
  (k): k is GraphKind => k !== "entity" && k !== "person",
);

/** Cor de um kind (fallback para o azul de marca se faltar). */
export function colorOf(kind: NodeKind): string {
  return MODULE_META[kind]?.color ?? "#1D5FE0";
}

/** Rótulo PT-BR de um kind. */
export function labelOf(kind: NodeKind): string {
  return MODULE_META[kind]?.label ?? kind;
}

// ─── Paleta/rótulos por TIPO DE RELAÇÃO (cor do FIO) ──────────────────────────────

/** Metadados visuais de um tipo de relação (cor da aresta + rótulo na legenda). */
export interface RelationMeta {
  rel: EdgeKind;
  label: string;
  color: string;
}

/**
 * Cor por tipo de relação — propositalmente NEUTRA/distinta das cores de nó, para
 * o olho separar "tipo de coisa" (nó) de "por que está ligado" (fio).
 */
export const RELATION_META: Record<EdgeKind, RelationMeta> = {
  cnpj: { rel: "cnpj", label: "Mesmo CNPJ", color: "#3D8BFF" },
  name: { rel: "name", label: "Mesmo nome/razão social", color: "#94A3B8" },
  municipio: { rel: "municipio", label: "Mesmo município (IBGE)", color: "#22A7F0" },
  orgao: { rel: "orgao", label: "Órgão contratante", color: "#7C5CFF" },
  derived: { rel: "derived", label: "Conexão derivada", color: "#94A3B8" },
  // ── Novas relações ──
  despesa: { rel: "despesa", label: "Despesa do parlamentar", color: "#F472B6" },
  fornecedor: { rel: "fornecedor", label: "Pagamento a fornecedor", color: "#FB7185" },
  voto: { rel: "voto", label: "Atividade legislativa", color: "#C084FC" },
  socio: { rel: "socio", label: "Sócio (QSA)", color: "#FB923C" },
};

/** Ordem das relações na legenda. */
export const RELATION_ORDER: EdgeKind[] = [
  "cnpj",
  "fornecedor",
  "despesa",
  "socio",
  "voto",
  "name",
  "municipio",
  "orgao",
  "derived",
];

/** Cor de um tipo de relação (fallback cinza neutro). */
export function relColorOf(rel: EdgeKind): string {
  return RELATION_META[rel]?.color ?? "#94A3B8";
}

/** Rótulo PT-BR de um tipo de relação. */
export function relLabelOf(rel: EdgeKind): string {
  return RELATION_META[rel]?.label ?? rel;
}
