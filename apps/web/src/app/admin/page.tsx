// Painel Admin — exclusivo do dono. Protegido pelo papel em public.profiles e
// pela edge function `admin-api` (que revalida is_admin no servidor com a service role).
//
// Gate em camadas:
//   1) useIsAdmin() lê o papel do usuário logado; se não for admin → "acesso restrito".
//   2) Toda chamada de dados vai à admin-api com o token de sessão; o servidor
//      rejeita (403) qualquer não-admin, então a UI nunca é fonte de verdade.

import { useCallback, useEffect, useState } from "react";
import { BarChart3, ClipboardList, Database, Layers, RefreshCw, ShieldAlert, ShieldCheck, Users } from "lucide-react";
import { useAuth } from "../../auth/auth-context";
import { useIsAdmin } from "../../components/admin/use-is-admin";
import {
  fetchAuditEvents,
  fetchOverview,
  fetchUsers,
  type AdminOverview,
  type AdminUsersResponse,
  type AuditEventsResponse,
  type AuditFilters,
} from "../../components/admin/admin-api";
import {
  DataSection,
  OverviewSection,
  SourcesModulesSection,
  UsersSection,
} from "../../components/admin/admin-sections";
import { AuditSection } from "../../components/admin/audit-section";

type AdminTab = "overview" | "users" | "data" | "sources" | "audit";

const TABS: Array<{ id: AdminTab; label: string; icon: typeof BarChart3 }> = [
  { id: "overview", label: "Visão geral", icon: BarChart3 },
  { id: "users", label: "Usuários", icon: Users },
  { id: "data", label: "Dados", icon: Database },
  { id: "sources", label: "Fontes & Módulos", icon: Layers },
  { id: "audit", label: "Auditoria", icon: ClipboardList },
];

// ─── Estado de acesso negado ─────────────────────────────────────────────────────

function AccessRestricted() {
  return (
    <section className="panel" style={{ padding: 40, textAlign: "center", maxWidth: 460, margin: "40px auto" }}>
      <span
        className="inset"
        aria-hidden="true"
        style={{ width: 56, height: 56, borderRadius: 16, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}
      >
        <ShieldAlert size={26} style={{ color: "var(--danger)" }} />
      </span>
      <h2 className="h2" style={{ marginBottom: 8 }}>Acesso restrito</h2>
      <p className="muted small" style={{ lineHeight: 1.6, margin: 0 }}>
        Esta área é exclusiva do administrador da plataforma. Se você acredita que deveria
        ter acesso, fale com o responsável pela conta.
      </p>
    </section>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 240, gap: 12, color: "var(--t-mid)" }}>
      <ShieldCheck size={28} strokeWidth={1.6} aria-hidden="true" style={{ opacity: 0.4 }} />
      <span className="muted">{label}</span>
    </div>
  );
}

// ─── Página ──────────────────────────────────────────────────────────────────────

export function AdminPage() {
  const { user } = useAuth();
  const { isAdmin, loading: gateLoading } = useIsAdmin();
  const [tab, setTab] = useState<AdminTab>("overview");

  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUsersResponse | null>(null);
  const [auditData, setAuditData] = useState<AuditEventsResponse | null>(null);
  const [auditFilters, setAuditFilters] = useState<AuditFilters>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOverview(await fetchOverview());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar os dados.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await fetchUsers());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar os usuários.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAudit = useCallback(async (filters: AuditFilters = {}) => {
    setLoading(true);
    setError(null);
    try {
      setAuditData(await fetchAuditEvents(filters));
      setAuditFilters(filters);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar eventos de auditoria.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Carrega os dados da aba ativa quando admin é confirmado.
  useEffect(() => {
    if (gateLoading || !isAdmin) return;
    if ((tab === "overview" || tab === "data" || tab === "sources") && !overview) {
      void loadOverview();
    }
    if (tab === "users" && !users) {
      void loadUsers();
    }
    if (tab === "audit" && !auditData) {
      void loadAudit({});
    }
  }, [gateLoading, isAdmin, tab, overview, users, auditData, loadOverview, loadUsers, loadAudit]);

  if (gateLoading) {
    return <LoadingState label="Verificando acesso…" />;
  }

  if (!isAdmin) {
    return <AccessRestricted />;
  }

  const refresh = () => {
    if (tab === "users") void loadUsers();
    else if (tab === "audit") void loadAudit(auditFilters);
    else void loadOverview();
  };

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Cabeçalho */}
      <div className="panel rise" style={{ padding: 22, display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", justifyContent: "space-between" }}>
        <div className="row" style={{ gap: 12 }}>
          <span
            aria-hidden="true"
            style={{ width: 42, height: 42, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", background: "linear-gradient(135deg,var(--brand),var(--accent))", flexShrink: 0 }}
          >
            <ShieldCheck size={22} />
          </span>
          <div>
            <span className="eyebrow">Administração</span>
            <h1 className="h1" style={{ fontSize: 22, marginTop: 4 }}>Painel do dono</h1>
          </div>
        </div>
        <button className="btn btn--ghost btn--sm" type="button" onClick={refresh} disabled={loading}>
          <RefreshCw size={14} aria-hidden="true" style={loading ? { animation: "adminspin 1s linear infinite" } : undefined} />
          Atualizar
        </button>
      </div>

      {/* Abas */}
      <div className="panel" style={{ padding: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-current={active ? "page" : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "9px 14px",
                borderRadius: 9,
                border: 0,
                cursor: "pointer",
                font: "inherit",
                fontSize: 13.5,
                fontWeight: active ? 700 : 500,
                background: active ? "color-mix(in srgb,var(--brand) 10%,transparent)" : "transparent",
                color: active ? "var(--brand-ink)" : "var(--t-mid)",
                transition: "background .15s,color .15s",
              }}
            >
              <Icon size={15} aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>

      {/* Conteúdo */}
      {error ? (
        <div className="panel" role="alert" style={{ padding: "14px 18px", display: "flex", gap: 10, alignItems: "center", borderColor: "color-mix(in srgb,var(--danger) 35%,var(--border))" }}>
          <ShieldAlert size={16} style={{ color: "var(--danger)", flexShrink: 0 }} aria-hidden="true" />
          <span className="small" style={{ color: "var(--t-hi)" }}>{error}</span>
          <button className="btn btn--ghost btn--sm" type="button" onClick={refresh} style={{ marginLeft: "auto" }}>
            Tentar de novo
          </button>
        </div>
      ) : null}

      {tab === "overview" &&
        (overview ? <OverviewSection data={overview} /> : loading ? <LoadingState label="Carregando visão geral…" /> : null)}

      {tab === "users" &&
        (users ? (
          <UsersSection data={users} currentUserId={user?.id ?? null} onChanged={() => void loadUsers()} />
        ) : loading ? (
          <LoadingState label="Carregando usuários…" />
        ) : null)}

      {tab === "data" &&
        (overview ? <DataSection data={overview} /> : loading ? <LoadingState label="Carregando dados…" /> : null)}

      {tab === "sources" &&
        (overview ? (
          <SourcesModulesSection sources={overview.sources} modules={overview.modules} />
        ) : loading ? (
          <LoadingState label="Carregando fontes…" />
        ) : null)}

      {tab === "audit" &&
        (auditData ? (
          <AuditSection
            data={auditData}
            filters={auditFilters}
            onFilterChange={(f) => void loadAudit(f)}
            onRefresh={() => void loadAudit(auditFilters)}
            loading={loading}
          />
        ) : loading ? (
          <LoadingState label="Carregando auditoria…" />
        ) : null)}

      <style>{`@keyframes adminspin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </section>
  );
}
