/**
 * ContextChat — caixinha de chat flutuante, chamável de qualquer tela.
 *
 * Recebe um `context` (descrição da tela/entidade atual) que vai junto em cada
 * mensagem, então a IA responde ciente de onde o usuário está. Fala /ai/chat
 * via useAIChat. Degrada com elegância em 503 ("IA em ativação").
 *
 * NÃO é montado aqui — só exportado. O App.tsx pluga onde quiser (canto inferior
 * por padrão). Tudo com tokens do design-system (dark-safe).
 */

import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Loader2, Sparkles } from "lucide-react";
import { useAIChat } from "../../hooks/useAI";
import type { AiChatMessage } from "../../lib/ai-client";

export interface ContextChatProps {
  /** Contexto da tela/entidade atual, enviado à IA em cada mensagem. */
  context?: string;
  /** Token de sessão (logado) repassado ao backend. */
  accessToken?: string;
  /** Título do cabeçalho do chat. */
  title?: string;
  /** Frase de boas-vindas exibida quando não há mensagens. */
  greeting?: string;
  /** Começa aberto? Default: false (fica como botão flutuante). */
  defaultOpen?: boolean;
}

const S = {
  fab: {
    position: "fixed" as const,
    right: "20px",
    bottom: "20px",
    zIndex: 9998,
    width: "56px",
    height: "56px",
    borderRadius: "50%",
    border: "none",
    background: "linear-gradient(180deg, var(--brand-2, #3D8BFF), var(--brand, #1D5FE0))",
    color: "#fff",
    boxShadow: "var(--shadow-lg, 0 18px 44px rgba(11,34,64,.12))",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  } satisfies React.CSSProperties,

  panel: {
    position: "fixed" as const,
    right: "20px",
    bottom: "20px",
    zIndex: 9999,
    width: "min(380px, calc(100vw - 32px))",
    height: "min(560px, calc(100dvh - 40px))",
    display: "flex",
    flexDirection: "column" as const,
    background: "var(--elevated, #fff)",
    border: "1px solid var(--border, #E4EAF2)",
    borderRadius: "var(--r-lg, 16px)",
    boxShadow: "var(--shadow-xl, 0 36px 80px rgba(11,34,64,.18))",
    overflow: "hidden",
  } satisfies React.CSSProperties,

  header: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "12px 14px",
    borderBottom: "1px solid var(--border, #E4EAF2)",
    background: "var(--surface, #fff)",
  } satisfies React.CSSProperties,

  headerTitle: {
    fontSize: "14px",
    fontWeight: 700,
    color: "var(--t-hi, #0B2240)",
    margin: 0,
  } satisfies React.CSSProperties,

  log: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "14px",
    display: "flex",
    flexDirection: "column" as const,
    gap: "10px",
  } satisfies React.CSSProperties,

  bubbleUser: {
    alignSelf: "flex-end" as const,
    maxWidth: "85%",
    background: "linear-gradient(180deg, var(--brand-2, #3D8BFF), var(--brand, #1D5FE0))",
    color: "#fff",
    borderRadius: "14px 14px 4px 14px",
    padding: "9px 12px",
    fontSize: "14px",
    lineHeight: 1.5,
    whiteSpace: "pre-wrap" as const,
  } satisfies React.CSSProperties,

  bubbleAi: {
    alignSelf: "flex-start" as const,
    maxWidth: "90%",
    background: "var(--surface-2, #F7F9FC)",
    color: "var(--t-hi, #0B2240)",
    border: "1px solid var(--border, #E4EAF2)",
    borderRadius: "14px 14px 14px 4px",
    padding: "9px 12px",
    fontSize: "14px",
    lineHeight: 1.55,
    whiteSpace: "pre-wrap" as const,
  } satisfies React.CSSProperties,

  greeting: {
    color: "var(--t-mid, #56657D)",
    fontSize: "13px",
    lineHeight: 1.55,
    textAlign: "center" as const,
    margin: "auto 12px",
  } satisfies React.CSSProperties,

  notice: {
    color: "var(--t-mid, #56657D)",
    fontSize: "13px",
    background: "var(--surface-2, #F7F9FC)",
    border: "1px solid var(--border, #E4EAF2)",
    borderRadius: "var(--r-md, 12px)",
    padding: "10px 12px",
    margin: "0",
  } satisfies React.CSSProperties,

  form: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "10px 12px",
    borderTop: "1px solid var(--border, #E4EAF2)",
    background: "var(--surface, #fff)",
  } satisfies React.CSSProperties,

  input: {
    flex: 1,
    border: "1px solid var(--border, #E4EAF2)",
    borderRadius: "var(--r-md, 12px)",
    background: "var(--surface-2, #F7F9FC)",
    color: "var(--t-hi, #0B2240)",
    padding: "9px 12px",
    font: "inherit",
    fontSize: "14px",
    outline: "none",
  } satisfies React.CSSProperties,

  sendBtn: {
    flex: "0 0 auto",
    width: "38px",
    height: "38px",
    borderRadius: "var(--r-md, 12px)",
    border: "none",
    background: "var(--brand, #1D5FE0)",
    color: "#fff",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  } satisfies React.CSSProperties,

  iconBtn: {
    all: "unset" as const,
    cursor: "pointer",
    color: "var(--t-low, #6B7E96)",
    display: "inline-flex",
    marginLeft: "auto",
  } satisfies React.CSSProperties,
} as const;

