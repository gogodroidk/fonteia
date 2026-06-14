/**
 * IntelligenceOmnibox — barra de inteligência no topo + paleta de comando.
 *
 * O usuário escreve uma frase; o componente chama /ai/intent e mostra:
 *   - o que a IA entendeu (understanding)
 *   - uma ação/rota sugerida (suggestedAction + suggestedRoute), clicável
 *   - uma resposta direta (answer)
 *
 * Atalho: ⌘K / Ctrl+K abre a paleta (habilitado por padrão; desligue com
 * `shortcut={false}`). Degrada com elegância em 503 ("IA em ativação").
 *
 * NÃO é montado em lugar nenhum aqui — só exportado, pronto para o App.tsx
 * encaixar no topo. Tudo com tokens do design-system (dark-safe).
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Sparkles, ArrowRight, Loader2, X } from "lucide-react";
import { useFocusTrap } from "../../hooks/use-focus-trap";
import { useAIIntent } from "../../hooks/useAI";

export interface IntelligenceOmniboxProps {
  /** Contexto da tela atual (rota/entidade) repassado à IA. */
  context?: string;
  /** Token de sessão (logado) — repassado ao backend. */
  accessToken?: string;
  /** Placeholder do gatilho e do input. */
  placeholder?: string;
  /** Liga o atalho ⌘K / Ctrl+K. Default: true. */
  shortcut?: boolean;
  /**
   * Navegação ao aceitar uma rota sugerida. Se omitido, usa window.location.
   * (Permite plugar o router do app sem acoplar a uma lib específica.)
   */
  onNavigate?: (route: string) => void;
}

const S = {
  trigger: {
    display: "inline-flex",
    alignItems: "center",
    gap: "10px",
    width: "100%",
    maxWidth: "520px",
    background: "var(--surface, #fff)",
    border: "1px solid var(--border, #E4EAF2)",
    borderRadius: "var(--r-md, 12px)",
    padding: "10px 14px",
    color: "var(--t-low, #6B7E96)",
    cursor: "text",
    font: "inherit",
    fontSize: "14px",
    textAlign: "left" as const,
    transition: "border-color .18s, box-shadow .18s",
  } satisfies React.CSSProperties,

  overlay: {
    position: "fixed" as const,
    inset: 0,
    zIndex: 10000,
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    padding: "12vh 16px 16px",
    background: "rgba(7,12,22,.45)",
    backdropFilter: "blur(4px)",
    WebkitBackdropFilter: "blur(4px)",
  } satisfies React.CSSProperties,

  panel: {
    width: "min(640px, 100%)",
    background: "var(--elevated, #fff)",
    border: "1px solid var(--border, #E4EAF2)",
    borderRadius: "var(--r-lg, 16px)",
    boxShadow: "var(--shadow-xl, 0 36px 80px rgba(11,34,64,.18))",
    overflow: "hidden",
  } satisfies React.CSSProperties,

  inputRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "14px 16px",
    borderBottom: "1px solid var(--border, #E4EAF2)",
  } satisfies React.CSSProperties,

  input: {
    flex: 1,
    border: 0,
    outline: "none",
    background: "transparent",
    color: "var(--t-hi, #0B2240)",
    font: "inherit",
    fontSize: "16px",
  } satisfies React.CSSProperties,

  body: { padding: "16px", display: "grid", gap: "14px" } satisfies React.CSSProperties,

  label: {
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: ".08em",
    textTransform: "uppercase" as const,
    color: "var(--brand-ink, #1D5FE0)",
    marginBottom: "4px",
  } satisfies React.CSSProperties,

  text: {
    fontSize: "14px",
    lineHeight: 1.55,
    color: "var(--t-hi, #0B2240)",
    margin: 0,
    whiteSpace: "pre-wrap" as const,
  } satisfies React.CSSProperties,

  muted: {
    fontSize: "13px",
    lineHeight: 1.5,
    color: "var(--t-mid, #56657D)",
    margin: 0,
  } satisfies React.CSSProperties,

  actionBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    background: "var(--surface-2, #F7F9FC)",
    border: "1px solid var(--border, #E4EAF2)",
    borderRadius: "var(--r-md, 12px)",
    padding: "10px 14px",
    color: "var(--brand-ink, #1D5FE0)",
    fontWeight: 600,
    fontSize: "14px",
    cursor: "pointer",
  } satisfies React.CSSProperties,

  kbd: {
    fontSize: "11px",
    fontWeight: 700,
    padding: "2px 6px",
    borderRadius: "6px",
    background: "var(--surface-2, #F7F9FC)",
    border: "1px solid var(--border, #E4EAF2)",
    color: "var(--t-mid, #56657D)",
    marginLeft: "auto",
  } satisfies React.CSSProperties,
} as const;

