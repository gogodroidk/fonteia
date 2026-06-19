import { useState, type ReactNode } from "react";
import type { CamaraDeputado } from "@fonteia/sources";
import { ChevronLeft, ExternalLink, Mail } from "lucide-react";
import { FonteDots } from "../../components/ui";

// ─── Constants ───────────────────────────────────────────────────────────────

const FONTE_DOTS_CAMARA = [
  { sigla: "CD", cor: "#1F8A4C", nome: "Câmara dos Deputados — Dados Abertos" },
];

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DeputadoDetailPageProps {
  deputado: CamaraDeputado;
  onBack: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 12,
        fontWeight: 700,
        color: "var(--t-low)",
        textTransform: "uppercase",
        letterSpacing: "0.07em",
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  );
}

// ─── Info row: label + value ──────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="row between"
      style={{
        gap: 12,
        paddingTop: 10,
        paddingBottom: 10,
        borderBottom: "1px solid var(--border)",
        alignItems: "flex-start",
        flexWrap: "wrap",
      }}
    >
      <span className="tiny" style={{ color: "var(--t-low)", fontWeight: 600, flexShrink: 0 }}>
        {label}
      </span>
      <span
        className="tiny num"
        style={{ color: "var(--t-hi)", fontWeight: 700, textAlign: "right", wordBreak: "break-word" }}
      >
        {value || "—"}
      </span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DeputadoDetailPage({ deputado, onBack }: DeputadoDetailPageProps) {
  const [imgError, setImgError] = useState(false);

  const hasPhoto = deputado.foto !== "" && !imgError;
  const hasPartido = deputado.partido !== "";
  const hasUf = deputado.uf !== "";
  const hasEmail = deputado.email !== "";

  const camaraPerfilUrl = `https://www.camara.leg.br/deputados/${deputado.id}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 800 }}>
      {/* Voltar */}
      <button
        className="btn btn--ghost btn--sm"
        type="button"
        onClick={onBack}
        style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6 }}
      >
        <ChevronLeft size={16} aria-hidden="true" />
        Voltar a Política
      </button>

      {/* Hero */}
      <div className="panel" style={{ padding: "24px 28px" }}>
        <span className="eyebrow">Política — Câmara dos Deputados</span>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            marginTop: 16,
            flexWrap: "wrap",
          }}
        >
          {/* Avatar */}
          {hasPhoto ? (
            <img
              src={deputado.foto}
              alt=""
              onError={() => setImgError(true)}
              style={{
                width: 80,
                height: 80,
                borderRadius: "50%",
                objectFit: "cover",
                flexShrink: 0,
                border: "2px solid var(--border)",
                background: "var(--surface-2, var(--surface))",
              }}
            />
          ) : (
            <div
              aria-hidden="true"
              style={{
                width: 80,
                height: 80,
                borderRadius: "50%",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
                fontSize: 26,
                color: "var(--brand-ink)",
                background: "color-mix(in srgb, var(--brand-ink) 12%, var(--surface))",
                border: "2px solid var(--border)",
              }}
            >
              {initialsOf(deputado.nome)}
            </div>
          )}

          {/* Info */}
          <div style={{ minWidth: 0, flex: 1 }}>
            <h1
              style={{
                fontSize: 26,
                fontWeight: 800,
                margin: "0 0 10px",
                color: "var(--t-hi)",
                lineHeight: 1.2,
              }}
            >
              {deputado.nome || "Nome não informado"}
            </h1>
            <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {hasPartido && (
                <span className="badge badge--neutral" style={{ fontWeight: 700 }}>
                  {deputado.partido}
                </span>
              )}
              {hasUf && (
                <span className="badge badge--neutral">
                  {deputado.uf}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Contato */}
      {hasEmail && (
        <div className="panel" style={{ padding: "20px 24px" }}>
          <SectionLabel>Contato</SectionLabel>
          <a
            href={`mailto:${deputado.email}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontSize: 14,
              fontWeight: 600,
              color: "var(--brand-ink)",
              textDecoration: "none",
            }}
          >
            <Mail size={16} aria-hidden="true" />
            {deputado.email}
          </a>
        </div>
      )}

      {/* Identificação */}
      <div className="panel" style={{ padding: "20px 24px" }}>
        <SectionLabel>Identificação</SectionLabel>
        <InfoRow label="ID na Câmara" value={deputado.id} />
        <InfoRow label="Partido" value={deputado.partido || "Não informado"} />
        <InfoRow label="UF" value={deputado.uf || "Não informado"} />
        <div
          className="row between"
          style={{
            gap: 12,
            paddingTop: 10,
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <span className="tiny" style={{ color: "var(--t-low)", fontWeight: 600, flexShrink: 0 }}>
            Fonte
          </span>
          <span
            className="tiny"
            style={{ color: "var(--t-hi)", fontWeight: 700, textAlign: "right", wordBreak: "break-word" }}
          >
            {deputado.sourceId}
          </span>
        </div>
      </div>

      {/* Links oficiais */}
      <div className="panel" style={{ padding: "20px 24px" }}>
        <SectionLabel>Links oficiais</SectionLabel>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <FonteDots fontes={FONTE_DOTS_CAMARA} size={32} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--t-hi)" }}>
              Câmara dos Deputados — Dados Abertos
            </div>
            <div className="tiny muted" style={{ marginTop: 2 }}>
              dadosabertos.camara.leg.br
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <a
            href={camaraPerfilUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              fontWeight: 600,
              color: "var(--brand-ink)",
              textDecoration: "none",
            }}
          >
            <ExternalLink size={14} aria-hidden="true" />
            Ver perfil na Câmara
          </a>

          {deputado.foto !== "" && (
            <a
              href={deputado.foto}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13,
                fontWeight: 600,
                color: "var(--brand-ink)",
                textDecoration: "none",
              }}
            >
              <ExternalLink size={14} aria-hidden="true" />
              Ver foto oficial
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
