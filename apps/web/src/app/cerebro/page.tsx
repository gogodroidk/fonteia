/**
 * Cérebro — grafo de conhecimento interativo (estilo Obsidian) da Fonte.ia.
 *
 * Busque por CNPJ **ou por NOME** (empresa, pessoa, marca, político, município):
 * a entidade vira o NÓ CENTRAL e o grafo puxa tudo que existe sobre ela em todos
 * os módulos (sanções, contratos, licitações, infrações ambientais, processos,
 * marcas, municípios, política), com cores por módulo (nós) e por tipo de relação
 * (fios). Clique num nó para abrir o PAINEL DE DETALHE (dados completos + link à
 * fonte oficial), EXPANDIR as conexões dele (por CNPJ, por nome ou por município)
 * ou RECENTRALIZAR. Filtre camadas por módulo e busque dentro do grafo.
 *
 * Render: <canvas> com simulação de força própria (requestAnimationFrame).
 * Suporta pan, wheel-zoom, arrastar nós, HiDPI (devicePixelRatio) e respeita
 * `prefers-reduced-motion` (nesse caso assenta o layout sem animar). Acessível:
 * lista textual navegável por teclado espelha o grafo inteiro.
 *
 * CLIENT-ONLY: nenhum acesso a `window`/`document`/`canvas` no topo do módulo —
 * tudo dentro de efeitos/handlers. Projetada para `React.lazy` e fora do SSG.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Brain,
  Building2,
  Crosshair,
  ExternalLink,
  Filter,
  Loader2,
  Maximize2,
  Search,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import {
  ForceSimulation,
  DEFAULT_PARAMS,
  massFor,
  radiusFor,
  ringAround,
  edgeLengthFor,
} from "../../features/cerebro/force-graph";
import {
  expandCnpj,
  expandLeaf,
  searchEntities,
  sanitizeCnpj,
  formatCnpj,
  resolveUBO,
  EXEMPLO_CNPJ,
  CENTER_SENTINEL,
  type ExpandResult,
  type RawLeaf,
  type SearchHit,
  type UBOResult,
  type UBOHop,
} from "../../features/cerebro/cerebro-api";
import {
  MODULE_META,
  RELATION_META,
  RELATION_ORDER,
  FILTERABLE_KINDS,
  LEGEND_ORDER,
  colorOf,
  labelOf,
  relColorOf,
  relLabelOf,
  type EdgeKind,
  type GraphData,
  type GraphEdge,
  type GraphKind,
  type GraphNode,
  type NodeKind,
} from "../../features/cerebro/types";
import CerebroGuide from "../../components/cerebro/cerebro-guide";

// ─── Helpers de grafo ───────────────────────────────────────────────────────────

/** Detecta tema escuro lendo o atributo data-theme (com fallback claro). */
function isDarkTheme(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.getAttribute("data-theme") === "dark";
}

