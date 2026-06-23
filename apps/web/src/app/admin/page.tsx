// Painel Admin — exclusivo do dono. Protegido em camadas.
//
// Gate em camadas (a UI NUNCA é fonte de verdade):
//   1) useIsAdmin() lê o papel do usuário logado; se não for admin → "acesso restrito".
//   2) Os dados de gestão (overview/usuários/auditoria) vão à edge function
//      `admin-api` com o token de sessão; o servidor rejeita (403) não-admin.
//   3) As métricas agregadas (receita, assinaturas, uso, cupons) vêm de RPCs
//      SECURITY DEFINER (infra/migrations/0033_admin_metrics.sql) que revalidam
//      is_admin(auth.uid()) no BANCO. Mesmo padrão de source_health() em /sources.
//
// Honestidade de dados: enquanto a migration 0033 não estiver aplicada, as RPCs
// 404 e a UI mostra "backend pendente" — nenhum número é inventado.

import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  ClipboardList,
  CreditCard,
  Database,
  Gift,
  Layers,
  MessageSquare,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";
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
  fetchCouponsOverview,
  fetchPlatformMetrics,
  fetchRecentSubscriptions,
  fetchSubscriptionsSummary,
  fetchUsageSummary,
  AdminRpcMissingError,
  type CouponOverviewRow,
  type PlatformMetrics,
  type RecentSubscription,
  type SubscriptionSummaryRow,
  type UsageSummary,
} from "../../components/admin/admin-metrics-api";
import {
  DataSection,
  OverviewSection,
  SourcesModulesSection,
  UsersSection,
} from "../../components/admin/admin-sections";
import {
  BackendPendingNote,
  CouponsSection,
  MetricsOverviewSection,
  SubscriptionsSection,
  UsageSection,
} from "../../components/admin/metrics-sections";
import { AuditSection } from "../../components/admin/audit-section";
import { FeedbackSection } from "../../components/admin/feedback-section";

type AdminTab = "overview" | "revenue" | "users" | "usage" | "coupons" | "data" | "sources" | "audit" | "feedback";

const TABS: Array<{ id: AdminTab; label: string; icon: typeof BarChart3 }> = [
  { id: "overview", label: "Visão geral", icon: BarChart3 },
  { id: "revenue", label: "Receita & Assinaturas", icon: CreditCard },
  { id: "usage", label: "Uso", icon: TrendingUp },
  { id: "users", label: "Usuários", icon: Users },
  { id: "feedback", label: "Suporte", icon: MessageSquare },
  { id: "coupons", label: "Cupons", icon: Gift },
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

// ─── Estado das métricas (RPCs 0033) ──────────────────────────────────────────────
// "pending" = RPC ainda não existe no banco (migration não aplicada) → placeholder honesto.

type MetricsState<T> =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; data: T }
  | { kind: "pending" }
  | { kind: "error"; message: string };

interface RevenueData {
  metrics: PlatformMetrics;
  summary: SubscriptionSummaryRow[];
  recent: RecentSubscription[];
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

  // Estados das abas de métricas (independentes; cada uma degrada sozinha).
  const [revenue, setRevenue] = useState<MetricsState<RevenueData>>({ kind: "idle" });
  const [usage, setUsage] = useState<MetricsState<UsageSummary>>({ kind: "idle" });
  const [coupons, setCoupons] = useState<MetricsState<CouponOverviewRow[]>>({ kind: "idle" });

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

  const loadRevenue = useCallback(async () => {
    setRevenue({ kind: "loading" });
    try {
      const [metrics, summary, recent] = await Promise.all([
        fetchPlatformMetrics(),
        fetchSubscriptionsSummary(),
        fetchRecentSubscriptions(20),
      ]);
      setRevenue({ kind: "ready", data: { metrics, summary, recent } });
    } catch (e) {
      if (e instanceof AdminRpcMissingError) setRevenue({ kind: "pending" });
      else setRevenue({ kind: "error", message: e instanceof Error ? e.message : "Falha ao carregar métricas." });
    }
  }, []);

  const loadUsage = useCallback(async () => {
    setUsage({ kind: "loading" });
    try {
      setUsage({ kind: "ready", data: await fetchUsageSummary(30) });
    } catch (e) {
      if (e instanceof AdminRpcMissingError) setUsage({ kind: "pending" });
      else setUsage({ kind: "error", message: e instanceof Error ? e.message : "Falha ao carregar uso." });
    }
  }, []);

