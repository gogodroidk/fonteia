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
  /**
   * Reenvia a ÚLTIMA mensagem do usuário (após erro/indisponível) SEM duplicá-la
   * no histórico. No-op se não há o que reenviar ou se já está carregando.
   */
  retry: () => Promise<void>;
  /** true quando há uma última mensagem do usuário passível de reenvio. */
  canRetry: boolean;
  /** Limpa o histórico e o estado. */
  reset: () => void;
}

/**
 * Estado de um chat contextual. `context` (rota/entidade) é capturado por ref
 * para não recriar `send`/`retry` a cada render; passe um valor estável ou
 * atualize via a prop do componente.
 *
 * Robustez (o "chatzinho" não pode travar):
 *  - guarda contra envio concorrente (uma chamada por vez);
 *  - em erro, a mensagem do usuário PERMANECE no histórico e fica disponível para
 *    `retry()` — o reenvio reaproveita o histórico, sem duplicar o turno;
 *  - `unavailable` (503) e `error` são estados distintos para a UI tratar.
 */
export function useAIChat(options?: { context?: string; accessToken?: string }): UseAIChat {
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [state, setState] = useState<AiCallState>(IDLE);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Refs de controle: trava de concorrência e snapshot do histórico atual (para o
  // retry reaproveitar exatamente os turnos já renderizados, inclusive o último
  // turno do usuário que falhou).
  const inFlightRef = useRef(false);
  const messagesRef = useRef<AiChatMessage[]>([]);
  messagesRef.current = messages;

  // Núcleo compartilhado por send/retry: dispara a chamada para um histórico já
  // montado (que TERMINA num turno do usuário). Anexa a resposta ou seta o erro.
  const run = useCallback(async (outgoing: AiChatMessage[]) => {
    if (inFlightRef.current) return; // já há uma chamada em andamento
    const last = outgoing[outgoing.length - 1];
    if (!last || last.role !== "user") return; // nada a responder
    inFlightRef.current = true;
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
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || inFlightRef.current) return;
    const outgoing = [...messagesRef.current, { role: "user" as const, content: trimmed }];
    setMessages(outgoing);
    await run(outgoing);
  }, [run]);

  const retry = useCallback(async () => {
    if (inFlightRef.current) return;
    const current = messagesRef.current;
    // Só reenviamos se o histórico termina num turno do usuário (resposta faltou).
    const last = current[current.length - 1];
    if (!last || last.role !== "user") return;
    await run(current);
  }, [run]);

  const reset = useCallback(() => {
    setMessages([]);
    setState(IDLE);
  }, []);

  const lastMessage = messages[messages.length - 1];
  const canRetry = !state.loading && lastMessage?.role === "user";

  return { messages, send, retry, canRetry, reset, ...state };
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
