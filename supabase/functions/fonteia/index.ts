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

const SLE = "https://www25.receita.fazenda.gov.br/sle-sociedade";
const UA = "FonteiaBot/1.0 (+mailto:contato@fontebrasil.online)";
// Chave pública do projeto (vai no bundle do front — pública por design). Usada
// como apikey ao consultar my_plan em nome do usuário (gating no servidor).
const PUBLISHABLE_KEY = "sb_publishable_uojihld8t92MQXo7gXrR3w_WPVn4RkZ";

// Gating no servidor: confere o plano do usuário (via token de sessão) chamando a
// RPC my_plan. Só libera recursos pagos quando plan = pro/corporativo (ou teste por cupom).
async function isProUser(request: Request): Promise<boolean> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || token === PUBLISHABLE_KEY) return false; // sem token de usuário
  try {
    const base = Deno.env.get("SUPABASE_URL");
    if (!base) return false;
    const res = await fetch(`${base}/rest/v1/rpc/my_plan`, {
      method: "POST",
      headers: {
        apikey: PUBLISHABLE_KEY,
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: "{}",
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { plan?: string };
    return data.plan === "pro" || data.plan === "corporativo";
  } catch {
    return false;
  }
}

const EDITAL_SYSTEM_PROMPT = [
  "Você é o assistente da Fonte.ia. Recebe o PDF de um edital de leilão da Receita Federal e o explica para um comprador leigo, em português claro.",
  "Regras: use SÓ o que está no PDF; nunca invente; se algo não estiver no edital, escreva 'não consta no edital'. Não dê parecer jurídico definitivo.",
  "Formato (markdown curto): **Resumo** (2-3 linhas) · **Quem pode participar** · **Datas e prazos** (visitação, propostas, pagamento, retirada) · **Como pagar** · **Riscos e pontos de atenção** · **O que conferir antes de dar lance**.",
].join("\n");

const CHAT_SYSTEM_PROMPT = [
  "Você é o assistente geral da Fonte.ia, plataforma brasileira de inteligência de dados públicos (foco atual: leilões da Receita Federal e licitações).",
  "Responda em português do Brasil, claro e direto, sem jargão e SEM inventar fatos.",
  "",
  "Regras invioláveis:",
  "- Nunca invente número, valor, prazo, lei ou característica de lote/edital. Se não souber, diga que precisa ser verificado na fonte oficial ou no edital.",
  "- Não dê parecer jurídico, contábil, fiscal ou financeiro definitivo. Aponte riscos e o que conferir.",
  "- Não prometa lucro nem garanta resultado. Não automatize lances nem login gov.br/e-CAC.",
  "- Use o contexto da tela atual, quando fornecido, para responder melhor — mas não suponha dados que ele não traga.",
  "- Seja conciso (em geral até ~180 palavras). Use markdown leve só quando ajudar.",
].join("\n");

const INTENT_SYSTEM_PROMPT = [
  "Você é o roteador de intenções da Fonte.ia. O usuário digita uma frase no campo de busca inteligente e você decide para onde levá-lo e o que responder.",
  "Responda APENAS com um objeto JSON válido (sem markdown, sem cercas de código, sem texto fora do JSON), com exatamente estas chaves:",
  '{ "understanding": string, "suggestedRoute": string|null, "suggestedAction": string|null, "answer": string }',
  "",
  "Rotas válidas do app (escolha no máximo uma, ou null se nenhuma servir):",
  "- /app/lotes — lista de lotes de leilão da Receita Federal",
  "- /app/licitacoes — licitações públicas",
  "- /app/alertas — alertas e avisos salvos pelo usuário",
  "- /app/buscar — busca/pergunta livre sobre os dados",
  "- /app/relatorios — relatórios e exportações",
  "- /app/conta — conta, perfil e plano do usuário",
  "",
  "Diretrizes:",
  "- 'understanding': uma frase curta (pt-BR) do que o usuário quer.",
  "- 'suggestedRoute': a rota mais adequada da lista acima, ou null.",
  "- 'suggestedAction': rótulo curto do botão (ex.: 'Ver lotes', 'Abrir licitações'), ou null se não houver rota.",
  "- 'answer': resposta curta e útil em pt-BR (1-3 frases), sem inventar dados.",
  "- Nunca invente fatos. Se o usuário pedir um dado específico, oriente onde encontrá-lo no app.",
].join("\n");

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
  return await callGeminiRaw(model, apiKey, FONTEIA_SYSTEM_PROMPT, [
    { role: "user", parts: [{ text: userText }] },
  ], { temperature: 0.3, maxOutputTokens: 4096 });
}

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

// Chamada genérica ao Gemini: aceita system prompt, histórico (contents) e config.
// É a primitiva reaproveitada pelo Raio-X (callGemini), pelo /ai/chat e pelo /ai/intent.
async function callGeminiRaw(
  model: string,
  apiKey: string,
  systemPrompt: string,
  contents: GeminiContent[],
  generationConfig: Record<string, unknown>,
): Promise<Response> {
  return await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig,
    }),
  });
}

