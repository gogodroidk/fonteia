/**
 * Provedor Claude (Anthropic) — FALLBACK e motor das análises profundas.
 *
 * Encapsula a Messages API da Anthropic via `fetch` (SEM SDK — Worker autocontido),
 * reaproveitando exatamente a lógica que o worker.ts já usava no /ia/raio-x:
 *   POST https://api.anthropic.com/v1/messages
 *   headers: x-api-key, anthropic-version: 2023-06-01
 *   thinking adaptativo nos modelos que suportam.
 *
 * Modelo padrão: claude-opus-4-8 (troque via ANTHROPIC_MODEL).
 */

import type { AiEnv, AiGenerateRequest, AiGenerateResult, AiProvider } from "../types";
import { AiProviderError } from "../types";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/** Modelo padrão da Anthropic. Sobrescreva com ANTHROPIC_MODEL. */
export const CLAUDE_DEFAULT_MODEL = "claude-opus-4-8";

const DEFAULT_TIMEOUT_MS = 45_000; // análises profundas podem demorar mais
const DEFAULT_MAX_TOKENS = 1500;

interface AnthropicContentBlock {
  type: string;
  text?: string;
}

interface AnthropicMessageResponse {
  content?: AnthropicContentBlock[];
  stop_reason?: string;
  /** Categoria/explicação da recusa quando stop_reason === "refusal" (informativo). */
  stop_details?: { category?: string | null; explanation?: string } | null;
  error?: { message?: string };
}

/**
 * Modelos que NÃO suportam "thinking adaptativo". Mudamos de allowlist para
 * denylist: por padrão enviamos `thinking: {type: "adaptive"}` e só omitimos
 * para modelos sabidamente sem suporte. Assim modelos novos da família 4.x+
 * (claude-opus-4-9, claude-fable-6, ...) continuam recebendo thinking sem
 * precisar editar esta lista. Modelos antigos (opus-4-0/4-1, sonnet-4-0,
 * opus-3, sonnet-3-x, haiku-*) e variantes "-fast" ficam de fora.
 *
 * Observação: opus-4-5/4-1 e os atuais (opus-4-8, fable-5) recebem thinking;
 * apenas os prefixos abaixo são excluídos.
 */
const ADAPTIVE_THINKING_DENYLIST_PREFIXES: readonly string[] = [
  "claude-opus-4-0",
  "claude-opus-4-1",
  "claude-sonnet-4-0",
  "claude-3", // claude-3-opus, claude-3-5-sonnet, claude-3-haiku, ...
  "claude-2", // claude-2.0, claude-2.1
  "claude-instant",
  "claude-haiku-4-5", // Haiku 4.5 não suporta thinking adaptativo
];

/**
 * Por padrão enviamos thinking adaptativo; só negamos para modelos da denylist.
 * (Inverte a antiga allowlist para não regredir em modelos lançados após este
 * código — claude-opus-4-9 etc.)
 */
function modelSupportsAdaptiveThinking(model: string): boolean {
  return !ADAPTIVE_THINKING_DENYLIST_PREFIXES.some((prefix) => model.startsWith(prefix));
}

export class ClaudeProvider implements AiProvider {
  readonly name = "claude" as const;

  constructor(private readonly env: AiEnv) {}

  isConfigured(): boolean {
    return Boolean(this.env.ANTHROPIC_API_KEY && this.env.ANTHROPIC_API_KEY.trim());
  }

  async generate(request: AiGenerateRequest, model: string): Promise<AiGenerateResult> {
    const apiKey = this.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      throw new AiProviderError("claude", "ANTHROPIC_API_KEY ausente.");
    }

    // Anthropic trata `system` como campo próprio. Juntamos persona + contexto.
    const systemBlocks: string[] = [];
    if (request.system && request.system.trim()) {
      systemBlocks.push(request.system.trim());
    }
    if (request.context && request.context.trim()) {
      systemBlocks.push(`Contexto da tela atual:\n${request.context.trim()}`);
    }

    const body: Record<string, unknown> = {
      model,
      max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
    };
    if (systemBlocks.length > 0) {
      body.system = systemBlocks.join("\n\n");
    }
    if (modelSupportsAdaptiveThinking(model)) {
      body.thinking = { type: "adaptive" };
    }

    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new AiProviderError("claude", `Timeout apos ${timeoutMs}ms.`);
      }
      throw new AiProviderError("claude", `Falha de rede: ${(error as Error).message}`);
    } finally {
      clearTimeout(timer);
    }

    let data: AnthropicMessageResponse;
    try {
      data = (await response.json()) as AnthropicMessageResponse;
    } catch {
      throw new AiProviderError("claude", `Resposta nao-JSON (status ${response.status}).`, response.status);
    }

    if (!response.ok) {
      const msg = data.error?.message ?? "erro desconhecido";
      throw new AiProviderError("claude", `Anthropic respondeu ${response.status}: ${msg}`, response.status);
    }

    // Recusa de segurança: HTTP 200 com stop_reason "refusal" (e/ou content vazio).
    // NÃO mascarar como "sem texto utilizavel" — lançar erro distinto (refusal=true)
    // ANTES do filtro de texto para o roteador poder cair no outro provedor.
    if (data.stop_reason === "refusal") {
      const category = data.stop_details?.category;
      const detail = category ? ` (categoria: ${category})` : "";
      throw new AiProviderError(
        "claude",
        `Anthropic recusou a solicitacao por politica de seguranca${detail}.`,
        response.status,
        true,
      );
    }

    const text = (data.content ?? [])
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text as string)
      .join("\n")
      .trim();

    if (!text) {
      throw new AiProviderError("claude", "A IA nao retornou texto utilizavel.");
    }

    return { text, provider: "claude", model };
  }

  /** Resolve o modelo da Anthropic considerando override de env. */
  defaultModel(): string {
    return (this.env.ANTHROPIC_MODEL && this.env.ANTHROPIC_MODEL.trim()) || CLAUDE_DEFAULT_MODEL;
  }
}
