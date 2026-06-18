import type { KeyboardEvent } from "react";
import { Sparkles, Lock } from "lucide-react";
import type { ProductModule } from "@fonteia/domain";
import { navigateSpa } from "../app/_nav";

interface ModuleCardProps {
  module: ProductModule;
  selected?: boolean;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")} M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(".", ",")} mil`;
  return n.toLocaleString("pt-BR");
}

export function ModuleCard({ module, selected = false }: ModuleCardProps) {
  const isActive = module.status === "active";

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

  return (
    <article
      className={[
        "module-card",
        selected ? "selected" : "",
        isActive ? "module-card--active" : "module-card--locked",
      ]
        .filter(Boolean)
        .join(" ")}
      role={isActive ? "button" : undefined}
      tabIndex={isActive ? 0 : undefined}
      aria-label={isActive ? `Abrir módulo ${module.label}` : `Módulo ${module.label} não disponível`}
      onClick={isActive ? handleNavigate : undefined}
      onKeyDown={isActive ? handleKeyDown : undefined}
      style={{
        cursor: isActive ? "pointer" : "default",
        opacity: isActive ? 1 : 0.55,
        transition: "opacity .2s, box-shadow .2s, transform .15s",
      }}
    >
      <style>{`
        .module-card--active:hover,
        .module-card--active:focus-visible {
          box-shadow: 0 4px 20px color-mix(in srgb, var(--brand-ink) 14%, transparent);
          transform: translateY(-2px);
          outline: none;
        }
        .module-card--active:active {
          transform: translateY(0);
        }
      `}</style>

      {/* Head: status chip */}
      <div className="module-card-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
        <div className={isActive ? "module-icon active" : "module-icon"}>
          {isActive ? <Sparkles aria-hidden="true" size={18} /> : <Lock aria-hidden="true" size={17} />}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* Source badge */}
          {module.badge ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "2px 7px",
                borderRadius: 999,
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: ".04em",
                color: module.badgeColor ?? "var(--t-mid)",
                background: module.badgeColor
                  ? `color-mix(in srgb, ${module.badgeColor} 12%, var(--surface))`
                  : "var(--surface-2)",
                border: module.badgeColor
                  ? `1px solid color-mix(in srgb, ${module.badgeColor} 25%, transparent)`
                  : "1px solid var(--border)",
              }}
            >
              {module.badge}
            </span>
          ) : null}

          <span className={isActive ? "status-chip active" : "status-chip locked"}>
            {isActive ? "ativo" : "em breve"}
          </span>
        </div>
      </div>

      {/* Title */}
      <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700 }}>{module.label}</h3>

      {/* Promise */}
      <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--t-mid)", lineHeight: 1.45 }}>
        {module.promise}
      </p>

      {/* Record count */}
      {isActive && module.recordCount != null && module.recordCount > 0 ? (
        <div
          style={{
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: "-.025em",
            color: "var(--brand-ink)",
            marginBottom: 4,
          }}
        >
          {formatCount(module.recordCount)}
          <span
            style={{
              fontSize: 11.5,
              fontWeight: 600,
              color: "var(--t-mid)",
              marginLeft: 5,
              letterSpacing: 0,
            }}
          >
            registros
          </span>
        </div>
      ) : isActive ? (
        <div
          style={{
            fontSize: 12,
            color: "var(--t-mid)",
            marginBottom: 4,
          }}
        >
          Busca por CNPJ disponível
        </div>
      ) : null}

      {/* Persona */}
      <small
        style={{
          display: "block",
          fontSize: 11.5,
          color: "var(--t-low)",
          lineHeight: 1.4,
          marginBottom: isActive ? 14 : 0,
        }}
      >
        {module.targetPersona}
      </small>

      {/* CTA */}
      {isActive ? (
        <div
          style={{
            marginTop: "auto",
            paddingTop: 10,
            borderTop: "1px solid var(--border)",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <span
            style={{
              fontSize: 12.5,
              fontWeight: 700,
              color: "var(--brand-ink)",
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
            }}
          >
            Abrir módulo →
          </span>
        </div>
      ) : null}
    </article>
  );
}
