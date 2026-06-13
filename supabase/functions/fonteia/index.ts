// Supabase Edge Function: "fonteia"
// Backend de IA (somente leitura) do app Fonte.ia — o Raio-X do lote.
//
// Roda num modelo de IA GRÁTIS (Google Gemini Flash) — sem custo no começo.
// Sem a chave configurada, responde 503 honesto (NUNCA resposta falsa). Quando
// houver crédito, troca-se por Claude mudando 1 variável.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   GEMINI_API_KEY   obrigatório p/ ligar o Raio-X (crie em aistudio.google.com → "Get API key")
//   GEMINI_MODEL     opcional; default "gemini-2.5-flash"
//
// Rotas (sufixo após /functions/v1/fonteia):
//   GET  /health      -> status do serviço
//   POST /ia/raio-x   -> análise do lote por IA  { lot, question? }
//
// verify_jwt = true: a página de detalhe é logada; o app envia o token da sessão.

interface ReceitaLeilaoLot {
  id: string;
  sourceId: string;
  edital: string;
  edle: string;
  lotNumber: string;
  displayNumber: string;
  city: string;
  agency: string;
  minimumBidCents: number;
  proposalDeadline: string;
  eligiblePersonTypes: Array<"pf" | "pj">;
  sourceUrl: string;
  collectedAt: string;
}

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

const DEFAULT_MODEL = "gemini-2.5-flash";

const FONTEIA_SYSTEM_PROMPT = [
  "Você é o assistente da Fonte.ia, especialista em leilões da Receita Federal do Brasil.",
  "Explique para um comprador leigo, em português claro e direto, SEM jargão.",
  "",
  "Regras invioláveis:",
  "- Use APENAS os dados do lote fornecidos. NUNCA invente fato, valor, prazo ou característica.",
  "- Se um dado não foi fornecido, diga que precisa ser verificado no edital oficial.",
  "- Não dê aconselhamento jurídico, contábil, fiscal ou financeiro definitivo.",
  "- Não prometa lucro nem garanta resultado. Aponte riscos e o que conferir.",
  "- Não finja ser órgão público nem automatize lances ou login gov.br/e-CAC.",
  "",
  "Formato (markdown curto, no máximo ~250 palavras):",
  "**O que é** — uma frase sobre o lote.",
  "**Quem pode dar lance** — pessoa física e/ou jurídica, conforme o dado.",
  "**Prazo** — data limite da proposta e a urgência.",
  "**Valor de partida** — o lance mínimo informado, em reais.",
  "**Pontos de atenção** — riscos reais e o que SEMPRE conferir no edital antes de dar lance.",
].join("\n");

interface GeminiPart {
  text?: string;
}
interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
}

function lotFactsForPrompt(lot: ReceitaLeilaoLot): string {
  const reais = (lot.minimumBidCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const quem = lot.eligiblePersonTypes.includes("pf")
    ? "Pessoa física e pessoa jurídica"
    : "Apenas pessoa jurídica";
  return [
    `Lote: ${lot.lotNumber} (número de exibição ${lot.displayNumber})`,
    `Cidade: ${lot.city}`,
    `Órgão: ${lot.agency}`,
    `Edital: ${lot.edital} (EDLE ${lot.edle})`,
    `Lance mínimo: ${reais}`,
    `Quem pode dar lance: ${quem}`,
    `Prazo final da proposta: ${lot.proposalDeadline}`,
    `Fonte oficial: ${lot.sourceUrl}`,
    `Coletado em: ${lot.collectedAt}`,
  ].join("\n");
}

async function analyzeLotWithGemini(
  lot: ReceitaLeilaoLot,
  question: string | undefined,
): Promise<{ answer: string; model: string } | { notConfigured: true }> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return { notConfigured: true };

  const model = (Deno.env.get("GEMINI_MODEL") ?? "").trim() || DEFAULT_MODEL;
  const userContent = question
    ? `Dados do lote:\n${lotFactsForPrompt(lot)}\n\nPergunta do usuário: ${question}`
    : `Faça o Raio-X deste lote:\n${lotFactsForPrompt(lot)}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: FONTEIA_SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: userContent }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1500 },
      }),
    },
  );

  const data = (await response.json()) as GeminiResponse;
  if (!response.ok) {
    throw new Error(`Gemini respondeu ${response.status}: ${data.error?.message ?? "erro desconhecido"}`);
  }
  if (data.promptFeedback?.blockReason) {
    throw new Error(`Gemini bloqueou a resposta (${data.promptFeedback.blockReason}).`);
  }

  const answer = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text)
    .filter((t): t is string => typeof t === "string")
    .join("\n")
    .trim();

  if (!answer) throw new Error("A IA não retornou texto utilizável.");
  return { answer, model };
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const { pathname } = new URL(request.url);

  if (pathname.endsWith("/ia/raio-x") && request.method === "POST") {
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
      const result = await analyzeLotWithGemini(parsed.lot, parsed.question);
      if ("notConfigured" in result) {
        return json(
          {
            error: "ia_nao_configurada",
            message: "O assistente de IA ainda nao foi ativado. Configure o secret GEMINI_API_KEY.",
          },
          503,
        );
      }
      return json({
        answer: result.answer,
        model: result.model,
        disclaimer:
          "Análise gerada por IA a partir dos dados públicos da Receita. Confirme tudo no edital oficial antes de dar lance.",
      });
    } catch (error) {
      return json({ error: "Falha ao gerar a analise.", detail: String(error) }, 502);
    }
  }

  if (pathname.endsWith("/health") || pathname.endsWith("/fonteia") || pathname === "/") {
    return json({
      service: "fonteia",
      status: "ok",
      iaProvider: "gemini",
      iaEnabled: Boolean(Deno.env.get("GEMINI_API_KEY")),
      time: new Date().toISOString(),
    });
  }

  return json({ error: "Rota nao encontrada", path: pathname }, 404);
});
