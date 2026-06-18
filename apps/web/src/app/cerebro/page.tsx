/**
 * Cérebro — grafo de conhecimento interativo (estilo Obsidian) da Fonte.ia.
 *
 * Busque um CNPJ → ele vira o NÓ CENTRAL → o grafo puxa tudo que existe sobre a
 * empresa em todos os módulos (sanções, contratos, licitações, infrações
 * ambientais, processos, marcas), colorido por módulo. Clique num nó para
 * EXPANDIR (puxar as conexões dele, quando tiver CNPJ próprio) ou recentralizar.
 *
 * Render: <canvas> com simulação de força própria (requestAnimationFrame).
 * Suporta pan, wheel-zoom, arrastar nós, HiDPI (devicePixelRatio) e respeita
 * `prefers-reduced-motion` (nesse caso assenta o layout sem animar).
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
  Crosshair,
  Loader2,
  Maximize2,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import {
  ForceSimulation,
  DEFAULT_PARAMS,
  massFor,
  radiusFor,
  ringAround,
  EDGE_LENGTH,
} from "../../features/cerebro/force-graph";
import {
  expandCnpj,
  sanitizeCnpj,
  formatCnpj,
  EXEMPLO_CNPJ,
  type RawLeaf,
} from "../../features/cerebro/cerebro-api";
import {
  MODULE_META,
  LEGEND_ORDER,
  colorOf,
  labelOf,
  type GraphData,
  type GraphEdge,
  type GraphNode,
  type NodeKind,
} from "../../features/cerebro/types";

// ─── Helpers de grafo ───────────────────────────────────────────────────────────

/** Detecta tema escuro lendo o atributo data-theme (com fallback claro). */
function isDarkTheme(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.getAttribute("data-theme") === "dark";
}

