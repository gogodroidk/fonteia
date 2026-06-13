import { useState } from "react";
import {
  Bell,
  Check,
  Cookie,
  LogOut,
  Mail,
  Moon,
  ShieldCheck,
  Sun,
  Trash2,
  User,
  Zap,
} from "lucide-react";
import { openCookieSettings } from "../../lib/consent";
import { useTheme } from "../../theme/theme-context";
import type { Theme } from "../../theme/theme-context";

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
  | "seguranca";

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

// ─── Tab panels ─────────────────────────────────────────────────────────────

function TabPerfil({
  name,
  email,
  avatarUrl,
}: Pick<AccountPageProps, "name" | "email" | "avatarUrl">) {
  return (
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
        <div>
          <div style={{ fontWeight: 800, fontSize: 18 }}>{name}</div>
          <div
            className="row"
            style={{ gap: 5, color: "var(--t-mid)", fontSize: 14, marginTop: 3 }}
          >
            <Mail size={13} aria-hidden="true" />
            {email}
          </div>
          <span className="badge badge--accent" style={{ marginTop: 8 }}>
            Avaliação gratuita
          </span>
        </div>
      </div>
      <TRow label="Membro desde" val="Junho 2026" />
      <TRow label="Plano atual" val="Avaliação" />
    </div>
  );
}

function TabAssinatura() {
  function goToPlanos() {
    window.history.pushState(null, "", "/app/planos");
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  return (
    <div className="panel" style={{ padding: 26 }}>
      <div
        className="row between"
        style={{ marginBottom: 18 }}
      >
        <div style={{ fontWeight: 700, fontSize: 15 }}>Plano atual</div>
        <span className="badge badge--accent">Avaliação gratuita</span>
      </div>

      <div className="bar" style={{ marginBottom: 8 }}>
        <i style={{ width: "40%" }} />
      </div>
      <div style={{ fontSize: 13, color: "var(--t-mid)", marginBottom: 22 }}>
        2 de 5 análises utilizadas
      </div>

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
          onClick={goToPlanos}
          style={{ marginTop: 14 }}
        >
          <Zap size={15} aria-hidden="true" />
          Assinar Profissional
        </button>
      </div>

      <TRow label="Método de pagamento" val="Não cadastrado" />
      <TRow label="Próxima cobrança" val="—" />
      <TRow label="Garantia" val="7 dias, reembolso integral" />
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

interface NotifState {
  email: boolean;
  push: boolean;
}

function TabNotificacoes() {
  const [notif, setNotif] = useState<NotifState>({ email: true, push: true });

  const toggle = (key: keyof NotifState) =>
    setNotif((prev) => ({ ...prev, [key]: !prev[key] }));

  const rows: { key: keyof NotifState; title: string; desc: string }[] = [
    {
      key: "email",
      title: "E-mail",
      desc: "Resumo semanal dos melhores lotes.",
    },
    {
      key: "push",
      title: "Push no navegador",
      desc: "Alerta imediato quando um novo edital for publicado.",
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
          marginBottom: 4,
        }}
      >
        Como você quer ser avisado dos editais.
      </div>
      {rows.map(({ key, title, desc }, i) => (
        <div
          key={key}
          className="row between"
          style={{
            padding: "14px 0",
            borderTop: i === 0 ? "1px solid var(--border)" : "1px solid var(--border)",
            marginTop: i === 0 ? 12 : 0,
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
            <div
              style={{
                fontSize: 12.5,
                color: "var(--t-mid)",
                marginTop: 2,
              }}
            >
              {desc}
            </div>
          </div>
          <SwitchToggle on={notif[key]} onToggle={() => toggle(key)} />
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
          marginBottom: 20,
        }}
      >
        Gerencie como seus dados são coletados e usados nesta plataforma,
        conforme a LGPD.
      </div>
      <button
        type="button"
        className="btn btn--ghost"
        onClick={openCookieSettings}
      >
        <Cookie size={15} aria-hidden="true" />
        Gerenciar cookies
      </button>
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

// ─── Sidebar nav ────────────────────────────────────────────────────────────

const TAB_ICONS: Record<TabId, typeof User> = {
  perfil: User,
  assinatura: Zap,
  aparencia: Sun,
  notificacoes: Bell,
  privacidade: Cookie,
  seguranca: ShieldCheck,
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

  function renderPanel() {
    switch (activeTab) {
      case "perfil":
        return <TabPerfil name={name} email={email} avatarUrl={avatarUrl} />;
      case "assinatura":
        return <TabAssinatura />;
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
