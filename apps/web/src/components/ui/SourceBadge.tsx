/**
 * SourceBadge.tsx — Badge inline de rastreabilidade.
 *
 * Identidade visual do fosso do produto: todo dado cita fonte oficial, pública ou IA.
 * Componível: pode ser <span> ou <a> dependendo da prop `url`.
 *
 * Design system: CSS custom properties (var(--token)); mobile-first; dark/light.
 * Acessibilidade: aria-label descritivo; Fingerprint indica evidência auditável.
 */

import { ShieldCheck, Globe, Sparkles, Fingerprint } from "lucide-react";
import type { CSSProperties } from "react";

export interface SourceBadgeProps {
  /** Nome da fonte, ex: "Receita Federal", "PNCP", "Portal da Transparência". */
  fonte: string;
  /** Se presente, o badge vira <a> com target="_blank". */
  url?: string | undefined;
  /** Data de coleta/atualização, ex: "20/06/2026". */
  data?: string | undefined;
  /** Hash de evidência — se presente, exibe ícone Fingerprint com title truncado. */
  hash?: string | undefined;
  /** Classe semântica da fonte. @default "oficial" */
  tipo?: "oficial" | "publica" | "ia" | undefined;
  /** Tamanho do badge. @default "sm" */
  size?: "sm" | "md" | undefined;
}

// ─── Helpers internos ────────────────────────────────────────────────────────

type TipoResolved = "oficial" | "publica" | "ia";

function resolvedTipo(tipo: TipoResolved): {
  cor: string;
  bgColor: string;
  borderColor: string;
} {
  switch (tipo) {
    case "oficial":
      return {
        cor: "var(--ok)",
        bgColor: "color-mix(in srgb,var(--ok) 8%,var(--surface))",
        borderColor: "color-mix(in srgb,var(--ok) 22%,transparent)",
      };
    case "ia":
      return {
        cor: "var(--accent-ink)",
        bgColor: "color-mix(in srgb,var(--accent) 8%,var(--surface))",
        borderColor: "color-mix(in srgb,var(--accent) 22%,transparent)",
      };
    case "publica":
    default:
      return {
        cor: "var(--t-mid)",
        bgColor: "color-mix(in srgb,var(--t-mid) 6%,var(--surface))",
        borderColor: "var(--border)",
      };
  }
}

function ariaLabel(tipo: TipoResolved, fonte: string, data: string | undefined): string {
  const tipoLabel =
    tipo === "ia"
      ? "gerada por IA"
      : tipo === "publica"
        ? "pública"
        : "oficial";
  return `Fonte ${tipoLabel}: ${fonte}${data !== undefined ? ", " + data : ""}`;
}

// ─── Componente ──────────────────────────────────────────────────────────────

export function SourceBadge({
  fonte,
  url,
  data,
  hash,
  tipo = "oficial",
  size = "sm",
}: SourceBadgeProps) {
  const tipoResolved: TipoResolved = tipo;
  const { cor, bgColor, borderColor } = resolvedTipo(tipoResolved);

  const isMd = size === "md";
  const fontSize = isMd ? 12.5 : 11;
  const iconSize = isMd ? 13 : 11;
  const fpSize = isMd ? 12 : 10;

  const Icon =
    tipoResolved === "oficial"
      ? ShieldCheck
      : tipoResolved === "ia"
        ? Sparkles
        : Globe;

  const label = ariaLabel(tipoResolved, fonte, data);
  const textoLabel = `Fonte: ${fonte}${data !== undefined ? " · " + data : ""}`;

  const sharedStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: isMd ? 5 : 4,
    padding: isMd ? "3px 8px" : "2px 6px",
    background: bgColor,
    border: `1px solid ${borderColor}`,
    borderRadius: "var(--r-sm)",
    fontSize,
    color: "var(--t-mid)",
    lineHeight: 1.4,
    textDecoration: "none",
    verticalAlign: "middle",
    flexShrink: 0,
    maxWidth: "100%",
    whiteSpace: "nowrap",
    overflow: "hidden",
  };

  const hoverStyle: CSSProperties | undefined =
    url !== undefined
      ? { outline: "none" } // foco via :focus-visible global
      : undefined;

  const inner = (
    <>
      <Icon
        size={iconSize}
        aria-hidden="true"
        style={{ color: cor, flexShrink: 0 }}
      />
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {textoLabel}
      </span>
      {hash !== undefined && (
        <span
          title={`Hash de evidência: ${hash.slice(0, 16)}…`}
          style={{ display: "inline-flex", flexShrink: 0, cursor: "help" }}
        >
          <Fingerprint
            size={fpSize}
            aria-hidden="true"
            style={{ color: "var(--t-low)" }}
          />
        </span>
      )}
    </>
  );

  if (url !== undefined) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        style={{
          ...sharedStyle,
          ...hoverStyle,
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.opacity = "0.82";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.opacity = "1";
        }}
      >
        {inner}
      </a>
    );
  }

  return (
    <span
      aria-label={label}
      style={sharedStyle}
    >
      {inner}
    </span>
  );
}
