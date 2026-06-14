/**
 * fonteia-api
 *
 * Worker publico (somente leitura) que entrega ao app os dados REAIS dos leiloes
 * da Receita Federal e a analise por IA (Claude) de cada lote.
 *
 * Rotas:
 *   GET  /health                 -> status do servico
 *   GET  /leiloes/lotes          -> lista de lotes em destaque (dados ao vivo da Receita)
 *   GET  /leiloes/lotes/:id      -> um lote especifico
 *   POST /ia/raio-x              -> analise em linguagem simples de um lote (Claude)
 *
 * Dados dos lotes: endpoint publico oficial da Receita (Sistema de Leilao Eletronico).
 * Nao exige segredo. Resultado fica em cache na borda da Cloudflare por 15 min.
 *
 * IA (rota /ia/raio-x): exige o secret ANTHROPIC_API_KEY. Sem ele, a rota responde
 * 503 de forma honesta (nada de resposta falsa). Modelo padrao: claude-opus-4-8
 * (pode trocar via var ANTHROPIC_MODEL, ex.: claude-haiku-4-5 para custo menor).
 *
 * Secrets/vars (configurar com `wrangler secret put` / dashboard — NUNCA versionar):
 *   ANTHROPIC_API_KEY   sk-ant-...   (opcional; habilita a rota /ia/raio-x)
 *   ANTHROPIC_MODEL     claude-opus-4-8 (opcional; default abaixo)
 */

import {
  AiNotConfiguredError,
  createAiRouter,
  FONTEIA_ASSISTANT_SYSTEM_PROMPT,
  resolveIntent,
  type AiEnv,
  type AiMessage,
} from "@fonteia/ai";

// ---------------------------------------------------------------------------
// Tipos do ambiente e do handler (sem @cloudflare/workers-types — so Web APIs)
// ---------------------------------------------------------------------------