export function ContextChat({
  context,
  accessToken,
  title = "Assistente Fonte.ia",
  greeting = "Pergunte qualquer coisa sobre esta tela — leilões, prazos, riscos. Respondo com base nos dados oficiais.",
  defaultOpen = false,
}: ContextChatProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [text, setText] = useState("");
  const logRef = useRef<HTMLDivElement>(null);

  // Stable key map: each message object gets a unique id assigned on first sight.
  // Using WeakMap so entries are GC'd when messages are cleared via chat.reset().
  const keyMapRef = useRef<WeakMap<AiChatMessage, string>>(new WeakMap());
  const keyCounterRef = useRef(0);
  function getMessageKey(msg: AiChatMessage): string {
    let k = keyMapRef.current.get(msg);
    if (k === undefined) {
      k = `msg-${(keyCounterRef.current++).toString()}`;
      keyMapRef.current.set(msg, k);
    }
    return k;
  }

  const chat = useAIChat({
    ...(context ? { context } : {}),
    ...(accessToken ? { accessToken } : {}),
  });

  /* rola para o fim quando chega mensagem ou muda o loading */
  useEffect(() => {
    if (open && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [open, chat.messages, chat.loading]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = text;
    setText("");
    await chat.send(value);
  }

  if (!open) {
    return (
      <button type="button" style={S.fab} aria-label="Abrir assistente" onClick={() => setOpen(true)}>
        <MessageCircle size={24} aria-hidden />
      </button>
    );
  }

  return (
    <section style={S.panel} role="dialog" aria-label={title}>
      <header style={S.header}>
        <Sparkles size={18} aria-hidden style={{ color: "var(--brand-ink, #1D5FE0)" }} />
        <h2 style={S.headerTitle}>{title}</h2>
        <button type="button" style={S.iconBtn} aria-label="Fechar" onClick={() => setOpen(false)}>
          <X size={18} aria-hidden />
        </button>
      </header>

      <div style={S.log} ref={logRef}>
        {chat.messages.length === 0 && !chat.unavailable && !chat.error ? (
          <p style={S.greeting}>{greeting}</p>
        ) : null}

        {chat.messages.map((m) => (
          <div key={getMessageKey(m)} style={m.role === "user" ? S.bubbleUser : S.bubbleAi}>
            {m.content}
          </div>
        ))}

        {chat.loading ? (
          <div style={{ ...S.bubbleAi, display: "inline-flex", alignItems: "center", gap: "8px" }}>
            <Loader2 size={15} aria-hidden className="spin" />
            <span style={{ color: "var(--t-mid)" }}>pensando…</span>
          </div>
        ) : null}

        {chat.unavailable ? (
          <p style={S.notice}>A inteligência está sendo ativada. Tente novamente em instantes.</p>
        ) : null}
        {chat.error ? <p style={S.notice}>Não consegui responder agora. {chat.error}</p> : null}
      </div>

      <form style={S.form} onSubmit={onSubmit}>
        <input
          style={S.input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Escreva sua pergunta…"
          aria-label="Sua mensagem"
          disabled={chat.loading}
        />
        <button type="submit" style={S.sendBtn} aria-label="Enviar" disabled={chat.loading || !text.trim()}>
          <Send size={17} aria-hidden />
        </button>
      </form>
    </section>
  );
}
