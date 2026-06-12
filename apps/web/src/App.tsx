import { useEffect, useState, type ReactNode } from "react";
import { BarChart2, Bell, BookOpenText, Database, LayoutDashboard, LogOut, Search, ShieldCheck, User } from "lucide-react";
import { PRODUCT_MODULES, type ModuleId } from "@fonteia/domain";
import type { ReceitaLeilaoLot } from "@fonteia/sources";
import { useAuth } from "./auth/auth-context";
import { usePathname } from "./lib/use-pathname";
import { hasOnboarded, markOnboarded } from "./lib/onboarding";
import { LoginPage } from "./app/auth/login-page";
import { LandingPage } from "./app/landing/page";
import { OnboardingPage } from "./app/onboarding/page";
import { DashboardPage } from "./app/page";
import { BillingPage } from "./app/billing/page";
import { LotDetailPage } from "./app/leiloes/lot-detail-page";
import { ModulesPage } from "./app/modules/page";
import { SearchPage } from "./app/search/page";
import { SourcesPage } from "./app/sources/page";
import { AccountPage } from "./app/account/page";
import { LegalPage, type LegalKind } from "./app/legal/page";
import { CookieBanner } from "./components/cookie-banner";

type RouteKey = "dashboard" | "modules" | "sources" | "search" | "billing" | "lot-detail" | "conta";

const navItems: Array<{ path: string; route: RouteKey; label: string; icon: typeof LayoutDashboard }> = [
  { path: "/app", route: "dashboard", label: "Cockpit", icon: LayoutDashboard },
  { path: "/app/buscar", route: "search", label: "Perguntar", icon: Search },
  { path: "/app/fontes", route: "sources", label: "Fontes", icon: Database },
  { path: "/app/modulos", route: "modules", label: "Módulos", icon: BookOpenText },
  { path: "/app/planos", route: "billing", label: "Planos", icon: ShieldCheck },
];

function pathToRoute(path: string): RouteKey {
  if (path.startsWith("/app/buscar")) return "search";
  if (path.startsWith("/app/fontes")) return "sources";
  if (path.startsWith("/app/modulos")) return "modules";
  if (path.startsWith("/app/planos")) return "billing";
  if (path.startsWith("/app/conta")) return "conta";
  if (path.startsWith("/app/lote")) return "lot-detail";
  return "dashboard";
}

interface AppShellProps {
  path: string;
  navigate: (to: string) => void;
}

