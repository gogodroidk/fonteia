// Seções do Painel Admin alimentadas pelas RPCs de métricas (0033_admin_metrics.sql).
// Apresentação pura, dark-safe, design-system (CSS custom properties).
//
// Rastreabilidade: cada bloco diz DE ONDE vem o dado (tabela/RPC) e o MRR é
// rotulado como ESTIMATIVA — nunca apresentado como número oficial do Stripe.

import type { CSSProperties } from "react";
import {
  BadgePercent,
  CreditCard,
  Database,
  Gift,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { EmptyState } from "../ui/EmptyState";
import { StatCard } from "./admin-sections";
import type {
  CouponOverviewRow,
  PlatformMetrics,
  RecentSubscription,
  SubscriptionSummaryRow,
  UsageSummary,
} from "./admin-metrics-api";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  return Number(n ?? 0).toLocaleString("pt-BR");
}

function fmtBRLFromCents(cents: number): string {
  return (Number(cents ?? 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const PLAN_LABELS: Record<string, string> = {
  free: "Grátis",
  pro: "Pro",
  corporativo: "Corporativo",
};
function planLabel(plan: string): string {
  return PLAN_LABELS[plan] ?? plan;
}

const STATUS_LABELS: Record<string, string> = {
  active: "Ativa",
  trialing: "Em teste",
  past_due: "Pagamento atrasado",
  canceled: "Cancelada",
  incomplete: "Incompleta",
  unpaid: "Não paga",
  free: "Grátis",
};
function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

const STATUS_BADGE: Record<string, string> = {
  active: "badge--ok",
  trialing: "badge--info",
  past_due: "badge--warn",
  unpaid: "badge--danger",
  canceled: "badge--neutral",
  incomplete: "badge--neutral",
  free: "badge--neutral",
};
function statusBadgeClass(status: string): string {
  return STATUS_BADGE[status] ?? "badge--neutral";
}

// ─── Placeholder honesto: backend (RPC) pendente ────────────────────────────────

export function BackendPendingNote({
  what,
  detail,
}: {
  what: string;
  detail?: string;
}) {
  return (
    <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
      <EmptyState
        icon={Database}
        tone="info"
        title={`${what}: aguardando o backend`}
        description={
          detail ??
          "As funções de agregação (infra/migrations/0033_admin_metrics.sql) ainda não foram aplicadas neste ambiente. Nenhum número é exibido até a fonte existir — sem dados inventados."
        }
      />
    </div>
  );
}

// ─── Seção: Receita & Assinaturas (visão geral de métricas) ─────────────────────

export function MetricsOverviewSection({ data }: { data: PlatformMetrics }) {
  const { users, subscriptions, usage } = data;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14 }}>
        <StatCard
          icon={Wallet}
          label="MRR estimado"
          value={fmtBRLFromCents(subscriptions.mrr_cents)}
          hint="Estimativa por plano · não é o Stripe"
          accent
        />
        <StatCard
          icon={CreditCard}
          label="Assinantes ativos"
          value={fmtNum(subscriptions.paying)}
          hint={subscriptions.past_due > 0 ? `${fmtNum(subscriptions.past_due)} em atraso` : "active + trialing"}
        />
        <StatCard icon={Gift} label="Trials de cupom" value={fmtNum(subscriptions.trials)} hint="vigentes agora" />
        <StatCard icon={Users} label="Usuários" value={fmtNum(users.total)} hint={`+${fmtNum(users.new_7d)} em 7 dias`} />
        <StatCard icon={Sparkles} label="IA (24h)" value={fmtNum(usage.ai_hits_24h)} hint="chamadas por IP · ai_rate_limits" />
        <StatCard icon={BadgePercent} label="Consultas (30d)" value={fmtNum(usage.lookups_30d)} hint="external_lookups" />
      </div>
      <div className="tiny muted" style={{ textAlign: "right" }}>
        Fonte: RPC admin_platform_metrics · atualizado em {fmtDateTime(data.generated_at)}
      </div>
    </div>
  );
}

// ─── Seção: Assinaturas (quebra por plano/status + recentes) ────────────────────

