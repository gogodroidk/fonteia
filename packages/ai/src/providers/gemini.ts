/**
 * Provedor Gemini (Google) — padrão GRATUITO da Fonte.ia.
 *
 * Fala a REST oficial do Google direto via `fetch` (SEM SDK, sem dependência):
 *   POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
 *   header: x-goog-api-key: <GEMINI_API_KEY>
 *
 * Modelos:
 *   - gemini-2.5-flash  (rápido/barato — default, p/ intent e chat)
 *   - gemini-2.5-pro    (pro — p/ tarefas pesadas; configurável via GEMINI_MODEL_PRO)
 *
 * Erros e timeout são encapsulados em AiProviderError para o roteador tratar.
 */

import type { AiEnv, AiGenerateRequest, AiGenerateResult, AiMessage, AiProvider } from "../types";
import { AiProviderError } from "../types";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/** Modelo rápido padrão (barato). Sobrescreva com GEMINI_MODEL. */
export const GEMINI_FLASH_DEFAULT = "gemini-2.5-flash";
/** Modelo "pro" para tarefas pesadas. Sobrescreva com GEMINI_MODEL_PRO. */
export const GEMINI_PRO_DEFAULT = "gemini-2.5-pro";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_TOKENS = 1500;

// ---- Tipos do formato nativo do Gemini (apenas o que usamos) ----

interface GeminiPart {
  text?: string;
}

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

interface GeminiCandidate {
  content?: { parts?: GeminiPart[] };
  finishReason?: string;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  error?: { message?: string; status?: string };
  promptFeedback?: { blockReason?: string };
}

/** Converte nossas mensagens neutras para o formato `contents` do Gemini. */
function toGeminiContents(messages: AiMessage[]): GeminiContent[] {
  return messages.map((message) => ({
    // Gemini usa "model" no lugar de "assistant".
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }],
  }));
}

/** Monta o bloco de instrução de sistema (persona + contexto da tela). */
function buildSystemInstruction(request: AiGenerateRequest): { parts: GeminiPart[] } | undefined {
  const blocks: string[] = [];
  if (request.system && request.system.trim()) {
    blocks.push(request.system.trim());
  }
  if (request.context && request.context.trim()) {
    blocks.push(`Contexto da tela atual:\n${request.context.trim()}`);
  }
  if (blocks.length === 0) {
    return undefined;
  }
  return { parts: [{ text: blocks.join("\n\n") }] };
}

export class GeminiProvider implements AiProvider {
  readonly name = "gemini" as const;

  constructor(private readonly env: AiEnv) {}

  isConfigured(): boolean {
    return Boolean(this.env.GEMINI_API_KEY && this.env.GEMINI_API_KEY.trim());
  }

  async generate(request: AiGenerateRequest, model: string): Promise<AiGenerateResult> {
    const apiKey = this.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      // Não deveria acontecer (o roteador checa isConfigured antes), mas é defensivo.
      throw new AiProviderError("gemini", "GEMINI_API_KEY ausente.");
    }

    const body: Record<string, unknown> = {
      contents: toGeminiContents(request.messages),
      generationConfig: {
        maxOutputTokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
      },
    };

    const systemInstruction = buildSystemInstruction(request);
    if (systemInstruction) {
      body.systemInstruction = systemInstruction;
    }

    const url = `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`;
    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new AiProviderError("gemini", `Timeout apos ${timeoutMs}ms.`);
      }
      throw new AiProviderError("gemini", `Falha de rede: ${(error as Error).message}`);
    } finally {
      clearTimeout(timer);
    }

    let data: GeminiResponse;
    try {
      data = (await response.json()) as GeminiResponse;
    } catch {
      throw new AiProviderError("gemini", `Resposta nao-JSON (status ${response.status}).`, response.status);
    }

    if (!response.ok) {
      const msg = data.error?.message ?? "erro desconhecido";
      throw new AiProviderError("gemini", `Gemini respondeu ${response.status}: ${msg}`, response.status);
    }

    // Resposta pode vir bloqueada por segurança, sem candidato.
    if (data.promptFeedback?.blockReason) {
      throw new AiProviderError("gemini", `Conteudo bloqueado: ${data.promptFeedback.blockReason}`);
    }

    const candidates = data.candidates ?? [];

    // Trata terminações anômalas do candidato (MAX_TOKENS/SAFETY/RECITATION/...).
    // "STOP" é a terminação normal; qualquer outra com texto vazio seria mascarada
    // como "nao retornou texto" — preferimos um erro específico para o roteador.
    const finishReason = candidates[0]?.finishReason;
    if (finishReason === "SAFETY" || finishReason === "RECITATION" || finishReason === "BLOCKLIST" || finishReason === "PROHIBITED_CONTENT") {
      throw new AiProviderError("gemini", `Conteudo bloqueado pelo Gemini (finishReason: ${finishReason}).`, undefined, true);
    }
    if (finishReason === "MAX_TOKENS") {
      throw new AiProviderError("gemini", "Resposta truncada pelo limite de tokens (finishReason: MAX_TOKENS).");
    }

    const text = candidates
      .flatMap((candidate) => candidate.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join("")
      .trim();

    if (!text) {
      // Sem texto e sem finishReason conhecido: inclui o motivo (se houver) p/ diagnóstico.
      const reasonHint = finishReason ? ` (finishReason: ${finishReason})` : "";
      throw new AiProviderError("gemini", `A IA nao retornou texto utilizavel${reasonHint}.`);
    }

    return { text, provider: "gemini", model };
  }

  /** Resolve o modelo "flash" (rápido) considerando override de env. */
  flashModel(): string {
    return (this.env.GEMINI_MODEL && this.env.GEMINI_MODEL.trim()) || GEMINI_FLASH_DEFAULT;
  }

  /** Resolve o modelo "pro" (pesado) considerando override de env. */
  proModel(): string {
    return (this.env.GEMINI_MODEL_PRO && this.env.GEMINI_MODEL_PRO.trim()) || GEMINI_PRO_DEFAULT;
  }
}
