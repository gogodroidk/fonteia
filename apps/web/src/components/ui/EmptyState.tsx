/**
 * EmptyState.tsx — Estado vazio/dormant/erro reutilizável com CTA.
 *
 * Padroniza os muitos estados "sem dados / recurso pago / nada encontrado" do app.
 * Suporta dois CTAs (primário e secundário) e quatro tones semânticos.
 *
 * Design system: CSS custom properties (var(--token)); mobile-first 375px; dark/light.
 * Acessibilidade: role="status" implícito via semântica; foco visível nos botões.
 */

import type { LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export interface EmptyStateActionProps {
  label: string;
  href?: string | undefined;
  onClick?: (() => void) | undefined;
}

export interface EmptyStateProps {
  icon?: LucideIcon | undefined;
  title: string;
  description?: string | undefined;
  /** Cor semântica do estado. @default "neutral" */
  tone?: "neutral" | "info" | "warning" | "danger" | undefined;
  action?: EmptyStateActionProps | undefined;
  secondaryAction?: EmptyStateActionProps | undefined;
  /** Reduz padding e tamanho do ícone para contextos compactos. @default false */
  compact?: boolean | undefined;
}

// ─── Helpers internos ────────────────────────────────────────────────────────

type ToneResolved = "neutral" | "info" | "warning" | "danger";

function toneColor(tone: ToneResolved): string {
  switch (tone) {
    case "info":
      return "var(--brand-ink)";
    case "warning":
      return "var(--gold)";
    case "danger":
      return "var(--danger)";
    case "neutral":
    default:
      return "var(--t-mid)";
  }
}

function toneBgColor(tone: ToneResolved): string {
  switch (tone) {
    case "info":
      return "color-mix(in srgb,var(--brand) 12%,var(--surface))";
    case "warning":
      return "color-mix(in srgb,var(--gold) 12%,var(--surface))";
    case "danger":
      return "color-mix(in srgb,var(--danger) 12%,var(--surface))";
    case "neutral":
    default:
      return "color-mix(in srgb,var(--t-mid) 8%,var(--surface))";
  }
}

// ─── Sub-componente de ação ───────────────────────────────────────────────────

interface ActionButtonProps {
  action: EmptyStateActionProps;
  variant: "primary" | "ghost";
}

function ActionButton({ action, variant }: ActionButtonProps) {
  const cls = `btn btn--${variant} btn--sm`;

  if (action.href !== undefined) {
    return (
      <a href={action.href} className={cls}>
        {action.label}
      </a>
    );
  }

  if (action.onClick !== undefined) {
    const handler = action.onClick;
    return (
      <button type="button" className={cls} onClick={handler}>
        {action.label}
      </button>
    );
  }

  // href e onClick ausentes: renderiza span inerte (edge case de dados incompletos)
  return (
    <span className={cls} aria-disabled="true" style={{ opacity: 0.5, cursor: "default" }}>
      {action.label}
    </span>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function EmptyState({
  icon: Icon,
  title,
  description,
  tone = "neutral",
  action,
  secondaryAction,
  compact = false,
}: EmptyStateProps) {
  const toneResolved: ToneResolved = tone;
  const color = toneColor(toneResolved);
  const iconBg = toneBgColor(toneResolved);

  const iconCircleSize = compact ? 36 : 44;
  const iconSize = compact ? 18 : 22;

  const containerStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: compact ? "20px 16px" : "32px 20px",
    gap: compact ? 10 : 14,
    width: "100%",
  };

  const hasActions = action !== undefined || secondaryAction !== undefined;

  return (
    <div style={containerStyle} role="status">
      {/* Círculo com ícone */}
      {Icon !== undefined && (
        <div
          aria-hidden="true"
          style={{
            width: iconCircleSize,
            height: iconCircleSize,
            borderRadius: "50%",
            background: iconBg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon size={iconSize} style={{ color }} aria-hidden="true" />
        </div>
      )}

      {/* Textos */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: compact ? 4 : 6,
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontSize: compact ? 14 : 15,
            fontWeight: 700,
            color: "var(--t-hi)",
            lineHeight: 1.3,
          }}
        >
          {title}
        </span>

        {description !== undefined && (
          <p
            style={{
              margin: 0,
              fontSize: compact ? 12.5 : 13,
              color: "var(--t-mid)",
              lineHeight: 1.5,
              maxWidth: "46ch",
            }}
          >
            {description}
          </p>
        )}
      </div>

      {/* Ações */}
      {hasActions && (
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            justifyContent: "center",
            marginTop: compact ? 2 : 4,
          }}
        >
          {action !== undefined && (
            <ActionButton action={action} variant="primary" />
          )}
          {secondaryAction !== undefined && (
            <ActionButton action={secondaryAction} variant="ghost" />
          )}
        </div>
      )}
    </div>
  );
}
