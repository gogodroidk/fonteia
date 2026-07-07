/**
 * HeaderCard.tsx — cabeçalho do Raio-X 360°: razão social, CNAE, situação,
 * nº de sócios + chips de contagem por seção (clicáveis, rolam até a seção).
 */

import { Building2, Users } from "lucide-react";
import { formatCnpj } from "./raiox-api";
import type { DossieHeader, DossieSections, SectionKey } from "./types";
import { SECTION_ORDER } from "./types";

function situacaoTone(situacao: string): { className: string } {
  const s = situacao.toUpperCase();
  if (s.includes("ATIVA")) return { className: "badge--ok" };
  if (s.includes("SUSPENSA") || s.includes("INAPTA")) return { className: "badge--warn" };
  if (s.includes("BAIXADA") || s.includes("NULA")) return { className: "badge--danger" };
  return { className: "badge--neutral" };
}

export interface HeaderCardProps {
  cnpj: string;
  header: DossieHeader;
  sections: DossieSections;
  onJumpToSection: (key: SectionKey) => void;
}

export function HeaderCard({ cnpj, header, sections, onJumpToSection }: HeaderCardProps) {
  const tone = situacaoTone(header.situacao);
  const nSocios = header.qsa.length;

  return (
    <section className="panel" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }} aria-label="Dados da empresa">
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <span
          aria-hidden="true"
          style={{
            width: 42,
            height: 42,
            borderRadius: "var(--r-md)",
            background: "color-mix(in srgb,var(--brand) 12%,var(--surface))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Building2 size={20} style={{ color: "var(--brand-ink)" }} aria-hidden="true" />
        </span>
        <div style={{ minWidth: 0, flex: "1 1 240px" }}>
          <h1
            className="h2"
            style={{
              fontSize: "clamp(17px,4vw,22px)",
              overflowWrap: "break-word",
            }}
          >
            {header.razaoSocial || "Empresa não identificada"}
          </h1>
          <p className="tiny muted" style={{ margin: "4px 0 0" }}>
            {formatCnpj(cnpj)}
          </p>
        </div>
        <span className={`badge ${tone.className}`} style={{ flexShrink: 0 }}>
          {header.situacao || "Situação desconhecida"}
        </span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {header.cnae !== "" && (
          <span className="inset tiny" style={{ padding: "6px 10px", color: "var(--t-mid)" }}>
            {header.cnae}
          </span>
        )}
        <span
          className="inset tiny"
          style={{ padding: "6px 10px", color: "var(--t-mid)", display: "inline-flex", alignItems: "center", gap: 5 }}
        >
          <Users size={13} aria-hidden="true" />
          {nSocios} {nSocios === 1 ? "sócio" : "sócios"}
        </span>
      </div>

      {/* Chips de contagem por seção — rolam até a seção correspondente */}
      <nav aria-label="Ir para seção" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {SECTION_ORDER.map(({ key, chipLabel }) => {
          const section = sections[key];
          const count = section?.total ?? 0;
          return (
            <button
              key={key}
              type="button"
              className="chip"
              onClick={() => onJumpToSection(key)}
              style={{ fontSize: 12.5, padding: "6px 11px" }}
            >
              {chipLabel}
              <span
                style={{
                  fontWeight: 700,
                  color: count > 0 ? "var(--t-hi)" : "var(--t-low)",
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </nav>
    </section>
  );
}