export function SubscriptionsSection({
  summary,
  recent,
}: {
  summary: SubscriptionSummaryRow[];
  recent: RecentSubscription[];
}) {
  const totalSubs = summary.reduce((sum, r) => sum + r.total, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Quebra por plano/status */}
      <div className="panel" style={{ overflow: "hidden" }}>
        <div className="row between" style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <div className="h3">Assinaturas por plano e status</div>
          <span className="badge badge--neutral">{fmtNum(totalSubs)} no total</span>
        </div>
        {summary.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            tone="neutral"
            title="Nenhuma assinatura registrada"
            description="Quando o webhook do Stripe gravar a primeira assinatura, a quebra por plano aparece aqui."
          />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "inherit" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {(["Plano", "Status", "Assinaturas", "Próxima renovação"] as const).map((h) => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summary.map((row, i) => (
                  <tr key={`${row.plan_id}:${row.status}`} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "var(--t-hi)" }}>{planLabel(row.plan_id)}</span>
                    </td>
                    <td style={tdStyle}>
                      <span className={`badge ${statusBadgeClass(row.status)}`}>{statusLabel(row.status)}</span>
                    </td>
                    <td style={tdStyle}>
                      <span className="num" style={{ fontSize: 14, fontWeight: 700, color: "var(--t-hi)" }}>{fmtNum(row.total)}</span>
                    </td>
                    <td style={tdStyle}>
                      <span className="tiny" style={{ color: "var(--t-mid)" }}>{fmtDate(row.next_renewal)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Assinaturas recentes (e-mail mascarado) */}
      <div className="panel" style={{ overflow: "hidden" }}>
        <div className="row between" style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <div className="h3">Assinaturas recentes</div>
          <span className="tiny muted">e-mail mascarado · subscriptions</span>
        </div>
        {recent.length === 0 ? (
          <div className="muted small" style={{ padding: 20 }}>Nenhuma assinatura para mostrar.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "inherit" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {(["Assinante", "Plano", "Status", "Renova/expira", "Atualizada"] as const).map((h) => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recent.map((row, i) => (
                  <tr key={row.id} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 13, color: "var(--t-hi)", wordBreak: "break-all" }}>{row.email_masked}</span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--t-hi)" }}>{planLabel(row.plan_id)}</span>
                    </td>
                    <td style={tdStyle}>
                      <span className={`badge ${statusBadgeClass(row.status)}`}>{statusLabel(row.status)}</span>
                      {row.cancel_at_period_end ? (
                        <div className="tiny" style={{ color: "var(--warn)", marginTop: 2 }}>cancela no fim do ciclo</div>
                      ) : null}
                    </td>
                    <td style={tdStyle}><span className="tiny" style={{ color: "var(--t-mid)" }}>{fmtDate(row.current_period_end)}</span></td>
                    <td style={tdStyle}><span className="tiny muted">{fmtDateTime(row.updated_at)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Seção: Uso (eventos por tipo e módulo) ─────────────────────────────────────

interface UsageBarRow {
  label: string;
  total: number;
}

function UsageBars({ title, rows }: { title: string; rows: UsageBarRow[] }) {
  const max = rows.reduce((m, r) => Math.max(m, r.total), 0);
  return (
    <div className="panel" style={{ overflow: "hidden" }}>
      <div className="row between" style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
        <div className="h3">{title}</div>
        <span className="tiny muted">usage_events</span>
      </div>
      {rows.length === 0 ? (
        <div className="muted small" style={{ padding: 20 }}>Nenhum evento no período.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {rows.map((row, i) => {
            const pct = max > 0 ? Math.round((row.total / max) * 100) : 0;
            const label = row.label || "—";
            return (
              <div
                key={label}
                style={{ padding: "13px 20px", borderTop: i > 0 ? "1px solid var(--border)" : undefined, display: "flex", flexDirection: "column", gap: 6 }}
              >
                <div className="row between">
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--t-hi)" }}>{label}</span>
                  <span className="tiny num" style={{ color: "var(--t-mid)", fontWeight: 700 }}>{fmtNum(row.total)}</span>
                </div>
                <div style={{ height: 6, borderRadius: 999, background: "var(--surface-2)", overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", borderRadius: 999, background: "linear-gradient(90deg,var(--brand),var(--accent))" }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function UsageSection({ data }: { data: UsageSummary }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14 }}>
        <StatCard icon={TrendingUp} label={`Eventos (${data.days}d)`} value={fmtNum(data.total_events)} accent />
        <StatCard icon={Users} label="Usuários ativos" value={fmtNum(data.active_users)} hint={`últimos ${data.days} dias`} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18 }}>
        <UsageBars
          title="Uso por tipo de evento"
          rows={data.by_type.map((r) => ({ label: r.event_type, total: r.total }))}
        />
        <UsageBars
          title="Uso por módulo"
          rows={data.by_module.map((r) => ({ label: r.module_id, total: r.total }))}
        />
      </div>
      <div className="tiny muted" style={{ textAlign: "right" }}>
        Fonte: RPC admin_usage_summary (janela de {data.days} dias)
      </div>
    </div>
  );
}

// ─── Seção: Cupons ──────────────────────────────────────────────────────────────

export function CouponsSection({ coupons }: { coupons: CouponOverviewRow[] }) {
  return (
    <div className="panel" style={{ overflow: "hidden" }}>
      <div className="row between" style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
        <div className="h3">Cupons de teste</div>
        <span className="tiny muted">{coupons.length} cadastrado(s)</span>
      </div>
      {coupons.length === 0 ? (
        <EmptyState
          icon={Gift}
          tone="neutral"
          title="Nenhum cupom cadastrado"
          description="Cupons concedem período de teste sem cartão. Crie-os no banco (tabela coupons) — a gestão de criação ainda é via SQL."
        />
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "inherit" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {(["Código", "Tipo", "Dias", "Usos", "Vigentes", "Estado", "Expira"] as const).map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {coupons.map((c, i) => {
                const exhausted = c.max_redemptions != null && c.redeemed_count >= c.max_redemptions;
                return (
                  <tr key={c.code} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                    <td style={tdStyle}>
                      <code style={{ fontSize: 13, fontWeight: 700, color: "var(--t-hi)" }}>{c.code}</code>
                    </td>
                    <td style={tdStyle}><span className="tiny" style={{ color: "var(--t-mid)" }}>{c.kind}</span></td>
                    <td style={tdStyle}><span className="tiny num" style={{ color: "var(--t-mid)" }}>{c.trial_days}</span></td>
                    <td style={tdStyle}>
                      <span className="tiny num" style={{ color: "var(--t-mid)" }}>
                        {fmtNum(c.redeemed_count)}{c.max_redemptions != null ? ` / ${fmtNum(c.max_redemptions)}` : ""}
                      </span>
                    </td>
                    <td style={tdStyle}><span className="tiny num" style={{ color: "var(--t-mid)" }}>{fmtNum(c.active_redemptions)}</span></td>
                    <td style={tdStyle}>
                      {!c.active ? (
                        <span className="badge badge--neutral">inativo</span>
                      ) : exhausted ? (
                        <span className="badge badge--warn">esgotado</span>
                      ) : (
                        <span className="badge badge--ok">ativo</span>
                      )}
                    </td>
                    <td style={tdStyle}><span className="tiny muted">{fmtDate(c.expires_at)}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── estilos de tabela compartilhados (espelham admin-sections) ──────────────────

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
