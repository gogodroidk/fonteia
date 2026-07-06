// Seções do Painel Admin. Componentes de apresentação (dark-safe, design-system).
import { useState, type CSSProperties, type ReactNode } from "react";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  Clock,
  Database,
  Gift,
  Layers,
  RefreshCw,
  Search,
  ShieldCheck,
  User as UserIcon,
  X,
} from "lucide-react";
import {
  setModuleAccess,
  setUserRole,
  type AdminModule,
  type AdminOverview,
  type AdminSource,
  type AdminSourceRow,
  type AdminUser,
  type AdminUsersResponse,
} from "./admin-api";
import { AdminRpcForbiddenError, AdminRpcMissingError, grantTrial } from "./admin-metrics-api";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  return n.toLocaleString("pt-BR");
}

function fmtDateTime(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Data curta (dd/mm/aaaa) para cadastro/último acesso. */
function fmtDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Distância relativa honesta em pt-BR ("hoje", "há 3 dias", "há 2 meses").
 * Usada no rastreamento de último acesso — sem inventar precisão que não temos.
 */
function fmtRelative(value: string | null): string {
  if (!value) return "nunca";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "—";
  const diffMs = Date.now() - then;
  if (diffMs < 0) return "agora";
  const day = 86400000;
  const days = Math.floor(diffMs / day);
  if (days === 0) return "hoje";
  if (days === 1) return "ontem";
  if (days < 30) return `há ${days} dias`;
  const months = Math.floor(days / 30);
  if (months < 12) return `há ${months} ${months === 1 ? "mês" : "meses"}`;
  const years = Math.floor(days / 365);
  return `há ${years} ${years === 1 ? "ano" : "anos"}`;
}

const KIND_LABELS: Record<string, string> = {
  auction_lot: "Lotes de leilão",
  bidding_opportunity: "Licitações",
};
function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}

const STATUS_BADGE: Record<string, string> = {
  ok: "badge--ok",
  success: "badge--ok",
  connected: "badge--ok",
  active: "badge--ok",
  running: "badge--info",
  integrating: "badge--info",
  fragile_operational: "badge--warn",
  partial: "badge--warn",
  open_no_api: "badge--neutral",
  locked: "badge--neutral",
  error: "badge--danger",
  failed: "badge--danger",
  deprecated: "badge--danger",
};
function statusBadgeClass(status: string): string {
  return STATUS_BADGE[status] ?? "badge--neutral";
}

// ─── StatCard ──────────────────────────────────────────────────────────────────

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: typeof Database;
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="panel" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="row" style={{ gap: 9 }}>
        <span
          className="inset"
          aria-hidden="true"
          style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <Icon size={16} style={{ color: accent ? "var(--accent-ink)" : "var(--brand-ink)" }} />
        </span>
        <span className="tiny" style={{ color: "var(--t-mid)", fontWeight: 600 }}>{label}</span>
      </div>
      <div className="display num" style={{ fontSize: 28, color: "var(--t-hi)" }}>{value}</div>
      {hint ? <div className="tiny muted">{hint}</div> : null}
    </div>
  );
}

// ─── Seção: Visão geral ─────────────────────────────────────────────────────────

export function OverviewSection({ data }: { data: AdminOverview }) {
  const connectedSources = data.sources.filter(
    (s) => s.status === "connected" || s.status === "fragile_operational",
  ).length;
  const activeModules = data.modules.filter((m) => m.status === "active").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 14,
        }}
      >
        <StatCard icon={UserIcon} label="Usuários" value={fmtNum(data.users.total)} hint={`${data.users.admins} admin(s)`} />
        <StatCard icon={Database} label="Registros (entities)" value={fmtNum(data.entities.total)} accent />
        <StatCard icon={Layers} label="Módulos ativos" value={`${activeModules}/${data.modules.length}`} />
        <StatCard icon={RefreshCw} label="Fontes conectadas" value={`${connectedSources}/${data.sources.length}`} />
        <StatCard icon={Database} label="Raw records" value={fmtNum(data.counts["raw_records"] ?? 0)} />
        <StatCard icon={RefreshCw} label="Coletas (runs)" value={fmtNum(data.counts["source_runs"] ?? 0)} />
        <StatCard icon={UserIcon} label="Assinaturas" value={fmtNum(data.counts["subscriptions"] ?? 0)} />
        <StatCard icon={AlertTriangle} label="Alertas de usuário" value={fmtNum(data.counts["user_alerts"] ?? 0)} />
      </div>

      <div className="tiny muted" style={{ textAlign: "right" }}>
        Atualizado em {fmtDateTime(data.generatedAt)}
      </div>
    </div>
  );
}