// Percorre a lista de modelos (DEFAULT_MODELS ou GEMINI_MODEL) e devolve o primeiro
// texto não vazio. Mesma lógica de fallback do Raio-X, isolada para o chat/intent.
async function generateWithGemini(
  apiKey: string,
  systemPrompt: string,
  contents: GeminiContent[],
  generationConfig: Record<string, unknown>,
): Promise<{ answer: string; model: string }> {
  const configured = (Deno.env.get("GEMINI_MODEL") ?? "").trim();
  const models = configured ? [configured] : DEFAULT_MODELS;
  let lastError = "nenhum modelo respondeu";
  for (const model of models) {
    try {
      const response = await callGeminiRaw(model, apiKey, systemPrompt, contents, generationConfig);
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

async function fetchEditalBase64(edle: string): Promise<string | null> {
  const parts = edle.split(/[/-]/).filter((p) => p.length > 0);
  if (parts.length < 3) return null;
  const [u, n, e] = parts;
  if (!u || !n || !e) return null;
  const url = `${SLE}/api/edital/${u.padStart(7, "0")}/${n.padStart(6, "0")}/${e}/edital-completo`;
  const res = await fetch(url, { headers: { accept: "application/json", "user-agent": UA } });
  if (!res.ok) return null;
  const data = (await res.json()) as { data?: string };
  return typeof data.data === "string" ? data.data : null;
}

async function analyzeEditalWithGemini(
  edle: string,
  question: string | undefined,
): Promise<{ answer: string; model: string } | { notConfigured: true } | { noPdf: true }> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return { notConfigured: true };
  const b64 = await fetchEditalBase64(edle);
  if (!b64) return { noPdf: true };

  const configured = (Deno.env.get("GEMINI_MODEL") ?? "").trim();
  const models = configured ? [configured] : DEFAULT_MODELS;
  const userText = question
    ? `Pergunta do usuário sobre este edital: ${question}`
    : "Analise este edital de leilão e gere o resumo no formato pedido.";

  let lastError = "nenhum modelo respondeu";
  for (const model of models) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: EDITAL_SYSTEM_PROMPT }] },
            contents: [
              {
                role: "user",
                parts: [
                  { inlineData: { mimeType: "application/pdf", data: b64 } },
                  { text: userText },
                ],
              },
            ],
            generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
          }),
        },
      );
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
    console.error("[fonteia] edital gemini falhou:", lastError);
  }
  throw new Error(lastError);
}

/* ─── Assistente geral (/ai/chat) e roteador de intenção (/ai/intent) ───────── */

interface ChatMessage {
  role?: string;
  content?: string;
}

const CHAT_INPUT_CAP = 4000; // limite total de caracteres do input (proteção de custo/abuso)

// Converte o histórico do front (role: user|assistant) para o formato Gemini
// (role: user|model), descartando mensagens vazias/inválidas.
function toGeminiContents(messages: ChatMessage[]): GeminiContent[] {
  const out: GeminiContent[] = [];
  for (const m of messages) {
    const content = typeof m?.content === "string" ? m.content.trim() : "";
    if (!content) continue;
    out.push({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: content }] });
  }
  // Gemini exige que o histórico comece com role "user"; descarta turnos "model"
  // iniciais (caso raro de histórico malformado vindo do cliente).
  while (out.length > 0 && out[0]!.role === "model") out.shift();
  return out;
}

// Soma o tamanho do input e, se passar do cap, descarta as mensagens mais antigas
// (mantém o fim da conversa, que é o mais relevante). Garante pelo menos 1 turno.
function capContents(contents: GeminiContent[], cap: number): GeminiContent[] {
  const sized = contents.map((c) => ({
    c,
    len: c.parts.reduce((n, p) => n + (p.text?.length ?? 0), 0),
  }));
  let total = sized.reduce((n, s) => n + s.len, 0);
  let start = 0;
  while (total > cap && start < sized.length - 1) {
    total -= sized[start]!.len;
    start += 1;
  }
  const kept = contents.slice(start);
  // Trava final: se ainda passar (uma única mensagem gigante), trunca o texto.
  const last = kept[kept.length - 1];
  if (last && last.parts[0]?.text && last.parts[0].text.length > cap) {
    last.parts[0].text = last.parts[0].text.slice(0, cap);
  }
  return kept;
}

// Parser de JSON tolerante: aceita JSON puro, cercado por ```json ... ``` ou com
// texto ao redor (pega do primeiro { ao último }). Nunca lança — devolve null.
function parseLooseJson(raw: string): Record<string, unknown> | null {
  const tryParse = (s: string): Record<string, unknown> | null => {
    try {
      const v = JSON.parse(s);
      return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };
  const direct = tryParse(raw.trim());
  if (direct) return direct;
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) {
    const fenced = tryParse(fence[1].trim());
    if (fenced) return fenced;
  }
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first !== -1 && last > first) {
    const sliced = tryParse(raw.slice(first, last + 1));
    if (sliced) return sliced;
  }
  return null;
}

function asStringOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
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

  // Assistente geral: chat contextual (ContextChat / useAIChat → /ai/chat).
  if (request.method === "POST" && pathname.endsWith("/ai/chat")) {
    let parsed: { messages?: ChatMessage[]; context?: string };
    try {
      parsed = (await request.json()) as { messages?: ChatMessage[]; context?: string };
    } catch {
      return json({ error: "Corpo invalido: envie JSON com { messages }." }, 400);
    }
    if (!Array.isArray(parsed.messages) || parsed.messages.length === 0) {
      return json({ error: "Campo 'messages' ausente ou vazio." }, 400);
    }
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return json(
        {
          error: "ia_nao_configurada",
          message: "O assistente de IA ainda nao foi ativado. Configure o secret GEMINI_API_KEY.",
        },
        503,
      );
    }

    let contents = toGeminiContents(parsed.messages);
    if (contents.length === 0) {
      return json({ error: "Nenhuma mensagem valida em 'messages'." }, 400);
    }
    // Contexto da tela vira a primeira mensagem (role user), antes do histórico.
    const ctx = asStringOrNull(parsed.context);
    if (ctx) {
      contents.unshift({
        role: "user",
        parts: [{ text: `Contexto da tela atual: ${ctx}` }],
      });
    }
    contents = capContents(contents, CHAT_INPUT_CAP);

    try {
      const result = await generateWithGemini(apiKey, CHAT_SYSTEM_PROMPT, contents, {
        temperature: 0.4,
        maxOutputTokens: 1024,
      });
      return json({ answer: result.answer, model: result.model });
    } catch (error) {
      return json({ error: "Falha ao responder.", detail: String(error) }, 502);
    }
  }

  // Roteador de intenção do omnibox (IntelligenceOmnibox / useAIIntent → /ai/intent).
  if (request.method === "POST" && pathname.endsWith("/ai/intent")) {
    let parsed: { query?: string; context?: string };
    try {
      parsed = (await request.json()) as { query?: string; context?: string };
    } catch {
      return json({ error: "Corpo invalido: envie JSON com { query }." }, 400);
    }
    const query = asStringOrNull(parsed.query);
    if (!query) return json({ error: "Campo 'query' ausente." }, 400);

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return json(
        {
          error: "ia_nao_configurada",
          message: "O assistente de IA ainda nao foi ativado. Configure o secret GEMINI_API_KEY.",
        },
        503,
      );
    }

    const ctx = asStringOrNull(parsed.context);
    const userText = [
      ctx ? `Contexto da tela atual: ${ctx}` : null,
      `Frase do usuário: ${query}`.slice(0, CHAT_INPUT_CAP),
    ]
      .filter((t): t is string => t !== null)
      .join("\n\n");

    try {
      const result = await generateWithGemini(
        apiKey,
        INTENT_SYSTEM_PROMPT,
        [{ role: "user", parts: [{ text: userText }] }],
        { temperature: 0.2, maxOutputTokens: 512, responseMimeType: "application/json" },
      );
      const obj = parseLooseJson(result.answer);
      // Fallback que nunca quebra: se o JSON vier inválido, devolve a resposta crua.
      const understanding = asStringOrNull(obj?.["understanding"]) ?? `Você pediu: ${query}`;
      const answer = asStringOrNull(obj?.["answer"]) ?? (result.answer.trim() || "Não consegui interpretar agora.");
      return json({
        understanding,
        suggestedRoute: asStringOrNull(obj?.["suggestedRoute"]),
        suggestedAction: asStringOrNull(obj?.["suggestedAction"]),
        answer,
        model: result.model,
      });
    } catch (error) {
      return json({ error: "Falha ao interpretar.", detail: String(error) }, 502);
    }
  }

  // Análise do EDITAL por IA: Gemini lê o PDF inteiro do SLE.
  if (request.method === "POST" && pathname.endsWith("/ia/edital")) {
    let parsed: { edle?: string; question?: string };
    try {
      parsed = (await request.json()) as { edle?: string; question?: string };
    } catch {
      return json({ error: "Corpo invalido: envie JSON com { edle }." }, 400);
    }
    if (!parsed.edle) return json({ error: "Campo 'edle' ausente." }, 400);
    // Gating no servidor: a análise de edital é recurso PAGO (Profissional).
    if (!(await isProUser(request))) {
      return json(
        {
          error: "plano_requerido",
          message: "A analise do edital por IA e do plano Profissional. Assine ou use o cupom de teste.",
        },
        403,
      );
    }
    try {
      const result = await analyzeEditalWithGemini(parsed.edle, parsed.question);
      if ("notConfigured" in result) {
        return json({ error: "ia_nao_configurada", message: "Configure o secret GEMINI_API_KEY." }, 503);
      }
      if ("noPdf" in result) {
        return json({ error: "edital_sem_pdf", message: "Este edital nao tem PDF publicado no SLE." }, 404);
      }
      return json({
        answer: result.answer,
        model: result.model,
        disclaimer: "Analise do edital por IA. Confirme tudo no edital oficial antes de dar lance.",
      });
    } catch (error) {
      return json({ error: "Falha ao analisar o edital.", detail: String(error) }, 502);
    }
  }

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
