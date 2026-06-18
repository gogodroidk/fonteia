/**
 * Jargao — explica termos jurídicos/tributários ao toque ou hover.
 *
 * Uso:
 *   <Jargao termo="darf">DARF</Jargao>
 *   <Jargao termo="habilitacao" />    ← usa GLOSSARIO_TERMOS[termo].termo como label
 *
 * Acessibilidade:
 *   - Botão semântico (foco visível, alvo ≥ 44 px em mobile)
 *   - aria-expanded, aria-describedby
 *   - Fecha ao clicar fora e ao pressionar Esc
 *   - Funciona em touch (toque abre/fecha)
 */

import { useEffect, useId, useRef, useState } from "react";
import { HelpCircle } from "lucide-react";
import { GLOSSARIO_TERMOS } from "../data/glossario-termos";

/* ─── tipos ─── */
interface JargaoProps {
  /** Chave slug do glossário (ex.: "darf", "habilitacao", "no-estado") */
  termo: string;
  /**
   * Texto visível. Se omitido, usa GLOSSARIO_TERMOS[termo].termo como label.
   * Se o termo não existir no dicionário, renderiza apenas o children sem decoração.
   */
  children?: React.ReactNode;
}

/* ─── constantes de estilo (scoped inline para ser autossuficiente) ─── */
const S = {
  // wrapper inline-flex para não quebrar o fluxo de texto
  wrap: {
    display: "inline-flex",
    alignItems: "baseline",
    gap: "2px",
  } satisfies React.CSSProperties,

  // o próprio botão que envolve o termo
  trigger: {
    all: "unset",
    display: "inline-flex",
    alignItems: "center",
    gap: "3px",
    cursor: "pointer",
    // sublinhar pontilhado — indicador de "tem explicação"
    borderBottom: "1.5px dotted currentColor",
    color: "inherit",
    lineHeight: "inherit",
    fontSize: "inherit",
    fontWeight: "inherit",
    // alvo de toque ≥ 44 px: padding vertical compensado negativamente para não
    // empurrar o layout
    paddingTop: "10px",
    paddingBottom: "10px",
    marginTop: "-10px",
    marginBottom: "-10px",
    // deixa o ícone visível no alinhamento de texto
    verticalAlign: "baseline",
    position: "relative" as const,
    borderRadius: "3px",
  } satisfies React.CSSProperties,

  icon: {
    display: "inline-block",
    verticalAlign: "middle",
    flexShrink: 0,
    opacity: 0.55,
    // leve deslocamento para alinhar com a baseline do texto
    marginBottom: "1px",
  } satisfies React.CSSProperties,

  // popover flutuante
  popover: (visible: boolean): React.CSSProperties => ({
    position: "absolute",
    zIndex: 9999,
    bottom: "calc(100% + 8px)",
    left: "50%",
    width: "min(280px, 90vw)",
    background: "var(--elevated, #fff)",
    border: "1px solid var(--border, #E4EAF2)",
    borderRadius: "var(--r-md, 12px)",
    boxShadow: "var(--shadow-lg, 0 18px 44px rgba(11,34,64,.12))",
    padding: "12px 14px",
    pointerEvents: visible ? "auto" : "none",
    opacity: visible ? 1 : 0,
    transform: visible
      ? "translateX(-50%) translateY(0)"
      : "translateX(-50%) translateY(4px)",
    transition: "opacity 0.15s ease, transform 0.15s ease",
    // garante que fique sobre outros elementos
    isolation: "isolate",
  }),

  popoverTermo: {
    display: "block",
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.1em",
    textTransform: "uppercase" as const,
    color: "var(--accent-ink, #0E9885)",
    marginBottom: "5px",
  } satisfies React.CSSProperties,

  popoverDef: {
    display: "block",
    fontSize: "13.5px",
    lineHeight: 1.5,
    color: "var(--t-hi, #0B2240)",
    margin: 0,
  } satisfies React.CSSProperties,

  // setinha decorativa apontando para baixo
  arrow: {
    position: "absolute" as const,
    bottom: "-6px",
    left: "50%",
    transform: "translateX(-50%) rotate(45deg)",
    width: "10px",
    height: "10px",
    background: "var(--elevated, #fff)",
    border: "1px solid var(--border, #E4EAF2)",
    borderTop: "none",
    borderLeft: "none",
  } satisfies React.CSSProperties,
} as const;

/* ─── componente ─── */
export function Jargao({ termo, children }: JargaoProps) {
  const entry = GLOSSARIO_TERMOS[termo]; // pode ser undefined (noUncheckedIndexedAccess)

  // Se o termo não existe no dicionário, renderiza só o conteúdo sem quebrar
  if (entry === undefined) {
    return <>{children}</>;
  }

  return <JargaoPopover entry={entry} children={children} />;
}

/* ─── sub-componente com estado (separado para evitar hooks condicionais) ─── */
interface JargaoPopoverProps {
  entry: { termo: string; definicao: string };
  children?: React.ReactNode;
}

function JargaoPopover({ entry, children }: JargaoPopoverProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLSpanElement>(null);
  const descId = useId();

  /* fecha ao clicar fora */
  useEffect(() => {
    if (!open) return;

    function handleOutside(e: MouseEvent | TouchEvent) {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
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
  }, [open]);

  /* fecha ao pressionar Esc */
  useEffect(() => {
    if (!open) return;

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  function toggle(e: React.MouseEvent | React.TouchEvent) {
    // evita duplo disparo em dispositivos que emitem tanto touchstart quanto click
    e.preventDefault();
    setOpen((prev) => !prev);
  }

  const label = children ?? entry.termo;

  return (
    <span style={S.wrap}>
      {/* O elemento interativo é um <button> para semântica e foco correto */}
      <button
        ref={triggerRef}
        type="button"
        style={S.trigger}
        aria-expanded={open}
        aria-describedby={open ? descId : undefined}
        aria-label={`${typeof label === "string" ? label : entry.termo} — ver definição`}
        onClick={toggle}
        // evita o duplo disparo touch → click no iOS
        onTouchEnd={toggle}
      >
        {label}
        <HelpCircle
          size={13}
          aria-hidden="true"
          style={S.icon}
        />

        {/* Popover ancorado no botão (position absolute relativo ao trigger) */}
        <span
          ref={popoverRef}
          id={descId}
          role="tooltip"
          aria-hidden={!open}
          style={S.popover(open)}
        >
          <span style={S.popoverTermo}>{entry.termo}</span>
          <p style={S.popoverDef}>{entry.definicao}</p>
          {/* setinha decorativa */}
          <span aria-hidden="true" style={S.arrow} />
        </span>
      </button>
    </span>
  );
}
