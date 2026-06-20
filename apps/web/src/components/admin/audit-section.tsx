// AuditSection — exibe eventos de auditoria de consultas (InfoSimples/CNPJ).
// Padrão de design: CSS custom properties, classes panel/badge/btn do design system próprio.

import { useState } from "react";
import { ClipboardList, RefreshCw } from "lucide-react";
import { EmptyState } from "../ui/EmptyState";
import type { AuditEvent, AuditEventsResponse, AuditFilters } from "./admin-api";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtCnpj(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length === 14)
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return raw;
}

function fmtUser(event: AuditEvent): string {
  if (event.user_email) return event.user_email;
  if (event.user_id) return `${event.user_id.slice(0, 8)}…`;
  return "—";
}

function SourceBadge({ source }: { source: string }) {
  if (source === "live") {
    return <span className="badge badge--ok">Live</span>;
  }
  if (source === "cache") {
    return <span className="badge badge--neutral">Cache</span>;
  }
  return <span className="badge badge--neutral">{source}</span>;
}

// ─── Tipos internos ───────────────────────────────────────────────────────────

interface LocalForm {
  from: string;
  to: string;
  cnpj: string;
  user_id: string;
  kind: string;
}

function filtersToForm(f: AuditFilters): LocalForm {
  return {
    from: f.from ?? "",
    to: f.to ?? "",
    cnpj: f.cnpj ?? "",
    user_id: f.user_id ?? "",
    kind: f.kind ?? "",
  };
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface AuditSectionProps {
  data: AuditEventsResponse;
  filters: AuditFilters;
  onFilterChange: (f: AuditFilters) => void;
  onRefresh: () => void;
  loading: boolean;
}

export function AuditSection({
  data,
  filters,
  onFilterChange,
  onRefresh,
  loading,
}: AuditSectionProps) {
  const [form, setForm] = useState<LocalForm>(() => filtersToForm(filters));

  function applyFilters() {
    const next: AuditFilters = { page: 1 };
    if (form.from) next.from = form.from;
    if (form.to) next.to = form.to;
    if (form.cnpj) next.cnpj = form.cnpj;
    if (form.user_id) next.user_id = form.user_id;
    if (form.kind) next.kind = form.kind;
    onFilterChange(next);
  }

  function clearFilters() {
    const empty: LocalForm = { from: "", to: "", cnpj: "", user_id: "", kind: "" };
    setForm(empty);
    onFilterChange({});
  }

  function goToPage(page: number) {
    onFilterChange({ ...filters, page });
  }

  const currentPage = filters.page ?? 1;

  // ─── Barra de filtros ──────────────────────────────────────────────────────

  const inputStyle: React.CSSProperties = {
    padding: "7px 10px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--t-hi)",
    font: "inherit",
    fontSize: 13,
    minWidth: 0,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Filtros */}
      <div className="panel" style={{ padding: "16px 18px" }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            alignItems: "flex-end",
          }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--t-mid)", fontWeight: 600 }}>
            De
            <input
              type="date"
              value={form.from}
              onChange={(e) => setForm((f) => ({ ...f, from: e.target.value }))}
              style={inputStyle}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--t-mid)", fontWeight: 600 }}>
            Até
            <input
              type="date"
              value={form.to}
              onChange={(e) => setForm((f) => ({ ...f, to: e.target.value }))}
              style={inputStyle}
            />
          </label>
          <input
            type="text"
            value={form.cnpj}
            placeholder="CNPJ (só dígitos)"
            onChange={(e) => setForm((f) => ({ ...f, cnpj: e.target.value }))}
            style={{ ...inputStyle, width: 160 }}
          />
          <input
            type="text"
            value={form.user_id}
            placeholder="E-mail ou user ID"
            onChange={(e) => setForm((f) => ({ ...f, user_id: e.target.value }))}
            style={{ ...inputStyle, width: 180 }}
          />
          <input
            type="text"
            value={form.kind}
            placeholder="kind (ex: inpi-marcas-cnpj)"
            onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
            style={{ ...inputStyle, width: 200 }}
          />
          <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
            <button
              className="btn btn--ghost btn--sm"
              type="button"
              onClick={clearFilters}
              disabled={loading}
            >
              Limpar
            </button>
            <button
              className="btn btn--primary btn--sm"
              type="button"
              onClick={applyFilters}
              disabled={loading}
            >
              Filtrar
            </button>
          </div>
        </div>
      </div>

      {/* Linha de resumo */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span className="muted small">
          {data.total.toLocaleString("pt-BR")} evento{data.total !== 1 ? "s" : ""} encontrado{data.total !== 1 ? "s" : ""}
        </span>
        <button
          className="btn btn--ghost btn--sm"
          type="button"
          onClick={onRefresh}
          disabled={loading}
          style={{ marginLeft: "auto" }}
          aria-label="Atualizar lista"
        >
          <RefreshCw
            size={13}
            aria-hidden="true"
            style={loading ? { animation: "auditspin 1s linear infinite" } : undefined}
          />
          Atualizar
        </button>
      </div>

      {/* Tabela ou estado vazio */}
      <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
        {data.events.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            tone="neutral"
            title="Nenhum evento encontrado"
            description="Ajuste os filtros ou consulte um período diferente."
          />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
              }}
            >
              <thead>
                <tr>
                  {(["Data/hora", "Usuário", "Tipo", "CNPJ / Chave", "Origem", "Provedor"] as const).map(
                    (col) => (
                      <th
                        key={col}
                        style={{
                          textAlign: "left",
                          padding: "10px 12px",
                          fontWeight: 600,
                          color: "var(--t-mid)",
                          borderBottom: "1px solid var(--border)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {col}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {data.events.map((ev, idx) => (
                  <tr
                    key={ev.id}
                    style={
                      idx % 2 === 1
                        ? { background: "color-mix(in srgb,var(--t-mid) 4%,transparent)" }
                        : undefined
                    }
                  >
                    <td style={{ padding: "9px 12px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>
                      {fmtDateTime(ev.fetched_at)}
                    </td>
                    <td
                      style={{
                        padding: "9px 12px",
                        borderBottom: "1px solid var(--border)",
                        maxWidth: 200,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={ev.user_email ?? ev.user_id ?? undefined}
                    >
                      {fmtUser(ev)}
                    </td>
                    <td style={{ padding: "9px 12px", borderBottom: "1px solid var(--border)" }}>
                      <code style={{ fontSize: 12, color: "var(--t-mid)" }}>{ev.lookup_kind}</code>
                    </td>
                    <td style={{ padding: "9px 12px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>
                      {fmtCnpj(ev.lookup_key)}
                    </td>
                    <td style={{ padding: "9px 12px", borderBottom: "1px solid var(--border)" }}>
                      <SourceBadge source={ev.source} />
                    </td>
                    <td
                      style={{
                        padding: "9px 12px",
                        borderBottom: "1px solid var(--border)",
                        color: "var(--t-mid)",
                        fontSize: 12,
                      }}
                    >
                      {ev.provider}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Paginação */}
      {data.total_pages > 1 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            justifyContent: "center",
          }}
        >
          <button
            className="btn btn--ghost btn--sm"
            type="button"
            disabled={currentPage <= 1 || loading}
            onClick={() => goToPage(currentPage - 1)}
          >
            Anterior
          </button>
          <span className="small muted">
            Página {currentPage} de {data.total_pages}
          </span>
          <button
            className="btn btn--ghost btn--sm"
            type="button"
            disabled={currentPage >= data.total_pages || loading}
            onClick={() => goToPage(currentPage + 1)}
          >
            Próxima
          </button>
        </div>
      )}

      <style>{`@keyframes auditspin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
