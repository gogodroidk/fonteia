/**
 * EntityReport.tsx
 * Presentational, print-friendly report view for a SavedReport.
 * Screen: dark/light safe. Print (@media print): always light, document layout.
 * Provides: export-CSV action, print button.
 * Mobile-first, reduced-motion safe, WCAG AA.
 */

import { Download, ExternalLink, Printer } from "lucide-react";
import type { SavedReport } from "../../features/reports/reports-store";
import { LogoMark } from "../ui/logo-mark";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface EntityReportProps {
  report: SavedReport;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

function buildCsv(report: SavedReport): string {
  const header = "Campo,Valor\n";
  const rows = report.fields
    .map((f) => `"${f.label.replace(/"/g, '""')}","${f.value.replace(/"/g, '""')}"`)
    .join("\n");
  const sourcesHeader = "\n\nFonte,URL,Coletado em\n";
  const sourceRows = report.sources
    .map(
      (s) =>
        `"${s.label.replace(/"/g, '""')}","${(s.url ?? "").replace(/"/g, '""')}","${(s.collectedAt ?? "").replace(/"/g, '""')}"`,
    )
    .join("\n");
  return header + rows + sourcesHeader + sourceRows;
}

function downloadCsv(report: SavedReport): void {
  if (typeof window === "undefined") return;
  const csv = buildCsv(report);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `fonteia-relatorio-${report.id.replace(/[^a-z0-9-]/gi, "_")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FieldTable({ fields }: { fields: SavedReport["fields"] }) {
  if (fields.length === 0) return null;
  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontFamily: "inherit",
          fontSize: 14,
        }}
      >
        <tbody>
          {fields.map((f, i) => (
            <tr
              key={f.label}
              style={{ borderTop: i !== 0 ? "1px solid var(--border)" : undefined }}
            >
              <td
                style={{
                  padding: "10px 16px 10px 0",
                  color: "var(--t-low)",
                  fontWeight: 600,
                  fontSize: 12,
                  letterSpacing: ".05em",
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                  width: "36%",
                  verticalAlign: "top",
                }}
              >
                {f.label}
              </td>
              <td
                style={{
                  padding: "10px 0",
                  color: "var(--t-hi)",
                  fontWeight: 500,
                  wordBreak: "break-word",
                }}
              >
                {f.value || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SourcesList({ sources }: { sources: SavedReport["sources"] }) {
  if (sources.length === 0) return null;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {sources.map((s) => (
        <div
          key={s.label}
          className="row wrap"
          style={{
            gap: 10,
            padding: "12px 14px",
            background: "var(--surface-2)",
            borderRadius: "var(--r-md)",
            border: "1px solid var(--border)",
            alignItems: "flex-start",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: "var(--t-hi)" }}>{s.label}</div>
            {s.url !== undefined && (
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="row"
                style={{
                  gap: 4,
                  marginTop: 3,
                  fontSize: 11.5,
                  color: "var(--brand-ink)",
                  textDecoration: "none",
                  wordBreak: "break-all",
                }}
              >
                <ExternalLink size={11} aria-hidden="true" style={{ flexShrink: 0 }} />
                {s.url}
              </a>
            )}
          </div>
          {s.collectedAt !== undefined && (
            <div
              style={{
                fontSize: 11,
                color: "var(--t-low)",
                fontWeight: 600,
                letterSpacing: ".04em",
                whiteSpace: "nowrap",
                marginTop: 2,
              }}
            >
              Coletado: {formatDate(s.collectedAt)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function EntityReport({ report }: EntityReportProps) {
  const generatedAt = formatDate(report.createdAt);

  return (
    <>
      {/* ── Screen view ─────────────────────────────────────────────────────── */}
      <div
        className="panel"
        style={{ overflow: "hidden" }}
        aria-label={`Relatório: ${report.title}`}
      >
        {/* Header bar */}
        <div
          className="row between wrap"
          style={{
            padding: "16px 22px",
            borderBottom: "1px solid var(--border)",
            gap: 12,
          }}
        >
          <div className="row" style={{ gap: 10 }}>
            <div
              style={{
                color: "var(--brand-ink)",
                display: "flex",
                alignItems: "center",
                flexShrink: 0,
              }}
            >
              <LogoMark size={22} />
            </div>
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: ".1em",
                  textTransform: "uppercase",
                  color: "var(--accent-ink)",
                }}
              >
                Fonte.ia — Relatório
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--t-low)",
                  marginTop: 1,
                }}
              >
                {report.kindLabel} · Gerado em {generatedAt}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="row no-print" style={{ gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => downloadCsv(report)}
              title="Exportar CSV"
            >
              <Download size={13} aria-hidden="true" />
              CSV
            </button>
            <button
              type="button"
              className="btn btn--soft btn--sm"
              onClick={() => window.print()}
              title="Imprimir / salvar como PDF"
            >
              <Printer size={13} aria-hidden="true" />
              Imprimir PDF
            </button>
          </div>
        </div>

        {/* Kind badge + title */}
        <div style={{ padding: "20px 22px 0" }}>
          <span className="badge badge--info" style={{ marginBottom: 10 }}>
            {report.kindLabel}
          </span>
          <h2
            style={{
              margin: "0 0 4px",
              fontSize: 20,
              fontWeight: 800,
              letterSpacing: "-.02em",
              color: "var(--t-hi)",
              lineHeight: 1.2,
              wordBreak: "break-word",
            }}
          >
            {report.title}
          </h2>
          {report.subtitle !== undefined && (
            <div style={{ fontSize: 13, color: "var(--t-mid)", marginBottom: 4 }}>
              {report.subtitle}
            </div>
          )}
        </div>

        {/* Fields */}
        {report.fields.length > 0 && (
          <div style={{ padding: "16px 22px" }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: ".1em",
                textTransform: "uppercase",
                color: "var(--t-low)",
                marginBottom: 10,
              }}
            >
              Dados do relatório
            </div>
            <FieldTable fields={report.fields} />
          </div>
        )}

        {/* Sources */}
        {report.sources.length > 0 && (
          <div
            style={{
              padding: "16px 22px 22px",
              borderTop: "1px solid var(--border)",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: ".1em",
                textTransform: "uppercase",
                color: "var(--t-low)",
                marginBottom: 10,
              }}
            >
              Fontes (rastreabilidade)
            </div>
            <SourcesList sources={report.sources} />
          </div>
        )}
      </div>

      {/* ── Print-only document ──────────────────────────────────────────────
          Rendered but hidden on screen; @media print shows it and hides the
          rest of the app via the rules in design-system.css (.app-root hidden,
          .print-report displayed).
      ──────────────────────────────────────────────────────────────────────── */}
      <div className="print-report" aria-hidden="true">
        <div className="report-header">
          <div>
            <div className="report-title">Fonte.ia — {report.kindLabel}</div>
            <div className="report-sub">
              {report.title}
              {report.subtitle !== undefined ? ` · ${report.subtitle}` : ""}
            </div>
          </div>
          <div className="report-sub" style={{ textAlign: "right" }}>
            Gerado em: {generatedAt}
          </div>
        </div>

        {report.fields.length > 0 && (
          <div className="report-section">
            <div className="report-section-title">Dados</div>
            {report.fields.map((f) => (
              <div key={f.label} className="report-row">
                <span>{f.label}</span>
                <b>{f.value || "—"}</b>
              </div>
            ))}
          </div>
        )}

        {report.sources.length > 0 && (
          <div className="report-section">
            <div className="report-section-title">Fontes (rastreabilidade)</div>
            {report.sources.map((s) => (
              <div key={s.label} className="report-row" style={{ flexDirection: "column", gap: 2 }}>
                <b>{s.label}</b>
                {s.url !== undefined && (
                  <span style={{ fontSize: "8pt", color: "#5A6B82", wordBreak: "break-all" }}>
                    {s.url}
                  </span>
                )}
                {s.collectedAt !== undefined && (
                  <span style={{ fontSize: "8pt", color: "#9AA8BC" }}>
                    Coletado: {formatDate(s.collectedAt)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="report-footer">
          <span>fontebrasil.online</span>
          <span>Fonte.ia — dados públicos com rastreabilidade</span>
          <span>ID: {report.id}</span>
        </div>
      </div>
    </>
  );
}