export interface Env {
  // IA — Gemini (Google) é o padrão gratuito; Anthropic é o fallback/reforço.
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  GEMINI_MODEL_PRO?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface ExportedHandler<E> {
  fetch(request: Request, env: E, ctx: ExecutionContext): Promise<Response>;
}

// Cloudflare expoe caches.default (nao faz parte do lib DOM padrao).
const edgeCache = (caches as unknown as { default: Cache }).default;

// ---------------------------------------------------------------------------
// Conector da Receita (inline — Worker autocontido, so Web APIs)
// Espelha packages/sources/src/connectors/receita-leiloes.ts
// ---------------------------------------------------------------------------

const RECEITA_LEILOES_DESTAQUES_URL =
  "https://www25.receita.fazenda.gov.br/sle-sociedade/api/portal/destaques";

const CACHE_TTL_SECONDS = 900; // 15 min

interface ReceitaLeiloesDestaqueRaw {
  permitePF: boolean;
  orgao: string;
  cidade: string;
  edital: string;
  edle: string;
  dtFimProposta: string;
  destaque: boolean;
  imagemDestaque?: string;
  numero: number;
  lote: number;
  valor: number;
}

interface ReceitaLeiloesDestaquesPayload {
  agora: string;
  destaques: ReceitaLeiloesDestaqueRaw[];
}

interface ReceitaLeilaoLot {
  id: string;
  sourceId: "receita-leiloes-sle";
  edital: string;
  edle: string;
  lotNumber: string;
  displayNumber: string;
  city: string;
  agency: string;
  minimumBidCents: number;
  proposalDeadline: string;
  eligiblePersonTypes: Array<"pf" | "pj">;
  imageUrl?: string;
  sourceUrl: string;
  collectedAt: string;
  raw: ReceitaLeiloesDestaqueRaw;
}

function parseReceitaDate(value: string): string {
  const [datePart, timePart = "00:00"] = value.split(" ");
  const [year, month, day] = datePart?.split("-") ?? [];

  if (!year || !month || !day) {
    return value;
  }

  return `${year}-${month}-${day}T${timePart}:00-03:00`;
}

function buildLotId(raw: ReceitaLeiloesDestaqueRaw): string {
  return `${raw.edle.replaceAll("/", "-")}-${raw.lote}`;
}

function normalizeReceitaDestaque(raw: ReceitaLeiloesDestaqueRaw, collectedAt: string): ReceitaLeilaoLot {
  const lot: ReceitaLeilaoLot = {
    id: buildLotId(raw),
    sourceId: "receita-leiloes-sle",
    edital: raw.edital,
    edle: raw.edle,
    lotNumber: String(raw.lote),
    displayNumber: String(raw.numero),
    city: raw.cidade,
    agency: raw.orgao,
    minimumBidCents: Math.round(raw.valor * 100),
    proposalDeadline: parseReceitaDate(raw.dtFimProposta),
    eligiblePersonTypes: raw.permitePF ? ["pf", "pj"] : ["pj"],
    sourceUrl: RECEITA_LEILOES_DESTAQUES_URL,
    collectedAt,
    raw,
  };

  if (raw.imagemDestaque) {
    lot.imageUrl = raw.imagemDestaque;
  }

  return lot;
}

function normalizeReceitaDestaquesPayload(payload: ReceitaLeiloesDestaquesPayload): ReceitaLeilaoLot[] {
  const collectedAt = parseReceitaDate(payload.agora);
  return (payload.destaques ?? []).map((raw) => normalizeReceitaDestaque(raw, collectedAt));
}

/**
 * Busca os destaques ao vivo da Receita, com cache na borda (Cloudflare Cache API).
 * Em caso de falha do cache, busca direto. Lanca erro se a Receita estiver fora.
 */
async function fetchDestaquesLive(): Promise<{ payload: ReceitaLeiloesDestaquesPayload; fromCache: boolean }> {
  const cacheKey = new Request(RECEITA_LEILOES_DESTAQUES_URL, { headers: { accept: "application/json" } });

  try {
    const cached = await edgeCache.match(cacheKey);
    if (cached) {
      const payload = (await cached.json()) as ReceitaLeiloesDestaquesPayload;
      return { payload, fromCache: true };
    }
  } catch {
    // cache indisponivel — segue para o fetch ao vivo
  }

  const response = await fetch(RECEITA_LEILOES_DESTAQUES_URL, { headers: { accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Receita respondeu ${response.status}`);
  }

  const bodyText = await response.text();
  const payload = JSON.parse(bodyText) as ReceitaLeiloesDestaquesPayload;

  try {
    const toCache = new Response(bodyText, {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": `public, max-age=${CACHE_TTL_SECONDS}`,
      },
    });
    await edgeCache.put(cacheKey, toCache);
  } catch {
    // ignora falha de escrita no cache
  }

  return { payload, fromCache: false };
}

// ---------------------------------------------------------------------------
// CORS + helpers de resposta JSON
// ---------------------------------------------------------------------------

// Origens permitidas para acesso à API.
// TODO: rate limiting via Cloudflare (Workers Rate Limiting API ou Cloudflare Rules).
const ALLOWED_ORIGINS = new Set([
  "https://fontebrasil.online",
  "https://www.fontebrasil.online",
]);

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  // Subdomínios: *.fontebrasil.online e *.igoreluisa.workers.dev (preview/staging)
  if (/^https:\/\/[a-z0-9-]+\.fontebrasil\.online$/.test(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.igoreluisa\.workers\.dev$/.test(origin)) return true;
  return false;
}

function getCorsHeaders(requestOrigin: string | null): Record<string, string> {
  const allowedOrigin = isAllowedOrigin(requestOrigin) ? (requestOrigin ?? "") : "https://fontebrasil.online";
  return {
    "access-control-allow-origin": allowedOrigin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    "vary": "Origin",
  };
}

// Mantido para rotas GET públicas (lotes/health) onde qualquer origem pode ler.
const CORS_HEADERS_PUBLIC: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
};

function json(body: unknown, status = 200, corsHeaders: Record<string, string> = CORS_HEADERS_PUBLIC, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders,
      ...extra,
    },
  });
}

// ---------------------------------------------------------------------------
// IA — roteador multimodelo (Gemini gratuito + Claude fallback) via @fonteia/ai
// ---------------------------------------------------------------------------

// O Env do Worker já é compatível com o AiEnv do pacote (mesmos nomes de var),
// então passamos `env` direto ao roteador.
function aiEnv(env: Env): AiEnv {
  return {
    GEMINI_API_KEY: env.GEMINI_API_KEY,
    GEMINI_MODEL: env.GEMINI_MODEL,
    GEMINI_MODEL_PRO: env.GEMINI_MODEL_PRO,
    ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
    ANTHROPIC_MODEL: env.ANTHROPIC_MODEL,
  };
}

/** true se PELO MENOS um provedor de IA está configurado (Gemini ou Claude). */
function iaEnabled(env: Env): boolean {
  return Boolean(
    (env.GEMINI_API_KEY && env.GEMINI_API_KEY.trim()) ||
      (env.ANTHROPIC_API_KEY && env.ANTHROPIC_API_KEY.trim()),
  );
}

// Cap de tamanho de input — protege contra injeção de prompt longa / abuso de tokens.
const MAX_INPUT_CHARS = 2000;
// Quantidade máxima de turnos aceitos no /ai/chat (evita payloads gigantes).
const MAX_CHAT_MESSAGES = 24;

/** Apara e limita um texto livre a MAX_INPUT_CHARS. Retorna undefined se vazio. */
function capText(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  return trimmed.slice(0, MAX_INPUT_CHARS);
}

/**
 * Valida e normaliza o array `messages` do /ai/chat: mantém só itens com role
 * 'user'/'assistant' e conteúdo string, aplica cap por mensagem e limita a
 * quantidade total (pegando os mais recentes).
 */
function sanitizeMessages(raw: unknown): AiMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: AiMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") continue;
    const capped = capText(content);
    if (!capped) continue;
    out.push({ role, content: capped });
  }
  return out.slice(-MAX_CHAT_MESSAGES);
}

/** Resposta 503 honesta quando nenhum provedor de IA está configurado. */
function iaNotConfigured(cors: Record<string, string>): Response {
  return json(
    {
      error: "ia_nao_configurada",
      message:
        "O assistente de IA ainda nao foi ativado. Configure o secret GEMINI_API_KEY (ou ANTHROPIC_API_KEY) no Worker.",
    },
    503,
    cors,
  );
}

const FONTEIA_SYSTEM_PROMPT = [
  "Voce e o assistente da Fonte.ia, especialista em leiloes da Receita Federal do Brasil.",
  "Explique para um comprador leigo, em portugues claro e direto, SEM jargao.",
  "",
  "Regras inviolaveis:",
  "- Use APENAS os dados do lote fornecidos. NUNCA invente fato, valor, prazo ou caracteristica.",
  "- Se um dado nao foi fornecido, diga explicitamente que precisa ser verificado no edital oficial.",
  "- Nao de aconselhamento juridico, contabil, fiscal ou financeiro definitivo.",
  "- Nao prometa lucro nem garanta resultado. Aponte riscos e o que conferir.",
  "- Nao finja ser orgao publico nem automatize lances ou login gov.br/e-CAC.",
  "",
  "Formato da resposta (markdown curto, no maximo ~250 palavras):",
  "**O que e** — uma frase sobre o lote.",
  "**Quem pode dar lance** — pessoa fisica e/ou juridica, conforme o dado.",
  "**Prazo** — data limite da proposta e a urgencia.",
  "**Valor de partida** — o lance minimo informado, em reais.",
  "**Pontos de atencao** — riscos reais e o que SEMPRE conferir no edital oficial antes de dar lance.",
].join("\n");

function lotFactsForPrompt(lot: ReceitaLeilaoLot): string {
  const reais = (lot.minimumBidCents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
  const quem = lot.eligiblePersonTypes.includes("pf")
    ? "Pessoa fisica e pessoa juridica"
    : "Apenas pessoa juridica";

  return [
    `Lote: ${lot.lotNumber} (numero de exibicao ${lot.displayNumber})`,
    `Cidade: ${lot.city}`,
    `Orgao: ${lot.agency}`,
    `Edital: ${lot.edital} (EDLE ${lot.edle})`,
    `Lance minimo: ${reais}`,
    `Quem pode dar lance: ${quem}`,
    `Prazo final da proposta: ${lot.proposalDeadline}`,
    `Fonte oficial: ${lot.sourceUrl}`,
    `Coletado em: ${lot.collectedAt}`,
  ].join("\n");
}

/**
 * Raio-X de um lote. Roteado: tarefa 'raio-x' prefere Claude (forte) e cai para
 * Gemini se a chave da Anthropic faltar. Mantém o comportamento original do
 * endpoint (mesmo system prompt e formato de resposta).
 */
async function analyzeLot(
  lot: ReceitaLeilaoLot,
  question: string | undefined,
  env: Env,
): Promise<{ answer: string; model: string }> {
  const router = createAiRouter(aiEnv(env));

  const userContent = question
    ? `Dados do lote:\n${lotFactsForPrompt(lot)}\n\nPergunta do usuario: ${question}`
    : `Faca o Raio-X deste lote:\n${lotFactsForPrompt(lot)}`;

  const result = await router.generate({
    task: "raio-x",
    system: FONTEIA_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });

  return { answer: result.text, model: result.model };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

const handler: ExportedHandler<Env> = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const requestOrigin = request.headers.get("origin");

    if (request.method === "OPTIONS") {
      // Para preflight das rotas de IA, retorna CORS restrito; para demais, público.
      const isIaRoute = pathname === "/ia/raio-x" || pathname.startsWith("/ai/");
      const headers = isIaRoute ? getCorsHeaders(requestOrigin) : CORS_HEADERS_PUBLIC;
      return new Response(null, { status: 204, headers });
    }

    // GET /health
    if (pathname === "/health" || pathname === "/") {
      return json({
        service: "fonteia-api",
        status: "ok",
        iaEnabled: iaEnabled(env),
        time: new Date().toISOString(),
      });
    }

    // GET /leiloes/lotes
    if (pathname === "/leiloes/lotes" && request.method === "GET") {
      try {
        const { payload, fromCache } = await fetchDestaquesLive();
        const lots = normalizeReceitaDestaquesPayload(payload);
        return json({
          sourceStatus: "fragile_operational",
          source: "receita-leiloes-sle",
          collectedAt: parseReceitaDate(payload.agora),
          fromCache,
          count: lots.length,
          lots,
        });
      } catch (error) {
        console.error("[api] /leiloes/lotes failed:", error);
        return json({ error: "Nao foi possivel consultar a Receita agora." }, 502);
      }
    }

    // GET /leiloes/lotes/:id
    const lotMatch = pathname.match(/^\/leiloes\/lotes\/([^/]+)$/);
    if (lotMatch && request.method === "GET") {
      const lotId = decodeURIComponent(lotMatch[1] ?? "");
      try {
        const { payload } = await fetchDestaquesLive();
        const lots = normalizeReceitaDestaquesPayload(payload);
        const lot = lots.find((item) => item.id === lotId);
        if (!lot) {
          return json({ error: "Lote nao encontrado", path: pathname }, 404);
        }
        return json(lot);
      } catch (error) {
        console.error("[api] /leiloes/lotes/:id failed:", error);
        return json({ error: "Nao foi possivel consultar a Receita agora." }, 502);
      }
    }

    // POST /ia/raio-x  { lot: ReceitaLeilaoLot, question?: string }
    if (pathname === "/ia/raio-x" && request.method === "POST") {
      const iaCors = getCorsHeaders(requestOrigin);

      let parsed: { lot?: ReceitaLeilaoLot; question?: string };
      try {
        parsed = (await request.json()) as { lot?: ReceitaLeilaoLot; question?: string };
      } catch {
        return json({ error: "Corpo invalido: envie JSON com { lot }." }, 400, iaCors);
      }

      if (!parsed.lot || !parsed.lot.id) {
        return json({ error: "Campo 'lot' ausente ou invalido." }, 400, iaCors);
      }

      // Trunca a pergunta para evitar injeção de prompt longa ou abuso de tokens.
      const MAX_QUESTION_LENGTH = 500;
      const question = parsed.question
        ? parsed.question.slice(0, MAX_QUESTION_LENGTH)
        : undefined;

      try {
        const { answer, model } = await analyzeLot(parsed.lot, question, env);
        return json({
          answer,
          model,
          disclaimer:
            "Analise gerada por IA a partir dos dados publicos da Receita. Confirme tudo no edital oficial antes de dar lance.",
        }, 200, iaCors);
      } catch (error) {
        if (error instanceof AiNotConfiguredError) {
          return iaNotConfigured(iaCors);
        }
        console.error("[api] /ia/raio-x failed:", error);
        return json({ error: "Falha ao gerar a analise." }, 502, iaCors);
      }
    }

    // POST /ai/chat  { messages: AiMessage[], context?: string }
    // Chat contextual: roteia 'chat-rapido' (Gemini flash -> Claude).
    if (pathname === "/ai/chat" && request.method === "POST") {
      const iaCors = getCorsHeaders(requestOrigin);

      let parsed: { messages?: unknown; context?: unknown };
      try {
        parsed = (await request.json()) as { messages?: unknown; context?: unknown };
      } catch {
        return json({ error: "Corpo invalido: envie JSON com { messages }." }, 400, iaCors);
      }

      const messages = sanitizeMessages(parsed.messages);
      if (messages.length === 0) {
        return json({ error: "Campo 'messages' ausente ou vazio." }, 400, iaCors);
      }
      const context = capText(typeof parsed.context === "string" ? parsed.context : undefined);

      try {
        const router = createAiRouter(aiEnv(env));
        const result = await router.generate({
          task: "chat-rapido",
          system: FONTEIA_ASSISTANT_SYSTEM_PROMPT,
          context,
          messages,
        });
        return json({ answer: result.text, model: result.model }, 200, iaCors);
      } catch (error) {
        if (error instanceof AiNotConfiguredError) {
          return iaNotConfigured(iaCors);
        }
        console.error("[api] /ai/chat failed:", error);
        return json({ error: "Falha ao responder." }, 502, iaCors);
      }
    }

    // POST /ai/intent  { query: string, context?: string }
    // Omnibox: devolve intencao estruturada {understanding, suggestedRoute, suggestedAction, answer}.
    if (pathname === "/ai/intent" && request.method === "POST") {
      const iaCors = getCorsHeaders(requestOrigin);

      let parsed: { query?: unknown; context?: unknown };
      try {
        parsed = (await request.json()) as { query?: unknown; context?: unknown };
      } catch {
        return json({ error: "Corpo invalido: envie JSON com { query }." }, 400, iaCors);
      }

      const query = capText(typeof parsed.query === "string" ? parsed.query : undefined);
      if (!query) {
        return json({ error: "Campo 'query' ausente ou vazio." }, 400, iaCors);
      }
      const context = capText(typeof parsed.context === "string" ? parsed.context : undefined);

      try {
        const router = createAiRouter(aiEnv(env));
        const intent = await resolveIntent(router, { query, context });
        return json(intent, 200, iaCors);
      } catch (error) {
        if (error instanceof AiNotConfiguredError) {
          return iaNotConfigured(iaCors);
        }
        console.error("[api] /ai/intent failed:", error);
        return json({ error: "Falha ao interpretar." }, 502, iaCors);
      }
    }

    return json({ error: "Rota nao encontrada", path: pathname }, 404);
  },
};

export default handler;
