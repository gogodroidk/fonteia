/**
 * EntityReport.tsx
 * Presentational, print-friendly report view for a SavedReport.
 *
 * Screen: dark/light safe via CSS custom property tokens.
 * Print (@media print): always light, A4 document layout with brand header
 * and auditable sources footer. Scoped under .er-doc to avoid conflicts.
 *
 * Mobile-first, reduced-motion safe, WCAG AA.
 */

import { Download, ExternalLink, Printer, ShieldCheck } from "lucide-react";
import type { SavedReport } from "../../features/reports/reports-store";
import { LogoMark } from "../ui/logo-mark";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface EntityReportProps {
  report: SavedReport;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Format ISO date → "DD de mês de AAAA" */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

/** Format ISO date+time → "DD/MM/AAAA HH:mm" */
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16).replace("T", " ");
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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

// ─── Print CSS (scoped to .er-doc) ───────────────────────────────────────────
//
// Injected via <style> so it is co-located with the component and does not
// require changes to design-system.css. Scoped to .er-doc to avoid
// conflicting with the existing .print-report / .report-* rules.
//
// Rules:
//  - A4 margins (20mm sides, 16mm top/bottom)
//  - Force light theme: white background, near-black text
//  - page-break-inside: avoid on every section block
//  - Hide all app chrome; show only .er-print-doc
//  - Optimise for ink: no heavy shadows, no decorative gradients

const PRINT_STYLES = `
/* Screen: hide print-only document */
.er-print-doc {
  display: none;
}

@media print {
  /* Hide everything except the print document */
  body > *:not(.er-print-root),
  .app-root,
  .chat-panel,
  .sidebar-nav,
  .no-print {
    display: none !important;
  }

  /* Show the print-only container */
  .er-print-doc {
    display: block !important;
  }

  /* A4 page setup */
  @page {
    size: A4 portrait;
    margin: 16mm 20mm;
  }

  /* Force light colour regardless of system/app dark mode */
  html, body {
    background: #ffffff !important;
    color: #0B2240 !important;
    font-family: 'Figtree', 'Figtree Variable', system-ui, sans-serif;
    font-size: 10.5pt;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ── Document root ── */
  .er-print-doc {
    background: #ffffff !important;
    color: #0B2240 !important;
    max-width: 100%;
    font-size: 10.5pt;
    line-height: 1.55;
  }

  /* ── Brand header ── */
  .er-print-header {
    display: flex !important;
    align-items: flex-start;
    justify-content: space-between;
    padding-bottom: 10pt;
    border-bottom: 2pt solid #0B2240;
    margin-bottom: 14pt;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .er-print-logo-row {
    display: flex !important;
    align-items: center;
    gap: 8pt;
  }
  .er-print-logo-svg {
    color: #1D5FE0;
    flex-shrink: 0;
  }
  .er-print-brand-name {
    font-size: 15pt;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: #0B2240;
    line-height: 1;
  }
  .er-print-brand-sub {
    font-size: 7.5pt;
    color: #5A6B82;
    margin-top: 2pt;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    font-weight: 600;
  }
  .er-print-meta {
    text-align: right;
    font-size: 8pt;
    color: #5A6B82;
    line-height: 1.6;
  }
  .er-print-meta strong {
    color: #0B2240;
    font-weight: 700;
  }

  /* ── Entity title block ── */
  .er-print-title-block {
    margin-bottom: 14pt;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .er-print-kind-label {
    font-size: 7.5pt;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #1D5FE0;
    margin-bottom: 3pt;
  }
  .er-print-entity-name {
    font-size: 16pt;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: #0B2240;
    line-height: 1.2;
    margin: 0 0 3pt;
  }
  .er-print-subtitle {
    font-size: 9pt;
    color: #5A6B82;
  }

  /* ── Trust note ── */
  .er-print-trust {
    display: flex !important;
    align-items: center;
    gap: 5pt;
    background: #EEF4FF;
    border: 0.5pt solid #C5D7F5;
    border-radius: 4pt;
    padding: 5pt 8pt;
    font-size: 8pt;
    color: #1D5FE0;
    font-weight: 600;
    margin-bottom: 14pt;
    page-break-inside: avoid;
    break-inside: avoid;
  }

  /* ── Sections ── */
  .er-print-section {
    margin-bottom: 14pt;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .er-print-section-title {
    font-size: 8pt;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #0B2240;
    border-bottom: 0.5pt solid #D7E0EC;
    padding-bottom: 3pt;
    margin-bottom: 7pt;
  }

  /* ── Field rows ── */
  .er-print-field-row {
    display: flex !important;
    justify-content: space-between;
    align-items: baseline;
    padding: 3pt 0;
    border-bottom: 0.5pt solid #F2F4F8;
    gap: 12pt;
    font-size: 9.5pt;
  }
  .er-print-field-label {
    color: #5A6B82;
    font-size: 8pt;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    flex-shrink: 0;
    width: 36%;
  }
  .er-print-field-value {
    color: #0B2240;
    font-weight: 600;
    word-break: break-word;
    text-align: right;
    flex: 1;
  }

  /* ── Source entries ── */
  .er-print-source-entry {
    padding: 5pt 0;
    border-bottom: 0.5pt solid #F2F4F8;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .er-print-source-name {
    font-weight: 700;
    font-size: 9pt;
    color: #0B2240;
    margin-bottom: 1pt;
  }
  .er-print-source-url {
    font-size: 7pt;
    color: #5A6B82;
    word-break: break-all;
  }
  .er-print-source-meta {
    font-size: 7.5pt;
    color: #8A9BB0;
    margin-top: 1pt;
    display: flex !important;
    gap: 12pt;
    flex-wrap: wrap;
  }
  .er-print-hash {
    font-family: 'Courier New', monospace;
    font-size: 7pt;
    color: #8A9BB0;
    letter-spacing: 0.02em;
  }

  /* ── Footer ── */
  .er-print-footer {
    margin-top: 16pt;
    padding-top: 7pt;
    border-top: 1pt solid #D7E0EC;
    display: flex !important;
    justify-content: space-between;
    align-items: flex-start;
    font-size: 7.5pt;
    color: #8A9BB0;
    gap: 8pt;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .er-print-footer-left {
    line-height: 1.5;
  }
  .er-print-footer-right {
    text-align: right;
    line-height: 1.5;
    flex-shrink: 0;
  }
  .er-print-footer strong {
    color: #5A6B82;
  }
}
`;