/** Normaliza texto p/ busca: minúsculas, sem acentos. */
function norm(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/** Cria o nó central (empresa/pessoa). */
function makeCenterNode(
  id: string,
  label: string,
  opts: { cnpj?: string | undefined; codigoIbge?: string | undefined; sublabel?: string | undefined } = {},
): GraphNode {
  return {
    id,
    kind: "entity",
    label,
    sublabel: opts.sublabel ?? (opts.cnpj ? formatCnpj(opts.cnpj) : undefined),
    cnpj: opts.cnpj,
    codigoIbge: opts.codigoIbge,
    isCenter: true,
    expanded: true,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    radius: radiusFor(true),
    mass: massFor(true),
    fixed: false,
  };
}

/** Converte um nó-folha cru em GraphNode posicionado ao redor do pai. */
function makeLeafNode(
  leaf: RawLeaf,
  parent: GraphNode,
  index: number,
  total: number,
): GraphNode {
  const pos = ringAround(parent, index, total);
  return {
    id: leaf.id,
    kind: leaf.kind,
    label: leaf.label,
    sublabel: leaf.sublabel,
    cnpj: leaf.cnpj,
    codigoIbge: leaf.codigoIbge,
    searchTerm: leaf.searchTerm,
    deputadoId: leaf.deputadoId,
    sourceUrl: leaf.sourceUrl,
    details: leaf.details,
    isCenter: false,
    expanded: false,
    x: pos.x,
    y: pos.y,
    vx: 0,
    vy: 0,
    radius: radiusFor(false),
    mass: massFor(false),
    fixed: false,
  };
}

/** Chave canônica de aresta (não-direcionada) para deduplicação. */
const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Relações "contextuais" desenhadas TRACEJADAS (município/órgão/nome/voto), para
 * o olho separá-las dos vínculos fortes/diretos sólidos (CNPJ, fornecedor — siga
 * o dinheiro —, despesa, sócio). Usado tanto no canvas quanto na legenda.
 */
const DASHED_RELS = new Set<EdgeKind>(["municipio", "name", "voto"]);
function isDashedRel(rel: EdgeKind): boolean {
  return DASHED_RELS.has(rel);
}

/**
 * Kinds que NÃO ligam diretamente ao pai porque já são ligados por arestas extra
 * (município por IBGE; sócios/proposições/fornecedores por `crossEdges`). Evita o
 * fio redundante centro→folha quando a folha já tem o seu vínculo semântico.
 */
const CROSS_LINKED_KINDS = new Set<NodeKind>([
  "municipality",
  "person",
  "legal_proposition",
]);

/**
 * Funde os nós-folha de uma expansão num grafo existente, ligando cada folha ao
 * nó-pai (com a relação correta) e adicionando as arestas extra (município +
 * cruzamentos tipados de `crossEdges`). Também enriquece o nó-pai com os detalhes
 * cadastrais do centro (`centerDetails`/`centerSourceUrl`, vindos do `company`).
 * Deduplica nós e arestas por id. Marca o pai como `expanded`. Devolve um
 * GraphData novo (imutável p/ o React reagir).
 */
function mergeExpansion(
  prev: GraphData,
  parentId: string,
  result: Pick<
    ExpandResult,
    "leaves" | "municipalityEdges" | "crossEdges" | "centerDetails" | "centerSourceUrl"
  >,
): GraphData {
  const { leaves, municipalityEdges, crossEdges, centerDetails, centerSourceUrl } = result;

  // Marca o pai como expandido e, se vieram detalhes do centro, funde-os no nó.
  const nodes = prev.nodes.map((n) => {
    if (n.id !== parentId) return n;
    const enriched: GraphNode = { ...n, expanded: true };
    if (centerDetails && centerDetails.length > 0) enriched.details = centerDetails;
    if (centerSourceUrl && !enriched.sourceUrl) enriched.sourceUrl = centerSourceUrl;
    return enriched;
  });
  const parent = nodes.find((n) => n.id === parentId);
  if (!parent) return prev;

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const existingEdges = new Set(prev.edges.map((e) => edgeKey(e.source, e.target)));
  const newEdges: GraphEdge[] = [...prev.edges];

  /** Adiciona uma aresta deduplicada (ignora se algum extremo não existe). */
  const addEdge = (from: string, to: string, rel: GraphEdge["rel"]): void => {
    if (from === to) return;
    if (!nodeById.has(from) || !nodeById.has(to)) return;
    const key = edgeKey(from, to);
    if (existingEdges.has(key)) return;
    existingEdges.add(key);
    newEdges.push({ source: from, target: to, length: edgeLengthFor(rel), rel });
  };

  leaves.forEach((leaf, i) => {
    if (!nodeById.has(leaf.id)) {
      const node = makeLeafNode(leaf, parent, i, leaves.length);
      nodeById.set(node.id, node);
      nodes.push(node);
    }
    // Folhas com vínculo próprio (município/sócio/proposição) são ligadas pelas
    // arestas extra — não duplicamos o fio centro→folha.
    if (CROSS_LINKED_KINDS.has(leaf.kind)) return;
    addEdge(parentId, leaf.id, leaf.rel);
  });

  // Arestas folha↔município (cruzamento por código IBGE).
  for (const me of municipalityEdges ?? []) {
    addEdge(me.from, me.to, "municipio");
  }

  // Cruzamentos tipados (siga o dinheiro + atividade legislativa). O sentinela
  // CENTER_SENTINEL no `from`/`to` é resolvido para o id real do nó-pai.
  for (const ce of crossEdges ?? []) {
    const from = ce.from === CENTER_SENTINEL ? parentId : ce.from;
    const to = ce.to === CENTER_SENTINEL ? parentId : ce.to;
    addEdge(from, to, ce.rel);
  }

  return { nodes, edges: newEdges };
}

// ─── Câmera (pan/zoom) ──────────────────────────────────────────────────────────

interface Camera {
  tx: number;
  ty: number;
  scale: number;
}

const MIN_SCALE = 0.2;
const MAX_SCALE = 3.5;

// ─── Componente ─────────────────────────────────────────────────────────────────

export function CerebroPage() {
  const [graph, setGraph] = useState<GraphData>({ nodes: [], edges: [] });
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  // Resultados da busca por nome (dropdown para escolher o centro).
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);

  // Estado do painel de Beneficiário Final (UBO).
  const [uboResult, setUboResult] = useState<UBOResult | null>(null);
  const [uboLoading, setUboLoading] = useState(false);
  const [showUbo, setShowUbo] = useState(false);

  // Camadas ativas (filtro por módulo). Set vazio = todas visíveis (default).
  const [hiddenKinds, setHiddenKinds] = useState<Set<GraphKind>>(new Set());
  // Busca DENTRO do grafo (realça/filtra nós por texto).
  const [graphQuery, setGraphQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Refs vivos para o loop de render (evita recriar o RAF a cada state change).
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const simRef = useRef<ForceSimulation | null>(null);
  const graphRef = useRef<GraphData>(graph);
  const cameraRef = useRef<Camera>({ tx: 0, ty: 0, scale: 1 });
  const rafRef = useRef<number | null>(null);
  const dprRef = useRef<number>(1);
  const sizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const hoverIdRef = useRef<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const darkRef = useRef<boolean>(false);
  const reducedRef = useRef<boolean>(false);
  const hiddenRef = useRef<Set<GraphKind>>(hiddenKinds);
  const queryRef = useRef<string>("");

  // Estado de interação por ponteiro (drag de nó / pan).
  const dragRef = useRef<{
    mode: "none" | "node" | "pan";
    nodeId: string | null;
    lastX: number;
    lastY: number;
    movedSq: number;
  }>({ mode: "none", nodeId: null, lastX: 0, lastY: 0, movedSq: 0 });

  // Mantém graphRef em sincronia com o estado e (re)inicia a simulação.
  useEffect(() => {
    graphRef.current = graph;
    if (!simRef.current) {
      simRef.current = new ForceSimulation(graph, DEFAULT_PARAMS);
    } else {
      simRef.current.setData(graph);
    }
    if (reducedRef.current) {
      const sim = simRef.current;
      for (let i = 0; i < 320 && !sim.isSettled(); i++) sim.step(1);
    } else {
      simRef.current.reheat();
    }
    ensureRaf();
    // ensureRaf é estável (useCallback sem deps).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);
  useEffect(() => {
    hiddenRef.current = hiddenKinds;
    if (reducedRef.current) draw();
    else ensureRaf();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hiddenKinds]);
  useEffect(() => {
    queryRef.current = norm(graphQuery.trim());
    if (reducedRef.current) draw();
    else ensureRaf();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphQuery]);

  // ── Conversões de coordenadas tela ↔ mundo ──
  const screenToWorld = useCallback((sx: number, sy: number): { x: number; y: number } => {
    const cam = cameraRef.current;
    const { w, h } = sizeRef.current;
    return {
      x: (sx - w / 2 - cam.tx) / cam.scale,
      y: (sy - h / 2 - cam.ty) / cam.scale,
    };
  }, []);

  /** Um nó está oculto pelo filtro de camadas? (centro nunca é ocultado.) */
  const isHidden = useCallback((node: GraphNode): boolean => {
    if (node.isCenter) return false;
    return hiddenRef.current.has(node.kind as GraphKind);
  }, []);

  /** Um nó casa com a busca dentro do grafo? (query vazia = todos casam.) */
  const matchesQuery = useCallback((node: GraphNode): boolean => {
    const q = queryRef.current;
    if (q === "") return true;
    return (
      norm(node.label).includes(q) ||
      (node.sublabel ? norm(node.sublabel).includes(q) : false) ||
      norm(labelOf(node.kind)).includes(q)
    );
  }, []);

  /** Nó sob um ponto de tela (o mais próximo dentro do raio). Ignora ocultos. */
  const nodeAtScreen = useCallback(
    (sx: number, sy: number): GraphNode | null => {
      const { x, y } = screenToWorld(sx, sy);
      const cam = cameraRef.current;
      const nodes = graphRef.current.nodes;
      let best: GraphNode | null = null;
      let bestDist = Number.POSITIVE_INFINITY;
      for (const node of nodes) {
        if (isHidden(node)) continue;
        const dx = node.x - x;
        const dy = node.y - y;
        const distSq = dx * dx + dy * dy;
        const hit = node.radius + 8 / cam.scale;
        if (distSq <= hit * hit && distSq < bestDist) {
          best = node;
          bestDist = distSq;
        }
      }
      return best;
    },
    [screenToWorld, isHidden],
  );

  // ── Loop de render (RAF) ──
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const { w, h } = sizeRef.current;
    const dpr = dprRef.current;
    const cam = cameraRef.current;
    const dark = darkRef.current;
    const { nodes, edges } = graphRef.current;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    ctx.translate(w / 2 + cam.tx, h / 2 + cam.ty);
    ctx.scale(cam.scale, cam.scale);

    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const hoverId = hoverIdRef.current;
    const selId = selectedIdRef.current;
    const hasQuery = queryRef.current !== "";

    // 1) Arestas (fios) — cor pela RELAÇÃO. Realça as conectadas ao nó focado.
    ctx.lineCap = "round";
    for (const edge of edges) {
      const s = nodeById.get(edge.source);
      const t = nodeById.get(edge.target);
      if (!s || !t) continue;
      if (isHidden(s) || isHidden(t)) continue; // não desenha fio para nó oculto
      const dimmed = hasQuery && !(matchesQuery(s) && matchesQuery(t));
      const focused =
        selId !== null && (edge.source === selId || edge.target === selId);
      const hovered =
        hoverId !== null && (edge.source === hoverId || edge.target === hoverId);
      const base = relColorOf(edge.rel);
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      const alpha = dimmed
        ? dark
          ? 0.05
          : 0.07
        : focused || hovered
          ? 0.85
          : dark
            ? 0.22
            : 0.3;
      ctx.strokeStyle = hexWithAlpha(base, alpha);
      ctx.lineWidth = (focused || hovered ? 2.4 : 1.2) / cam.scale;
      // Fios de relação "contextual" (município/órgão/nome/voto) tracejados, para
      // distinguir de vínculos diretos/fortes (CNPJ, fornecedor, despesa, sócio).
      if (isDashedRel(edge.rel)) {
        ctx.setLineDash([5 / cam.scale, 4 / cam.scale]);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 2) Nós (círculos com halo + rótulo). Rótulos só quando legíveis.
    const showLabels = cam.scale > 0.45;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const node of nodes) {
      if (isHidden(node)) continue;
      const color = colorOf(node.kind);
      const isFocused = node.id === selId || node.id === hoverId;
      const dimmed = hasQuery && !matchesQuery(node);
      const r = node.radius;
      ctx.globalAlpha = dimmed ? 0.22 : 1;

      if (node.isCenter || isFocused || (hasQuery && !dimmed)) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + (node.isCenter ? 10 : 6), 0, Math.PI * 2);
        ctx.fillStyle = hexWithAlpha(color, hasQuery && !dimmed ? 0.24 : 0.16);
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      ctx.lineWidth = (node.isCenter ? 3 : isFocused ? 2.4 : 1.4) / cam.scale;
      ctx.strokeStyle = node.isCenter
        ? "#FFFFFF"
        : isFocused
          ? hexWithAlpha("#FFFFFF", 0.9)
          : hexWithAlpha(dark ? "#000000" : "#FFFFFF", 0.55);
      ctx.stroke();

      // Anel tracejado: nós expansíveis (têm CNPJ ou termo de busca) não expandidos.
      if (!node.isCenter && (node.cnpj || node.searchTerm) && !node.expanded) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 4, 0, Math.PI * 2);
        ctx.setLineDash([3 / cam.scale, 3 / cam.scale]);
        ctx.lineWidth = 1.2 / cam.scale;
        ctx.strokeStyle = hexWithAlpha(color, 0.7);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (showLabels || node.isCenter) {
        const fontPx = (node.isCenter ? 14 : 11.5) / cam.scale;
        ctx.font = `${node.isCenter ? 700 : 500} ${fontPx}px 'Figtree', system-ui, sans-serif`;
        const label = truncate(node.label, node.isCenter ? 36 : 24);
        const ty = node.y + r + 4 / cam.scale;
        ctx.fillStyle = dark ? "rgba(7,12,22,0.85)" : "rgba(255,255,255,0.9)";
        ctx.lineWidth = 3 / cam.scale;
        ctx.strokeStyle = dark ? "rgba(7,12,22,0.85)" : "rgba(255,255,255,0.9)";
        ctx.strokeText(label, node.x, ty);
        ctx.fillStyle = dark ? "#EAF1FB" : "#0B2240";
        ctx.fillText(label, node.x, ty);
      }
      ctx.globalAlpha = 1;
    }
  }, [isHidden, matchesQuery]);

  const tick = useCallback(() => {
    const sim = simRef.current;
    if (sim && !reducedRef.current) {
      sim.step(1);
    }
    draw();
    if (!reducedRef.current && sim && !sim.isSettled()) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      rafRef.current = null;
    }
  }, [draw]);

  const ensureRaf = useCallback(() => {
    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [tick]);

  // ── Setup do canvas: tamanho HiDPI, tema, reduced-motion, observers ──
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const applyReduced = () => {
      reducedRef.current = mql.matches;
      setReducedMotion(mql.matches);
      if (mql.matches) {
        const sim = simRef.current;
        if (sim) for (let i = 0; i < 320 && !sim.isSettled(); i++) sim.step(1);
        draw();
      } else {
        ensureRaf();
      }
    };
    applyReduced();
    mql.addEventListener("change", applyReduced);

    const syncTheme = () => {
      darkRef.current = isDarkTheme();
      draw();
    };
    syncTheme();
    const themeObserver = new MutationObserver(syncTheme);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      dprRef.current = dpr;
      sizeRef.current = { w: rect.width, h: rect.height };
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      simRef.current?.reheat();
      ensureRaf();
      draw();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    return () => {
      mql.removeEventListener("change", applyReduced);
      themeObserver.disconnect();
      ro.disconnect();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [draw, ensureRaf]);

  // ── Busca textual por NOME (dropdown) — debounce leve ──
  useEffect(() => {
    const term = input.trim();
    // CNPJ digitado: não busca por nome (o usuário vai gerar direto).
    if (term.length < 2 || sanitizeCnpj(input) !== "") {
      setHits([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const handle = setTimeout(() => {
      void searchEntities(term)
        .then((found) => {
          if (!cancelled) setHits(found);
        })
        .catch(() => {
          if (!cancelled) setHits([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [input]);

  // ── Montagem do grafo a partir de um CNPJ ──
  const runCnpj = useCallback(
    async (rawCnpj: string, recenter: boolean) => {
      const cnpj = sanitizeCnpj(rawCnpj);
      if (cnpj === "") {
        setError("CNPJ inválido: digite os 14 números (com ou sem máscara).");
        return;
      }
      setIsLoading(true);
      setError(null);
      setInfo(null);
      setHits([]);
      try {
        const result = await expandCnpj(cnpj);
        const centerId = `entity:${cnpj}`;

        setGraph((prev) => {
          let next = prev;
          const exists = prev.nodes.some((n) => n.id === centerId);
          if (recenter || !exists) {
            const center = makeCenterNode(centerId, result.centerLabel, { cnpj });
            next = { nodes: [center], edges: [] };
            cameraRef.current = { tx: 0, ty: 0, scale: 1 };
          } else {
            next = {
              nodes: prev.nodes.map((n) =>
                n.id === centerId && n.label === formatCnpj(cnpj)
                  ? { ...n, label: result.centerLabel }
                  : n,
              ),
              edges: prev.edges,
            };
          }
          return mergeExpansion(next, centerId, result);
        });

        setSelectedId(centerId);
        announceResult(result, setInfo);
        if (result.errors.length > 0) {
          console.warn("[cerebro] Erros parciais por módulo:", result.errors);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao montar o grafo.");
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  // ── Montagem do grafo a partir de um resultado de busca por NOME ──
  const runHit = useCallback(
    async (hit: SearchHit) => {
      // Empresa/órgão com CNPJ: trata como CNPJ (rede completa).
      if (hit.cnpj) {
        setInput(formatCnpj(hit.cnpj));
        void runCnpj(hit.cnpj, true);
        return;
      }
      // Entidade sem CNPJ (político, proposição, marca, município): centro =
      // a própria entidade. Político usa o cruzamento dedicado por deputadoId
      // (despesas → fornecedores + votações → proposições); os demais por NOME.
      setIsLoading(true);
      setError(null);
      setInfo(null);
      setHits([]);
      try {
        const result = await expandLeaf({
          searchTerm: hit.name,
          label: hit.name,
          kind: hit.kind,
          deputadoId: hit.deputadoId,
        });
        const centerId = `entity:${hit.kind}:${hit.id}`;
        const center = makeCenterNode(centerId, hit.name, {
          codigoIbge: hit.codigoIbge,
          sublabel: hit.sublabel,
        });
        // Político-centro guarda o deputadoId para re-expandir/cruzar depois.
        if (hit.kind === "politician" && hit.deputadoId) {
          center.deputadoId = hit.deputadoId;
        }
        // A própria entidade-centro pode reaparecer como folha (mesmo nome) —
        // remove para não duplicar o nó central.
        const ownLeafId = `${hit.kind}:${hit.id}`;
        const leaves = result.leaves.filter((l) => l.id !== ownLeafId);
        cameraRef.current = { tx: 0, ty: 0, scale: 1 };
        setGraph(
          mergeExpansion({ nodes: [center], edges: [] }, centerId, {
            ...result,
            leaves,
          }),
        );
        setSelectedId(centerId);
        announceResult(result, setInfo);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao montar o grafo.");
      } finally {
        setIsLoading(false);
      }
    },
    [runCnpj],
  );

  /** Submit do formulário: CNPJ → grafo direto; texto → usa o 1º resultado. */
  const onSubmit = useCallback(() => {
    const cnpj = sanitizeCnpj(input);
    if (cnpj !== "") {
      void runCnpj(cnpj, true);
      return;
    }
    if (hits.length > 0) {
      void runHit(hits[0]!);
      return;
    }
    setError("Digite um CNPJ (14 dígitos) ou um nome para buscar.");
  }, [input, hits, runCnpj, runHit]);

  /**
   * Exemplo do guia (chips para leigos): aceita CNPJ ou nome. CNPJ → grafo
   * direto; nome → busca e usa o 1º resultado. Erro amigável se nada bater.
   */
  const handleGuideExample = useCallback(
    (query: string) => {
      setInput(query);
      const cnpj = sanitizeCnpj(query);
      if (cnpj !== "") {
        void runCnpj(cnpj, true);
        return;
      }
      setSearching(true);
      void searchEntities(query)
        .then((found) => {
          const first = found[0];
          if (first) {
            void runHit(first);
          } else {
            setError(`Nada encontrado para "${query}". Tente outro nome ou um CNPJ.`);
          }
        })
        .catch((err) => setError(err instanceof Error ? err.message : String(err)))
        .finally(() => setSearching(false));
    },
    [runCnpj, runHit],
  );

  /** Expande um nó-folha (por CNPJ, por deputadoId, por nome ou município). */
  const expandNode = useCallback(
    async (node: GraphNode) => {
      if (!node.cnpj && !node.searchTerm && !node.deputadoId) return;
      setIsLoading(true);
      setError(null);
      try {
        const result = await expandLeaf({
          cnpj: node.cnpj,
          searchTerm: node.searchTerm ?? node.label,
          deputadoId: node.deputadoId,
          kind: node.kind,
          label: node.label,
        });
        setGraph((prev) => mergeExpansion(prev, node.id, result));
        const total = result.leaves.length;
        setInfo(
          total === 0
            ? `Nenhuma conexão nova a partir de ${node.label}.`
            : `${total} ${total === 1 ? "conexão" : "conexões"} a partir de ${node.label}.`,
        );
        if (result.errors.length > 0) {
          console.warn("[cerebro] Erros parciais ao expandir:", result.errors);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao expandir o nó.");
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  /**
   * Recentraliza um nó-folha como novo centro do grafo:
   *   • com CNPJ        → rede completa da empresa/órgão (`runCnpj`).
   *   • político        → cruzamento por deputadoId (despesas + votações).
   */
  const recenterNode = useCallback(
    (node: GraphNode) => {
      if (node.cnpj) {
        setInput(formatCnpj(node.cnpj));
        void runCnpj(node.cnpj, true);
        return;
      }
      if (node.kind === "politician" && (node.deputadoId || node.searchTerm)) {
        void runHit({
          id: node.deputadoId ?? node.id,
          kind: "politician",
          name: node.searchTerm ?? node.label,
          deputadoId: node.deputadoId,
          sublabel: node.sublabel,
        });
      }
    },
    [runCnpj, runHit],
  );

  /**
   * Dispara o BFS de beneficiário final a partir do CNPJ do centro (ou de um nó
   * com CNPJ). Abre o painel UBO com o resultado — nunca lança, degrada honestamente.
   */
  const runUBO = useCallback(async (cnpj: string) => {
    setUboLoading(true);
    setShowUbo(true);
    setUboResult(null);
    try {
      const result = await resolveUBO(cnpj);
      setUboResult(result);
    } catch {
      setUboResult({
        cnpj,
        empresaNome: formatCnpj(cnpj),
        beneficiaries: [],
        incomplete: [],
        errors: ["Não foi possível consultar a cadeia de propriedade agora."],
        truncated: false,
      });
    } finally {
      setUboLoading(false);
    }
  }, []);

  // ── Handlers de ponteiro (drag de nó + pan) ──
  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.setPointerCapture(e.pointerId);
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const node = nodeAtScreen(sx, sy);
      const d = dragRef.current;
      d.lastX = sx;
      d.lastY = sy;
      d.movedSq = 0;
      if (node) {
        d.mode = "node";
        d.nodeId = node.id;
        node.fixed = true;
        hoverIdRef.current = node.id;
      } else {
        d.mode = "pan";
        d.nodeId = null;
      }
    },
    [nodeAtScreen],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const d = dragRef.current;

      if (d.mode === "none") {
        const node = nodeAtScreen(sx, sy);
        const nextHover = node?.id ?? null;
        if (nextHover !== hoverIdRef.current) {
          hoverIdRef.current = nextHover;
          canvas.style.cursor = node ? "pointer" : "grab";
          if (reducedRef.current) draw();
          else ensureRaf();
        }
        return;
      }

      const dx = sx - d.lastX;
      const dy = sy - d.lastY;
      d.movedSq += dx * dx + dy * dy;
      d.lastX = sx;
      d.lastY = sy;

      if (d.mode === "node" && d.nodeId) {
        const world = screenToWorld(sx, sy);
        const node = graphRef.current.nodes.find((n) => n.id === d.nodeId);
        if (node) {
          node.x = world.x;
          node.y = world.y;
          node.vx = 0;
          node.vy = 0;
        }
        simRef.current?.reheat();
      } else if (d.mode === "pan") {
        cameraRef.current.tx += dx;
        cameraRef.current.ty += dy;
        canvas.style.cursor = "grabbing";
      }
      if (reducedRef.current) draw();
      else ensureRaf();
    },
    [draw, ensureRaf, nodeAtScreen, screenToWorld],
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      const d = dragRef.current;
      if (canvas) {
        try {
          canvas.releasePointerCapture(e.pointerId);
        } catch {
          /* ponteiro já liberado */
        }
        canvas.style.cursor = "grab";
      }
      const wasNode = d.mode === "node";
      const nodeId = d.nodeId;
      const clicked = d.movedSq < 25;
      if (nodeId) {
        const node = graphRef.current.nodes.find((n) => n.id === nodeId);
        if (node) node.fixed = false;
      }
      d.mode = "none";
      d.nodeId = null;

      if (wasNode && clicked && nodeId) {
        const node = graphRef.current.nodes.find((n) => n.id === nodeId);
        if (node) {
          // Clique = abrir o painel de detalhe (seleção). NÃO expande sozinho —
          // a expansão é explícita pelo botão do painel (evita carga acidental).
          setSelectedId(node.id);
        }
      }
      simRef.current?.reheat();
      ensureRaf();
    },
    [ensureRaf],
  );

  // ── Wheel-zoom (mantém o ponto sob o cursor fixo) ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const cam = cameraRef.current;
      const { w, h } = sizeRef.current;
      const factor = Math.exp(-e.deltaY * 0.0015);
      const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, cam.scale * factor));
      const wx = (sx - w / 2 - cam.tx) / cam.scale;
      const wy = (sy - h / 2 - cam.ty) / cam.scale;
      cam.scale = nextScale;
      cam.tx = sx - w / 2 - wx * nextScale;
      cam.ty = sy - h / 2 - wy * nextScale;
      if (reducedRef.current) draw();
      else ensureRaf();
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [draw, ensureRaf]);

  /** Reenquadra a câmera para caber os nós VISÍVEIS (botão "Centralizar"). */
  const fitView = useCallback(() => {
    const nodes = graphRef.current.nodes.filter((n) => !isHidden(n));
    const { w, h } = sizeRef.current;
    if (nodes.length === 0 || w === 0) {
      cameraRef.current = { tx: 0, ty: 0, scale: 1 };
    } else {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const n of nodes) {
        minX = Math.min(minX, n.x - n.radius);
        minY = Math.min(minY, n.y - n.radius);
        maxX = Math.max(maxX, n.x + n.radius);
        maxY = Math.max(maxY, n.y + n.radius);
      }
      const gw = Math.max(maxX - minX, 1);
      const gh = Math.max(maxY - minY, 1);
      const pad = 80;
      const scale = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, Math.min((w - pad) / gw, (h - pad) / gh)),
      );
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      cameraRef.current = { tx: -cx * scale, ty: -cy * scale, scale };
    }
    if (reducedRef.current) draw();
    else ensureRaf();
  }, [draw, ensureRaf, isHidden]);

  // ── Dados derivados ──
  const center = useMemo(
    () => graph.nodes.find((n) => n.isCenter) ?? null,
    [graph.nodes],
  );
  const selectedNode = useMemo(
    () => graph.nodes.find((n) => n.id === selectedId) ?? null,
    [graph.nodes, selectedId],
  );

  /** Contagem de nós por kind (para badges das camadas). */
  const countByKind = useMemo(() => {
    const map = new Map<GraphKind, number>();
    for (const node of graph.nodes) {
      if (node.isCenter) continue;
      const k = node.kind as GraphKind;
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return map;
  }, [graph.nodes]);

  /** Nós agrupados por kind (exceto o centro) para a lista lateral navegável.
   *  Respeita o filtro de camadas e a busca dentro do grafo. */
  const grouped = useMemo(() => {
    const q = norm(graphQuery.trim());
    const map = new Map<NodeKind, GraphNode[]>();
    for (const node of graph.nodes) {
      if (node.isCenter) continue;
      if (hiddenKinds.has(node.kind as GraphKind)) continue;
      if (
        q !== "" &&
        !norm(node.label).includes(q) &&
        !(node.sublabel ? norm(node.sublabel).includes(q) : false) &&
        !norm(labelOf(node.kind)).includes(q)
      ) {
        continue;
      }
      const arr = map.get(node.kind) ?? [];
      arr.push(node);
      map.set(node.kind, arr);
    }
    return LEGEND_ORDER.filter((k) => map.has(k)).map((k) => ({
      kind: k,
      nodes: map.get(k)!,
    }));
  }, [graph.nodes, hiddenKinds, graphQuery]);

  const hasGraph = graph.nodes.length > 0;
  const visibleCount = useMemo(
    () => graph.nodes.filter((n) => !n.isCenter && !hiddenKinds.has(n.kind as GraphKind)).length,
    [graph.nodes, hiddenKinds],
  );

  /** Foca um nó a partir da lista textual (teclado): seleciona + reenquadra nele. */
  const focusFromList = useCallback(
    (node: GraphNode) => {
      setSelectedId(node.id);
      const cam = cameraRef.current;
      cam.tx = -node.x * cam.scale;
      cam.ty = -node.y * cam.scale;
      if (reducedRef.current) draw();
      else ensureRaf();
    },
    [draw, ensureRaf],
  );

  /** Liga/desliga uma camada (kind). */
  const toggleKind = useCallback((kind: GraphKind) => {
    setHiddenKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }, []);

  const allVisible = hiddenKinds.size === 0;

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Cabeçalho */}
      <div>
        <span className="eyebrow" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Brain size={14} aria-hidden="true" /> Cérebro
        </span>
        <h2 className="h2" style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
          Grafo de conhecimento
        </h2>
        <p className="muted small" style={{ marginTop: 4, maxWidth: 680 }}>
          Um cérebro visual dos dados públicos. Busque por CNPJ ou por nome (empresa, pessoa, marca,
          político, município): a entidade vira o centro e o grafo puxa tudo que existe sobre ela em
          todos os módulos — sanções, contratos, licitações, infrações ambientais, processos, marcas,
          municípios, política, despesas parlamentares (siga o dinheiro), votações e sócios (QSA).
          Cores por módulo (nós) e por tipo de relação (fios). Clique num nó para ver os detalhes,
          abrir a fonte oficial, expandir ou recentralizar.
        </p>
      </div>

      {/* Barra de busca (CNPJ ou nome) com dropdown de resultados */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="panel"
        style={{ padding: "14px 16px", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "stretch", position: "relative", zIndex: 5 }}
      >
        <div className="searchbar" style={{ flex: "1 1 300px", minWidth: 0, position: "relative" }}>
          <Search size={16} style={{ color: "var(--t-low)", flexShrink: 0 }} aria-hidden="true" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="CNPJ (00.000.000/0001-91) ou nome (ex.: Banco do Brasil, Petrobras…)"
            aria-label="CNPJ ou nome para montar o grafo"
            autoComplete="off"
          />
          {searching && (
            <Loader2 size={15} className="spin" style={{ color: "var(--t-low)", flexShrink: 0 }} aria-hidden="true" />
          )}
          {input !== "" && (
            <button
              className="btn btn--icon btn--ghost btn--sm"
              style={{ width: 28, height: 28, flexShrink: 0 }}
              onClick={() => {
                setInput("");
                setHits([]);
              }}
              type="button"
              aria-label="Limpar"
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}

          {/* Dropdown de resultados da busca por nome */}
          {hits.length > 0 && !isLoading && (
            <ul className="cerebro-hits" role="listbox" aria-label="Resultados da busca">
              {hits.map((hit) => (
                <li key={`${hit.kind}:${hit.id}`} role="option" aria-selected="false">
                  <button
                    type="button"
                    className="cerebro-hit"
                    onClick={() => void runHit(hit)}
                  >
                    <span className="dot" style={{ background: colorOf(hit.kind), width: 9, height: 9, flexShrink: 0 }} aria-hidden="true" />
                    <span className="cerebro-hit-main">
                      <span className="cerebro-hit-name">{hit.name}</span>
                      <span className="cerebro-hit-sub">
                        {labelOf(hit.kind)}
                        {hit.cnpj ? ` · ${formatCnpj(hit.cnpj)}` : hit.sublabel ? ` · ${hit.sublabel}` : ""}
                      </span>
                    </span>
                    {hit.cnpj && <Building2 size={13} style={{ color: "var(--t-low)", flexShrink: 0 }} aria-hidden="true" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          className="btn btn--primary"
          type="submit"
          disabled={isLoading || input.trim() === ""}
          style={{ flexShrink: 0 }}
        >
          {isLoading ? (
            <>
              <Loader2 size={16} className="spin" aria-hidden="true" />
              Montando…
            </>
          ) : (
            <>
              <Sparkles size={16} aria-hidden="true" />
              Gerar cérebro
            </>
          )}
        </button>
      </form>

      {/* Guia amigável para leigos — some quando já há um grafo na tela */}
      {!hasGraph && <CerebroGuide onExample={handleGuideExample} />}

      {/* Erro */}
      {error !== null && (
        <div
          className="panel"
          role="alert"
          style={{
            padding: "12px 16px",
            background: "color-mix(in srgb, var(--danger) 10%, var(--surface))",
            border: "1px solid color-mix(in srgb, var(--danger) 28%, transparent)",
            color: "var(--danger)",
            fontSize: 13.5,
            fontWeight: 600,
          }}
        >
          {error}
        </div>
      )}

      {/* Área principal: canvas + painel lateral */}
      <div className="cerebro-layout">
        {/* Palco do grafo */}
        <section
          className="panel"
          style={{ position: "relative", overflow: "hidden", padding: 0, minHeight: 420 }}
          aria-label="Grafo de conhecimento interativo"
        >
          <div
            ref={wrapRef}
            className="gridbg"
            style={{ position: "relative", width: "100%", height: "min(74vh, 680px)", minHeight: 420 }}
          >
            <canvas
              ref={canvasRef}
              role="img"
              aria-label={
                center
                  ? `Grafo de ${center.label} com ${visibleCount} conexões visíveis. Use a lista ao lado para navegar por teclado.`
                  : "Grafo de conhecimento vazio. Busque um CNPJ ou nome para começar."
              }
              style={{ display: "block", touchAction: "none", cursor: "grab" }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />

            {/* Estado vazio sobreposto */}
            {!hasGraph && !isLoading && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 14,
                  textAlign: "center",
                  padding: 24,
                  pointerEvents: "none",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 76,
                    height: 76,
                    borderRadius: "50%",
                    background: "color-mix(in srgb, var(--brand) 14%, var(--surface))",
                    color: "var(--brand-ink)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Brain size={36} strokeWidth={1.6} />
                </span>
                <div style={{ fontWeight: 800, fontSize: 17, color: "var(--t-hi)" }}>
                  Comece por CNPJ ou nome
                </div>
                <p className="muted small" style={{ margin: 0, maxWidth: 380 }}>
                  Digite um CNPJ ou o nome de uma empresa, pessoa ou marca. Cada fio liga a entidade às
                  sanções, contratos, licitações, processos, municípios e mais — colorido por módulo.
                </p>
                <button
                  className="btn btn--soft btn--sm"
                  type="button"
                  style={{ pointerEvents: "auto" }}
                  onClick={() => {
                    setInput(formatCnpj(EXEMPLO_CNPJ));
                    void runCnpj(EXEMPLO_CNPJ, true);
                  }}
                >
                  <Sparkles size={14} aria-hidden="true" />
                  Ver exemplo (Banco do Brasil)
                </button>
              </div>
            )}

            {/* Loading sobreposto */}
            {isLoading && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 12,
                  background: "color-mix(in srgb, var(--surface) 55%, transparent)",
                  backdropFilter: "blur(2px)",
                  pointerEvents: "none",
                }}
                aria-live="polite"
              >
                <Loader2 size={28} className="spin" style={{ color: "var(--brand-ink)" }} aria-hidden="true" />
                <span className="muted small">Consultando os módulos…</span>
              </div>
            )}

            {/* Controles flutuantes do palco: busca-no-grafo + filtros + centralizar */}
            {hasGraph && (
              <div
                style={{
                  position: "absolute",
                  top: 12,
                  right: 12,
                  display: "flex",
                  gap: 6,
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                  justifyContent: "flex-end",
                  maxWidth: "calc(100% - 24px)",
                }}
              >
                <div className="searchbar glass" style={{ padding: "0 10px", height: 34, width: "min(220px, 46vw)" }}>
                  <Search size={14} style={{ color: "var(--t-low)", flexShrink: 0 }} aria-hidden="true" />
                  <input
                    value={graphQuery}
                    onChange={(e) => setGraphQuery(e.target.value)}
                    placeholder="Filtrar no grafo…"
                    aria-label="Buscar dentro do grafo"
                    style={{ fontSize: 13, padding: "7px 0" }}
                  />
                  {graphQuery !== "" && (
                    <button
                      type="button"
                      className="btn btn--icon btn--ghost btn--sm"
                      style={{ width: 22, height: 22, flexShrink: 0 }}
                      onClick={() => setGraphQuery("")}
                      aria-label="Limpar filtro do grafo"
                    >
                      <X size={13} aria-hidden="true" />
                    </button>
                  )}
                </div>
                <button
                  className="btn btn--icon btn--ghost btn--sm"
                  type="button"
                  onClick={() => setShowFilters((v) => !v)}
                  aria-label="Filtrar camadas por módulo"
                  aria-pressed={showFilters}
                  title="Camadas"
                  style={{ background: "var(--glass)", backdropFilter: "blur(10px)", position: "relative" }}
                >
                  <Filter size={16} aria-hidden="true" />
                  {!allVisible && (
                    <span
                      aria-hidden="true"
                      style={{
                        position: "absolute",
                        top: 4,
                        right: 4,
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: "var(--brand-ink)",
                      }}
                    />
                  )}
                </button>
                <button
                  className="btn btn--icon btn--ghost btn--sm"
                  type="button"
                  onClick={fitView}
                  aria-label="Centralizar e enquadrar o grafo"
                  title="Centralizar"
                  style={{ background: "var(--glass)", backdropFilter: "blur(10px)" }}
                >
                  <Maximize2 size={16} aria-hidden="true" />
                </button>
              </div>
            )}

            {/* Painel de camadas (filtro por módulo) */}
            {hasGraph && showFilters && (
              <div
                className="glass cerebro-filters"
                role="group"
                aria-label="Camadas por módulo"
              >
                <div className="row between" style={{ marginBottom: 8 }}>
                  <span className="tiny" style={{ fontWeight: 800, color: "var(--t-hi)" }}>Camadas</span>
                  <button
                    type="button"
                    className="link tiny"
                    onClick={() => setHiddenKinds(new Set())}
                    disabled={allVisible}
                    style={{ opacity: allVisible ? 0.5 : 1 }}
                  >
                    Mostrar tudo
                  </button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {FILTERABLE_KINDS.filter((k) => countByKind.has(k)).map((kind) => {
                    const on = !hiddenKinds.has(kind);
                    return (
                      <button
                        key={kind}
                        type="button"
                        className="cerebro-layer"
                        onClick={() => toggleKind(kind)}
                        aria-pressed={on}
                        style={{ opacity: on ? 1 : 0.45 }}
                      >
                        <span className="dot" style={{ background: colorOf(kind), width: 9, height: 9, flexShrink: 0 }} aria-hidden="true" />
                        <span className="cerebro-layer-label">{labelOf(kind)}</span>
                        <span className="cerebro-layer-count">{countByKind.get(kind)}</span>
                        <span className={`switch ${on ? "on" : ""}`} aria-hidden="true" style={{ width: 32, height: 18, flexShrink: 0 }}>
                          <i style={{ width: 14, height: 14, transform: on ? "translateX(13px)" : "none" }} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Legenda: módulos (nós) + relações (fios) */}
            {hasGraph && (
              <div
                className="glass cerebro-legend"
                aria-hidden="true"
              >
                <div className="cerebro-legend-row">
                  {grouped.length === 0 ? (
                    <LegendDot kind="entity" />
                  ) : (
                    [{ kind: "entity" as NodeKind }, ...grouped].map((g) => (
                      <LegendDot key={g.kind} kind={g.kind} />
                    ))
                  )}
                </div>
                <div className="divide" style={{ margin: "7px 0" }} />
                <div className="cerebro-legend-row">
                  {RELATION_ORDER.filter((rel) => graph.edges.some((e) => e.rel === rel)).map((rel) => (
                    <RelDot key={rel} rel={rel} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Painel lateral: detalhe do nó + lista textual navegável (a11y) */}
        <aside
          className="panel cerebro-aside"
          style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}
          aria-label="Detalhes e lista de conexões"
        >
          {/* Painel de detalhe do nó selecionado */}
          {selectedNode ? (
            <div className="inset" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="row" style={{ gap: 8, alignItems: "center" }}>
                <span
                  className="dot"
                  style={{ background: colorOf(selectedNode.kind), width: 10, height: 10 }}
                  aria-hidden="true"
                />
                <span className="tiny" style={{ fontWeight: 700, color: "var(--t-mid)" }}>
                  {labelOf(selectedNode.kind)}
                </span>
              </div>
              <div style={{ fontWeight: 800, fontSize: 15, color: "var(--t-hi)", overflowWrap: "anywhere" }}>
                {selectedNode.label}
              </div>
              {selectedNode.sublabel && (
                <div className="small muted" style={{ overflowWrap: "anywhere" }}>
                  {selectedNode.sublabel}
                </div>
              )}

              {/* Tabela de detalhes (dados completos do registro) */}
              {selectedNode.details && selectedNode.details.length > 0 && (
                <dl className="cerebro-detail">
                  {selectedNode.details.map((field, i) => (
                    <div key={`${field.label}-${i}`} className="cerebro-detail-row">
                      <dt>{field.label}</dt>
                      <dd>{field.value}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {/* Ações: fonte oficial + expandir + recentralizar + UBO */}
              <div className="row wrap" style={{ gap: 8, marginTop: 4 }}>
                {selectedNode.sourceUrl && (
                  <a
                    className="btn btn--soft btn--sm"
                    href={selectedNode.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink size={13} aria-hidden="true" /> Fonte oficial
                  </a>
                )}
                {!selectedNode.isCenter &&
                  (selectedNode.cnpj || selectedNode.searchTerm || selectedNode.deputadoId) &&
                  !selectedNode.expanded && (
                    <button
                      className="btn btn--soft btn--sm"
                      type="button"
                      onClick={() => void expandNode(selectedNode)}
                      disabled={isLoading}
                    >
                      <Sparkles size={13} aria-hidden="true" /> Expandir conexões
                    </button>
                  )}
                {!selectedNode.isCenter &&
                  (selectedNode.cnpj ||
                    (selectedNode.kind === "politician" &&
                      (selectedNode.deputadoId || selectedNode.searchTerm))) && (
                    <button
                      className="btn btn--ghost btn--sm"
                      type="button"
                      onClick={() => recenterNode(selectedNode)}
                      disabled={isLoading}
                    >
                      <Crosshair size={13} aria-hidden="true" /> Recentralizar
                    </button>
                  )}
                {selectedNode.cnpj && (
                  <button
                    className="btn btn--ghost btn--sm"
                    type="button"
                    onClick={() => void runUBO(selectedNode.cnpj!)}
                    disabled={isLoading || uboLoading}
                    title="Descubra as pessoas físicas que controlam esta empresa, percorrendo a cadeia de holdings"
                  >
                    <Users size={13} aria-hidden="true" />
                    {uboLoading && showUbo ? "Investigando…" : "Beneficiário final"}
                  </button>
                )}
              </div>
            </div>
          ) : (
            info && (
              <p className="small muted" style={{ margin: 0 }} aria-live="polite">
                {info}
              </p>
            )
          )}

          {/* Lista textual de conexões — fallback navegável por teclado (a11y) */}
          <div style={{ minHeight: 0, flex: 1, overflowY: "auto" }}>
            <div className="row between" style={{ marginBottom: 8 }}>
              <div className="tiny" style={{ fontWeight: 700, color: "var(--t-hi)" }}>
                Conexões {hasGraph ? `(${visibleCount})` : ""}
              </div>
              {graphQuery !== "" && (
                <span className="tiny muted">filtro: “{graphQuery}”</span>
              )}
            </div>
            {!hasGraph ? (
              <p className="small muted" style={{ margin: 0 }}>
                Nenhum grafo ainda. Busque um CNPJ ou nome para listar as conexões aqui.
              </p>
            ) : grouped.length === 0 ? (
              <p className="small muted" style={{ margin: 0 }}>
                {graphQuery !== "" || !allVisible
                  ? "Nenhuma conexão casa com o filtro atual."
                  : "A entidade está no centro, mas não encontramos conexões nas bases já coletadas."}
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {grouped.map((group) => (
                  <section key={group.kind} aria-label={labelOf(group.kind)}>
                    <div
                      className="tiny"
                      style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, fontWeight: 700, color: "var(--t-mid)" }}
                    >
                      <span
                        className="dot"
                        style={{ background: colorOf(group.kind), width: 9, height: 9 }}
                        aria-hidden="true"
                      />
                      {labelOf(group.kind)} ({group.nodes.length})
                    </div>
                    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                      {group.nodes.map((node) => (
                        <li key={node.id}>
                          <button
                            type="button"
                            onClick={() => focusFromList(node)}
                            aria-current={node.id === selectedId ? "true" : undefined}
                            className="cerebro-list-item"
                            style={{
                              borderColor:
                                node.id === selectedId ? colorOf(node.kind) : "var(--border)",
                            }}
                          >
                            <span className="cerebro-list-label">{node.label}</span>
                            {node.sublabel && (
                              <span className="cerebro-list-sub">{node.sublabel}</span>
                            )}
                            {(node.cnpj || node.searchTerm) && !node.expanded && !node.isCenter && (
                              <span className="cerebro-list-tag">expansível</span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Rodapé: dica de uso + reduced-motion */}
      <p className="tiny muted" style={{ margin: 0 }}>
        Clique num nó para ver detalhes e a fonte · arraste os nós para reorganizar · role para dar zoom ·
        arraste o fundo para mover.
        {reducedMotion ? " Animação reduzida ativada — o grafo é assentado sem movimento." : ""}
      </p>

      {/* Painel de Beneficiário Final (UBO) — aparece abaixo do grafo */}
      {showUbo && (
        <UBOPanel
          result={uboResult}
          loading={uboLoading}
          onClose={() => {
            setShowUbo(false);
            setUboResult(null);
          }}
        />
      )}

      {/* Estilos locais — responsivo, dropdown, filtros, detalhe e itens da lista */}
      <style>{`
        .cerebro-layout{
          display:grid;
          grid-template-columns:minmax(0,1fr) 340px;
          gap:16px;
          align-items:stretch;
        }
        .cerebro-aside{max-height:min(74vh,680px)}
        @media (max-width:920px){
          .cerebro-layout{grid-template-columns:1fr}
          .cerebro-aside{max-height:none}
        }
        /* Dropdown de resultados da busca por nome */
        .cerebro-hits{
          position:absolute;top:calc(100% + 6px);left:0;right:0;z-index:20;
          list-style:none;margin:0;padding:5px;max-height:340px;overflow-y:auto;
          background:var(--elevated);border:1px solid var(--border-2);
          border-radius:var(--r-md);box-shadow:var(--shadow-lg);
          display:flex;flex-direction:column;gap:2px;
        }
        .cerebro-hit{
          width:100%;text-align:left;cursor:pointer;display:flex;align-items:center;gap:9px;
          background:transparent;border:0;border-radius:9px;padding:8px 10px;font-family:inherit;
          transition:background .12s;
        }
        .cerebro-hit:hover,.cerebro-hit:focus-visible{background:var(--surface-2)}
        .cerebro-hit-main{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1}
        .cerebro-hit-name{font-size:13.5px;font-weight:600;color:var(--t-hi);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .cerebro-hit-sub{font-size:11.5px;color:var(--t-mid);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        /* Painel de camadas */
        .cerebro-filters{
          position:absolute;top:54px;right:12px;z-index:15;
          border-radius:12px;padding:10px 12px;width:min(260px,72vw);
          max-height:min(60vh,360px);overflow-y:auto;
        }
        .cerebro-layer{
          width:100%;display:flex;align-items:center;gap:8px;cursor:pointer;
          background:transparent;border:0;border-radius:8px;padding:5px 6px;font-family:inherit;
          transition:background .12s;
        }
        .cerebro-layer:hover{background:var(--surface-2)}
        .cerebro-layer-label{font-size:12.5px;font-weight:600;color:var(--t-hi);flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .cerebro-layer-count{font-size:11px;font-weight:700;color:var(--t-mid);font-variant-numeric:tabular-nums}
        /* Legenda */
        .cerebro-legend{
          position:absolute;left:12px;bottom:12px;border-radius:12px;padding:9px 12px;
          max-width:min(64%,360px);
        }
        .cerebro-legend-row{display:flex;flex-wrap:wrap;gap:5px 12px}
        /* Tabela de detalhe */
        .cerebro-detail{margin:4px 0 0;padding:8px 0 0;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:6px}
        .cerebro-detail-row{display:grid;grid-template-columns:84px 1fr;gap:8px;align-items:baseline}
        .cerebro-detail-row dt{font-size:11px;font-weight:700;letter-spacing:.02em;text-transform:uppercase;color:var(--t-low);margin:0}
        .cerebro-detail-row dd{margin:0;font-size:12.5px;color:var(--t-hi);overflow-wrap:anywhere}
        /* Lista textual */
        .cerebro-list-item{
          width:100%;text-align:left;cursor:pointer;
          display:flex;flex-direction:column;gap:2px;
          background:var(--surface-2);border:1px solid var(--border);
          border-radius:9px;padding:7px 10px;font-family:inherit;
          transition:border-color .15s,background .15s,transform .1s;
        }
        .cerebro-list-item:hover{background:var(--surface);transform:translateX(2px)}
        .cerebro-list-label{
          font-size:13px;font-weight:600;color:var(--t-hi);
          overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
        }
        .cerebro-list-sub{
          font-size:11.5px;color:var(--t-mid);
          overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
        }
        .cerebro-list-tag{
          align-self:flex-start;margin-top:3px;font-size:10px;font-weight:700;
          letter-spacing:.04em;text-transform:uppercase;
          color:var(--brand-ink);
          background:color-mix(in srgb,var(--brand) 12%,transparent);
          padding:1px 6px;border-radius:999px;
        }
        @media (prefers-reduced-motion:reduce){
          .cerebro-list-item:hover{transform:none}
        }
        /* Painel UBO */
        .ubo-panel{padding:16px 20px}
        .ubo-notice{
          padding:10px 14px;border-radius:var(--r-md);font-size:13px;line-height:1.5;
        }
        .ubo-notice--warn{
          background:color-mix(in srgb,var(--warn,#f59e0b) 10%,var(--surface));
          border:1px solid color-mix(in srgb,var(--warn,#f59e0b) 28%,transparent);
          color:var(--t-hi);
        }
        .ubo-notice--info{
          background:color-mix(in srgb,var(--brand) 8%,var(--surface));
          border:1px solid color-mix(in srgb,var(--brand) 18%,transparent);
          color:var(--t-hi);
        }
        .ubo-beneficiary{border-radius:var(--r-md)}
        .ubo-chain{
          list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:2px 0;
          align-items:center;
        }
        .ubo-chain li{display:inline;font-size:12px}
        .ubo-arrow{color:var(--t-low);font-weight:700}
        @media (max-width:600px){
          .ubo-panel{padding:12px 14px}
        }
      `}</style>
    </div>
  );
}

// ─── Subcomponentes / utils de UI ───────────────────────────────────────────────

/** Anuncia o resultado de uma expansão na faixa de info (texto honesto). */
function announceResult(
  result: ExpandResult,
  setInfo: (v: string | null) => void,
): void {
  const total = result.leaves.length;
  if (total === 0) {
    setInfo(
      `Nenhuma conexão encontrada para ${result.centerLabel} nos módulos disponíveis. ` +
        "Isso pode significar que a entidade ainda não aparece nas bases públicas já coletadas.",
    );
    return;
  }
  const premium = result.trademarksPremium ? " (marcas via consulta premium ao INPI)" : "";
  setInfo(
    `${total} ${total === 1 ? "conexão" : "conexões"} encontradas para ${result.centerLabel}${premium}.`,
  );
}

/** Item de legenda de MÓDULO (cor do nó): ponto colorido + rótulo. */
function LegendDot({ kind }: { kind: NodeKind }) {
  const meta = MODULE_META[kind];
  const style: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6 };
  return (
    <span style={style} title={meta.fonte}>
      <span
        className="dot"
        style={{ background: meta.color, width: 9, height: 9, boxShadow: `0 0 0 2px color-mix(in srgb,${meta.color} 22%,transparent)` }}
      />
      <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--t-mid)" }}>{meta.label}</span>
    </span>
  );
}

/** Item de legenda de RELAÇÃO (cor do fio): traço colorido + rótulo. */
function RelDot({ rel }: { rel: EdgeKind }) {
  const meta = RELATION_META[rel];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }} title={relLabelOf(rel)}>
      <span
        aria-hidden="true"
        style={{
          width: 16,
          height: 0,
          borderTop: `2px ${isDashedRel(rel) ? "dashed" : "solid"} ${meta.color}`,
          display: "inline-block",
        }}
      />
      <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--t-mid)" }}>{meta.label}</span>
    </span>
  );
}

/** Trunca um texto longo com reticências. */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

// ─── Painel de Beneficiário Final ─────────────────────────────────────────────────

/**
 * Formata uma cadeia de propriedade como texto legível: "Empresa A → Holding B → João da Silva".
 */
function chainLabel(chain: UBOHop[]): string {
  return chain.map((h, i) => (i === 0 ? h.empresaNome : h.socioNome)).join(" → ");
}

/**
 * Painel que exibe o resultado do BFS de Beneficiário Final (UBO).
 * Renderizado fora do canvas, abaixo do grafo, com linguagem acessível a leigos.
 */
function UBOPanel({
  result,
  loading,
  onClose,
}: {
  result: UBOResult | null;
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className="panel ubo-panel"
      role="region"
      aria-label="Beneficiário final — quem manda de verdade"
    >
      {/* Cabeçalho */}
      <div
        className="row between"
        style={{ alignItems: "flex-start", gap: 12, marginBottom: 12 }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 4,
            }}
          >
            <Users size={16} style={{ color: "var(--brand-ink)", flexShrink: 0 }} aria-hidden="true" />
            <span style={{ fontWeight: 800, fontSize: 15, color: "var(--t-hi)" }}>
              Beneficiário final
            </span>
            {result && (
              <span
                className="cerebro-list-tag"
                style={{ alignSelf: "center" }}
              >
                {result.beneficiaries.length === 0 && result.incomplete.length === 0
                  ? "sem dados"
                  : `${result.beneficiaries.length} PF encontrada${result.beneficiaries.length !== 1 ? "s" : ""}`}
              </span>
            )}
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            Quem é o dono de verdade por trás desta empresa? Percorremos a cadeia de
            sócios — holdings, sub-holdings — até chegar nas pessoas físicas que a
            controlam. Fonte: Receita Federal (via base pública da BrasilAPI).
          </p>
          {result && (
            <p className="tiny muted" style={{ margin: "6px 0 0" }}>
              Empresa investigada:{" "}
              <strong style={{ color: "var(--t-hi)" }}>
                {result.empresaNome}
              </strong>{" "}
              ({formatCnpj(result.cnpj)}) ·{" "}
              <a
                href={`https://brasilapi.com.br/api/cnpj/v1/${result.cnpj}`}
                target="_blank"
                rel="noopener noreferrer"
                className="link tiny"
              >
                Fonte
              </a>
            </p>
          )}
        </div>
        <button
          className="btn btn--icon btn--ghost btn--sm"
          type="button"
          onClick={onClose}
          aria-label="Fechar painel de beneficiário final"
          style={{ flexShrink: 0, marginTop: 2 }}
        >
          <X size={15} aria-hidden="true" />
        </button>
      </div>

      {/* Conteúdo */}
      {loading && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "20px 0",
            color: "var(--t-mid)",
          }}
          aria-live="polite"
        >
          <Loader2 size={20} className="spin" aria-hidden="true" />
          <span className="small">
            Percorrendo a cadeia de propriedade… (pode levar alguns segundos)
          </span>
        </div>
      )}

      {!loading && result && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Aviso de truncamento */}
          {result.truncated && (
            <div className="ubo-notice ubo-notice--warn">
              A investigação parou ao atingir o limite de {" "}
              <strong>40 nós</strong> visitados. Pode haver mais sócios não exibidos —
              a estrutura desta empresa é muito extensa para varrer por completo.
            </div>
          )}

          {/* Erros não-fatais */}
          {result.errors.length > 0 && (
            <div className="ubo-notice ubo-notice--warn">
              {result.errors.join(" · ")}
            </div>
          )}

          {/* Beneficiários encontrados */}
          {result.beneficiaries.length > 0 && (
            <div>
              <div
                className="tiny"
                style={{ fontWeight: 700, color: "var(--t-mid)", marginBottom: 8 }}
              >
                Pessoas físicas identificadas ({result.beneficiaries.length})
              </div>
              <div
                style={{ display: "flex", flexDirection: "column", gap: 8 }}
                role="list"
                aria-label="Beneficiários finais encontrados"
              >
                {result.beneficiaries.map((b, i) => (
                  <div
                    key={`${norm(b.nome)}-${i}`}
                    className="inset ubo-beneficiary"
                    role="listitem"
                    style={{ padding: "10px 12px" }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 4,
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: "50%",
                          background:
                            "color-mix(in srgb, var(--brand) 14%, var(--surface))",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <Users
                          size={14}
                          style={{ color: "var(--brand-ink)" }}
                          aria-hidden="true"
                        />
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 700,
                            fontSize: 13.5,
                            color: "var(--t-hi)",
                            overflowWrap: "anywhere",
                          }}
                        >
                          {b.nome}
                        </div>
                        {b.qualificacao && (
                          <div className="tiny muted" style={{ marginTop: 1 }}>
                            {b.qualificacao}
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Cadeia de propriedade */}
                    {b.chain.length > 1 && (
                      <div style={{ marginTop: 6 }}>
                        <div
                          className="tiny"
                          style={{ fontWeight: 600, color: "var(--t-low)", marginBottom: 4 }}
                        >
                          Caminho de controle
                        </div>
                        <ol
                          className="ubo-chain"
                          aria-label={`Cadeia de propriedade até ${b.nome}`}
                        >
                          {b.chain.map((hop, hi) => (
                            <li key={`${hop.empresaCnpj}-${hi}`}>
                              <a
                                href={hop.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="link tiny"
                                title={`Fonte: ${hop.sourceUrl}`}
                              >
                                {hop.empresaNome}
                              </a>
                              <span className="tiny muted">
                                {" "}
                                ({formatCnpj(hop.empresaCnpj)})
                              </span>
                              {hi < b.chain.length - 1 && (
                                <span
                                  aria-hidden="true"
                                  className="ubo-arrow"
                                >
                                  {" "}
                                  →{" "}
                                </span>
                              )}
                              {hi === b.chain.length - 1 && (
                                <span className="tiny muted">
                                  {" "}
                                  · sócio: <strong style={{ color: "var(--t-hi)" }}>{hop.socioNome}</strong>
                                  {hop.qualificacao ? ` (${hop.qualificacao})` : ""}
                                </span>
                              )}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cadeias incompletas */}
          {result.incomplete.length > 0 && (
            <div>
              <div
                className="tiny"
                style={{ fontWeight: 700, color: "var(--t-mid)", marginBottom: 6 }}
              >
                Cadeias incompletas ({result.incomplete.length}) — sem dado público disponível
              </div>
              <div className="ubo-notice ubo-notice--info">
                Nos ramos abaixo, encontramos uma empresa sócia (pessoa jurídica), mas
                o CNPJ dela não estava disponível na base pública para continuar a
                investigação. Isso é normal em estruturas com holdings estrangeiras ou
                quando a Receita Federal não divulgou o dado.
              </div>
              <div
                style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}
              >
                {result.incomplete.map((chain, i) => {
                  const lastHop = chain[chain.length - 1];
                  return (
                    <div
                      key={`incomplete-${i}`}
                      className="inset"
                      style={{ padding: "8px 12px", opacity: 0.8 }}
                    >
                      <div className="small" style={{ color: "var(--t-hi)", overflowWrap: "anywhere" }}>
                        {chainLabel(chain)}
                      </div>
                      {lastHop && (
                        <div className="tiny muted" style={{ marginTop: 3 }}>
                          Parou em:{" "}
                          <strong>{lastHop.socioNome}</strong>
                          {lastHop.tipo === "PJ" && " (empresa sócia sem CNPJ na base)"}
                          {" · "}
                          <a
                            href={lastHop.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="link tiny"
                          >
                            Fonte
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Estado vazio honesto */}
          {result.beneficiaries.length === 0 &&
            result.incomplete.length === 0 &&
            result.errors.length === 0 && (
              <div className="ubo-notice ubo-notice--info">
                Não encontramos QSA (quadro de sócios) para esta empresa na base atual.
                Isso pode indicar que a empresa ainda não foi coletada, ou que é uma
                entidade pública sem sócios (ex.: autarquia, fundação pública).
                Evidência insuficiente — não fabricamos dados.
              </div>
            )}

          {/* Nota de rastreabilidade */}
          <p className="tiny muted" style={{ margin: 0, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
            Fonte oficial: Receita Federal do Brasil via BrasilAPI (espelho público da
            base de CNPJ). Dados sujeitos à atualização e limitações da divulgação pública.
            Esta investigação usa apenas dados abertos — não acessa fontes privadas.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Aplica alpha (0..1) a uma cor HEX (#RGB ou #RRGGBB), devolvendo rgba().
 * Necessário porque o canvas não aceita `color-mix`. Robusto a entradas curtas.
 */
function hexWithAlpha(hex: string, alpha: number): string {
  let h = hex.replace("#", "");
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export default CerebroPage;
