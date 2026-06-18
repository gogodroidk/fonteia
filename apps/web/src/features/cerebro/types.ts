/**
 * Cérebro — tipos do grafo de conhecimento + paleta por módulo.
 *
 * O "Cérebro" é um grafo interativo (estilo Obsidian) que liga uma entidade
 * central (empresa/CNPJ) a tudo que existe sobre ela nos módulos da Fonte.ia:
 * sanções, contratos, licitações, infrações ambientais, processos judiciais,
 * marcas (INPI) etc.
 *
 * Estes tipos são puros (sem React, sem DOM) e servem tanto o motor de força
 * (`force-graph.ts`) quanto a camada de dados (`cerebro-api.ts`) e a página.
 */

/** Kinds de entidade do BULK que servem de conexão por CNPJ. */
export type GraphKind =
  | "organization"
  | "sanction"
  | "environmental_infraction"
  | "legal_process"
  | "public_contract"
  | "bidding_opportunity"
  | "trademark";

/** Tipo lógico de um nó no grafo. `entity` é o nó central (empresa). */
export type NodeKind = GraphKind | "entity";

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
  /** CNPJ (14 dígitos) deste nó, quando ele próprio for expansível. */
  cnpj?: string | undefined;
  /** true para o nó central (empresa pesquisada/recentralizada). */
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

/** Aresta (fio) entre dois nós, por id. */
export interface GraphEdge {
  source: string;
  target: string;
  /** Comprimento de repouso da mola (px). */
  length: number;
}

/** O grafo inteiro: nós + arestas. */
export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** Metadados visuais de um módulo/kind: cor (via var CSS), rótulo, descrição. */
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
    label: "Empresa (centro)",
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
    fonte: "PNCP — contratos",
  },
  bidding_opportunity: {
    kind: "bidding_opportunity",
    label: "Licitação",
    color: "#F59E0B", // --warn (laranja)
    fonte: "PNCP — contratações",
  },
  trademark: {
    kind: "trademark",
    label: "Marca (INPI)",
    color: "#14CBB1", // --accent-2
    fonte: "INPI",
  },
};

/** Ordem de exibição na legenda (centro primeiro, depois por relevância). */
export const LEGEND_ORDER: NodeKind[] = [
  "entity",
  "sanction",
  "public_contract",
  "bidding_opportunity",
  "legal_process",
  "environmental_infraction",
  "organization",
  "trademark",
];

/** Cor de um kind (fallback para o azul de marca se faltar). */
export function colorOf(kind: NodeKind): string {
  return MODULE_META[kind]?.color ?? "#1D5FE0";
}

/** Rótulo PT-BR de um kind. */
export function labelOf(kind: NodeKind): string {
  return MODULE_META[kind]?.label ?? kind;
}
