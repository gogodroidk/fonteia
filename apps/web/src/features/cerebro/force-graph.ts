/**
 * Cérebro — motor de simulação de força (própria, sem dependências).
 *
 * Física clássica de "force-directed graph":
 *   • Repulsão entre todos os nós (Coulomb, O(n²) — ok até centenas de nós).
 *   • Atração nas arestas (mola de Hooke até um comprimento de repouso).
 *   • Gravidade fraca para o centro (mantém o grafo coeso na viewport).
 *   • Amortecimento (damping) → o sistema esfria e estabiliza.
 *
 * É puro (sem React/DOM). A página chama `step()` a cada frame e desenha os nós
 * pelas coordenadas resultantes. Nós com `fixed=true` (sendo arrastados) não são
 * integrados, mas continuam empurrando os vizinhos.
 */

import type { EdgeKind, GraphData, GraphNode } from "./types";

export interface SimParams {
  /** Força de repulsão (quanto maior, mais espaçado). */
  repulsion: number;
  /** Rigidez das molas das arestas (0..1). */
  springStiffness: number;
  /** Gravidade em direção ao centro (0..1, pequena). */
  gravity: number;
  /** Amortecimento por frame (0..1; ~0.9 estabiliza rápido sem travar). */
  damping: number;
  /** Distância mínima para evitar singularidade na repulsão. */
  minDistance: number;
  /** Velocidade abaixo da qual consideramos o sistema "parado". */
  sleepVelocity: number;
}

export const DEFAULT_PARAMS: SimParams = {
  repulsion: 5200,
  springStiffness: 0.045,
  gravity: 0.012,
  damping: 0.86,
  minDistance: 14,
  sleepVelocity: 0.05,
};

/**
 * Motor de força sobre um GraphData. Mantém referência aos arrays do grafo
 * (muta x/y/vx/vy in-place). Centro fica perto de (0,0); a página aplica a
 * transformação de câmera (pan/zoom) na hora de desenhar.
 */
export class ForceSimulation {
  private data: GraphData;
  private params: SimParams;
  /** Energia cinética acumulada do último passo (para detectar repouso). */
  public energy = 0;

  constructor(data: GraphData, params: SimParams = DEFAULT_PARAMS) {
    this.data = data;
    this.params = params;
  }

  /** Troca o grafo (ex.: após expandir um nó), preservando posições existentes. */
  setData(next: GraphData): void {
    this.data = next;
    this.energy = Number.POSITIVE_INFINITY; // re-aquece para reacomodar
  }

  setParams(next: Partial<SimParams>): void {
    this.params = { ...this.params, ...next };
  }

  /** true quando o sistema está praticamente parado (pode pausar o RAF). */
  isSettled(): boolean {
    return this.energy < this.params.sleepVelocity;
  }

  /** Reaquece a simulação (ex.: ao arrastar, expandir, ou redimensionar). */
  reheat(): void {
    this.energy = Number.POSITIVE_INFINITY;
  }

