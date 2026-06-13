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

// ─── Constants ────────────────────────────────────────────────────────────────

/** Contato de suporte do produto (público, honesto). */
const SUPPORT_EMAIL = "contato@fontebrasil.online";

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
  { id: "privacidade", label: "Privacidade & Cookies" },
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
  until,
  planLoading,
}: Pick<AccountPageProps, "name" | "email" | "avatarUrl"> & TabPerfilPlanProps) {
  const watchCount = useWatchlistCount();

  // Rótulo do badge de plano (exibido sob o email)
  const badgeLabel = planLoading
    ? "Carregando..."
    : isPro
      ? trial
        ? "Teste ativo"
        : planLabel(plan)
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
      : "Gratuito";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Identidade */}
      <div className="panel" style={{ padding: 26 }}>
        <div className="row" style={{ gap: 16, marginBottom: 24 }}>
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={name}
              className="avatar"
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
        <TRow label="Membro desde" val="Junho 2026" />
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
            <strong style={{ fontSize: 15 }}>Desbloqueie o acesso completo</strong>
          </div>
          <p
            style={{
              fontSize: 13,
              opacity: 0.85,
              lineHeight: 1.5,
              margin: "0 0 14px",
            }}
          >
            Análises ilimitadas, alertas de novos editais e relatórios com
            rastreabilidade completa. Comece com 7 dias grátis — só paga depois.
          </p>
          <button
            type="button"
            className="btn btn--accent"
            onClick={() => navigate("/app/planos")}
          >
            <Zap size={15} aria-hidden="true" />
            Ver planos
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
  until: string | undefined;
  planLoading: boolean;
}

function TabAssinatura({ isPro, plan, trial, until, planLoading }: TabAssinaturaProps) {
  const badgeLabel = planLoading
    ? "Carregando..."
    : isPro
      ? trial ? "Teste ativo" : "Ativo"
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
        ? `Acesso de teste (${planLabel(plan)}) ativo até ${formatUntil(until)}. Assine para manter sem interrupção.`
        : `Você está no plano ${planLabel(plan)}. Gerencie ou cancele abaixo.`
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

      {!isPro && (
        <div style={{ marginBottom: 18 }}>
          <CouponRedeem compact />
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

      <TRow label="Método de pagamento" val="Não cadastrado" />
      <TRow label="Próxima cobrança" val="—" />
      <TRow label="Teste" val="7 dias grátis nos planos pagos" />
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
        Privacidade & Cookies
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
  const { plan, isPro, trial, until, loading: planLoading } = usePlan();

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
    <section className="page-panel account-page">
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
