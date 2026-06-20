/**
 * ContextChat — Olli, o copiloto da Fonte.ia.
 *
 * Recebe um `context` (descrição da tela/entidade atual) que vai junto em cada
 * mensagem, então a IA responde ciente de onde o usuário está. Fala /ai/chat
 * via useAIChat. Degrada com elegância em 503 ("IA em ativação").
 *
 * NÃO é montado aqui — só exportado. O App.tsx pluga onde quiser (canto inferior
 * por padrão). Tudo com tokens do design-system (dark-safe).
 */

import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Loader2 } from "lucide-react";
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

/* ─── Quick-start chips ─── */
const CHIPS = [
  "O que dá pra fazer aqui?",
  "Resuma esta tela",
  "Como funciona o Cérebro?",
  "Quais leilões valem a pena?",
] as const;

/* ─── Avatar de Olli (bolinha gradiente com "O") ─── */
function OlliAvatar({ size = 28 }: { size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: "50%",
        background: "linear-gradient(135deg, var(--brand-2, #3D8BFF), var(--accent, #6C5CE7))",
        color: "#fff",
        fontSize: `${Math.round(size * 0.48)}px`,
        fontWeight: 800,
        flexShrink: 0,
        userSelect: "none",
      }}
    >
      O
    </span>
  );
}

/* ─── Styles ─── */
const S = {
  fab: {
    position: "fixed" as const,
    right: "20px",
    bottom: "max(20px, env(safe-area-inset-bottom, 20px))",
    zIndex: 9998,
    width: "56px",
    height: "56px",
    borderRadius: "50%",
    border: "none",
    background: "linear-gradient(135deg, var(--brand-2, #3D8BFF), var(--accent, #6C5CE7))",
    color: "#fff",
    boxShadow: "var(--shadow-lg, 0 18px 44px rgba(11,34,64,.12))",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  } satisfies React.CSSProperties,

  panel: {
    position: "fixed" as const,
    right: "12px",
    bottom: "max(20px, env(safe-area-inset-bottom, 20px))",
    zIndex: 9999,
    width: "min(380px, calc(100vw - 24px))",
    height: "min(560px, calc(100dvh - 32px))",
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

  headerInfo: {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    gap: "1px",
    minWidth: 0,
  } satisfies React.CSSProperties,

  headerTitle: {
    fontSize: "14px",
    fontWeight: 700,
    color: "var(--t-hi, #0B2240)",
    margin: 0,
    lineHeight: 1.2,
  } satisfies React.CSSProperties,

  headerSub: {
    fontSize: "11px",
    color: "var(--t-low, #6B7E96)",
    lineHeight: 1.2,
  } satisfies React.CSSProperties,

  log: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "14px",
    display: "flex",
    flexDirection: "column" as const,
    gap: "10px",
  } satisfies React.CSSProperties,

  greetingBox: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "14px",
    alignItems: "center",
    margin: "auto 0",
  } satisfies React.CSSProperties,

  greetingText: {
    color: "var(--t-mid, #56657D)",
    fontSize: "13px",
    lineHeight: 1.6,
    textAlign: "center" as const,
  } satisfies React.CSSProperties,

  chipsRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "6px",
    justifyContent: "center",
  } satisfies React.CSSProperties,

  chip: {
    background: "var(--surface-2, #F7F9FC)",
    border: "1px solid var(--border, #E4EAF2)",
    borderRadius: "20px",
    padding: "6px 12px",
    fontSize: "12px",
    color: "var(--t-mid, #56657D)",
    cursor: "pointer",
    minHeight: "32px",
    display: "inline-flex",
    alignItems: "center",
    lineHeight: 1.3,
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

  aiBubbleRow: {
    display: "flex",
    alignItems: "flex-end",
    gap: "6px",
    alignSelf: "flex-start" as const,
    maxWidth: "92%",
  } satisfies React.CSSProperties,

  bubbleAi: {
    background: "var(--surface-2, #F7F9FC)",
    color: "var(--t-hi, #0B2240)",
    border: "1px solid var(--border, #E4EAF2)",
    borderRadius: "14px 14px 14px 4px",
    padding: "9px 12px",
    fontSize: "14px",
    lineHeight: 1.55,
    whiteSpace: "pre-wrap" as const,
    minWidth: 0,
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

  footer: {
    display: "flex",
    flexDirection: "column" as const,
    borderTop: "1px solid var(--border, #E4EAF2)",
    background: "var(--surface, #fff)",
  } satisfies React.CSSProperties,

  form: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "10px 12px",
  } satisfies React.CSSProperties,

  trust: {
    fontSize: "10px",
    color: "var(--t-low, #6B7E96)",
    textAlign: "center" as const,
    padding: "0 12px 8px",
    lineHeight: 1.4,
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
    minHeight: "40px",
  } satisfies React.CSSProperties,

  sendBtn: {
    flex: "0 0 auto",
    width: "40px",
    height: "40px",
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
    alignItems: "center",
    justifyContent: "center",
    // Alvo de toque mínimo para mobile (era 32px, abaixo do recomendado).
    width: "40px",
    height: "40px",
    borderRadius: "var(--r-md, 12px)",
    marginLeft: "auto",
    flexShrink: 0,
  } satisfies React.CSSProperties,
} as const;