// ─── Sub-components (screen) ──────────────────────────────────────────────────

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
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
            <div style={{ fontWeight: 700, fontSize: 13, color: "var(--t-hi)" }}>{s.label}</div>
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
            {s.collectedAt !== undefined && (
              <div
                style={{
                  fontSize: 11,
                  color: "var(--t-low)",
                  fontWeight: 600,
                  marginTop: 4,
                  letterSpacing: ".04em",
                }}
              >
                Coletado em: {formatDate(s.collectedAt)}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Print-only document sub-components ──────────────────────────────────────

function PrintSourceEntry({ s }: { s: SavedReport["sources"][number] }) {
  return (
    <div className="er-print-source-entry">
      <div className="er-print-source-name">{s.label}</div>
      {s.url !== undefined && (
        <div className="er-print-source-url">{s.url}</div>
      )}
      <div className="er-print-source-meta">
        {s.collectedAt !== undefined && (
          <span>Coletado: {formatDate(s.collectedAt)}</span>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function EntityReport({ report }: EntityReportProps) {
  const generatedAt = formatDate(report.createdAt);
  const generatedAtFull = formatDateTime(report.createdAt);

  return (
    <>
      {/* Inject scoped print CSS once per mount */}
      <style>{PRINT_STYLES}</style>

      {/* ── Screen view ───────────────────────────────────────────────────────
          Shown on screen (light + dark). Hidden during @media print via
          .app-root display:none in design-system.css and the er-print-doc rule.
      ─────────────────────────────────────────────────────────────────────── */}
      <div
        className="panel"
        style={{ overflow: "hidden" }}
        aria-label={`Relatório de Due Diligence: ${report.title}`}
      >
        {/* ── Document header bar ── */}
        <div
          className="row between wrap no-print"
          style={{
            padding: "16px 22px",
            borderBottom: "1px solid var(--border)",
            gap: 12,
          }}
        >
          {/* Brand identity */}
          <div className="row" style={{ gap: 10 }}>
            <div
              style={{
                color: "var(--brand-ink)",
                display: "flex",
                alignItems: "center",
                flexShrink: 0,
              }}
            >
              <LogoMark size={24} />
            </div>
            <div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 800,
                  letterSpacing: "-.01em",
                  color: "var(--brand-ink)",
                  lineHeight: 1,
                }}
              >
                Fonte.ia
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: ".06em",
                  textTransform: "uppercase",
                  color: "var(--t-low)",
                  marginTop: 2,
                }}
              >
                Relatório de Due Diligence
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => downloadCsv(report)}
              title="Exportar dados em CSV"
              aria-label="Exportar dados em CSV"
            >
              <Download size={13} aria-hidden="true" />
              CSV
            </button>
            <button
              type="button"
              className="btn btn--soft btn--sm"
              onClick={() => window.print()}
              title="Exportar como PDF via impressao"
              aria-label="Exportar relatório como PDF"
            >
              <Printer size={13} aria-hidden="true" />
              Exportar PDF
            </button>
          </div>
        </div>

        {/* ── Document identity + trust note ── */}
        <div style={{ padding: "20px 22px 0" }}>
          {/* Kind + generation timestamp */}
          <div
            className="row wrap"
            style={{ gap: 8, marginBottom: 12, alignItems: "center" }}
          >
            <span className="badge badge--info">{report.kindLabel}</span>
            <span
              style={{
                fontSize: 11,
                color: "var(--t-low)",
                fontWeight: 600,
                letterSpacing: ".03em",
              }}
            >
              Gerado em {generatedAtFull}
            </span>
          </div>

          {/* Entity title */}
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

          {/* Trust note */}
          <div
            className="row"
            style={{
              gap: 7,
              marginTop: 14,
              marginBottom: 4,
              padding: "9px 13px",
              background: "color-mix(in srgb, var(--brand) 8%, var(--surface-2))",
              borderRadius: "var(--r-md)",
              border: "1px solid color-mix(in srgb, var(--brand) 20%, var(--border))",
            }}
          >
            <ShieldCheck
              size={14}
              aria-hidden="true"
              style={{ color: "var(--brand-ink)", flexShrink: 0 }}
            />
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--brand-ink)",
                letterSpacing: ".01em",
              }}
            >
              Documento rastreavel — cada dado cita a fonte oficial
            </span>
          </div>
        </div>

        {/* ── Fields ── */}
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

        {/* ── Sources (rastreabilidade) ── */}
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

        {/* ── Screen footer note ── */}
        <div
          style={{
            padding: "12px 22px",
            borderTop: "1px solid var(--border)",
            background: "var(--surface-2)",
            fontSize: 11,
            color: "var(--t-low)",
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            justifyContent: "space-between",
          }}
        >
          <span>fontebrasil.online · ID: {report.id}</span>
          <span>Gerado em {generatedAtFull}</span>
        </div>
      </div>

      {/* ── Print-only A4 document ────────────────────────────────────────────
          Hidden on screen (display:none via .er-print-doc rule).
          @media print makes it block and hides the rest of the app.
          aria-hidden="true" because screen readers use the screen view above.
      ─────────────────────────────────────────────────────────────────────── */}
      <div className="er-print-doc" aria-hidden="true">

        {/* Brand header */}
        <div className="er-print-header">
          <div className="er-print-logo-row">
            <div className="er-print-logo-svg">
              <LogoMark size={28} />
            </div>
            <div>
              <div className="er-print-brand-name">Fonte.ia</div>
              <div className="er-print-brand-sub">Relatório de Due Diligence</div>
            </div>
          </div>
          <div className="er-print-meta">
            <div>
              <strong>{report.kindLabel}</strong>
            </div>
            <div>Gerado em: {generatedAtFull}</div>
            <div>fontebrasil.online</div>
          </div>
        </div>

        {/* Entity title block */}
        <div className="er-print-title-block">
          <div className="er-print-kind-label">{report.kindLabel}</div>
          <h1 className="er-print-entity-name">{report.title}</h1>
          {report.subtitle !== undefined && (
            <div className="er-print-subtitle">{report.subtitle}</div>
          )}
        </div>

        {/* Trust note */}
        <div className="er-print-trust">
          <span style={{ fontWeight: 800, fontSize: "8pt", letterSpacing: ".04em" }}>
            DOCUMENTO RASTREAVEL
          </span>
          <span>—</span>
          <span>
            Cada dado cita a fonte oficial (orgao, data de coleta). Gerado automaticamente
            pela plataforma Fonte.ia a partir de fontes publicas verificaveis.
          </span>
        </div>

        {/* Data fields */}
        {report.fields.length > 0 && (
          <div className="er-print-section">
            <div className="er-print-section-title">Dados do relatório</div>
            {report.fields.map((f) => (
              <div key={f.label} className="er-print-field-row">
                <span className="er-print-field-label">{f.label}</span>
                <span className="er-print-field-value">{f.value || "—"}</span>
              </div>
            ))}
          </div>
        )}

        {/* Sources */}
        {report.sources.length > 0 && (
          <div className="er-print-section">
            <div className="er-print-section-title">
              Fontes e rastreabilidade — {report.sources.length}{" "}
              {report.sources.length === 1 ? "fonte" : "fontes"} verificadas
            </div>
            {report.sources.map((s) => (
              <PrintSourceEntry key={s.label} s={s} />
            ))}
          </div>
        )}

        {/* Page footer */}
        <div className="er-print-footer">
          <div className="er-print-footer-left">
            <div>
              <strong>Fonte.ia</strong> · fontebrasil.online
            </div>
            <div>Gerado por Fonte.ia · {generatedAt}</div>
            <div>Documento rastreavel — cada dado cita a fonte oficial (orgao, data, hash)</div>
          </div>
          <div className="er-print-footer-right">
            <div>
              <strong>ID do relatório</strong>
            </div>
            <div className="er-print-hash">{report.id}</div>
          </div>
        </div>
      </div>
    </>
  );
}