  const loadCoupons = useCallback(async () => {
    setCoupons({ kind: "loading" });
    try {
      setCoupons({ kind: "ready", data: await fetchCouponsOverview() });
    } catch (e) {
      if (e instanceof AdminRpcMissingError) setCoupons({ kind: "pending" });
      else setCoupons({ kind: "error", message: e instanceof Error ? e.message : "Falha ao carregar cupons." });
    }
  }, []);

  // Carrega os dados da aba ativa quando admin é confirmado.
  useEffect(() => {
    if (gateLoading || !isAdmin) return;
    if ((tab === "overview" || tab === "data" || tab === "sources") && !overview) void loadOverview();
    if (tab === "users" && !users) void loadUsers();
    if (tab === "audit" && !auditData) void loadAudit({});
    if (tab === "revenue" && revenue.kind === "idle") void loadRevenue();
    if (tab === "usage" && usage.kind === "idle") void loadUsage();
    if (tab === "coupons" && coupons.kind === "idle") void loadCoupons();
  }, [
    gateLoading, isAdmin, tab, overview, users, auditData,
    revenue.kind, usage.kind, coupons.kind,
    loadOverview, loadUsers, loadAudit, loadRevenue, loadUsage, loadCoupons,
  ]);

  if (gateLoading) {
    return <LoadingState label="Verificando acesso…" />;
  }

  if (!isAdmin) {
    return <AccessRestricted />;
  }

  const refresh = () => {
    if (tab === "users") void loadUsers();
    else if (tab === "audit") void loadAudit(auditFilters);
    else if (tab === "revenue") void loadRevenue();
    else if (tab === "usage") void loadUsage();
    else if (tab === "coupons") void loadCoupons();
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
      <div className="panel" style={{ padding: 6, display: "flex", gap: 4, flexWrap: "wrap", overflowX: "auto" }}>
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
                whiteSpace: "nowrap",
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

      {/* Erro global (somente abas servidas pela admin-api) */}
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

      {tab === "revenue" && (
        revenue.kind === "ready" ? (
          <SubscriptionsSectionWithMetrics data={revenue.data} />
        ) : revenue.kind === "pending" ? (
          <BackendPendingNote what="Receita & Assinaturas" />
        ) : revenue.kind === "error" ? (
          <InlineError message={revenue.message} onRetry={loadRevenue} />
        ) : (
          <LoadingState label="Carregando receita…" />
        )
      )}

      {tab === "usage" && (
        usage.kind === "ready" ? (
          <UsageSection data={usage.data} />
        ) : usage.kind === "pending" ? (
          <BackendPendingNote what="Uso da plataforma" />
        ) : usage.kind === "error" ? (
          <InlineError message={usage.message} onRetry={loadUsage} />
        ) : (
          <LoadingState label="Carregando uso…" />
        )
      )}

      {tab === "users" &&
        (users ? (
          <UsersSection data={users} currentUserId={user?.id ?? null} onChanged={() => void loadUsers()} />
        ) : loading ? (
          <LoadingState label="Carregando usuários…" />
        ) : null)}

      {tab === "coupons" && (
        coupons.kind === "ready" ? (
          <CouponsSection coupons={coupons.data} />
        ) : coupons.kind === "pending" ? (
          <BackendPendingNote what="Cupons" />
        ) : coupons.kind === "error" ? (
          <InlineError message={coupons.message} onRetry={loadCoupons} />
        ) : (
          <LoadingState label="Carregando cupons…" />
        )
      )}

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

      {tab === "feedback" && <FeedbackSection />}

      <style>{`@keyframes adminspin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </section>
  );
}

// ─── Helpers locais ────────────────────────────────────────────────────────────

function SubscriptionsSectionWithMetrics({ data }: { data: RevenueData }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <MetricsOverviewSection data={data.metrics} />
      <SubscriptionsSection summary={data.summary} recent={data.recent} />
    </div>
  );
}

function InlineError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="panel" role="alert" style={{ padding: "14px 18px", display: "flex", gap: 10, alignItems: "center", borderColor: "color-mix(in srgb,var(--danger) 35%,var(--border))" }}>
      <ShieldAlert size={16} style={{ color: "var(--danger)", flexShrink: 0 }} aria-hidden="true" />
      <span className="small" style={{ color: "var(--t-hi)" }}>{message}</span>
      <button className="btn btn--ghost btn--sm" type="button" onClick={onRetry} style={{ marginLeft: "auto" }}>
        Tentar de novo
      </button>
    </div>
  );
}
