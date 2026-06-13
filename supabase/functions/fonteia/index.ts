// Supabase Edge Function: "fonteia"
// Backend publico (somente leitura) do app Fonte.ia, rodando no Supabase —
// onde a chave da Anthropic ja esta guardada (Edge Function Secrets).
//
// Rotas (sufixo apos /functions/v1/fonteia):
//   GET  /health                 -> status do servico
//   GET  /leiloes/lotes          -> lotes ao vivo da Receita Federal (cache 15 min)
//   GET  /leiloes/lotes/:id      -> um lote especifico
//   POST /ia/raio-x              -> analise do lote por IA (Claude)
//
// Lotes: endpoint publico oficial da Receita (sem segredo).
// IA: usa o secret ANTHROPIC_API_KEY. Sem ele, responde 503 honesto (nunca resposta falsa).
// Modelo padrao: claude-opus-4-8 (troque com o secret ANTHROPIC_MODEL, ex.: claude-haiku-4-5).
//
// Deploy: cole este arquivo no editor de Edge Functions do Supabase (funcao "fonteia"),
// desligue "Verify JWT" e clique em Deploy. A chave ja esta nos secrets.

// ---------------------------------------------------------------------------
// Conector da Receita (inline — funcao autocontida, so Web APIs)
// ---------------------------------------------------------------------------

const RECEITA_LEILOES_DESTAQUES_URL =
  "https://www25.receita.fazenda.gov.br/sle-sociedade/api/portal/destaques";

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 min

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
  const [year, month, day] = (datePart ?? "").split("-");
  if (!year || !month || !day) return value;
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
  if (raw.imagemDestaque) lot.imageUrl = raw.imagemDestaque;
  return lot;
}

function normalizeReceitaDestaquesPayload(payload: ReceitaLeiloesDestaquesPayload): ReceitaLeilaoLot[] {
  const collectedAt = parseReceitaDate(payload.agora);
  return (payload.destaques ?? []).map((raw) => normalizeReceitaDestaque(raw, collectedAt));
}

// Cache em memoria do isolate (reduz chamadas a Receita entre requisicoes).
let receitaCache: { at: number; payload: ReceitaLeiloesDestaquesPayload } | null = null;

async function getDestaques(): Promise<{ payload: ReceitaLeiloesDestaquesPayload; fromCache: boolean }> {
  if (receitaCache && Date.now() - receitaCache.at < CACHE_TTL_MS) {
    return { payload: receitaCache.payload, fromCache: true };
  }
  const response = await fetch(RECEITA_LEILOES_DESTAQUES_URL, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Receita respondeu ${response.status}`);
  const payload = (await response.json()) as ReceitaLeiloesDestaquesPayload;
  receitaCache = { at: Date.now(), payload };
  return { payload, fromCache: false };
}

// ---------------------------------------------------------------------------
// CORS + resposta JSON
// ---------------------------------------------------------------------------

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, apikey, x-client-info",
  "access-control-max-age": "86400",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS_HEADERS },
  });
}

// ---------------------------------------------------------------------------
// IA — analise de um lote com Claude (Anthropic Messages API)
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = "claude-opus-4-8";

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

interface AnthropicContentBlock {
  type: string;
  text?: string;
}

function modelSupportsAdaptiveThinking(model: string): boolean {
  return (
    model.startsWith("claude-opus-4-7") ||
    model.startsWith("claude-opus-4-8") ||
    model.startsWith("claude-sonnet-4-6") ||
    model.startsWith("claude-fable-5")
  );
}

function lotFactsForPrompt(lot: ReceitaLeilaoLot): string {
  const reais = (lot.minimumBidCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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

async function analyzeLotWithClaude(
  lot: ReceitaLeilaoLot,
  question: string | undefined,
): Promise<{ answer: string; model: string } | { notConfigured: true }> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return { notConfigured: true };

  const model = (Deno.env.get("ANTHROPIC_MODEL") ?? "").trim() || DEFAULT_MODEL;
  const userContent = question
    ? `Dados do lote:\n${lotFactsForPrompt(lot)}\n\nPergunta do usuario: ${question}`
    : `Faca o Raio-X deste lote:\n${lotFactsForPrompt(lot)}`;

  const body: Record<string, unknown> = {
    model,
    max_tokens: 1500,
    system: FONTEIA_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  };
  if (modelSupportsAdaptiveThinking(model)) body.thinking = { type: "adaptive" };

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as { content?: AnthropicContentBlock[]; error?: { message?: string } };
  if (!response.ok) {
    throw new Error(`Anthropic respondeu ${response.status}: ${data.error?.message ?? "erro desconhecido"}`);
  }

  const answer = (data.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("\n")
    .trim();

  if (!answer) throw new Error("A IA nao retornou texto utilizavel.");
  return { answer, model };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

function routePath(url: URL): string {
  // Remove o prefixo da plataforma e o nome da funcao, deixando o sufixo.
  let path = url.pathname
    .replace(/^\/functions\/v1\/fonteia/, "")
    .replace(/^\/fonteia/, "");
  if (path === "") path = "/";
  return path;
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const path = routePath(url);

  if (path === "/" || path === "/health") {
    return json({
      service: "fonteia",
      status: "ok",
      iaEnabled: Boolean(Deno.env.get("ANTHROPIC_API_KEY")),
      time: new Date().toISOString(),
    });
  }

  if (path === "/leiloes/lotes" && request.method === "GET") {
    try {
      const { payload, fromCache } = await getDestaques();
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
      return json({ error: "Nao foi possivel consultar a Receita agora.", detail: String(error) }, 502);
    }
  }

  const lotMatch = path.match(/^\/leiloes\/lotes\/([^/]+)$/);
  if (lotMatch && request.method === "GET") {
    const lotId = decodeURIComponent(lotMatch[1] ?? "");
    try {
      const { payload } = await getDestaques();
      const lot = normalizeReceitaDestaquesPayload(payload).find((item) => item.id === lotId);
      if (!lot) return json({ error: "Lote nao encontrado", path }, 404);
      return json(lot);
    } catch (error) {
      return json({ error: "Nao foi possivel consultar a Receita agora.", detail: String(error) }, 502);
    }
  }

  if (path === "/ia/raio-x" && request.method === "POST") {
    let parsed: { lot?: ReceitaLeilaoLot; question?: string };
    try {
      parsed = (await request.json()) as { lot?: ReceitaLeilaoLot; question?: string };
    } catch {
      return json({ error: "Corpo invalido: envie JSON com { lot }." }, 400);
    }
    if (!parsed.lot || !parsed.lot.id) {
      return json({ error: "Campo 'lot' ausente ou invalido." }, 400);
    }
    try {
      const result = await analyzeLotWithClaude(parsed.lot, parsed.question);
      if ("notConfigured" in result) {
        return json(
          {
            error: "ia_nao_configurada",
            message: "O assistente de IA ainda nao foi ativado. Configure o secret ANTHROPIC_API_KEY.",
          },
          503,
        );
      }
      return json({
        answer: result.answer,
        model: result.model,
        disclaimer:
          "Analise gerada por IA a partir dos dados publicos da Receita. Confirme tudo no edital oficial antes de dar lance.",
      });
    } catch (error) {
      return json({ error: "Falha ao gerar a analise.", detail: String(error) }, 502);
    }
  }

  return json({ error: "Rota nao encontrada", path }, 404);
});
