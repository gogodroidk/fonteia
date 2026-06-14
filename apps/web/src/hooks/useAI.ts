/**
 * Hooks de estado para as chamadas de IA (chat contextual + omnibox).
 *
 * Encapsulam loading / erro / "IA indisponível" (503) para os componentes não
 * repetirem essa plumbing. Sem dependências externas — só React + ai-client.
 */

import { useCallback, useRef, useState } from "react";
import {
  aiChat,
  aiIntent,
  AiUnavailableError,
  type AiChatMessage,
  type AiIntentResponse,
} from "../lib/ai-client";

interface AiCallState {
  loading: boolean;
  /** Mensagem de erro amigável (null quando sem erro). */
  error: string | null;
  /** true quando a IA respondeu 503 — UI deve mostrar "IA em ativação". */
  unavailable: boolean;
}

const IDLE: AiCallState = { loading: false, error: null, unavailable: false };

/* ─── Chat contextual ──────────────────────────────────────────────────── */

export interface UseAIChat extends AiCallState {
  /** Turnos acumulados (user + assistant), prontos para renderizar. */
  messages: AiChatMessage[];
  /** Envia uma mensagem do usuário; anexa a resposta da IA ao histórico. */
  send: (text: string) => Promise<void>;
  /** Limpa o histórico e o estado. */
  reset: () => void;
}

/**
 * Estado de um chat contextual. `context` (rota/entidade) é capturado por ref
 * para não recriar `send` a cada render; passe um valor estável ou atualize via
 * a prop do componente.
 */
export function useAIChat(options?: { context?: string; accessToken?: string }): UseAIChat {
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [state, setState] = useState<AiCallState>(IDLE);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const userMessage: AiChatMessage = { role: "user", content: trimmed };
    // Histórico que será enviado (inclui a mensagem nova).
    let outgoing: AiChatMessage[] = [];
    setMessages((prev) => {
      outgoing = [...prev, userMessage];
      return outgoing;
    });
    setState({ loading: true, error: null, unavailable: false });

    try {
      const opts = optionsRef.current;
      const res = await aiChat(outgoing, {
        ...(opts?.context ? { context: opts.context } : {}),
        ...(opts?.accessToken ? { accessToken: opts.accessToken } : {}),
      });
      setMessages((prev) => [...prev, { role: "assistant", content: res.answer }]);
      setState(IDLE);
    } catch (error) {
      if (error instanceof AiUnavailableError) {
        setState({ loading: false, error: null, unavailable: true });
      } else {
        setState({ loading: false, error: (error as Error).message, unavailable: false });
      }
    }
  }, []);

  const reset = useCallback(() => {
    setMessages([]);
    setState(IDLE);
  }, []);

  return { messages, send, reset, ...state };
}

/* ─── Omnibox (intenção) ───────────────────────────────────────────────── */

export interface UseAIIntent extends AiCallState {
  /** Última intenção resolvida (null antes da primeira consulta). */
  intent: AiIntentResponse | null;
  /** Resolve a intenção de uma query; retorna o resultado (ou null em erro). */
  resolve: (query: string) => Promise<AiIntentResponse | null>;
  /** Limpa a intenção e o estado. */
  reset: () => void;
}

export function useAIIntent(options?: { context?: string; accessToken?: string }): UseAIIntent {
  const [intent, setIntent] = useState<AiIntentResponse | null>(null);
  const [state, setState] = useState<AiCallState>(IDLE);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const resolve = useCallback(async (query: string): Promise<AiIntentResponse | null> => {
    const trimmed = query.trim();
    if (!trimmed) return null;

    setState({ loading: true, error: null, unavailable: false });
    try {
      const opts = optionsRef.current;
      const res = await aiIntent(trimmed, {
        ...(opts?.context ? { context: opts.context } : {}),
        ...(opts?.accessToken ? { accessToken: opts.accessToken } : {}),
      });
      setIntent(res);
      setState(IDLE);
      return res;
    } catch (error) {
      if (error instanceof AiUnavailableError) {
        setState({ loading: false, error: null, unavailable: true });
      } else {
        setState({ loading: false, error: (error as Error).message, unavailable: false });
      }
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setIntent(null);
    setState(IDLE);
  }, []);

  return { intent, resolve, reset, ...state };
}