function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
}

export function IntelligenceOmnibox({
  context,
  accessToken,
  placeholder = "Pergunte ou descreva o que você quer…",
  shortcut = true,
  onNavigate,
}: IntelligenceOmniboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useFocusTrap<HTMLDivElement>(open);
  const titleId = useId();

  const ai = useAIIntent({
    ...(context ? { context } : {}),
    ...(accessToken ? { accessToken } : {}),
  });

  /* atalho ⌘K / Ctrl+K */
  useEffect(() => {
    if (!shortcut) return;
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [shortcut]);

  /* foco no input ao abrir */
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  /* Esc fecha */
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  const submit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      await ai.resolve(query);
    },
    [ai, query],
  );

  const goToRoute = useCallback(
    (route: string) => {
      close();
      if (onNavigate) {
        onNavigate(route);
      } else if (typeof window !== "undefined") {
        window.location.href = route;
      }
    },
    [close, onNavigate],
  );

  const shortcutHint = isApplePlatform() ? "⌘K" : "Ctrl K";

  return (
    <>
      <button type="button" style={S.trigger} onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Sparkles size={17} aria-hidden style={{ color: "var(--brand-ink, #1D5FE0)" }} />
        <span style={{ flex: 1 }}>{placeholder}</span>
        {shortcut ? <span style={S.kbd}>{shortcutHint}</span> : null}
      </button>

      {open ? (
        <div
          style={S.overlay}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            style={S.panel}
          >
            <span id={titleId} style={{ position: "absolute", left: "-9999px" }}>
              Inteligência Fonte.ia
            </span>

            <form style={S.inputRow} onSubmit={submit}>
              <Sparkles size={18} aria-hidden style={{ color: "var(--brand-ink, #1D5FE0)" }} />
              <input
                ref={inputRef}
                style={S.input}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={placeholder}
                aria-label="Pergunte ou descreva o que você quer"
              />
              {ai.loading ? (
                <Loader2 size={18} aria-hidden className="spin" style={{ color: "var(--t-mid)" }} />
              ) : (
                <button
                  type="button"
                  onClick={close}
                  aria-label="Fechar"
                  style={{ all: "unset", cursor: "pointer", color: "var(--t-low)" }}
                >
                  <X size={18} aria-hidden />
                </button>
              )}
            </form>

            {(ai.intent || ai.unavailable || ai.error) && (
              <div style={S.body}>
                {ai.unavailable ? (
                  <p style={S.muted}>
                    A inteligência está sendo ativada. Tente novamente em instantes.
                  </p>
                ) : ai.error ? (
                  <p style={S.muted}>Não consegui interpretar agora. {ai.error}</p>
                ) : ai.intent ? (
                  <>
                    <div>
                      <div style={S.label}>Entendi</div>
                      <p style={S.muted}>{ai.intent.understanding}</p>
                    </div>

                    <div>
                      <div style={S.label}>Resposta</div>
                      <p style={S.text}>{ai.intent.answer}</p>
                    </div>

                    {ai.intent.suggestedRoute ? (
                      <button
                        type="button"
                        style={S.actionBtn}
                        onClick={() => goToRoute(ai.intent!.suggestedRoute as string)}
                      >
                        <span>{ai.intent.suggestedAction ?? "Ir"}</span>
                        <ArrowRight size={16} aria-hidden />
                      </button>
                    ) : null}
                  </>
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
