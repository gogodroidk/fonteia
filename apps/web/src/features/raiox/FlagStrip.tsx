/**
 * FlagStrip.tsx — faixa de red flags do Raio-X 360° (acima da dobra).
 *
 * Semáforo por severidade (alta=vermelho/--danger, media=âmbar/--warn,
 * baixa=verde/--ok). Quando `flag.locked === true` (plano free), o texto some
 * (o servidor já não manda `explicacao`) e o card mostra um borrão + cadeado
 * com CTA "Assine para ver os alertas" — o corte real é do servidor, isto é
 * só apresentação.
 */

import { Lock, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import type { DossieFlag, Severity } from "./types";

function severityColor(sev: Severity): string {
  if (sev === "alta") return "var(--danger)";
  if (sev === "media") return "var(--warn)";
  return "var(--ok)";
}

function severityBg(sev: Severity): string {
  if (sev === "alta") return "color-mix(in srgb,var(--danger) 14%,var(--surface))";
  if (sev === "media") return "color-mix(in srgb,var(--warn) 14%,var(--surface))";
  return "color-mix(in srgb,var(--ok) 14%,var(--surface))";
}

function SeverityIcon({ severity }: { severity: Severity }) {
  const color = severityColor(severity);
  if (severity === "alta") return <ShieldAlert size={17} style={{ color }} aria-hidden="true" />;
  if (severity === "media") return <ShieldQuestion size={17} style={{ color }} aria-hidden="true" />;
  return <ShieldCheck size={17} style={{ color }} aria-hidden="true" />;
}

interface FlagCardProps {
  flag: DossieFlag;
  onUpgrade: () => void;
}

function FlagCard({ flag, onUpgrade }: FlagCardProps) {
  const color = severityColor(flag.severity);
  const bg = severityBg(flag.severity);

  return (
    <li
      className="inset"
      style={{
        position: "relative",
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        minWidth: 220,
        flex: "1 1 240px",
        borderColor: `color-mix(in srgb,${color} 35%,var(--border))`,
        background: bg,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <SeverityIcon severity={flag.severity} />
        <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--t-hi)" }}>{flag.titulo}</span>
      </div>

      {flag.locked ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Borrão: texto placeholder ilegível que sugere conteúdo sem revelar nada */}
          <div
            aria-hidden="true"
            style={{
              filter: "blur(4px)",
              userSelect: "none",
              fontSize: 12.5,
              color: "var(--t-low)",
              lineHeight: 1.4,
            }}
          >
            Consta um alerta detalhado sobre este ponto, com explicação completa e fonte oficial vinculada.
          </div>
          <button
            type="button"
            className="btn btn--sm"
            onClick={onUpgrade}
            style={{
              alignSelf: "flex-start",
              gap: 6,
              background: "color-mix(in srgb,var(--accent) 16%,transparent)",
              color: "var(--accent-ink)",
              border: "1px solid color-mix(in srgb,var(--accent) 35%,transparent)",
              fontWeight: 700,
            }}
          >
            <Lock size={13} aria-hidden="true" />
            Assine para ver os alertas
          </button>
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--t-mid)", lineHeight: 1.4 }}>
          {flag.explicacao}
        </p>
      )}
    </li>
  );
}

export interface FlagStripProps {
  flags: DossieFlag[];
  onUpgrade: () => void;
}

export function FlagStrip({ flags, onUpgrade }: FlagStripProps) {
  if (flags.length === 0) {
    return (
      <div
        className="inset"
        role="status"
        style={{
          padding: "12px 14px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          borderColor: "color-mix(in srgb,var(--ok) 35%,var(--border))",
        }}
      >
        <ShieldCheck size={17} style={{ color: "var(--ok)" }} aria-hidden="true" />
        <span style={{ fontSize: 13, color: "var(--t-mid)" }}>
          Nenhum alerta identificado nas fontes consultadas.
        </span>
      </div>
    );
  }

  return (
    <ul
      aria-label="Alertas de risco"
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
      }}
    >
      {flags.map((flag) => (
        <FlagCard key={flag.id} flag={flag} onUpgrade={onUpgrade} />
      ))}
    </ul>
  );
}
