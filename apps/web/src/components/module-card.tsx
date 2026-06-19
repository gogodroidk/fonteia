import type { KeyboardEvent } from "react";
import {
  Gavel,
  FileSearch,
  Building2,
  Scale,
  BadgeCheck,
  Map,
  Landmark,
  MapPin,
  Braces,
} from "lucide-react";
import type { LucideProps } from "lucide-react";
import type { ProductModule } from "@fonteia/domain";
import { navigateSpa } from "../app/_nav";

/* ── icon registry ──────────────────────────────────────────────────────── */

type IconComponent = React.ComponentType<LucideProps>;

const ICON_MAP: Record<string, IconComponent> = {
  Gavel,
  FileSearch,
  Building2,
  Scale,
  BadgeCheck,
  Map,
  Landmark,
  MapPin,
  Braces,
};

function ModuleIcon({ name, size = 18 }: { name: string; size?: number }) {
  const Icon = ICON_MAP[name] ?? Braces;
  return <Icon size={size} aria-hidden="true" />;
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")} M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(".", ",")} mil`;
  return n.toLocaleString("pt-BR");
}

/* ── types ───────────────────────────────────────────────────────────────── */

export interface ModuleCardProps {
  module: ProductModule;
  selected?: boolean;
  /** Example question in plain pt-BR that the module can answer. */
  exampleQuestion?: string | undefined;
  /** CSS animation-delay for staggered entrance (e.g. "110ms"). */
  entranceDelay?: string | undefined;
}

/* ── card styles injected once ───────────────────────────────────────────── */

const MODULE_CARD_STYLES = `
  .module-card--active:hover,
  .module-card--active:focus-visible {
    box-shadow: 0 6px 24px color-mix(in srgb, var(--brand-ink) 16%, transparent);
    transform: translateY(-3px);
  }
  .module-card--active:active {
    transform: translateY(0);
  }
  .module-card--locked {
    opacity: 0.55;
  }
  .module-card__icon-wrap {
    width: 38px;
    height: 38px;
    border-radius: var(--r-md);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: var(--surface-2);
    color: var(--t-low);
    transition: background .2s, color .2s;
  }
  .module-card--active .module-card__icon-wrap {
    background: color-mix(in srgb, var(--brand) 12%, var(--surface));
    color: var(--brand-ink);
  }
  .module-card__question {
    font-size: 12px;
    color: var(--t-mid);
    background: var(--surface-2);
    border-left: 2px solid var(--border-2);
    border-radius: 0 var(--r-sm) var(--r-sm) 0;
    padding: 7px 10px;
    line-height: 1.45;
    margin: 0;
    font-style: italic;
  }
  [data-theme="dark"] .module-card__question {
    border-left-color: color-mix(in srgb, var(--brand-ink) 35%, transparent);
  }
  .module-card__cta {
    font-size: 12.5px;
    font-weight: 700;
    color: var(--brand-ink);
    display: inline-flex;
    align-items: center;
    gap: 4px;
    transition: gap .15s;
  }
  .module-card--active:hover .module-card__cta {
    gap: 7px;
  }
  @media (prefers-reduced-motion: reduce) {
    .module-card--active:hover,
    .module-card--active:focus-visible {
      transform: none;
    }
    .module-card--active:hover .module-card__cta {
      gap: 4px;
    }
  }
`;

let _stylesInjected = false;
function ensureStyles() {
  if (_stylesInjected || typeof document === "undefined") return;
  const el = document.createElement("style");
  el.dataset["moduleCard"] = "1";
  el.textContent = MODULE_CARD_STYLES;
  document.head.appendChild(el);
  _stylesInjected = true;
}

/* ── component ───────────────────────────────────────────────────────────── */

