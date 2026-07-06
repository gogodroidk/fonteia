import { useEffect, useState, type CSSProperties } from "react";
import {
  ArrowRight,
  Bell,
  Check,
  Cookie,
  ExternalLink,
  FileText,
  Gavel,
  Heart,
  HelpCircle,
  Lock,
  LogOut,
  Mail,
  MessageCircle,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  User,
  Zap,
} from "lucide-react";
import { openCookieSettings } from "../../lib/consent";
import { readWatchlist, subscribeWatchlist } from "../../lib/watchlist";
import { useTheme } from "../../theme/theme-context";
import type { Theme } from "../../theme/theme-context";
import { STRIPE_CUSTOMER_PORTAL_URL } from "../../config/stripe";
import { CouponRedeem } from "../../components/coupon-redeem";
import { usePlan } from "../../lib/use-plan";
import type { PlanId } from "../../lib/use-plan";
import { requestStripePortalUrl } from "../../lib/stripe-portal-client";
import { useIsAdmin } from "../../components/admin/use-is-admin";
import { TrialBadge } from "../../components/ui/TrialBadge";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Contato de suporte do produto (público, honesto). */
const SUPPORT_EMAIL = "contato@olli.com.br";

/** Rótulo legível do plano vindo do hook usePlan(). */
function planLabel(plan: PlanId): string {
  if (plan === "corporativo") return "Corporativo";
  if (plan === "pro") return "Profissional";
  return "Gratuito";
}

