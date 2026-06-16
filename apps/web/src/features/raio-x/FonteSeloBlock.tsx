/**
 * FonteSeloBlock — bloco de cabeçalho de seção com fonte, data de coleta e confiança.
 *
 * Componente novo, específico do Raio-X. Reutilizável por qualquer relatório futuro.
 */
import type { ReactNode } from "react";
import { FonteDots } from "../../components/ui";
import type { FonteItem } from "../../components/ui";

export type ConfiancaLevel = "alta" | "media" | "baixa";

export interface FonteSeloBlockProps {
  /** Título da seção. */
  titulo: string;
  /** Ícone opcional ao lado do título. */
  icone?: ReactNode;
  /** Fontes de dados (para os FonteDots). */
  fontes: FonteItem[];
  /** Data/hora da coleta em ISO ou string legível. */
  dataColeta: string;
  /** Nível de confiança da fonte. */
  confianca: ConfiancaLevel;
  /** Filhos: conteúdo da seção. */
  children: ReactNode;
  /** Classe extra para o wrapper externo. */
  className?: string;
}

const CONFIANCA_MAP: Record<ConfiancaLevel, { label: string; color: string; bg: string }> = {
  alta: { label: "Confiança alta", color: "var(--ok)", bg: "color-mix(in srgb, var(--ok) 14%, var(--surface))" },
  media: { label: "Confiança média", color: "var(--warn)", bg: "color-mix(in srgb, var(--warn) 14%, var(--surface))" },
  baixa: { label: "Confiança baixa", color: "var(--danger)", bg: "color-mix(in srgb, var(--danger) 14%, var(--surface))" },
};

function formatDataColeta(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function FonteSeloBlock({
  titulo,
  icone,
  fontes,
  dataColeta,
  confianca,
  children,
  className,
}: FonteSeloBlockProps) {
  const conf = CONFIANCA_MAP[confianca];

  return (
    <section className={`panel${className ? ` ${className}` : ""}`} style={{ padding: 0, overflow: "hidden" }}>
      {/* Cabeçalho da seção */}
      <div
        className="row between wrap"
        style={{
          padding: "14px 18px 12px",
          gap: 10,
          borderBottom: "1px solid var(--border)",
          background: "var(--surface-2)",
        }}
      >
        {/* Título + ícone */}
        <div className="row" style={{ gap: 8, alignItems: "center", minWidth: 0 }}>
          {icone && (
            <span
              style={{
                color: "var(--brand-ink)",
                display: "flex",
                alignItems: "center",
                flexShrink: 0,
              }}
              aria-hidden="true"
            >
              {icone}
            </span>
          )}
          <span
            style={{
              fontSize: 13.5,
              fontWeight: 800,
              color: "var(--t-hi)",
              letterSpacing: "-0.01em",
            }}
          >
            {titulo}
          </span>
        </div>

        {/* Selos: confiança + data + fontes */}
        <div className="row wrap" style={{ gap: 8, alignItems: "center", flexShrink: 0 }}>
          {/* Badge de confiança */}
          <span
            className="badge"
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: conf.color,
              background: conf.bg,
              border: `1px solid color-mix(in srgb, ${conf.color} 28%, transparent)`,
              borderRadius: 6,
            }}
          >
            {conf.label}
          </span>

          {/* Data da coleta */}
          <span
            className="tiny muted num"
            title="Data da coleta dos dados"
            style={{ whiteSpace: "nowrap" }}
          >
            Coletado em {formatDataColeta(dataColeta)}
          </span>

          {/* FonteDots */}
          <FonteDots fontes={fontes} size={22} />
        </div>
      </div>

      {/* Conteúdo da seção */}
      <div style={{ padding: "16px 18px 18px" }}>{children}</div>
    </section>
  );
}