/** Cria o nó central (empresa). */
function makeCenterNode(cnpj: string, label: string): GraphNode {
  return {
    id: `entity:${cnpj}`,
    kind: "entity",
    label,
    sublabel: formatCnpj(cnpj),
    cnpj,
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

/**
 * Funde os nós-folha de uma expansão num grafo existente, ligando cada folha ao
 * nó-pai. Deduplica por id: se um nó já existe, só garante a aresta. Marca o pai
 * como `expanded`. Devolve um GraphData novo (imutável p/ o React reagir).
 */
function mergeExpansion(
  prev: GraphData,
  parentId: string,
  leaves: RawLeaf[],
): GraphData {
  const nodes = prev.nodes.map((n) =>
    n.id === parentId ? { ...n, expanded: true } : n,
  );
  const parent = nodes.find((n) => n.id === parentId);
  if (!parent) return prev;

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const existingEdges = new Set(prev.edges.map((e) => edgeKey(e.source, e.target)));
  const newEdges: GraphEdge[] = [...prev.edges];

  leaves.forEach((leaf, i) => {
    if (!nodeById.has(leaf.id)) {
      const node = makeLeafNode(leaf, parent, i, leaves.length);
      nodeById.set(node.id, node);
      nodes.push(node);
    }
    const key = edgeKey(parentId, leaf.id);
    if (!existingEdges.has(key)) {
      existingEdges.add(key);
      newEdges.push({ source: parentId, target: leaf.id, length: EDGE_LENGTH });
    }
  });

  return { nodes, edges: newEdges };
}

// ─── Câmera (pan/zoom) ──────────────────────────────────────────────────────────

interface Camera {
  /** Translação em px de tela. */
  tx: number;
  ty: number;
  /** Fator de zoom (1 = 100%). */
  scale: number;
}

const MIN_SCALE = 0.25;
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
      // Sem animação: assenta o layout sincronamente (várias iterações rápidas).
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

  // ── Conversões de coordenadas tela ↔ mundo ──
  const screenToWorld = useCallback((sx: number, sy: number): { x: number; y: number } => {
    const cam = cameraRef.current;
    const { w, h } = sizeRef.current;
    return {
      x: (sx - w / 2 - cam.tx) / cam.scale,
      y: (sy - h / 2 - cam.ty) / cam.scale,
    };
  }, []);

  /** Nó sob um ponto de tela (o de cima/maior ganha). null se nenhum. */
  const nodeAtScreen = useCallback(
    (sx: number, sy: number): GraphNode | null => {
      const { x, y } = screenToWorld(sx, sy);
      const cam = cameraRef.current;
      const nodes = graphRef.current.nodes;
      let best: GraphNode | null = null;
      let bestDist = Number.POSITIVE_INFINITY;
      for (const node of nodes) {
        const dx = node.x - x;
        const dy = node.y - y;
        const distSq = dx * dx + dy * dy;
        // Área de clique generosa (raio + folga), escalada pelo zoom inverso.
        const hit = node.radius + 8 / cam.scale;
        if (distSq <= hit * hit && distSq < bestDist) {
          best = node;
          bestDist = distSq;
        }
      }
      return best;
    },
    [screenToWorld],
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

    // Limpa em coordenadas de device.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Câmera: origem no centro do canvas + pan + zoom.
    ctx.translate(w / 2 + cam.tx, h / 2 + cam.ty);
    ctx.scale(cam.scale, cam.scale);

    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const hoverId = hoverIdRef.current;
    const selId = selectedIdRef.current;

    // 1) Arestas (fios). Realça as conectadas ao nó focado.
    ctx.lineCap = "round";
    for (const edge of edges) {
      const s = nodeById.get(edge.source);
      const t = nodeById.get(edge.target);
      if (!s || !t) continue;
      const focused =
        selId !== null && (edge.source === selId || edge.target === selId);
      const hovered =
        hoverId !== null && (edge.source === hoverId || edge.target === hoverId);
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      // Cor da aresta puxa a cor da folha (target costuma ser a folha).
      const leaf = t.isCenter ? s : t;
      const base = colorOf(leaf.kind);
      ctx.strokeStyle = focused || hovered
        ? hexWithAlpha(base, 0.85)
        : hexWithAlpha(base, dark ? 0.22 : 0.28);
      ctx.lineWidth = (focused || hovered ? 2.2 : 1.1) / cam.scale;
      ctx.stroke();
    }

    // 2) Nós (círculos com halo + rótulo). Rótulos só quando legíveis.
    const showLabels = cam.scale > 0.45;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const node of nodes) {
      const color = colorOf(node.kind);
      const isFocused = node.id === selId || node.id === hoverId;
      const r = node.radius;

      // Halo suave para o centro e para o nó focado.
      if (node.isCenter || isFocused) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + (node.isCenter ? 10 : 6), 0, Math.PI * 2);
        ctx.fillStyle = hexWithAlpha(color, 0.16);
        ctx.fill();
      }

      // Corpo do nó.
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // Anel: branco no centro, mais sutil nas folhas. Destaca seleção.
      ctx.lineWidth = (node.isCenter ? 3 : isFocused ? 2.4 : 1.4) / cam.scale;
      ctx.strokeStyle = node.isCenter
        ? "#FFFFFF"
        : isFocused
          ? hexWithAlpha("#FFFFFF", 0.9)
          : hexWithAlpha(dark ? "#000000" : "#FFFFFF", 0.55);
      ctx.stroke();

      // Indica nós expansíveis ainda não expandidos com um anel tracejado.
      if (!node.isCenter && node.cnpj && !node.expanded) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 4, 0, Math.PI * 2);
        ctx.setLineDash([3 / cam.scale, 3 / cam.scale]);
        ctx.lineWidth = 1.2 / cam.scale;
        ctx.strokeStyle = hexWithAlpha(color, 0.7);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Rótulo.
      if (showLabels || node.isCenter) {
        const fontPx = (node.isCenter ? 14 : 11.5) / cam.scale;
        ctx.font = `${node.isCenter ? 700 : 500} ${fontPx}px 'Figtree', system-ui, sans-serif`;
        const label = truncate(node.label, node.isCenter ? 36 : 24);
        const ty = node.y + r + 4 / cam.scale;
        // Sombra de texto p/ legibilidade sobre os fios.
        ctx.fillStyle = dark ? "rgba(7,12,22,0.85)" : "rgba(255,255,255,0.9)";
        ctx.lineWidth = 3 / cam.scale;
        ctx.strokeStyle = dark ? "rgba(7,12,22,0.85)" : "rgba(255,255,255,0.9)";
        ctx.strokeText(label, node.x, ty);
        ctx.fillStyle = dark ? "#EAF1FB" : "#0B2240";
        ctx.fillText(label, node.x, ty);
      }
    }
  }, []);

  const tick = useCallback(() => {
    const sim = simRef.current;
    if (sim && !reducedRef.current) {
      sim.step(1);
    }
    draw();
    // Continua animando enquanto não assentou (e não há drag ativo "quente").
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
        // Assenta imediatamente e redesenha.
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

  // ── Busca / expansão de um CNPJ ──
  const runSearch = useCallback(
    async (rawCnpj: string, recenter: boolean) => {
      const cnpj = sanitizeCnpj(rawCnpj);
      if (cnpj === "") {
        setError("CNPJ inválido: digite os 14 números (com ou sem máscara).");
        return;
      }
      setIsLoading(true);
      setError(null);
      setInfo(null);
      try {
        const result = await expandCnpj(cnpj);
        const centerId = `entity:${cnpj}`;

        setGraph((prev) => {
          let next = prev;
          const exists = prev.nodes.some((n) => n.id === centerId);
          if (recenter || !exists) {
            // Nova consulta: centro novo no meio, demais nós como satélites leves.
            const center = makeCenterNode(cnpj, result.centerLabel);
            next = { nodes: [center], edges: [] };
            cameraRef.current = { tx: 0, ty: 0, scale: 1 };
          } else {
            // Garante o rótulo da empresa quando descoberto.
            next = {
              nodes: prev.nodes.map((n) =>
                n.id === centerId && n.label === formatCnpj(cnpj)
                  ? { ...n, label: result.centerLabel }
                  : n,
              ),
              edges: prev.edges,
            };
          }
          return mergeExpansion(next, centerId, result.leaves);
        });

        setSelectedId(centerId);
        const total = result.leaves.length;
        if (total === 0) {
          setInfo(
            `Nenhuma conexão encontrada para ${formatCnpj(cnpj)} nos módulos disponíveis. ` +
              "Isso pode significar que a empresa não aparece nas bases públicas já coletadas.",
          );
        } else {
          setInfo(
            `${total} ${total === 1 ? "conexão" : "conexões"} encontradas para ${result.centerLabel}.`,
          );
        }
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

  /** Expande um nó-folha que tenha CNPJ próprio (re-busca centrando nele). */
  const expandNode = useCallback(
    async (node: GraphNode) => {
      if (!node.cnpj) return;
      setIsLoading(true);
      setError(null);
      try {
        const result = await expandCnpj(node.cnpj);
        setGraph((prev) => mergeExpansion(prev, node.id, result.leaves));
        const total = result.leaves.length;
        setInfo(
          total === 0
            ? `Nenhuma conexão nova a partir de ${node.label}.`
            : `${total} ${total === 1 ? "conexão" : "conexões"} a partir de ${node.label}.`,
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao expandir o nó.");
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  /** Recentraliza um nó-folha que tenha CNPJ (vira o novo centro). */
  const recenterNode = useCallback(
    (node: GraphNode) => {
      if (!node.cnpj) return;
      void runSearch(node.cnpj, true);
    },
    [runSearch],
  );

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
        // Hover: atualiza realce + cursor.
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
      const clicked = d.movedSq < 25; // < 5px de movimento ⇒ é clique
      // Solta a fixação do nó arrastado.
      if (nodeId) {
        const node = graphRef.current.nodes.find((n) => n.id === nodeId);
        if (node) node.fixed = false;
      }
      d.mode = "none";
      d.nodeId = null;

      if (wasNode && clicked && nodeId) {
        const node = graphRef.current.nodes.find((n) => n.id === nodeId);
        if (node) {
          setSelectedId(node.id);
          // Clique simples num nó-folha expansível → expande as conexões dele.
          if (!node.isCenter && node.cnpj && !node.expanded) {
            void expandNode(node);
          }
        }
      }
      simRef.current?.reheat();
      ensureRaf();
    },
    [ensureRaf, expandNode],
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
      // Ponto do mundo sob o cursor antes do zoom.
      const wx = (sx - w / 2 - cam.tx) / cam.scale;
      const wy = (sy - h / 2 - cam.ty) / cam.scale;
      cam.scale = nextScale;
      // Reposiciona o pan para o mesmo ponto do mundo continuar sob o cursor.
      cam.tx = sx - w / 2 - wx * nextScale;
      cam.ty = sy - h / 2 - wy * nextScale;
      if (reducedRef.current) draw();
      else ensureRaf();
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [draw, ensureRaf]);

  /** Reenquadra a câmera para caber todos os nós (botão "Centralizar"). */
  const fitView = useCallback(() => {
    const nodes = graphRef.current.nodes;
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
  }, [draw, ensureRaf]);

  // ── Dados derivados para a lista textual (a11y) e o painel do nó ──
  const center = useMemo(
    () => graph.nodes.find((n) => n.isCenter) ?? null,
    [graph.nodes],
  );
  const selectedNode = useMemo(
    () => graph.nodes.find((n) => n.id === selectedId) ?? null,
    [graph.nodes, selectedId],
  );

  /** Nós agrupados por kind (exceto o centro) para a lista lateral navegável. */
  const grouped = useMemo(() => {
    const map = new Map<NodeKind, GraphNode[]>();
    for (const node of graph.nodes) {
      if (node.isCenter) continue;
      const arr = map.get(node.kind) ?? [];
      arr.push(node);
      map.set(node.kind, arr);
    }
    return LEGEND_ORDER.filter((k) => map.has(k)).map((k) => ({
      kind: k,
      nodes: map.get(k)!,
    }));
  }, [graph.nodes]);

  const hasGraph = graph.nodes.length > 0;

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
        <p className="muted small" style={{ marginTop: 4, maxWidth: 640 }}>
          Um cérebro visual dos dados públicos. Busque um CNPJ: a empresa vira o centro e o grafo
          puxa tudo que existe sobre ela em todos os módulos — sanções, contratos, licitações,
          infrações ambientais, processos e marcas — colorido por fonte. Clique num nó para expandir
          ou recentralizar.
        </p>
      </div>

      {/* Barra de busca */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void runSearch(input, true);
        }}
        className="panel"
        style={{ padding: "14px 16px", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "stretch" }}
      >
        <div className="searchbar" style={{ flex: "1 1 280px", minWidth: 0 }}>
          <Search size={16} style={{ color: "var(--t-low)", flexShrink: 0 }} aria-hidden="true" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Digite o CNPJ (ex.: 00.000.000/0001-91)"
            inputMode="numeric"
            aria-label="CNPJ para montar o grafo"
          />
          {input !== "" && (
            <button
              className="btn btn--icon btn--ghost btn--sm"
              style={{ width: 28, height: 28, flexShrink: 0 }}
              onClick={() => setInput("")}
              type="button"
              aria-label="Limpar"
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>
        <button
          className="btn btn--primary"
          type="submit"
          disabled={isLoading || sanitizeCnpj(input) === ""}
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

      {/* Área principal: canvas + lista textual lado a lado */}
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
            style={{ position: "relative", width: "100%", height: "min(72vh, 640px)", minHeight: 420 }}
          >
            <canvas
              ref={canvasRef}
              role="img"
              aria-label={
                center
                  ? `Grafo de ${center.label} com ${graph.nodes.length - 1} conexões. Use a lista ao lado para navegar por teclado.`
                  : "Grafo de conhecimento vazio. Busque um CNPJ para começar."
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
                  Comece pelo CNPJ
                </div>
                <p className="muted small" style={{ margin: 0, maxWidth: 360 }}>
                  Digite um CNPJ acima e gere o cérebro. Cada fio liga a empresa às sanções,
                  contratos, licitações, processos e mais — colorido por módulo.
                </p>
                <button
                  className="btn btn--soft btn--sm"
                  type="button"
                  style={{ pointerEvents: "auto" }}
                  onClick={() => {
                    setInput(formatCnpj(EXEMPLO_CNPJ));
                    void runSearch(EXEMPLO_CNPJ, true);
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

            {/* Controles flutuantes do palco */}
            {hasGraph && (
              <div
                style={{
                  position: "absolute",
                  top: 12,
                  right: 12,
                  display: "flex",
                  gap: 6,
                }}
              >
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

            {/* Legenda por cor de módulo */}
            {hasGraph && (
              <div
                className="glass"
                style={{
                  position: "absolute",
                  left: 12,
                  bottom: 12,
                  borderRadius: 12,
                  padding: "10px 12px",
                  maxWidth: "min(60%, 320px)",
                }}
                aria-hidden="true"
              >
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 12px" }}>
                  {grouped.length === 0 ? (
                    <LegendDot kind="entity" />
                  ) : (
                    [{ kind: "entity" as NodeKind }, ...grouped].map((g) => (
                      <LegendDot key={g.kind} kind={g.kind} />
                    ))
                  )}
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
          {/* Resumo / nó selecionado */}
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
              {selectedNode.cnpj && (
                <div className="row wrap" style={{ gap: 8, marginTop: 4 }}>
                  {!selectedNode.isCenter && !selectedNode.expanded && (
                    <button
                      className="btn btn--soft btn--sm"
                      type="button"
                      onClick={() => void expandNode(selectedNode)}
                      disabled={isLoading}
                    >
                      <Sparkles size={13} aria-hidden="true" /> Expandir conexões
                    </button>
                  )}
                  {!selectedNode.isCenter && (
                    <button
                      className="btn btn--ghost btn--sm"
                      type="button"
                      onClick={() => recenterNode(selectedNode)}
                      disabled={isLoading}
                    >
                      <Crosshair size={13} aria-hidden="true" /> Recentralizar
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            info && (
              <p className="small muted" style={{ margin: 0 }} aria-live="polite">
                {info}
              </p>
            )
          )}

          {/* Lista textual de conexões — fallback navegável por teclado */}
          <div style={{ minHeight: 0, flex: 1, overflowY: "auto" }}>
            <div className="tiny" style={{ fontWeight: 700, color: "var(--t-hi)", marginBottom: 8 }}>
              Conexões {hasGraph ? `(${graph.nodes.length - 1})` : ""}
            </div>
            {!hasGraph ? (
              <p className="small muted" style={{ margin: 0 }}>
                Nenhum grafo ainda. Busque um CNPJ para listar as conexões aqui.
              </p>
            ) : grouped.length === 0 ? (
              <p className="small muted" style={{ margin: 0 }}>
                A empresa está no centro, mas não encontramos conexões nas bases já coletadas.
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
                            {node.cnpj && !node.expanded && !node.isCenter && (
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
        Arraste os nós para reorganizar · role para dar zoom · arraste o fundo para mover.
        {reducedMotion ? " Animação reduzida ativada — o grafo é assentado sem movimento." : ""}
      </p>

      {/* Estilos locais — responsivo e itens da lista */}
      <style>{`
        .cerebro-layout{
          display:grid;
          grid-template-columns:minmax(0,1fr) 320px;
          gap:16px;
          align-items:stretch;
        }
        .cerebro-aside{max-height:min(72vh,640px)}
        @media (max-width:920px){
          .cerebro-layout{grid-template-columns:1fr}
          .cerebro-aside{max-height:none}
        }
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
      `}</style>
    </div>
  );
}

// ─── Subcomponentes / utils de UI ───────────────────────────────────────────────

/** Item de legenda: ponto colorido + rótulo do módulo. */
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

/** Trunca um texto longo com reticências. */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
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