export function ModuleCard({
  module,
  selected = false,
  exampleQuestion,
  entranceDelay,
}: ModuleCardProps) {
  const isActive = module.status === "active";

  // inject shared styles once into the document head (SSG-safe: guard on typeof document)
  ensureStyles();

  function handleNavigate() {
    if (!isActive) return;
    navigateSpa(`/app${module.route}`);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleNavigate();
    }
  }

  const showCount = isActive && module.recordCount != null && module.recordCount > 0;
  const showOnDemand = isActive && (module.recordCount == null || module.recordCount === 0);

  return (
    <article
      className={[
        "card",
        "module-card",
        "rise-in",
        selected ? "selected" : "",
        isActive ? "module-card--active" : "module-card--locked",
      ]
        .filter(Boolean)
        .join(" ")}
      role={isActive ? "button" : undefined}
      tabIndex={isActive ? 0 : undefined}
      aria-label={
        isActive ? `Abrir módulo ${module.label}` : `Módulo ${module.label} — em breve`
      }
      onClick={isActive ? handleNavigate : undefined}
      onKeyDown={isActive ? handleKeyDown : undefined}
      style={{
        cursor: isActive ? "pointer" : "default",
        transition: "opacity .2s, box-shadow .25s cubic-bezier(.2,.7,.3,1), transform .2s cubic-bezier(.2,.7,.3,1), border-color .2s",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: 18,
        animationDelay: entranceDelay ?? "0ms",
      }}
    >
      {/* Row: icon + badges */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div className="module-card__icon-wrap">
          <ModuleIcon name={module.icon} size={18} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {module.badge != null ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "2px 7px",
                borderRadius: 999,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: ".05em",
                color: module.badgeColor ?? "var(--t-mid)",
                background: module.badgeColor
                  ? `color-mix(in srgb, ${module.badgeColor} 12%, var(--surface))`
                  : "var(--surface-2)",
                border: module.badgeColor
                  ? `1px solid color-mix(in srgb, ${module.badgeColor} 28%, transparent)`
                  : "1px solid var(--border)",
              }}
            >
              {module.badge}
            </span>
          ) : null}

          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "2px 8px",
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: ".04em",
              background: isActive
                ? "color-mix(in srgb, var(--ok) 14%, transparent)"
                : "var(--surface-2)",
              color: isActive ? "var(--ok)" : "var(--t-low)",
              border: isActive
                ? "1px solid color-mix(in srgb, var(--ok) 25%, transparent)"
                : "1px solid var(--border)",
            }}
          >
            {isActive ? "ativo" : "em breve"}
          </span>
        </div>
      </div>

      {/* Title */}
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, lineHeight: 1.2, color: "var(--t-hi)" }}>
        {module.label}
      </h3>

      {/* Promise — plain language what it does */}
      <p style={{ margin: 0, fontSize: 13, color: "var(--t-mid)", lineHeight: 1.5 }}>
        {module.promise}
      </p>

      {/* Example question */}
      {exampleQuestion != null && isActive ? (
        <p className="module-card__question">"{exampleQuestion}"</p>
      ) : null}

      {/* Record count or on-demand label */}
      {showCount && module.recordCount != null ? (
        <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
          <span
            style={{
              fontSize: 20,
              fontWeight: 800,
              letterSpacing: "-.02em",
              color: "var(--brand-ink)",
            }}
          >
            {formatCount(module.recordCount)}
          </span>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--t-low)" }}>
            registros indexados
          </span>
        </div>
      ) : showOnDemand ? (
        <span style={{ fontSize: 12, color: "var(--t-low)" }}>consulta sob demanda</span>
      ) : null}

      {/* Persona */}
      <p
        style={{
          margin: 0,
          fontSize: 11.5,
          color: "var(--t-low)",
          lineHeight: 1.4,
          flexGrow: 1,
        }}
      >
        {module.targetPersona}
      </p>

      {/* CTA */}
      {isActive ? (
        <div
          style={{
            paddingTop: 10,
            borderTop: "1px solid var(--border)",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <span className="module-card__cta" aria-hidden="true">
            Abrir <span>→</span>
          </span>
        </div>
      ) : null}
    </article>
  );
}