export function ContextChat({
  context,
  accessToken,
  title = "Olli",
  greeting = "Oi! Sou o Olli, seu copiloto na Fonte.ia. Pode me perguntar qualquer coisa sobre esta tela — leilões, empresas, prazos, riscos ou como navegar aqui. Respondo com base nos dados públicos oficiais.",
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
    const value = text.trim();
    if (!value) return;
    setText("");
    await chat.send(value);
  }

  async function sendChip(chip: string) {
    await chat.send(chip);
  }

  const showChips =
    chat.messages.length === 0 && !chat.unavailable && !chat.error && !chat.loading;

  if (!open) {
    return (
      <button
        type="button"
        style={S.fab}
        aria-label="Abrir Olli, copiloto da Fonte.ia"
        onClick={() => setOpen(true)}
      >
        <MessageCircle size={24} aria-hidden />
      </button>
    );
  }

  return (
    <section style={S.panel} role="dialog" aria-label={`${title} — copiloto da Fonte.ia`}>
      {/* ── Header ── */}
      <header style={S.header}>
        <OlliAvatar size={30} />
        <div style={S.headerInfo}>
          <h2 style={S.headerTitle}>{title}</h2>
          <span style={S.headerSub}>Copiloto da Fonte.ia</span>
        </div>
        <button
          type="button"
          style={S.iconBtn}
          aria-label="Fechar Olli"
          onClick={() => setOpen(false)}
        >
          <X size={18} aria-hidden />
        </button>
      </header>

      {/* ── Message log ── */}
      <div style={S.log} ref={logRef}>
        {chat.messages.length === 0 && !chat.unavailable && !chat.error ? (
          <div style={S.greetingBox}>
            <p style={S.greetingText}>{greeting}</p>

            {showChips ? (
              <div style={S.chipsRow} role="list" aria-label="Sugestões de perguntas">
                {CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    style={S.chip}
                    role="listitem"
                    onClick={() => { void sendChip(chip); }}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {chat.messages.map((m) =>
          m.role === "user" ? (
            <div key={getMessageKey(m)} style={S.bubbleUser}>
              {m.content}
            </div>
          ) : (
            <div key={getMessageKey(m)} style={S.aiBubbleRow}>
              <OlliAvatar size={20} />
              <div style={S.bubbleAi}>{m.content}</div>
            </div>
          )
        )}

        {chat.loading ? (
          <div style={S.aiBubbleRow}>
            <OlliAvatar size={20} />
            <div style={{ ...S.bubbleAi, display: "inline-flex", alignItems: "center", gap: "8px" }}>
              <Loader2 size={15} aria-hidden className="spin" />
              <span style={{ color: "var(--t-mid)" }}>pensando…</span>
            </div>
          </div>
        ) : null}

        {chat.unavailable ? (
          <p style={S.notice}>
            A inteligência está sendo ativada. Tente novamente em instantes.
          </p>
        ) : null}
        {chat.error ? (
          <p style={S.notice}>Não consegui responder agora. {chat.error}</p>
        ) : null}
      </div>

      {/* ── Input + trust footer ── */}
      <div style={S.footer}>
        <form style={S.form} onSubmit={onSubmit}>
          <input
            style={S.input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Pergunte ao Olli…"
            aria-label="Sua mensagem"
            disabled={chat.loading}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void onSubmit(e as unknown as React.FormEvent);
              }
            }}
          />
          <button
            type="submit"
            style={S.sendBtn}
            aria-label="Enviar mensagem"
            disabled={chat.loading || !text.trim()}
          >
            <Send size={17} aria-hidden />
          </button>
        </form>
        <p style={S.trust}>
          Olli pode errar. Confira sempre na fonte oficial.
        </p>
      </div>
    </section>
  );
}
