/**
 * Motor de INTENÇÃO do omnibox.
 *
 * Recebe a frase do usuário, chama o roteador (tarefa 'intent' → Gemini flash
 * por padrão) e devolve uma intenção ESTRUTURADA que a UI consome direto:
 *   { understanding, suggestedRoute?, suggestedAction?, answer }
 *
 * A LLM é instruída a responder só JSON (ver FONTEIA_INTENT_SYSTEM_PROMPT), mas
 * modelos às vezes embrulham em cercas de código — por isso o parser é tolerante
 * e há fallback para nunca quebrar a experiência.
 */

import { FONTEIA_INTENT_SYSTEM_PROMPT } from "./prompts";
import type { AiRouter } from "./router";

/** Rotas internas que o omnibox pode sugerir (alinhado ao prompt de intenção). */
export type FonteiaKnownRoute =
  | "/"
  | "/leiloes"
  | "/licitacoes"
  | "/empresas"
  | "/ferramentas/calculadora-lance";

export interface FonteiaIntent {
  /** O que o sistema entendeu que o usuário quer (1 frase). */
  understanding: string;
  /** Rota interna sugerida (ou null se nenhuma se aplica). */
  suggestedRoute: string | null;
  /** Rótulo curto de ação sugerida (ou null). */
  suggestedAction: string | null;
  /** Resposta útil e direta (1-3 frases). */
  answer: string;
  /** Qual modelo respondeu (para debug/telemetria). */
  model: string;
}

export interface ResolveIntentInput {
  query: string;
  /** Contexto da tela atual (rota, entidade, etc.) — vira bloco no prompt. */
  context?: string | undefined;
}

/**
 * Extrai o primeiro objeto JSON de um texto, mesmo se vier embrulhado em
 * ```json ... ``` ou com texto ao redor. Retorna null se não achar JSON válido.
 */
function extractJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();

  // Tenta direto.
  const direct = tryParse(trimmed);
  if (direct) return direct;

  // Remove cercas de código ```json ... ``` ou ``` ... ```.
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch && fenceMatch[1]) {
    const fenced = tryParse(fenceMatch[1].trim());
    if (fenced) return fenced;
  }

  // Último recurso: pega do primeiro "{" ao último "}".
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    const slice = trimmed.slice(start, end + 1);
    const sliced = tryParse(slice);
    if (sliced) return sliced;
  }

  return null;
}

function tryParse(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function asStringOrNull(value: unknown): string | null {
  if (typeof value === "string") {
    const t = value.trim();
    return t.length > 0 && t.toLowerCase() !== "null" ? t : null;
  }
  return null;
}

/**
 * Resolve a intenção da query via roteador. Sempre retorna uma intenção válida:
 * se a LLM não devolver JSON parseável, usa o texto cru como `answer`.
 */
export async function resolveIntent(router: AiRouter, input: ResolveIntentInput): Promise<FonteiaIntent> {
  const result = await router.generate({
    task: "intent",
    system: FONTEIA_INTENT_SYSTEM_PROMPT,
    context: input.context,
    messages: [{ role: "user", content: input.query }],
  });

  const parsed = extractJsonObject(result.text);

  if (parsed) {
    const understanding = asStringOrNull(parsed.understanding);
    const answer = asStringOrNull(parsed.answer);
    return {
      understanding: understanding ?? "Entendi seu pedido.",
      suggestedRoute: asStringOrNull(parsed.suggestedRoute),
      suggestedAction: asStringOrNull(parsed.suggestedAction),
      answer: answer ?? result.text.trim(),
      model: result.model,
    };
  }

  // Fallback: sem JSON, mas ainda entregamos algo útil (degradação elegante).
  return {
    understanding: "Entendi seu pedido.",
    suggestedRoute: null,
    suggestedAction: null,
    answer: result.text.trim(),
    model: result.model,
  };
}