function AppShell({ path, navigate }: AppShellProps) {
  const { user, signOut } = useAuth();
  const [selectedLot, setSelectedLot] = useState<ReceitaLeilaoLot | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchSeed, setSearchSeed] = useState<string>("");
  const [alertsOpen, setAlertsOpen] = useState(false);
  const activeModule = PRODUCT_MODULES.find((m) => m.id === "leiloes");
  const route = pathToRoute(path);

  function go(to: string) {
    navigate(to);
    setSidebarOpen(false);
    setAlertsOpen(false);
  }

  function goToSearch(question?: string) {
    setSearchSeed(question?.trim() ?? "");
    go("/app/buscar");
  }

  function handleSelectLot(lot: ReceitaLeilaoLot) {
    setSelectedLot(lot);
    go("/app/lote");
  }

  const displayName =
    (user?.user_metadata?.["full_name"] as string | undefined) ??
    user?.email?.split("@")[0] ??
    "Usuário";

  const avatarUrl = user?.user_metadata?.["avatar_url"] as string | undefined;

  return (
    <div className="app-shell">
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}

      <aside className={`sidebar${sidebarOpen ? " sidebar-open" : ""}`} aria-label="Navegação principal">
        <div className="sidebar-top">
          <button className="brand brand-button" onClick={() => go("/app")} type="button">
            <div className="brand-mark">f</div>
            <div>
              <strong>Fonte.ia</strong>
              <span>by Olli</span>
            </div>
          </button>
          <button
            className="sidebar-close"
            onClick={() => setSidebarOpen(false)}
            type="button"
            aria-label="Fechar menu"
          >
            ✕
          </button>
        </div>

        <nav className="primary-nav">
          {navItems.map(({ path: itemPath, route: r, label, icon: Icon }) => (
            <button
              key={r}
              className={route === r ? "nav-item active" : "nav-item"}
              onClick={() => go(itemPath)}
              type="button"
            >
              <Icon aria-hidden="true" size={18} />
              {label}
            </button>
          ))}
        </nav>

        <div className="sidebar-modules">
          <span className="section-label">Produtos</span>
          {PRODUCT_MODULES.map((module) => (
            <button
              key={module.id}
              className={module.status === "active" ? "module-nav active" : "module-nav locked"}
              onClick={() => go("/app/modulos")}
              type="button"
            >
              <span>{module.label}</span>
              <small>{module.status === "active" ? "ativo" : "em breve"}</small>
            </button>
          ))}
        </div>

        <div className="sidebar-user">
          <button className="sidebar-user-main" onClick={() => go("/app/conta")} type="button" title="Minha conta">
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} className="user-avatar" />
            ) : (
              <div className="user-avatar-placeholder">
                <User size={16} aria-hidden="true" />
              </div>
            )}
            <div className="user-info">
              <strong>{displayName}</strong>
              <span>Plano Free</span>
            </div>
          </button>
          <button
            className="signout-btn"
            onClick={() => void signOut()}
            type="button"
            aria-label="Sair"
            title="Sair"
          >
            <LogOut size={16} aria-hidden="true" />
          </button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="hamburger"
              onClick={() => setSidebarOpen(true)}
              type="button"
              aria-label="Abrir menu"
            >
              <span />
              <span />
              <span />
            </button>
            <div>
              <span className="section-label">Módulo atual</span>
              <h1>{activeModule?.label ?? "Fonte.ia"}</h1>
            </div>
          </div>
          <div className="topbar-actions">
            <div className="alerts-wrap">
              <button
                className="ghost-button"
                onClick={() => setAlertsOpen((open) => !open)}
                type="button"
                aria-expanded={alertsOpen}
              >
                <Bell aria-hidden="true" size={17} />
                <span className="btn-label">Alertas</span>
              </button>
              {alertsOpen && (
                <>
                  <div className="alerts-popover-overlay" onClick={() => setAlertsOpen(false)} aria-hidden="true" />
                  <div className="alerts-popover" role="dialog" aria-label="Seus alertas">
                    <strong>Seus alertas</strong>
                    <p>
                      Você ainda não criou alertas. Abra um lote no radar e clique em
                      <em> "Criar alerta de prazo"</em> para ser avisado antes do leilão fechar.
                    </p>
                    <button className="primary-button" onClick={() => go("/app")} type="button">
                      Ir para o radar
                    </button>
                  </div>
                </>
              )}
            </div>
            <button className="primary-button" onClick={() => goToSearch()} type="button">
              <BarChart2 aria-hidden="true" size={17} />
              <span className="btn-label">Dossiê</span>
            </button>
          </div>
        </header>

        <div className="workspace-body">
          {route === "dashboard" && (
            <DashboardPage onSelectLot={handleSelectLot} onAsk={goToSearch} />
          )}
          {route === "lot-detail" &&
            (selectedLot ? (
              <LotDetailPage lot={selectedLot} onBack={() => go("/app")} />
            ) : (
              <DashboardPage onSelectLot={handleSelectLot} onAsk={goToSearch} />
            ))}
          {route === "search" && <SearchPage initialQuestion={searchSeed} />}
          {route === "sources" && <SourcesPage />}
          {route === "modules" && <ModulesPage selectedModuleId={"leiloes" satisfies ModuleId} />}
          {route === "billing" && <BillingPage />}
          {route === "conta" && (
            <AccountPage
              name={displayName}
              email={user?.email ?? ""}
              avatarUrl={avatarUrl}
              onSignOut={() => void signOut()}
            />
          )}
        </div>
      </main>

      <nav className="bottom-nav" aria-label="Navegação rápida">
        {navItems.map(({ path: itemPath, route: r, label, icon: Icon }) => (
          <button
            key={r}
            className={route === r ? "bottom-nav-item active" : "bottom-nav-item"}
            onClick={() => go(itemPath)}
            type="button"
          >
            <Icon aria-hidden="true" size={22} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

export function App() {
  const { user, loading } = useAuth();
  const { path, navigate } = usePathname();
  const [onboarded, setOnboarded] = useState<boolean>(() => hasOnboarded());

  // Pós-login: tira o usuário da landing/login e leva pro app.
  useEffect(() => {
    if (!loading && user && (path === "/" || path === "/entrar")) {
      navigate("/app");
    }
  }, [loading, user, path, navigate]);

  if (loading) {
    return (
      <div className="app-loading">
        <div className="brand-mark brand-mark-lg">f</div>
        <span className="app-loading-text">Carregando...</span>
      </div>
    );
  }

  const legalKind: LegalKind | null =
    path === "/privacidade"
      ? "privacidade"
      : path === "/cookies"
        ? "cookies"
        : path === "/termos"
          ? "termos"
          : null;

  const inApp = path.startsWith("/app");
  let content: ReactNode;

  if (legalKind) {
    content = <LegalPage kind={legalKind} onHome={() => navigate("/")} />;
  } else if (inApp) {
    if (!user) {
      content = <LoginPage onGoToLanding={() => navigate("/")} />;
    } else if (!onboarded) {
      content = (
        <OnboardingPage
          name={(user.user_metadata?.["full_name"] as string | undefined) ?? user.email?.split("@")[0]}
          onFinish={() => {
            markOnboarded();
            setOnboarded(true);
            navigate("/app");
          }}
        />
      );
    } else {
      content = <AppShell path={path} navigate={navigate} />;
    }
  } else if (path === "/entrar") {
    content = <LoginPage onGoToLanding={() => navigate("/")} />;
  } else {
    content = <LandingPage onLogin={() => navigate("/entrar")} />;
  }

  return (
    <>
      {content}
      <CookieBanner onOpenPolicy={() => navigate("/cookies")} />
    </>
  );
}
