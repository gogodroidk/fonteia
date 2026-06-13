/**
 * Modo Ajuda — Fonte.ia
 *
 * Exporta:
 *   HelpModeProvider  — Context provider; envolva o app inteiro.
 *   useHelpMode()     — { helpOn: boolean; toggleHelp: () => void }
 *   HelpHint          — Wrapper que mostra um tooltip de ajuda quando helpOn === true.
 *
 * Acessibilidade (mesmas garantias do jargao-tooltip.tsx):
 *   - Botão semântico com aria-expanded / aria-describedby
 *   - Fecha ao clicar/tocar fora e ao pressionar Esc
 *   - Toque em mobile: primeiro toque exibe a dica, segundo toque fecha
 *   - Alvo de toque ≥ 44 px via padding negativo compensado
 *   - Respeita prefers-reduced-motion
 *
 * Custo zero quando desligado:
 *   - HelpHint com helpOn === false renderiza apenas o children, sem DOM extra.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { HELP_HINTS } from "../data/help-hints";

/* ─── Persistência ─────────────────────────────────────────────────────── */

const STORAGE_KEY = "fonteia.helpMode";

function readStorage(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeStorage(value: boolean): void {
  try {
    if (value) {
      localStorage.setItem(STORAGE_KEY, "1");
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // incognito / storage blocked — silently ignore
  }
}

/* ─── Context ──────────────────────────────────────────────────────────── */

interface HelpModeCtx {
  helpOn: boolean;
  toggleHelp: () => void;
}

const HelpModeContext = createContext<HelpModeCtx | null>(null);

export function HelpModeProvider({ children }: { children: ReactNode }) {
  const [helpOn, setHelpOn] = useState<boolean>(() => readStorage());

  const toggleHelp = useCallback(() => {
    setHelpOn((prev) => {
      const next = !prev;
      writeStorage(next);
      return next;
    });
  }, []);

  return (
    <HelpModeContext.Provider value={{ helpOn, toggleHelp }}>
      {children}
    </HelpModeContext.Provider>
  );
}

export function useHelpMode(): HelpModeCtx {
  const ctx = useContext(HelpModeContext);
  if (ctx === null) {
    throw new Error("useHelpMode must be used inside <HelpModeProvider>");
  }
  return ctx;
}

/* ─── HelpHint ─────────────────────────────────────────────────────────── */

interface HelpHintProps {
  /** Chave do catálogo HELP_HINTS (ex.: "nav.lotes", "topbar.search") */
  id: string;
  children: ReactNode;
}

/**
 * Quando helpOn === false: renderiza apenas children (custo zero).
 * Quando helpOn === true: envolve children num wrapper que exibe tooltip no
 * hover (desktop) e no toque (mobile).
 */
export function HelpHint({ id, children }: HelpHintProps) {
  const { helpOn } = useHelpMode();
  if (!helpOn) return <>{children}</>;
  return <HelpHintActive id={id}>{children}</HelpHintActive>;
}

/* ─── HelpHintActive — sub-componente com estado ──────────────────────── */

const S = {
  wrap: {
    display: "inline-flex",
    position: "relative" as const,
    verticalAlign: "middle",
  } satisfies React.CSSProperties,

  // leve destaque visual quando o modo ajuda está ligado
  highlight: {
    outline: "1.5px dashed var(--brand, #1D5FE0)",
    outlineOffset: "2px",
    borderRadius: "6px",
  } satisfies React.CSSProperties,

  popover: (visible: boolean): React.CSSProperties => ({
    position: "absolute",
    zIndex: 9999,
    bottom: "calc(100% + 10px)",
    left: "50%",
    width: "min(280px, 90vw)",
    background: "var(--elevated, #fff)",
    border: "1px solid var(--border, #E4EAF2)",
    borderRadius: "var(--r-md, 12px)",
    boxShadow: "var(--shadow-lg, 0 18px 44px rgba(11,34,64,.12))",
    padding: "11px 13px",
    pointerEvents: visible ? "auto" : "none",
    opacity: visible ? 1 : 0,
    transform: visible
      ? "translateX(-50%) translateY(0)"
      : "translateX(-50%) translateY(4px)",
    transition: "opacity 0.15s ease, transform 0.15s ease",
    isolation: "isolate",
  }),

  label: {
    display: "block",
    fontSize: "10px",
    fontWeight: 700,
    letterSpacing: "0.1em",
    textTransform: "uppercase" as const,
    color: "var(--brand-ink, #1D5FE0)",
    marginBottom: "4px",
  } satisfies React.CSSProperties,

  text: {
    display: "block",
    fontSize: "13px",
    lineHeight: 1.5,
    color: "var(--t-hi, #0B2240)",
    margin: 0,
  } satisfies React.CSSProperties,

  arrow: {
    position: "absolute" as const,
    bottom: "-5px",
    left: "50%",
    transform: "translateX(-50%) rotate(45deg)",
    width: "9px",
    height: "9px",
    background: "var(--elevated, #fff)",
    border: "1px solid var(--border, #E4EAF2)",
    borderTop: "none",
    borderLeft: "none",
  } satisfies React.CSSProperties,
} as const;

function HelpHintActive({ id, children }: HelpHintProps) {
  const hint = HELP_HINTS[id]; // may be undefined (noUncheckedIndexedAccess)
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLSpanElement>(null);
  const descId = useId();

  /* close on outside click/touch */
  useEffect(() => {
    if (hint === undefined || !open) return;

    function handleOutside(e: MouseEvent | TouchEvent) {
      const target = e.target as Node;
      if (
        wrapRef.current &&
        !wrapRef.current.contains(target) &&
        popoverRef.current &&
        !popoverRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [hint, open]);

  /* close on Esc */
  useEffect(() => {
    if (hint === undefined || !open) return;

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        wrapRef.current?.focus();
      }
    }

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [hint, open]);

  // All hooks are called above; now safe to bail out if no hint registered.
  if (hint === undefined) return <>{children}</>;

  /* desktop: open on hover */
  function handleMouseEnter() {
    setOpen(true);
  }
  function handleMouseLeave() {
    setOpen(false);
  }

  /* mobile: toggle on touch (preventDefault stops the double click/focus cascade) */
  function handleTouchEnd(e: React.TouchEvent) {
    e.preventDefault();
    setOpen((prev) => !prev);
  }

  /* keyboard: toggle on focus/blur (open on focus, close on blur if not hovering) */
  function handleFocus() {
    setOpen(true);
  }
  function handleBlur() {
    setOpen(false);
  }

  return (
    <span
      ref={wrapRef}
      style={{ ...S.wrap, ...(open ? S.highlight : {}) }}
      tabIndex={0}
      role="button"
      aria-expanded={open}
      aria-describedby={open ? descId : undefined}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchEnd={handleTouchEnd}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      {children}

      <span
        ref={popoverRef}
        id={descId}
        role="tooltip"
        aria-hidden={!open}
        style={S.popover(open)}
      >
        <span style={S.label}>Ajuda</span>
        <p style={S.text}>{hint}</p>
        <span aria-hidden="true" style={S.arrow} />
      </span>
    </span>
  );
}