  /**
   * Avança um passo da simulação. `alpha` (0..1) escala o deslocamento — a
   * página pode reduzi-lo ao longo do tempo para um "settle" suave.
   */
  step(alpha = 1): void {
    const { nodes, edges } = this.data;
    const { repulsion, springStiffness, gravity, damping, minDistance } = this.params;
    const n = nodes.length;
    if (n === 0) {
      this.energy = 0;
      return;
    }

    // 1) Repulsão par-a-par (Coulomb). Acumula força em vx/vy.
    for (let i = 0; i < n; i++) {
      const a = nodes[i]!;
      for (let j = i + 1; j < n; j++) {
        const b = nodes[j]!;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let distSq = dx * dx + dy * dy;
        if (distSq < minDistance * minDistance) {
          // Nós quase coincidentes: empurra numa direção pseudo-aleatória estável.
          if (distSq === 0) {
            dx = (i - j) * 0.5 + 0.5;
            dy = (j - i) * 0.5 + 0.5;
            distSq = dx * dx + dy * dy;
          }
          distSq = Math.max(distSq, minDistance * minDistance * 0.25);
        }
        const dist = Math.sqrt(distSq);
        // Força ∝ 1/dist², dividida pelas massas (centro empurra mais, move menos).
        const force = (repulsion / distSq) * alpha;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx += fx / a.mass;
        a.vy += fy / a.mass;
        b.vx -= fx / b.mass;
        b.vy -= fy / b.mass;
      }
    }

    // 2) Atração das arestas (mola de Hooke). Index por id (mapa local barato).
    const byId = new Map<string, GraphNode>();
    for (let i = 0; i < n; i++) byId.set(nodes[i]!.id, nodes[i]!);
    for (const edge of edges) {
      const s = byId.get(edge.source);
      const t = byId.get(edge.target);
      if (!s || !t) continue;
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
      const displacement = dist - edge.length;
      const force = displacement * springStiffness * alpha;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      s.vx += fx / s.mass;
      s.vy += fy / s.mass;
      t.vx -= fx / t.mass;
      t.vy -= fy / t.mass;
    }

    // 3) Gravidade fraca ao centro (0,0) + integração + amortecimento.
    let energy = 0;
    for (let i = 0; i < n; i++) {
      const node = nodes[i]!;
      if (node.fixed) {
        // Nó arrastado: não integra, e zera a velocidade para não "explodir".
        node.vx = 0;
        node.vy = 0;
        continue;
      }
      // Centro tem gravidade extra para ancorar no meio.
      const g = gravity * (node.isCenter ? 3 : 1) * alpha;
      node.vx -= node.x * g;
      node.vy -= node.y * g;

      node.vx *= damping;
      node.vy *= damping;

      node.x += node.vx;
      node.y += node.vy;

      energy += node.vx * node.vx + node.vy * node.vy;
    }
    this.energy = Math.sqrt(energy / n);
  }
}

// ─── Construção e fusão de grafos ───────────────────────────────────────────────

/** Massa de um nó pelo seu papel (centro pesado = âncora estável). */
export function massFor(isCenter: boolean): number {
  return isCenter ? 12 : 1.4;
}

/** Raio de desenho de um nó (centro maior). */
export function radiusFor(isCenter: boolean): number {
  return isCenter ? 22 : 8.5;
}

/** Comprimento de repouso padrão da aresta centro→folha. */
export const EDGE_LENGTH = 150;

/**
 * Comprimento de repouso por TIPO de relação. Relações "fortes" (mesmo CNPJ)
 * ficam mais curtas (cluster apertado em volta do centro); relações de contexto
 * (município, órgão, nome) ficam mais longas para o grafo respirar e separar
 * visualmente os agrupamentos.
 */
export function edgeLengthFor(rel: EdgeKind): number {
  switch (rel) {
    case "cnpj":
      return 140;
    // "Siga o dinheiro": despesa → fornecedor é o vínculo mais forte do grafo
    // político↔empresa; fica curto para colar a empresa no documento de despesa.
    case "fornecedor":
      return 120;
    // Despesa pendurada no parlamentar — curta para formar o "leque" de gastos.
    case "despesa":
      return 130;
    // Sócio do QSA colado à empresa (cluster societário apertado).
    case "socio":
      return 115;
    case "name":
      return 175;
    // Votação ↔ proposição: contexto legislativo — respira um pouco mais.
    case "voto":
      return 185;
    case "municipio":
      return 210;
    case "orgao":
      return 190;
    case "derived":
      return 160;
    default:
      return EDGE_LENGTH;
  }
}

/**
 * Distribui novos nós-folha numa coroa ao redor de um nó-pai, dando posições
 * iniciais determinísticas e não-sobrepostas (o motor refina depois). Usa o
 * ângulo-áureo para espalhar de forma agradável mesmo com muitos nós.
 */
export function ringAround(
  parent: { x: number; y: number },
  index: number,
  total: number,
  baseRadius = EDGE_LENGTH,
): { x: number; y: number } {
  const golden = Math.PI * (3 - Math.sqrt(5)); // ~2.399963 rad
  const angle = index * golden;
  // Espalha em "camadas" conforme cresce o total, evitando aglomerar tudo numa volta.
  const layer = Math.floor(index / Math.max(8, Math.ceil(total / 3)));
  const r = baseRadius + layer * 70 + (index % 3) * 8;
  return {
    x: parent.x + Math.cos(angle) * r,
    y: parent.y + Math.sin(angle) * r,
  };
}
