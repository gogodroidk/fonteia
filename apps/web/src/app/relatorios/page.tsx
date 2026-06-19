/**
 * relatorios/page.tsx
 * Lists ALL saved reports (any module/entity kind) and renders the selected
 * one with EntityReport. Merges legacy lot-only reports (key: "fonteia_reports")
 * with the new generic store (key: "fonteia.reports.v1") for backward compat.
 *
 * Mobile-first, dark/light safe, reduced-motion safe.
 */

import { useEffect, useState } from "react";
import {
  Download,
  ExternalLink,
  FileSearch,
  FileText,
  Info,
  Printer,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { navigateSpa } from "../_nav";
import {
  listReports,
  deleteReport,
  saveReport,
  type SavedReport,
} from "../../features/reports/reports-store";
import { EntityReport } from "../../components/report/EntityReport";

// ─── Legacy migration ─────────────────────────────────────────────────────────
// Old store used key "fonteia_reports" and ReportEntry shape (lotTitle, lotId).
// We read it once, convert to SavedReport, merge into the new store, and clear
// the old key so this migration only runs once.

interface LegacyEntry {
  id: string;
  lotTitle: string;
  lotId: string;
  createdAt: string;
}

function isLegacyEntry(x: unknown): x is LegacyEntry {
  if (typeof x !== "object" || x === null) return false;
  const r = x as Record<string, unknown>;
  return (
    typeof r["id"] === "string" &&
    typeof r["lotTitle"] === "string" &&
    typeof r["lotId"] === "string" &&
    typeof r["createdAt"] === "string"
  );
}

function migrateLegacy(): void {
  if (typeof window === "undefined") return;
  const LEGACY_KEY = "fonteia_reports";
  try {
    const raw = window.localStorage.getItem(LEGACY_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    const entries = parsed.filter(isLegacyEntry);
    for (const e of entries) {
      const report: SavedReport = {
        id: `lote:${e.lotId}`,
        kind: "lote",
        kindLabel: "Lote de leilão",
        title: e.lotTitle,
        subtitle: e.lotId,
        fields: [],
        sources: [
          {
            label: "Receita Federal — Leilões",
            url: `https://www.leiloesjudiciais.gov.br/lotes/${encodeURIComponent(e.lotId)}`,
            collectedAt: e.createdAt,
          },
        ],
        createdAt: e.createdAt,
      };
      saveReport(report);
    }
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    // Migration is best-effort; never break the page
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface RelatoriosPageProps {
  onExplore?: (() => void) | undefined;
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

// ─── CSV download for a report (re-export from EntityReport helper) ───────────

function buildCsvFromReport(report: SavedReport): string {
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
  const csv = buildCsvFromReport(report);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `fonteia-relatorio-${report.id.replace(/[^a-z0-9-]/gi, "_")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Kind badge colors ────────────────────────────────────────────────────────

const KIND_BADGE: Record<string, string> = {
  lote: "badge--info",
  empresa: "badge--accent",
  municipio: "badge--ok",
  parlamentar: "badge--neutral",
  ambiental: "badge--ok",
  marca: "badge--neutral",
  processo: "badge--neutral",
};

function kindBadgeClass(kind: string): string {
  return KIND_BADGE[kind] ?? "badge--neutral";
}

// ─── What the reports system contains ────────────────────────────────────────

const REPORT_CONTENTS: Array<{ icon: typeof FileText; label: string; desc: string }> = [
  {
    icon: ShieldCheck,
    label: "Dados estruturados",
    desc: "Campos extraídos diretamente das fontes oficiais — sem inferência de IA.",
  },
  {
    icon: FileText,
    label: "Qualquer módulo",
    desc:
      "Funciona para empresas (CNPJ), municípios, parlamentares, lotes de leilão, autos IBAMA, marcas INPI e processos.",
  },
  {
    icon: Info,
    label: "Rastreabilidade completa",
    desc: "Cada relatório traz URL oficial, data de coleta e ID do registro.",
  },
  {
    icon: ExternalLink,
    label: "Fontes verificáveis",
    desc:
      "Links diretos para IBGE, Câmara dos Deputados, Receita Federal, CNPJ.ws, IBAMA e outros órgãos.",
  },
  {
    icon: Printer,
    label: "Impressão / PDF",
    desc: "Ctrl+P ou ⌘P para salvar como PDF. O layout de impressão é formatado como documento.",
  },
];

// ─── Skeleton loader ──────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div
      className="row"
      style={{
        padding: "14px 20px",
        gap: 14,
        borderTop: "1px solid var(--border)",
      }}
    >
      <div className="skeleton" style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0 }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        <div className="skeleton" style={{ height: 14, width: "55%", borderRadius: 6 }} />
        <div className="skeleton" style={{ height: 11, width: "30%", borderRadius: 5 }} />
      </div>
      <div className="skeleton" style={{ height: 26, width: 80, borderRadius: 8 }} />
    </div>
  );
}

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
          Em qualquer página de detalhe — empresa, município, parlamentar, lote de leilão,
          infração ambiental, marca ou processo — clique em{" "}
          <strong>"Gerar relatório"</strong>. O relatório inclui os dados da entidade, a fonte
          oficial, a data de coleta e fica salvo aqui para reabrir, reimprimir ou exportar CSV
          quando quiser.
        </p>
      </div>

      {onExplore !== undefined && (
        <button
          type="button"
          className="btn btn--primary"
          onClick={onExplore}
          style={{ marginTop: 8 }}
        >
          <FileText size={15} aria-hidden="true" />
          Explorar lotes
        </button>
      )}
    </div>
  );
}

// ─── Sidebar: what reports contain ───────────────────────────────────────────

function ReportContentsPanel() {
  return (
    <div
      className="panel"
      style={{ padding: 22, display: "flex", flexDirection: "column", gap: 0 }}
    >
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>
        O que cada relatório contém
      </div>
      <p
        style={{
          fontSize: 12,
          color: "var(--t-low)",
          lineHeight: 1.5,
          marginBottom: 12,
          marginTop: 0,
        }}
      >
        Gerado em qualquer módulo e salvo localmente no seu navegador. O PDF é obtido via
        impressão do navegador (Ctrl+P / ⌘P). Os dados nunca saem do seu dispositivo.
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
            <Icon size={15} style={{ color: "var(--brand-ink)" }} aria-hidden="true" />
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

// ─── Report row in the list ───────────────────────────────────────────────────

interface ReportRowProps {
  report: SavedReport;
  isSelected: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onCsv: () => void;
  isFirst: boolean;
}

function ReportRow({
  report,
  isSelected,
  onOpen,
  onDelete,
  onCsv,
  isFirst,
}: ReportRowProps) {
  return (
    <tr style={{ borderTop: !isFirst ? "1px solid var(--border)" : undefined }}>
      {/* Entity */}
      <td style={{ padding: "14px 20px" }}>
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
                background: "linear-gradient(90deg,var(--brand),var(--accent-2))",
              }}
            />
            <FileText size={16} style={{ color: "var(--t-mid)" }} aria-hidden="true" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14, wordBreak: "break-word" }}>
              {report.title}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 4, alignItems: "center", flexWrap: "wrap" }}>
              <span className={`badge ${kindBadgeClass(report.kind)}`} style={{ fontSize: 10.5 }}>
                {report.kindLabel}
              </span>
              {report.subtitle !== undefined && (
                <span style={{ fontSize: 11.5, color: "var(--t-low)", fontFamily: "monospace" }}>
                  {report.subtitle}
                </span>
              )}
            </div>
          </div>
        </div>
      </td>

      {/* Date */}
      <td
        style={{
          padding: "14px 20px",
          fontSize: 13.5,
          color: "var(--t-mid)",
          whiteSpace: "nowrap",
        }}
      >
        {formatDate(report.createdAt)}
      </td>

      {/* Actions */}
      <td style={{ padding: "14px 20px" }}>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          <button
            type="button"
            className={`btn btn--sm ${isSelected ? "btn--primary" : "btn--ghost"}`}
            onClick={onOpen}
            title="Abrir relatório"
          >
            <ExternalLink size={12} aria-hidden="true" />
            {isSelected ? "Aberto" : "Abrir"}
          </button>
          <button
            type="button"
            className="btn btn--soft btn--sm"
            onClick={onCsv}
            title="Exportar CSV"
          >
            <Download size={12} aria-hidden="true" />
            CSV
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={onDelete}
            title="Excluir relatório"
            style={{ color: "var(--danger)", borderColor: "color-mix(in srgb,var(--danger) 30%,var(--border))" }}
            aria-label={`Excluir relatório de ${report.title}`}
          >
            <Trash2 size={12} aria-hidden="true" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Reports list panel ───────────────────────────────────────────────────────

interface ReportsListProps {
  reports: SavedReport[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

function ReportsList({ reports, selectedId, onSelect, onDelete }: ReportsListProps) {
  return (
    <div className="panel" style={{ overflow: "hidden" }}>
      <div
        className="row between"
        style={{ padding: "16px 22px", borderBottom: "1px solid var(--border)", gap: 12 }}
      >
        <div style={{ fontWeight: 700, fontSize: 15 }}>
          {reports.length === 1
            ? "1 relatório salvo"
            : `${reports.length} relatórios salvos`}
        </div>
        <span className="badge badge--neutral" style={{ fontSize: 11 }}>
          Histórico local
        </span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontFamily: "inherit",
            minWidth: 480,
          }}
        >
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {(["Entidade", "Gerado em", "Ações"] as const).map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "10px 20px",
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
              <ReportRow
                key={report.id}
                report={report}
                isSelected={report.id === selectedId}
                isFirst={i === 0}
                onOpen={() => onSelect(report.id)}
                onDelete={() => onDelete(report.id)}
                onCsv={() => downloadCsv(report)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function RelatoriosPage({ onExplore }: RelatoriosPageProps) {
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Migrate legacy lot reports and load all reports on mount
  useEffect(() => {
    migrateLegacy();
    setReports(listReports());
    setLoading(false);
  }, []);

  // Keep in sync if another tab writes to LS
  useEffect(() => {
    function sync() {
      setReports(listReports());
    }
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("storage", sync);
    };
  }, []);

  // When a report is deleted, clear selection if it was the selected one
  function handleDelete(id: string) {
    deleteReport(id);
    setReports(listReports());
    if (selectedId === id) setSelectedId(null);
  }

  // Selecting a report also scrolls to the detail view on mobile
  function handleSelect(id: string) {
    setSelectedId((prev) => (prev === id ? null : id));
  }

  function handleLotExplore() {
    navigateSpa("/app/lotes");
    onExplore?.();
  }

  const selectedReport = selectedId !== null
    ? reports.find((r) => r.id === selectedId)
    : undefined;

  const hasReports = reports.length > 0;

  return (
    <section style={{ display: "flex", flexDirection: "column" }}>
      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div
        className="row between wrap"
        style={{ marginBottom: 20, gap: 12, alignItems: "flex-end" }}
      >
        <div>
          <span className="eyebrow">Todos os módulos</span>
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
            Relatórios individuais de qualquer entidade — empresa, município, parlamentar,
            lote, infração ambiental, marca ou processo. Salvos localmente; incluem fonte
            oficial e data de coleta.
          </p>
        )}
      </div>

      {/* ── Loading skeletons ──────────────────────────────────────────────── */}
      {loading && (
        <div className="relatorios-grid">
          <div className="panel" style={{ overflow: "hidden" }}>
            <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--border)" }}>
              <div className="skeleton" style={{ height: 16, width: 180, borderRadius: 6 }} />
            </div>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
          <ReportContentsPanel />
        </div>
      )}

      {/* ── Main content ───────────────────────────────────────────────────── */}
      {!loading && (
        <div className="relatorios-grid">
          {/* Left column: list or empty state */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {hasReports ? (
              <ReportsList
                reports={reports}
                selectedId={selectedId}
                onSelect={handleSelect}
                onDelete={handleDelete}
              />
            ) : (
              <EmptyState onExplore={handleLotExplore} />
            )}

            {/* Selected report detail — shows below list on mobile, inside left col */}
            {selectedReport !== undefined && (
              <EntityReport report={selectedReport} />
            )}
          </div>

          {/* Right column: sidebar */}
          <ReportContentsPanel />
        </div>
      )}

      {/* ── Responsive grid ───────────────────────────────────────────────── */}
      <style>{`
        .relatorios-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 300px;
          gap: 20px;
          align-items: start;
        }
        @media (max-width: 1000px) {
          .relatorios-grid {
            grid-template-columns: 1fr;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .skeleton::after { animation: none !important; }
        }
      `}</style>
    </section>
  );
}