/** Formata a data de expiração de trial para pt-BR. */
function formatUntil(until: string): string {
  const date = new Date(until);
  if (Number.isNaN(date.getTime())) return until;
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Navegação SPA via History API (mesmo esquema do App: pushState + popstate).
 * Mantém URLs compartilháveis e o botão voltar funcionando, sem reload.
 */
function navigate(to: string): void {
  if (typeof window === "undefined") return;
  if (to.startsWith("/")) {
    window.history.pushState(null, "", to);
    window.dispatchEvent(new PopStateEvent("popstate"));
  } else {
    window.location.href = to;
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface AccountPageProps {
  name: string;
  email: string;
  avatarUrl?: string | undefined;
  onSignOut: () => void;
}

type TabId =
  | "perfil"
  | "assinatura"
  | "aparencia"
  | "notificacoes"
  | "privacidade"
  | "seguranca"
  | "ajuda";

interface TabDef {
  id: TabId;
  label: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const TABS: TabDef[] = [
  { id: "perfil", label: "Perfil" },
  { id: "assinatura", label: "Assinatura" },
  { id: "aparencia", label: "Aparência" },
  { id: "notificacoes", label: "Notificações" },
  { id: "privacidade", label: "Privacidade e Cookies" },
  { id: "seguranca", label: "Segurança" },
  { id: "ajuda", label: "Ajuda" },
];

// ─── Small helpers ───────────────────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0] ?? "";
  const second = parts[1] ?? "";
  return (first[0] ?? "").toUpperCase() + (second[0] ?? "").toUpperCase();
}

function SwitchToggle({
  on,
  onToggle,
}: {
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className={"switch" + (on ? " on" : "")}
      style={{ flexShrink: 0 }}
    >
      <i />
    </button>
  );
}

function TRow({ label, val }: { label: string; val: string }) {
  return (
    <div
      className="row between"
      style={{ padding: "12px 0", borderTop: "1px solid var(--border)" }}
    >
      <span style={{ fontSize: 13.5, color: "var(--t-mid)" }}>{label}</span>
      <span style={{ fontSize: 13.5, fontWeight: 600 }}>{val}</span>
    </div>
  );
}

/**
 * Live count of the local watchlist (key `fonteia_watchlist`). Reflects writes
 * from the Lotes/Alertas pages in the same tab and across tabs. Degrades to 0
 * when storage is unavailable.
 */
function useWatchlistCount(): number {
  const [count, setCount] = useState<number>(() => readWatchlist().length);
  useEffect(() => subscribeWatchlist((ids) => setCount(ids.length)), []);
  return count;
}

/** A full-width navigation row used for in-app links and legal pages. */
function LinkRow({
  icon: Icon,
  label,
  hint,
  onClick,
  href,
  external,
}: {
  icon: typeof User;
  label: string;
  hint?: string;
  onClick?: () => void;
  href?: string;
  external?: boolean;
}) {
  const inner = (
    <>
      <span
        className="inset"
        aria-hidden="true"
        style={{
          width: 34,
          height: 34,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon size={16} style={{ color: "var(--t-mid)" }} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 14, fontWeight: 600 }}>
          {label}
        </span>
        {hint && (
          <span
            style={{
              display: "block",
              fontSize: 12.5,
              color: "var(--t-mid)",
              marginTop: 1,
            }}
          >
            {hint}
          </span>
        )}
      </span>
      {external ? (
        <ExternalLink size={15} aria-hidden="true" style={{ color: "var(--t-mid)", flexShrink: 0 }} />
      ) : (
        <ArrowRight size={15} aria-hidden="true" style={{ color: "var(--t-mid)", flexShrink: 0 }} />
      )}
    </>
  );

  const rowStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 12,
    width: "100%",
    minHeight: 56,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--t-hi)",
    textAlign: "left",
    textDecoration: "none",
    cursor: "pointer",
    font: "inherit",
  };

  if (href) {
    return (
      <a
        href={href}
        style={rowStyle}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {inner}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} style={rowStyle}>
      {inner}
    </button>
  );
}

// ─── Tab panels ─────────────────────────────────────────────────────────────

interface TabPerfilPlanProps {
  isPro: boolean;
  plan: PlanId;
  trial: boolean;
  status: string;
  until: string | undefined;
  planLoading: boolean;
}

function TabPerfil({
  name,
  email,
  avatarUrl,
  isPro,
  plan,
  trial,
  status,
  until,
  planLoading,
}: Pick<AccountPageProps, "name" | "email" | "avatarUrl"> & TabPerfilPlanProps) {
  const watchCount = useWatchlistCount();

  // Se a imagem do avatar (ex.: Google) falhar, cai para as iniciais.
  const [avatarError, setAvatarError] = useState(false);

  const expired = status === "expired";

  // Rótulo do badge de plano (exibido sob o email)
  const badgeLabel = planLoading
    ? "Carregando…"
    : isPro
      ? trial
        ? "Teste ativo"
        : planLabel(plan)
      : expired
        ? "Teste acabou"
        : "Sem assinatura";

  const badgeClass = planLoading
    ? "badge badge--neutral"
    : isPro
      ? "badge badge--accent"
      : "badge badge--neutral";

  // Linha "Plano atual" na tabela
  const planRowVal = planLoading
    ? "…"
    : isPro
      ? trial && until !== undefined
        ? `${planLabel(plan)} — teste até ${formatUntil(until)}`
        : planLabel(plan)
      : expired
        ? until !== undefined
          ? `Gratuito — teste encerrado em ${formatUntil(until)}`
          : "Gratuito — teste encerrado"
        : "Gratuito";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Identidade */}
      <div className="panel" style={{ padding: 26 }}>
        <div className="row" style={{ gap: 16, marginBottom: 24 }}>
          {avatarUrl && !avatarError ? (
            <img
              src={avatarUrl}
              alt={name}
              className="avatar"
              width={60}
              height={60}
              loading="lazy"
              decoding="async"
              onError={() => setAvatarError(true)}
              style={{ width: 60, height: 60 }}
            />
          ) : (
            <div
              className="avatar"
              style={{ width: 60, height: 60, fontSize: 22 }}
            >
              {getInitials(name)}
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>{name}</div>
            <div
              className="row"
              style={{
                gap: 5,
                color: "var(--t-mid)",
                fontSize: 14,
                marginTop: 3,
                wordBreak: "break-word",
              }}
            >
              <Mail size={13} aria-hidden="true" style={{ flexShrink: 0 }} />
              {email}
            </div>
            <span className={badgeClass} style={{ marginTop: 8 }}>
              {badgeLabel}
            </span>
          </div>
        </div>
        {/* Teste vigente: contagem regressiva. Não mostra o paywall de expirado
            aqui — o painel dourado "Desbloqueie o acesso" abaixo já cobre o CTA. */}
        {!planLoading && trial && until !== undefined && (
          <div style={{ marginBottom: 16 }}>
            <TrialBadge trial={trial} status={status} until={until} size="md" />
          </div>
        )}
        <TRow label="Plano atual" val={planRowVal} />
        <TRow label="Teste" val="7 dias grátis nos planos pagos" />
      </div>

      {/* Meu radar — watchlist local */}
      <div className="panel" style={{ padding: 22 }}>
        <div className="row between" style={{ marginBottom: 14 }}>
          <div className="row" style={{ gap: 9 }}>
            <span
              className="inset"
              aria-hidden="true"
              style={{
                width: 36,
                height: 36,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Heart size={17} style={{ color: "var(--accent-ink)" }} />
            </span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Meu radar</div>
              <div style={{ fontSize: 12.5, color: "var(--t-mid)" }}>
                Lotes que você marcou para acompanhar
              </div>
            </div>
          </div>
          <span className="badge badge--neutral" aria-live="polite">
            {watchCount} {watchCount === 1 ? "lote" : "lotes"}
          </span>
        </div>
        <p
          style={{
            fontSize: 13.5,
            color: "var(--t-mid)",
            lineHeight: 1.55,
            margin: "0 0 14px",
          }}
        >
          {watchCount === 0
            ? "Você ainda não acompanha nenhum lote. Toque no coração de um lote para salvá-lo aqui — fica guardado neste navegador."
            : `Você acompanha ${watchCount} ${watchCount === 1 ? "lote" : "lotes"}. Volte à lista para revisar prazos e detalhes.`}
        </p>
        <button
          type="button"
          className="btn btn--ghost btn--block"
          onClick={() => navigate("/app/lotes")}
        >
          <Gavel size={15} aria-hidden="true" />
          {watchCount === 0 ? "Explorar lotes" : "Ver meus lotes"}
        </button>
      </div>

      {/* Ampliar acesso — só aparece para usuários sem plano pago */}
      {!isPro && (
        <div
          className="panel"
          style={{
            padding: 22,
            background: "linear-gradient(135deg,var(--brand),#13294d)",
            color: "#fff",
            border: "none",
          }}
        >
          <div className="row" style={{ gap: 8, marginBottom: 6 }}>
            <Sparkles size={17} aria-hidden="true" />
            <strong style={{ fontSize: 15 }}>
              {expired ? "Seu teste de 7 dias acabou" : "Desbloqueie o acesso completo"}
            </strong>
          </div>
          <p
            style={{
              fontSize: 13,
              opacity: 0.85,
              lineHeight: 1.5,
              margin: "0 0 14px",
            }}
          >
            {expired
              ? "Assine para voltar a ter análises ilimitadas, alertas de novos editais e relatórios com rastreabilidade completa."
              : "Análises ilimitadas, alertas de novos editais e relatórios com rastreabilidade completa. Comece com 7 dias grátis — só paga depois."}
          </p>
          <button
            type="button"
            className="btn btn--accent"
            onClick={() => navigate("/app/planos")}
          >
            <Zap size={15} aria-hidden="true" />
            {expired ? "Assinar agora" : "Ver planos"}
          </button>
        </div>
      )}
    </div>
  );
}

interface TabAssinaturaProps {
  isPro: boolean;
  plan: PlanId;
  trial: boolean;
  status: string;
  until: string | undefined;
  planLoading: boolean;
}

function TabAssinatura({ isPro, plan, trial, status, until, planLoading }: TabAssinaturaProps) {
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  // Abre o Stripe Customer Portal: pede a URL ao backend e redireciona. Degrada com
  // elegância — sem assinatura/portal indisponível mostra um aviso com o contato.
  async function handleManageSubscription() {
    setPortalError(null);
    setPortalLoading(true);
    try {
      const result = await requestStripePortalUrl();
      if (result.ok) {
        window.location.href = result.url;
        return; // navegação em curso; mantém o loading até sair da página
      }
      if (result.reason === "sem_assinatura") {
        setPortalError(
          `Não encontramos uma assinatura ativa para gerenciar. Se você assinou, fale com ${SUPPORT_EMAIL}.`,
        );
      } else if (result.reason === "nao_autenticado") {
        setPortalError("Sua sessão expirou. Entre novamente para gerenciar a assinatura.");
      } else {
        setPortalError(
          `Não foi possível abrir o portal agora. Tente de novo em instantes ou fale com ${SUPPORT_EMAIL}.`,
        );
      }
    } catch {
      setPortalError(`Não foi possível abrir o portal agora. Fale com ${SUPPORT_EMAIL}.`);
    } finally {
      setPortalLoading(false);
    }
  }

  const expired = status === "expired";

  const badgeLabel = planLoading
    ? "Carregando…"
    : isPro
      ? trial ? "Teste ativo" : "Ativo"
      : expired
        ? "Teste acabou"
        : "Sem assinatura";

  const badgeClass = planLoading
    ? "badge badge--neutral"
    : isPro
      ? "badge badge--accent"
      : "badge badge--neutral";

  const descText = planLoading
    ? "Verificando seu plano…"
    : isPro
      ? trial && until !== undefined
        ? `Acesso de teste (${planLabel(plan)}) ativo até ${formatUntil(until)}. Assine para manter o acesso sem interrupção.`
        : `Você está no plano ${planLabel(plan)}. Gerencie ou cancele abaixo.`
      : expired
        ? until !== undefined
          ? `Seu teste de 7 dias acabou em ${formatUntil(until)}. Assine para voltar a ter acesso completo.`
          : "Seu teste de 7 dias acabou. Assine para voltar a ter acesso completo."
        : "Você ainda não assinou. Escolha um plano, ou ative um cupom de teste abaixo.";

  return (
    <div className="panel" style={{ padding: 26 }}>
      <div
        className="row between"
        style={{ marginBottom: 18 }}
      >
        <div style={{ fontWeight: 700, fontSize: 15 }}>Plano atual</div>
        <span className={badgeClass}>
          {badgeLabel}
        </span>
      </div>

      <div style={{ fontSize: 13, color: "var(--t-mid)", marginBottom: 18 }}>
        {descText}
      </div>

      {/* Estado do teste: contagem regressiva (vigente) ou paywall honesto
          (expirado). O CTA de expirado leva aos planos. */}
      {!planLoading && (trial && until !== undefined || expired) && (
        <div style={{ marginBottom: 18 }}>
          <TrialBadge
            trial={trial}
            status={status}
            until={until}
            size="md"
            {...(expired ? { onUpgrade: () => navigate("/app/planos") } : {})}
          />
        </div>
      )}

      {!isPro && (
        <div style={{ marginBottom: 18 }}>
          {/* onRedeemed força um reload: usePlan só re-busca em onAuthStateChange,
              e resgatar cupom não dispara auth change — sem isto o app seguiria
              tratando o usuário como free até um reload manual. */}
          <CouponRedeem
            compact
            onRedeemed={() => {
              window.location.reload();
            }}
          />
        </div>
      )}

      {!isPro && (
        <div
          style={{
            padding: 20,
            borderRadius: 14,
            background: "linear-gradient(135deg,var(--brand),#13294d)",
            color: "#fff",
            marginBottom: 18,
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 16 }}>
            Profissional — R$ 197/mês
          </div>
          <div
            style={{
              fontSize: 13,
              opacity: 0.85,
              marginTop: 5,
              lineHeight: 1.5,
            }}
          >
            Análises ilimitadas, alertas de editais e relatórios PDF com
            rastreabilidade completa.
          </div>
          <button
            type="button"
            className="btn btn--accent"
            onClick={() => navigate("/app/planos")}
            style={{ marginTop: 14 }}
          >
            <Zap size={15} aria-hidden="true" />
            Assinar agora
          </button>
        </div>
      )}

      {/* Gerenciar assinatura: visível para quem tem assinatura (isPro). Abre o
          Stripe Customer Portal via Edge Function. Se o dono definir um link estático
          em STRIPE_CUSTOMER_PORTAL_URL, ele vira fallback (abre em nova aba). */}
      {isPro && !STRIPE_CUSTOMER_PORTAL_URL && (
        <div style={{ marginBottom: 18 }}>
          <button
            type="button"
            className="btn btn--ghost btn--block"
            onClick={handleManageSubscription}
            disabled={portalLoading}
            aria-busy={portalLoading}
          >
            <ExternalLink size={15} aria-hidden="true" />
            {portalLoading ? "Abrindo portal…" : "Gerenciar assinatura"}
          </button>
          {portalError && (
            <div
              role="alert"
              className="small"
              style={{ marginTop: 8, color: "var(--danger,#b42318)", lineHeight: 1.5 }}
            >
              {portalError}
            </div>
          )}
        </div>
      )}

      {STRIPE_CUSTOMER_PORTAL_URL && (
        <a
          className="btn btn--ghost btn--block"
          href={STRIPE_CUSTOMER_PORTAL_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{ marginBottom: 18 }}
        >
          Gerenciar assinatura
        </a>
      )}

      {isPro && trial && until !== undefined && (
        <TRow label="Teste até" val={formatUntil(until)} />
      )}
      {isPro && !trial && (
        <div
          className="small muted"
          style={{ marginTop: 4, lineHeight: 1.5 }}
        >
          Gerencie a forma de pagamento e veja suas faturas no portal do Stripe
          (botão acima).
        </div>
      )}
      {!isPro && (
        <TRow label="Teste" val="7 dias grátis nos planos pagos" />
      )}
    </div>
  );
}

function TabAparencia() {
  const { theme, setTheme } = useTheme();

  const options: { value: Theme; label: string; icon: typeof Sun }[] = [
    { value: "light", label: "Claro", icon: Sun },
    { value: "dark", label: "Escuro", icon: Moon },
  ];

  return (
    <div className="panel" style={{ padding: 24 }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>
        Tema
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
        }}
      >
        {options.map(({ value, label, icon: Icon }) => {
          const active = theme === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              style={{
                padding: 18,
                textAlign: "left",
                cursor: "pointer",
                borderRadius: 13,
                border: `2px solid ${active ? "var(--brand-ink)" : "var(--border)"}`,
                background: active
                  ? "color-mix(in srgb,var(--brand) 8%,transparent)"
                  : "var(--surface)",
                boxShadow: active ? "0 0 0 3px var(--ring)" : "none",
                transition: "all .18s",
                font: "inherit",
              }}
            >
              <div
                className="row between"
                style={{ marginBottom: 10 }}
              >
                <Icon
                  size={18}
                  aria-hidden="true"
                  style={{
                    color: active ? "var(--brand-ink)" : "var(--t-mid)",
                  }}
                />
                {active && (
                  <Check
                    size={16}
                    aria-hidden="true"
                    style={{ color: "var(--brand-ink)" }}
                    strokeWidth={2.5}
                  />
                )}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{label}</div>
              <div
                style={{
                  height: 28,
                  borderRadius: 7,
                  marginTop: 10,
                  background:
                    value === "dark"
                      ? "linear-gradient(135deg,#0E1626,#16223A)"
                      : "linear-gradient(135deg,#fff,#EEF2F8)",
                  border: "1px solid var(--border)",
                }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TabNotificacoes() {
  // Único canal real hoje: avisos dentro do app. Os demais são honestos ("em breve").
  const [inApp, setInApp] = useState(true);

  const soon: { icon: typeof Mail; title: string; desc: string }[] = [
    {
      icon: Mail,
      title: "E-mail",
      desc: "Resumo semanal dos melhores lotes do seu radar.",
    },
    {
      icon: MessageCircle,
      title: "WhatsApp",
      desc: "Alerta no celular quando um novo edital for publicado.",
    },
  ];

  return (
    <div className="panel" style={{ padding: 24 }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
        Notificações
      </div>
      <div
        style={{
          fontSize: 13,
          color: "var(--t-mid)",
          marginBottom: 12,
        }}
      >
        Como você quer ser avisado dos editais.
      </div>

      {/* Canal ativo hoje */}
      <div
        className="row between"
        style={{ padding: "14px 0", borderTop: "1px solid var(--border)" }}
      >
        <div className="row" style={{ gap: 11 }}>
          <span
            className="inset"
            aria-hidden="true"
            style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
          >
            <Bell size={16} style={{ color: "var(--t-mid)" }} />
          </span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Avisos no app</div>
            <div style={{ fontSize: 12.5, color: "var(--t-mid)", marginTop: 2 }}>
              Mostra novidades e prazos enquanto você navega.
            </div>
          </div>
        </div>
        <SwitchToggle on={inApp} onToggle={() => setInApp((v) => !v)} />
      </div>

      {/* Canais futuros — honestos */}
      {soon.map(({ icon: Icon, title, desc }) => (
        <div
          key={title}
          className="row between"
          style={{ padding: "14px 0", borderTop: "1px solid var(--border)", opacity: 0.72 }}
        >
          <div className="row" style={{ gap: 11 }}>
            <span
              className="inset"
              aria-hidden="true"
              style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
            >
              <Icon size={16} style={{ color: "var(--t-mid)" }} />
            </span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
              <div style={{ fontSize: 12.5, color: "var(--t-mid)", marginTop: 2 }}>
                {desc}
              </div>
            </div>
          </div>
          <span className="badge badge--neutral" style={{ flexShrink: 0 }}>
            Em breve
          </span>
        </div>
      ))}
    </div>
  );
}

function TabPrivacidade() {
  return (
    <div className="panel" style={{ padding: 24 }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
        Privacidade e Cookies
      </div>
      <div
        style={{
          fontSize: 13,
          color: "var(--t-mid)",
          marginBottom: 16,
        }}
      >
        Gerencie como seus dados são coletados e usados nesta plataforma,
        conforme a LGPD.
      </div>

      <button
        type="button"
        className="btn btn--ghost"
        onClick={openCookieSettings}
        style={{ marginBottom: 18 }}
      >
        <Cookie size={15} aria-hidden="true" />
        Gerenciar cookies
      </button>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <LinkRow
          icon={Lock}
          label="Política de privacidade"
          hint="Como tratamos seus dados pessoais"
          onClick={() => navigate("/privacidade")}
        />
        <LinkRow
          icon={Cookie}
          label="Política de cookies"
          hint="Quais cookies usamos e por quê"
          onClick={() => navigate("/cookies")}
        />
        <LinkRow
          icon={FileText}
          label="Termos de uso"
          hint="Regras de uso da plataforma"
          onClick={() => navigate("/termos")}
        />
      </div>
    </div>
  );
}

function TabSeguranca({
  onSignOut,
  confirmDelete,
  setConfirmDelete,
}: {
  onSignOut: () => void;
  confirmDelete: boolean;
  setConfirmDelete: (v: boolean) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="panel" style={{ padding: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>
          Segurança
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <button
            type="button"
            className="btn btn--ghost btn--block"
            style={{ justifyContent: "flex-start" }}
            onClick={onSignOut}
          >
            <LogOut size={15} aria-hidden="true" />
            Sair da conta
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--block"
            style={{
              justifyContent: "flex-start",
              color: "var(--danger)",
              borderColor: "color-mix(in srgb,var(--danger) 30%,var(--border))",
            }}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 size={15} aria-hidden="true" />
            Excluir minha conta
          </button>
        </div>
      </div>

      {confirmDelete && (
        <div
          className="panel"
          role="dialog"
          aria-modal="true"
          aria-label="Confirmar exclusão"
          style={{
            padding: 24,
            borderColor: "color-mix(in srgb,var(--danger) 30%,var(--border))",
          }}
        >
          <div
            className="row"
            style={{ gap: 10, marginBottom: 12 }}
          >
            <ShieldCheck
              size={18}
              aria-hidden="true"
              style={{ color: "var(--danger)", flexShrink: 0 }}
            />
            <strong style={{ fontSize: 14 }}>Exclusão de dados (LGPD)</strong>
          </div>
          <p
            style={{
              fontSize: 13.5,
              color: "var(--t-mid)",
              lineHeight: 1.6,
              margin: "0 0 16px",
            }}
          >
            Para excluir sua conta e seus dados, envie um pedido para{" "}
            <a
              href="mailto:privacidade@olli.com.br?subject=Excluir%20minha%20conta"
              className="link"
            >
              privacidade@olli.com.br
            </a>
            . Concluímos em até 15 dias, conforme a LGPD.
          </p>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setConfirmDelete(false)}
          >
            Fechar
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Ajuda ───────────────────────────────────────────────────────────────────

function TabAjuda() {
  const steps: { n: number; title: string; desc: string }[] = [
    {
      n: 1,
      title: "Edital publicado",
      desc: "A Receita Federal anuncia o leilão de mercadorias apreendidas e fixa um prazo para lances.",
    },
    {
      n: 2,
      title: "Habilitação",
      desc: "Você se cadastra no portal oficial com CPF/CNPJ e certificado digital antes de dar lances.",
    },
    {
      n: 3,
      title: "Lances",
      desc: "Os lances são eletrônicos e públicos. Vence quem oferecer o maior valor acima do lance mínimo.",
    },
    {
      n: 4,
      title: "Pagamento e retirada",
      desc: "Após arrematar, você paga no prazo do edital e retira a mercadoria no local indicado.",
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Como funciona um leilão da Receita */}
      <div className="panel" style={{ padding: 24 }}>
        <div className="row" style={{ gap: 9, marginBottom: 6 }}>
          <span
            className="inset"
            aria-hidden="true"
            style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <HelpCircle size={17} style={{ color: "var(--brand-ink)" }} />
          </span>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            Como funciona um leilão da Receita
          </div>
        </div>
        <p
          style={{
            fontSize: 13.5,
            color: "var(--t-mid)",
            lineHeight: 1.55,
            margin: "0 0 16px",
          }}
        >
          Um resumo honesto em 4 passos. Sempre confira as regras no edital
          oficial — os prazos e condições variam de leilão para leilão.
        </p>

        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          {steps.map(({ n, title, desc }) => (
            <li key={n} className="row" style={{ gap: 12, alignItems: "flex-start" }}>
              <span
                aria-hidden="true"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  fontWeight: 800,
                  color: "#fff",
                  background: "linear-gradient(135deg,var(--brand),var(--accent))",
                }}
              >
                {n}
              </span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
                <div style={{ fontSize: 13, color: "var(--t-mid)", lineHeight: 1.5, marginTop: 2 }}>
                  {desc}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* Contato / suporte */}
      <div className="panel" style={{ padding: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
          Fale com a gente
        </div>
        <p
          style={{
            fontSize: 13.5,
            color: "var(--t-mid)",
            lineHeight: 1.55,
            margin: "0 0 14px",
          }}
        >
          Dúvidas, sugestões ou problemas? Respondemos por e-mail.
        </p>
        <LinkRow
          icon={Mail}
          label="Enviar e-mail para o suporte"
          hint={SUPPORT_EMAIL}
          href={`mailto:${SUPPORT_EMAIL}?subject=Suporte%20Fonte.ia`}
          external
        />
      </div>
    </div>
  );
}

// ─── Sidebar nav ────────────────────────────────────────────────────────────

const TAB_ICONS: Record<TabId, typeof User> = {
  perfil: User,
  assinatura: Zap,
  aparencia: Sun,
  notificacoes: Bell,
  privacidade: Cookie,
  seguranca: ShieldCheck,
  ajuda: HelpCircle,
};

function SideNav({
  activeTab,
  onSelect,
}: {
  activeTab: TabId;
  onSelect: (id: TabId) => void;
}) {
  return (
    <nav
      className="panel"
      aria-label="Navegação da conta"
      style={{ padding: 8, position: "sticky", top: 80 }}
    >
      {TABS.map(({ id, label }) => {
        const Icon = TAB_ICONS[id];
        const active = activeTab === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            aria-current={active ? "page" : undefined}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              width: "100%",
              padding: "11px 12px",
              borderRadius: 9,
              border: 0,
              cursor: "pointer",
              font: "inherit",
              fontSize: 13.5,
              fontWeight: active ? 700 : 500,
              background: active
                ? "color-mix(in srgb,var(--brand) 10%,transparent)"
                : "transparent",
              color: active ? "var(--brand-ink)" : "var(--t-mid)",
              textAlign: "left",
              marginBottom: 2,
              transition: "background .15s,color .15s",
            }}
          >
            <Icon size={15} aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </nav>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function AccountPage({ name, email, avatarUrl, onSignOut }: AccountPageProps) {
  const [activeTab, setActiveTab] = useState<TabId>("perfil");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { plan, isPro, trial, status, until, loading: planLoading } = usePlan();
  // Acesso ao painel de administração: aparece SÓ para quem tem role=admin
  // (gate server-side em profiles via RLS). Para os demais, nem renderiza.
  const { isAdmin } = useIsAdmin();

  function renderPanel() {
    switch (activeTab) {
      case "perfil":
        return (
          <TabPerfil
            name={name}
            email={email}
            avatarUrl={avatarUrl}
            isPro={isPro}
            plan={plan}
            trial={trial}
            status={status}
            until={until}
            planLoading={planLoading}
          />
        );
      case "assinatura":
        return (
          <TabAssinatura
            isPro={isPro}
            plan={plan}
            trial={trial}
            status={status}
            until={until}
            planLoading={planLoading}
          />
        );
      case "aparencia":
        return <TabAparencia />;
      case "notificacoes":
        return <TabNotificacoes />;
      case "privacidade":
        return <TabPrivacidade />;
      case "seguranca":
        return (
          <TabSeguranca
            onSignOut={onSignOut}
            confirmDelete={confirmDelete}
            setConfirmDelete={setConfirmDelete}
          />
        );
      case "ajuda":
        return <TabAjuda />;
    }
  }

  return (
    <section className="account-page" style={{ display: "flex", flexDirection: "column" }}>
      {/* ── Acesso ao painel de administração (só admin) ── */}
      {isAdmin && (
        <button
          type="button"
          onClick={() => navigate("/app/admin")}
          aria-label="Abrir o painel de administração"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            width: "100%",
            padding: 18,
            marginBottom: 20,
            borderRadius: 14,
            border: "none",
            cursor: "pointer",
            textAlign: "left",
            font: "inherit",
            color: "#fff",
            background: "linear-gradient(135deg,var(--brand),#13294d)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(255,255,255,0.14)",
              flexShrink: 0,
            }}
          >
            <ShieldCheck size={22} />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontWeight: 800, fontSize: 15 }}>
              Painel de Administração
            </span>
            <span style={{ display: "block", fontSize: 12.5, opacity: 0.85, marginTop: 2, lineHeight: 1.45 }}>
              Receita, usuários, uso, cupons e dados da plataforma — acesso exclusivo do administrador.
            </span>
          </span>
          <ArrowRight size={18} aria-hidden="true" style={{ flexShrink: 0 }} />
        </button>
      )}

      {/* ── Desktop: two-column layout ── */}
      <div
        className="account-tabs-layout"
        style={{
          display: "grid",
          gridTemplateColumns: "210px 1fr",
          gap: 20,
          alignItems: "start",
        }}
      >
        <SideNav activeTab={activeTab} onSelect={setActiveTab} />

        <div className="account-tab-content">{renderPanel()}</div>
      </div>

      {/* ── Mobile: stacked sections (hidden via CSS override below) ── */}
      <style>{`
        @media (max-width: 640px) {
          .account-tabs-layout {
            grid-template-columns: 1fr !important;
          }
          .account-tabs-layout nav[aria-label="Navegação da conta"] {
            position: static !important;
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
            padding: 6px !important;
          }
          .account-tabs-layout nav[aria-label="Navegação da conta"] button {
            flex: 0 0 auto;
            width: auto !important;
            padding: 8px 12px !important;
            font-size: 12.5px !important;
          }
        }
      `}</style>
    </section>
  );
}
