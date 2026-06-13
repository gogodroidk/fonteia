// Supabase Edge Function: "fonteia" — Raio-X do lote com IA grátis (Gemini Flash).
//
// AUTENTICAÇÃO PRÓPRIA (verify_jwt=false, autorizado pelo dono): exige o header
// `apikey` (chave pública do projeto). Conteúdo PÚBLICO (dados de leilão da Receita +
// resumo por IA), sem segredo e sem escrita. O verify_jwt do gateway rejeitava o token
// de sessão (401) e quebrava o Raio-X — por isso a auth é feita aqui dentro.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   GEMINI_API_KEY   obrigatório p/ ligar o Raio-X (aistudio.google.com → "Get API key")
//   GEMINI_MODEL     opcional; default tenta uma lista de modelos Flash atuais

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

// Modelos Flash tentados em ordem (o primeiro que responder vence). Robusto contra
// renomeação de modelo pelo Google. Sobrescreva com o secret GEMINI_MODEL.
const DEFAULT_MODELS = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.0-flash"];

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
  error?: { message?: string; status?: string };
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

async function callGemini(model: string, apiKey: string, userText: string): Promise<Response> {
  return await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: FONTEIA_SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: userText }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 1500 },
    }),
  });
}

async function analyzeLotWithGemini(
  lot: ReceitaLeilaoLot,
  question: string | undefined,
): Promise<{ answer: string; model: string } | { notConfigured: true }> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return { notConfigured: true };

  const configured = (Deno.env.get("GEMINI_MODEL") ?? "").trim();
  const models = configured ? [configured] : DEFAULT_MODELS;
  const userContent = question
    ? `Dados do lote:\n${lotFactsForPrompt(lot)}\n\nPergunta do usuário: ${question}`
    : `Faça o Raio-X deste lote:\n${lotFactsForPrompt(lot)}`;

  let lastError = "nenhum modelo respondeu";
  for (const model of models) {
    try {
      const response = await callGemini(model, apiKey, userContent);
      const data = (await response.json()) as GeminiResponse;
      if (response.ok && !data.promptFeedback?.blockReason) {
        const answer = (data.candidates?.[0]?.content?.parts ?? [])
          .map((p) => p.text)
          .filter((t): t is string => typeof t === "string")
          .join("\n")
          .trim();
        if (answer) return { answer, model };
        lastError = `${model}: resposta vazia`;
      } else {
        lastError = `${model}: ${response.status} ${data.error?.message ?? data.promptFeedback?.blockReason ?? ""}`;
      }
    } catch (e) {
      lastError = `${model}: ${String(e)}`;
    }
    console.error("[fonteia] gemini falhou:", lastError);
  }
  throw new Error(lastError);
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // Auth própria: exige a chave pública do projeto no header `apikey`.
  const apikey = request.headers.get("apikey") ?? "";
  if (apikey.trim() === "") {
    return json({ error: "apikey ausente" }, 401);
  }

  const { pathname } = new URL(request.url);

  // Raio-X: aceita POST em /ia/raio-x e na raiz (/fonteia, p/ supabase.functions.invoke).
  if (request.method === "POST" && (pathname.endsWith("/ia/raio-x") || pathname.endsWith("/fonteia"))) {
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