// ─── Seção: Dados (entities por kind + últimas coletas) ──────────────────────────

export function DataSection({ data }: { data: AdminOverview }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Entities por kind */}
      <div className="panel" style={{ overflow: "hidden" }}>
        <div className="row between" style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <div className="h3">Dados por tipo</div>
          <span className="badge badge--neutral">{fmtNum(data.entities.total)} no total</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {data.entities.byKind.length === 0 ? (
            <div className="muted small" style={{ padding: 20 }}>Nenhum dado coletado ainda.</div>
          ) : (
            data.entities.byKind.map((k, i) => {
              const pct = data.entities.total > 0 ? Math.round((k.count / data.entities.total) * 100) : 0;
              return (
                <div
                  key={k.kind}
                  style={{
                    padding: "13px 20px",
                    borderTop: i > 0 ? "1px solid var(--border)" : undefined,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <div className="row between">
                    <span style={{ fontSize: 14, fontWeight: 600, color: "var(--t-hi)" }}>{kindLabel(k.kind)}</span>
                    <span className="tiny" style={{ color: "var(--t-mid)", fontWeight: 600 }}>
                      {fmtNum(k.count)} · {pct}%
                    </span>
                  </div>
                  <div style={{ height: 6, borderRadius: 999, background: "var(--surface-2)", overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${pct}%`,
                        height: "100%",
                        borderRadius: 999,
                        background: "linear-gradient(90deg,var(--brand),var(--accent))",
                      }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Últimas coletas */}
      <RunsTable runs={data.recentRuns} />
    </div>
  );
}

function RunsTable({ runs }: { runs: AdminSourceRow[] }) {
  return (
    <div className="panel" style={{ overflow: "hidden" }}>
      <div className="row between" style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
        <div className="h3">Últimas coletas</div>
        <span className="tiny muted">source_runs</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "inherit" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {(["Fonte", "Status", "Início", "Vistos", "Inseridos"] as const).map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted small" style={{ padding: 20 }}>Nenhuma coleta registrada.</td>
              </tr>
            ) : (
              runs.map((run, i) => (
                <tr key={run.id} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--t-hi)" }}>{run.source_id}</span>
                    {run.error_message ? (
                      <div className="tiny" style={{ color: "var(--danger)", marginTop: 2 }}>{run.error_message}</div>
                    ) : null}
                  </td>
                  <td style={tdStyle}>
                    <span className={`badge ${statusBadgeClass(run.status)}`}>{run.status}</span>
                  </td>
                  <td style={tdStyle}><span className="tiny muted">{fmtDateTime(run.started_at)}</span></td>
                  <td style={tdStyle}><span className="tiny" style={{ color: "var(--t-mid)" }}>{fmtNum(run.records_seen)}</span></td>
                  <td style={tdStyle}><span className="tiny" style={{ color: "var(--t-mid)" }}>{fmtNum(run.records_inserted)}</span></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Seção: Fontes & Módulos ─────────────────────────────────────────────────────

export function SourcesModulesSection({
  sources,
  modules,
}: {
  sources: AdminSource[];
  modules: AdminModule[];
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="panel" style={{ overflow: "hidden" }}>
        <div className="row between" style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <div className="h3">Fontes de dados</div>
          <span className="tiny muted">{sources.length} cadastradas</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "inherit" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {(["Fonte", "Status", "Confiabilidade", "Módulos"] as const).map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sources.map((s, i) => (
                <tr key={s.id} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--t-hi)" }}>{s.name}</span>
                    <div className="tiny muted" style={{ marginTop: 2 }}>{s.id}</div>
                  </td>
                  <td style={tdStyle}><span className={`badge ${statusBadgeClass(s.status)}`}>{s.status}</span></td>
                  <td style={tdStyle}><span className="tiny" style={{ color: "var(--t-mid)" }}>{s.reliability}</span></td>
                  <td style={tdStyle}>
                    <span className="tiny" style={{ color: "var(--t-mid)" }}>{(s.modules ?? []).join(", ") || "—"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel" style={{ overflow: "hidden" }}>
        <div className="row between" style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <div className="h3">Módulos da plataforma</div>
          <span className="tiny muted">{modules.length} módulos</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))", gap: 12, padding: 16 }}>
          {modules.map((m) => (
            <div key={m.id} className="inset" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="row between">
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--t-hi)" }}>{m.label}</span>
                <span className={`badge ${statusBadgeClass(m.status)}`}>{m.status}</span>
              </div>
              {m.target_persona ? (
                <div className="tiny muted" style={{ lineHeight: 1.5 }}>{m.target_persona}</div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Seção: Usuários ─────────────────────────────────────────────────────────────

export function UsersSection({
  data,
  currentUserId,
  onChanged,
}: {
  data: AdminUsersResponse;
  currentUserId: string | null;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Estado otimista local sobreposto aos dados do servidor.
  const [roleOverride, setRoleOverride] = useState<Record<string, "user" | "admin">>({});
  const [accessOverride, setAccessOverride] = useState<Record<string, boolean>>({});
  // Filtros locais de rastreamento (nome/email + papel). Puramente client-side
  // sobre a lista que a admin-api já devolveu — sem chamada extra ao backend.
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "user">("all");

  const moduleList = data.modules;

  // Ação sensível: concede 7 dias de trial. O gate is_admin é SERVER-SIDE
  // (RPC admin_grant_trial, SECURITY DEFINER) — o front só dispara o pedido.
  async function handleGrantTrial(user: AdminUser) {
    setError(null);
    setNotice(null);
    setBusy(`trial:${user.id}`);
    try {
      const res = await grantTrial(user.id, 7);
      if (res.ok) {
        setNotice(res.message ?? "Trial de 7 dias concedido.");
      } else {
        setError(res.message ?? "Não foi possível conceder o trial.");
      }
    } catch (e) {
      if (e instanceof AdminRpcMissingError) {
        setError("Conceder trial exige a migration 0033 aplicada no banco (admin_grant_trial).");
      } else if (e instanceof AdminRpcForbiddenError) {
        setError("Apenas o administrador pode conceder trials.");
      } else {
        setError(e instanceof Error ? e.message : "Falha ao conceder o trial.");
      }
    } finally {
      setBusy(null);
    }
  }

  async function handleRole(user: AdminUser, role: "user" | "admin") {
    setError(null);
    setBusy(`role:${user.id}`);
    const prev = roleOverride[user.id] ?? user.role;
    setRoleOverride((o) => ({ ...o, [user.id]: role }));
    try {
      await setUserRole(user.id, role);
      onChanged();
    } catch (e) {
      setRoleOverride((o) => ({ ...o, [user.id]: prev }));
      setError(e instanceof Error ? e.message : "Falha ao trocar o papel.");
    } finally {
      setBusy(null);
    }
  }

  async function handleAccess(user: AdminUser, moduleId: string, allowed: boolean) {
    setError(null);
    const key = `${user.id}:${moduleId}`;
    setBusy(`access:${key}`);
    setAccessOverride((o) => ({ ...o, [key]: allowed }));
    try {
      await setModuleAccess(user.id, moduleId, allowed);
      onChanged();
    } catch (e) {
      setAccessOverride((o) => {
        const next = { ...o };
        delete next[key];
        return next;
      });
      setError(e instanceof Error ? e.message : "Falha ao salvar acesso.");
    } finally {
      setBusy(null);
    }
  }

  function effectiveRole(user: AdminUser): "user" | "admin" {
    return roleOverride[user.id] ?? user.role;
  }

  function moduleAllowed(user: AdminUser, moduleId: string): boolean {
    const key = `${user.id}:${moduleId}`;
    if (key in accessOverride) return accessOverride[key] as boolean;
    const found = user.module_access.find((a) => a.module_id === moduleId);
    return found?.allowed ?? false;
  }

  function allowedCount(user: AdminUser): number {
    return moduleList.reduce((n, m) => (moduleAllowed(user, m.id) ? n + 1 : n), 0);
  }

  // Lista filtrada por busca (nome/email) e papel. Não muta a original.
  const q = query.trim().toLowerCase();
  const visibleUsers = data.users.filter((user) => {
    if (roleFilter !== "all" && effectiveRole(user) !== roleFilter) return false;
    if (!q) return true;
    const haystack = `${user.full_name ?? ""} ${user.email ?? ""}`.toLowerCase();
    return haystack.includes(q);
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {error ? (
        <div
          className="panel"
          role="alert"
          style={{
            padding: "12px 16px",
            display: "flex",
            gap: 10,
            alignItems: "center",
            borderColor: "color-mix(in srgb,var(--danger) 35%,var(--border))",
          }}
        >
          <AlertTriangle size={16} style={{ color: "var(--danger)", flexShrink: 0 }} aria-hidden="true" />
          <span className="small" style={{ color: "var(--t-hi)" }}>{error}</span>
          <button className="btn btn--icon btn--ghost btn--sm" type="button" onClick={() => setError(null)} aria-label="Fechar" style={{ marginLeft: "auto" }}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {notice ? (
        <div
          className="panel"
          role="status"
          style={{
            padding: "12px 16px",
            display: "flex",
            gap: 10,
            alignItems: "center",
            borderColor: "color-mix(in srgb,var(--ok) 40%,var(--border))",
          }}
        >
          <Check size={16} style={{ color: "var(--ok)", flexShrink: 0 }} aria-hidden="true" />
          <span className="small" style={{ color: "var(--t-hi)" }}>{notice}</span>
          <button className="btn btn--icon btn--ghost btn--sm" type="button" onClick={() => setNotice(null)} aria-label="Fechar" style={{ marginLeft: "auto" }}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <div className="panel" style={{ overflow: "hidden" }}>
        <div
          className="row between"
          style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", gap: 12, flexWrap: "wrap" }}
        >
          <div className="h3">Usuários</div>
          <span className="tiny muted" aria-live="polite">
            {q || roleFilter !== "all"
              ? `${visibleUsers.length} de ${data.total}`
              : `${data.total} no total`}
          </span>
        </div>

        {/* Barra de busca e filtro de papel — rastreamento rápido em listas grandes. */}
        <div
          className="row"
          style={{ padding: "12px 20px", gap: 10, flexWrap: "wrap", borderBottom: "1px solid var(--border)" }}
        >
          <label
            className="inset"
            style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 220px", padding: "0 12px", minHeight: 44, borderRadius: 10 }}
          >
            <Search size={15} aria-hidden="true" style={{ color: "var(--t-mid)", flexShrink: 0 }} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome ou e-mail…"
              aria-label="Buscar usuários por nome ou e-mail"
              style={{
                flex: 1,
                minWidth: 0,
                border: 0,
                background: "transparent",
                font: "inherit",
                fontSize: 13.5,
                color: "var(--t-hi)",
                outline: "none",
              }}
            />
          </label>
          <div className="inset" role="group" aria-label="Filtrar por papel" style={{ display: "inline-flex", padding: 3, gap: 3, borderRadius: 10 }}>
            {([
              { value: "all", label: "Todos" },
              { value: "admin", label: "Admins" },
              { value: "user", label: "Usuários" },
            ] as const).map((opt) => {
              const active = roleFilter === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRoleFilter(opt.value)}
                  aria-pressed={active}
                  style={{
                    padding: "10px 14px",
                    minHeight: 44,
                    borderRadius: 8,
                    border: 0,
                    cursor: active ? "default" : "pointer",
                    font: "inherit",
                    fontSize: 12.5,
                    fontWeight: active ? 700 : 500,
                    background: active ? "var(--surface)" : "transparent",
                    color: active ? "var(--brand-ink)" : "var(--t-mid)",
                    transition: "background .15s,color .15s",
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          {visibleUsers.length === 0 ? (
            <div className="muted small" style={{ padding: 24, textAlign: "center" }}>
              Nenhum usuário corresponde ao filtro.
            </div>
          ) : null}
          {visibleUsers.map((user, i) => {
            const role = effectiveRole(user);
            const isSelf = user.id === currentUserId;
            const modCount = allowedCount(user);
            return (
              <div
                key={user.id}
                style={{
                  padding: "16px 20px",
                  borderTop: i > 0 ? "1px solid var(--border)" : undefined,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                {/* linha de topo: identidade + papel */}
                <div className="row between" style={{ gap: 12, flexWrap: "wrap" }}>
                  <div className="row" style={{ gap: 11, minWidth: 0 }}>
                    <span className="avatar" style={{ width: 38, height: 38, fontSize: 14 }} aria-hidden="true">
                      {(user.full_name ?? user.email ?? "?").trim().charAt(0).toUpperCase()}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div className="row" style={{ gap: 7 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--t-hi)" }}>
                          {user.full_name ?? "Sem nome"}
                        </span>
                        {role === "admin" ? (
                          <span
                            className="badge badge--accent"
                            style={{ gap: 4 }}
                            title="Admin: acesso total ao painel, inclusive a outras contas"
                          >
                            <ShieldCheck size={11} aria-hidden="true" /> admin
                          </span>
                        ) : null}
                        {isSelf ? <span className="badge badge--neutral">você</span> : null}
                      </div>
                      <div className="tiny muted" style={{ marginTop: 2, wordBreak: "break-all" }}>
                        {user.email ?? "—"}
                        {user.provider ? ` · ${user.provider}` : ""}
                      </div>
                      {/* Rastreamento: cadastro + último acesso (dados que a admin-api
                          já devolve). Sem inventar: "nunca"/"—" quando ausente. */}
                      <div
                        className="row"
                        style={{ gap: 12, marginTop: 6, flexWrap: "wrap" }}
                      >
                        <span
                          className="tiny"
                          style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--t-mid)" }}
                          title={`Cadastro em ${fmtDateTime(user.created_at)}`}
                        >
                          <CalendarClock size={12} aria-hidden="true" style={{ opacity: 0.7 }} />
                          Cadastro: {fmtDate(user.created_at)}
                        </span>
                        <span
                          className="tiny"
                          style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--t-mid)" }}
                          title={user.last_sign_in_at ? `Último acesso em ${fmtDateTime(user.last_sign_in_at)}` : "Nunca acessou"}
                        >
                          <Clock size={12} aria-hidden="true" style={{ opacity: 0.7 }} />
                          Último acesso: {fmtRelative(user.last_sign_in_at)}
                        </span>
                        <span
                          className="tiny"
                          style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--t-mid)" }}
                          title={`${modCount} de ${moduleList.length} módulos liberados`}
                        >
                          <Layers size={12} aria-hidden="true" style={{ opacity: 0.7 }} />
                          {modCount}/{moduleList.length} módulos
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      disabled={busy === `trial:${user.id}`}
                      onClick={() => void handleGrantTrial(user)}
                      title="Conceder 7 dias de teste (Pro) a este usuário"
                    >
                      <Gift size={13} aria-hidden="true" />
                      {busy === `trial:${user.id}` ? "Concedendo…" : "Trial 7d"}
                    </button>
                    <RoleToggle
                      role={role}
                      disabled={busy === `role:${user.id}` || (isSelf && role === "admin")}
                      selfLocked={isSelf && role === "admin"}
                      onChange={(r) => void handleRole(user, r)}
                    />
                  </div>
                </div>

                {/* acessos por módulo */}
                <div>
                  <div className="tiny" style={{ color: "var(--t-low)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
                    Acesso a módulos
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {moduleList.map((m) => {
                      const allowed = moduleAllowed(user, m.id);
                      const key = `${user.id}:${m.id}`;
                      const isBusy = busy === `access:${key}`;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleAccess(user, m.id, !allowed)}
                          className="badge"
                          style={{
                            cursor: isBusy ? "wait" : "pointer",
                            border: "1px solid var(--border)",
                            padding: "6px 10px",
                            fontSize: 12,
                            background: allowed ? "color-mix(in srgb,var(--accent) 16%,transparent)" : "var(--surface-2)",
                            color: allowed ? "var(--accent-ink)" : "var(--t-mid)",
                            opacity: isBusy ? 0.6 : 1,
                          }}
                          aria-pressed={allowed}
                        >
                          {allowed ? <Check size={11} aria-hidden="true" /> : <X size={11} aria-hidden="true" />}
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function RoleToggle({
  role,
  disabled,
  selfLocked = false,
  onChange,
}: {
  role: "user" | "admin";
  disabled: boolean;
  /** true quando a trava é "não posso rebaixar a mim mesmo" (não confundir com busy). */
  selfLocked?: boolean;
  onChange: (role: "user" | "admin") => void;
}) {
  const options: Array<{ value: "user" | "admin"; label: string; title: string }> = [
    { value: "user", label: "Usuário", title: "Usuário: acesso normal, sem painel admin" },
    { value: "admin", label: "Admin", title: "Admin: acesso total ao painel, inclusive a outras contas" },
  ];
  return (
    <div
      className="inset"
      role="group"
      aria-label="Papel do usuário"
      title={selfLocked ? "Você não pode remover seu próprio acesso de admin por aqui" : undefined}
      style={{ display: "inline-flex", padding: 3, gap: 3, borderRadius: 10, flexShrink: 0 }}
    >
      {options.map((opt) => {
        const active = role === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled || active}
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            title={opt.title}
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              border: 0,
              cursor: disabled || active ? "default" : "pointer",
              font: "inherit",
              fontSize: 12.5,
              fontWeight: active ? 700 : 500,
              background: active ? "var(--surface)" : "transparent",
              color: active ? "var(--brand-ink)" : "var(--t-mid)",
              boxShadow: active ? "var(--shadow-sm, 0 1px 2px rgba(0,0,0,.12))" : "none",
              transition: "background .15s,color .15s",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── estilos de tabela compartilhados ────────────────────────────────────────────

const thStyle: CSSProperties = {
  padding: "11px 20px",
  textAlign: "left",
  fontSize: 11,
  fontWeight: 700,
  color: "var(--t-low)",
  letterSpacing: "0.07em",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = { padding: "13px 20px", verticalAlign: "top" };
