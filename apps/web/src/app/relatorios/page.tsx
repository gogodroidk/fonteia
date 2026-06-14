import { useEffect, useState } from "react";
import {
  CheckSquare,
  Download,
  ExternalLink,
  FileSearch,
  FileText,
  Info,
  ShieldCheck,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReportEntry {
  id: string;
  lotTitle: string;
  lotId: string;
  createdAt: string;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface RelatoriosPageProps {
  onExplore?: (() => void) | undefined;
}

// ─── LocalStorage helper ──────────────────────────────────────────────────────

const LS_KEY = "fonteia_reports";

function loadReports(): ReportEntry[] {
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is ReportEntry =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as Record<string, unknown>)["id"] === "string" &&
        typeof (item as Record<string, unknown>)["lotTitle"] === "string" &&
        typeof (item as Record<string, unknown>)["lotId"] === "string" &&
        typeof (item as Record<string, unknown>)["createdAt"] === "string",
    );
  } catch {
    return [];
  }
}

// ─── Date formatter ───────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

// ─── What the report contains ─────────────────────────────────────────────────

const REPORT_CONTENTS: Array<{ icon: typeof FileText; label: string; desc: string }> = [
  {
    icon: ShieldCheck,
    label: "Score de risco",
    desc: "Pontuação de 0 a 100 calculada por regras fixas sobre o lote.",
  },
  {
    icon: FileText,
    label: "Resumo do lote",
    desc: "Dados do edital, órgão, prazo e valor mínimo extraídos da fonte oficial.",
  },
  {
    icon: Info,
    label: "Riscos detectados",
    desc: "Lista de fatores de risco identificados automaticamente (prazo, elegibilidade etc.).",
  },
  {
    icon: ExternalLink,
    label: "Fontes oficiais",
    desc: "Cadeia de rastreabilidade com a URL oficial, o ID do registro e a data de coleta.",
  },
  {
    icon: CheckSquare,
    label: "Checklist de verificação",
    desc: "7 orientações antes de fazer uma proposta em leilão judicial.",
  },
];

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ onExplore }: { onExplore?: (() => void) | undefined }) {
  return (
    <div
      className="panel"
      style={{
        padding: "48px 32px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: 16,
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 16,
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <FileSearch size={28} style={{ color: "var(--t-mid)" }} aria-hidden="true" />
      </div>

      <div style={{ maxWidth: 420 }}>
        <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 8 }}>
          Nenhum relatório gerado ainda
        </div>
        <p
          style={{
            fontSize: 13.5,
            color: "var(--t-mid)",
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          Abra o <strong>Raio-X</strong> de qualquer lote e clique em{" "}
          <strong>"Gerar relatório PDF"</strong>. O relatório traz os dados do lote, a fonte
          oficial, a data de coleta e o score de risco — e fica salvo aqui para reimprimir
          quando quiser.
        </p>
      </div>

      <button
        type="button"
        className="btn btn--primary"
        onClick={() => onExplore?.()}
        style={{ marginTop: 8 }}
      >
        <FileText size={15} aria-hidden="true" />
        Explorar lotes
      </button>
    </div>
  );
}

// ─── Reports table ────────────────────────────────────────────────────────────

function ReportsTable({ reports }: { reports: ReportEntry[] }) {
  function goToLot(lotId: string) {
    window.history.pushState(null, "", `/app/lotes/${encodeURIComponent(lotId)}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  return (
    <div className="panel" style={{ overflow: "hidden" }}>
      <div
        className="row between"
        style={{ padding: "16px 22px", borderBottom: "1px solid var(--border)" }}
      >
        <div style={{ fontWeight: 700, fontSize: 15 }}>
          {reports.length === 1
            ? "1 relatório gerado"
            : `${reports.length} relatórios gerados`}
        </div>
        <span
          className="badge badge--ok"
          style={{ fontSize: 11 }}
        >
          Histórico local
        </span>
      </div>

      <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "inherit", minWidth: 480 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            {(["Lote", "Gerado em", "Ações"] as const).map((h) => (
              <th
                key={h}
                style={{
                  padding: "11px 20px",
                  textAlign: "left",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--t-low)",
                  letterSpacing: ".07em",
                  textTransform: "uppercase",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {reports.map((report, i) => (
            <tr
              key={report.id}
              style={{ borderTop: i !== 0 ? "1px solid var(--border)" : undefined }}
            >
              {/* Lote */}
              <td style={{ padding: "15px 20px" }}>
                <div className="row" style={{ gap: 12 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      gap: 2,
                    }}
                  >
                    <div
                      style={{
                        height: 3,
                        width: 22,
                        borderRadius: 2,
                        background: "linear-gradient(90deg,#0B2240,#1D5FE0 70%,#14BBA4)",
                      }}
                    />
                    <FileText
                      size={16}
                      style={{ color: "var(--t-mid)" }}
                      aria-hidden="true"
                    />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{report.lotTitle}</div>
                    <div
                      style={{
                        fontSize: 11.5,
                        color: "var(--t-low)",
                        marginTop: 2,
                        fontFamily: "monospace",
                      }}
                    >
                      {report.lotId}
                    </div>
                  </div>
                </div>
              </td>

              {/* Data */}
              <td
                style={{
                  padding: "15px 20px",
                  fontSize: 13.5,
                  color: "var(--t-mid)",
                  whiteSpace: "nowrap",
                }}
              >
                {formatDate(report.createdAt)}
              </td>

              {/* Ações */}
              <td style={{ padding: "15px 20px" }}>
                <div className="row" style={{ gap: 7 }}>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => goToLot(report.lotId)}
                    title="Abrir lote"
                  >
                    <ExternalLink size={13} aria-hidden="true" />
                    Ver lote
                  </button>
                  <button
                    type="button"
                    className="btn btn--soft btn--sm"
                    onClick={() => goToLot(report.lotId)}
                    title="Abrir o lote para reimprimir o PDF"
                  >
                    <Download size={13} aria-hidden="true" />
                    Reimprimir no lote
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

// ─── What's inside the report panel ──────────────────────────────────────────

function ReportContentsPanel() {
  return (
    <div
      className="panel"
      style={{ padding: 22, display: "flex", flexDirection: "column", gap: 0 }}
    >
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>
        O que cada relatório contém
      </div>
      <p style={{ fontSize: 12, color: "var(--t-low)", lineHeight: 1.5, marginBottom: 12, marginTop: 0 }}>
        Gerado no Raio-X do lote e salvo localmente no seu navegador. O PDF é obtido via
        impressão do navegador (Ctrl+P / ⌘P).
      </p>
      {REPORT_CONTENTS.map(({ icon: Icon, label, desc }, i) => (
        <div
          key={label}
          className="row"
          style={{
            gap: 13,
            padding: "13px 0",
            borderTop: i !== 0 ? "1px solid var(--border)" : undefined,
            alignItems: "flex-start",
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "color-mix(in srgb,var(--brand) 9%,var(--surface-2))",
              border: "1px solid color-mix(in srgb,var(--brand) 18%,var(--border))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              marginTop: 1,
            }}
          >
            <Icon
              size={15}
              style={{ color: "var(--brand-ink)" }}
              aria-hidden="true"
            />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13.5 }}>{label}</div>
            <div
              style={{
                fontSize: 12.5,
                color: "var(--t-mid)",
                marginTop: 2,
                lineHeight: 1.5,
              }}
            >
              {desc}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function RelatoriosPage({ onExplore }: RelatoriosPageProps) {
  const [reports, setReports] = useState<ReportEntry[]>(() => loadReports());

  // Keep in sync if another tab (or the lot-detail-page) writes to LS
  useEffect(() => {
    function sync() {
      setReports(loadReports());
    }
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("storage", sync);
    };
  }, []);

  const hasReports = reports.length > 0;

  return (
    <section style={{ display: "flex", flexDirection: "column" }}>
      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div
        className="row between wrap"
        style={{ marginBottom: 20, gap: 12, alignItems: "flex-end" }}
      >
        <div>
          <span className="eyebrow">Leilões judiciais</span>
          <h2 style={{ margin: "4px 0 0" }}>Relatórios</h2>
        </div>
        {hasReports && (
          <p
            style={{
              fontSize: 13.5,
              color: "var(--t-mid)",
              margin: 0,
              maxWidth: 480,
              lineHeight: 1.5,
            }}
          >
            Gerados via <strong>Gerar relatório PDF</strong> no Raio-X de cada lote. Incluem
            fonte oficial, data de coleta e score de risco. Salvos localmente no navegador.
          </p>
        )}
      </div>

      {/* ── Two-column layout when there are reports, single column otherwise ── */}
      {hasReports ? (
        <div className="relatorios-grid">
          <ReportsTable reports={reports} />
          <ReportContentsPanel />
        </div>
      ) : (
        <div className="relatorios-grid">
          <EmptyState onExplore={onExplore} />
          <ReportContentsPanel />
        </div>
      )}

      {/* ── Responsive: 2 columns on desktop, single column on mobile ────── */}
      <style>{`
        .relatorios-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 300px;
          gap: 20px;
          align-items: start;
        }
        /* Collapse early: the app sidebar consumes ~280px, so the rigid
           300px side panel would squeeze the table before "mobile" widths. */
        @media (max-width: 1000px) {
          .relatorios-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </section>
  );
}
