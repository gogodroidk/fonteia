import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  Database,
  FileText,
  Gavel,
  LayoutGrid,
  LogOut,
  Menu,
  Search,
  ShieldCheck,
  User,
  X,
  Zap,
} from "lucide-react";
import type { ReceitaLeilaoLot } from "@fonteia/sources";
import { useAuth } from "./auth/auth-context";
import { usePathname } from "./lib/use-pathname";
import { hasOnboarded, markOnboarded } from "./lib/onboarding";
import { ThemeToggle } from "./components/ui";
import { LoginPage } from "./app/auth/login-page";
import { LandingPage } from "./app/landing/page";
import { OnboardingPage } from "./app/onboarding/page";
import { DashboardPage } from "./app/page";
import { LotesPage } from "./app/lotes/page";
import { AlertasPage } from "./app/alertas/page";
import { RelatoriosPage } from "./app/relatorios/page";
import { BillingPage } from "./app/billing/page";
import { LotDetailPage } from "./app/leiloes/lot-detail-page";
import { SearchPage } from "./app/search/page";
import { SourcesPage } from "./app/sources/page";
import { AccountPage } from "./app/account/page";
import { LegalPage, type LegalKind } from "./app/legal/page";
import { CookieBanner } from "./components/cookie-banner";
import { getLeilaoLotById } from "./data/fonteia-client";

type RouteKey =
  | "painel"
  | "lotes"
  | "alertas"
  | "relatorios"
  | "fontes"
  | "conta"
  | "billing"
  | "search"
  | "lot-detail";

const NAV: Array<{ path: string; route: RouteKey; label: string; icon: typeof LayoutGrid }> = [
  { path: "/app", route: "painel", label: "Painel", icon: LayoutGrid },
  { path: "/app/lotes", route: "lotes", label: "Lotes", icon: Gavel },
  { path: "/app/alertas", route: "alertas", label: "Alertas", icon: Bell },
  { path: "/app/relatorios", route: "relatorios", label: "Relatórios", icon: FileText },
  { path: "/app/fontes", route: "fontes", label: "Fontes", icon: Database },
];

const ROUTE_TITLES: Record<RouteKey, string> = {
  painel: "Painel",
  lotes: "Lotes",
  alertas: "Alertas",
  relatorios: "Relatórios",
  fontes: "Fontes & Rastreabilidade",
  conta: "Conta",
  billing: "Planos",
  search: "Perguntar",
  "lot-detail": "Análise do lote",
};

function pathToRoute(path: string): RouteKey {
  if (/^\/app\/(?:lotes|leiloes)\/[^/]+/.test(path)) return "lot-detail";
  if (path.startsWith("/app/lotes")) return "lotes";
  if (path.startsWith("/app/alertas")) return "alertas";
  if (path.startsWith("/app/relatorios")) return "relatorios";
  if (path.startsWith("/app/fontes")) return "fontes";
  if (path.startsWith("/app/conta")) return "conta";
  if (path.startsWith("/app/planos")) return "billing";
  if (path.startsWith("/app/buscar")) return "search";
  return "painel";
}

function getLotIdFromPath(path: string): string | null {
  const match = path.match(/^\/app\/(?:lotes|leiloes)\/([^/?#]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "FI";
}

interface AppShellProps {
  path: string;
  navigate: (to: string) => void;
}

function AppShell({ path, navigate }: AppShellProps) {
  const { user, signOut } = useAuth();
  const [selectedLot, setSelectedLot] = useState<ReceitaLeilaoLot | null>(null);
  const [isLoadingLot, setIsLoadingLot] = useState(false);
  const [lotLoadMessage, setLotLoadMessage] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [searchSeed, setSearchSeed] = useState("");
  const [checkoutOk, setCheckoutOk] = useState<boolean>(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("checkout") === "sucesso",
  );

  const route = pathToRoute(path);
  const lotIdFromPath = getLotIdFromPath(path);

  useEffect(() => {
    let isMounted = true;
    if (route !== "lot-detail" || !lotIdFromPath || selectedLot?.id === lotIdFromPath) {
      return () => {
        isMounted = false;
      };
    }
    setIsLoadingLot(true);
    setLotLoadMessage("Buscando lote pelas fontes disponiveis...");
    void getLeilaoLotById(lotIdFromPath)
      .then((result) => {
        if (!isMounted) return;
        setSelectedLot(result.lot);
        setLotLoadMessage(result.message);
      })
      .catch((error) => {
        if (!isMounted) return;
        setSelectedLot(null);
        setLotLoadMessage(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (isMounted) setIsLoadingLot(false);
      });
    return () => {
      isMounted = false;
    };
  }, [lotIdFromPath, route, selectedLot?.id]);

  function go(to: string) {
    navigate(to);
    setSidebarOpen(false);
  }

  function goToSearch(question?: string) {
    setSearchSeed(question?.trim() ?? "");
    go("/app/buscar");
  }

  function handleSelectLot(lot: ReceitaLeilaoLot) {
    setSelectedLot(lot);
    go(`/app/lotes/${encodeURIComponent(lot.id)}`);
  }

  const displayName =
    (user?.user_metadata?.["full_name"] as string | undefined) ?? user?.email?.split("@")[0] ?? "Você";
  const avatarUrl = user?.user_metadata?.["avatar_url"] as string | undefined;

  const navItem = (item: (typeof NAV)[number], inDrawer: boolean): ReactNode => {
    const active = route === item.route || (item.route === "lotes" && route === "lot-detail");
    const Icon = item.icon;
    const style: CSSProperties = {
      display: "flex",
      alignItems: "center",
      gap: 11,
      width: "100%",
      padding: collapsed && !inDrawer ? "12px 0" : "10px 13px",
      justifyContent: collapsed && !inDrawer ? "center" : "flex-start",
      borderRadius: 11,
      border: "1px solid transparent",
      cursor: "pointer",
      position: "relative",
      background: active ? "color-mix(in srgb,var(--brand) 10%,transparent)" : "transparent",
      color: active ? "var(--brand-ink)" : "var(--t-mid)",
      font: "inherit",
      fontWeight: active ? 700 : 500,
      fontSize: 14,
      transition: "background .15s,color .15s",
    };
    return (
      <button key={item.route} type="button" onClick={() => go(item.path)} style={style} title={item.label}>
        {active && (
          <span style={{ position: "absolute", left: 0, top: 10, bottom: 10, width: 3, borderRadius: 2, background: "var(--brand-ink)" }} />
        )}
        <Icon size={18} strokeWidth={active ? 2.1 : 1.8} aria-hidden="true" />
        {(!collapsed || inDrawer) && <span>{item.label}</span>}
      </button>
    );
  };

  const sidebarWidth = collapsed ? 70 : 234;

  const sidebarInner = (inDrawer: boolean): ReactNode => (
    <>
      <div style={{ padding: collapsed && !inDrawer ? "20px 0" : "20px 18px 14px", display: "flex", justifyContent: collapsed && !inDrawer ? "center" : "flex-start" }}>
        <button className="brand-button" type="button" onClick={() => go("/app")} style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: 0, cursor: "pointer", padding: 0 }}>
          <span style={{ width: 30, height: 30, borderRadius: 9, background: "linear-gradient(135deg,var(--brand),var(--accent))", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16, flexShrink: 0 }}>F</span>
          {(!collapsed || inDrawer) && (
            <span style={{ textAlign: "left", lineHeight: 1.05 }}>
              <strong style={{ display: "block", fontSize: 16, color: "var(--t-hi)" }}>Fonte.ia</strong>
              <span style={{ fontSize: 10.5, color: "var(--t-low)", letterSpacing: ".08em" }}>BY OLLI</span>
            </span>
          )}
        </button>
      </div>

      <nav style={{ padding: collapsed && !inDrawer ? "0 10px" : "0 12px", display: "flex", flexDirection: "column", gap: 3 }}>
        {NAV.map((item) => navItem(item, inDrawer))}
      </nav>

      <div style={{ flex: 1 }} />

      <nav style={{ padding: collapsed && !inDrawer ? "0 10px" : "0 12px" }}>
        {navItem({ path: "/app/conta", route: "conta", label: "Conta", icon: User }, inDrawer)}
      </nav>

      <div style={{ padding: collapsed && !inDrawer ? "12px 10px" : "12px 14px" }}>
        {collapsed && !inDrawer ? (
          <button className="btn btn--accent btn--icon btn--sm" type="button" onClick={() => go("/app/planos")} title="Ampliar acesso" style={{ width: "100%" }}>
            <Zap size={15} fill="currentColor" aria-hidden="true" />
          </button>
        ) : (
          <div className="inset" style={{ padding: 13 }}>
            <div className="row between" style={{ marginBottom: 7 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--t-hi)" }}>Plano Avaliação</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent-ink)" }}>5 grátis</span>
            </div>
            <button className="btn btn--accent btn--sm btn--block" type="button" onClick={() => go("/app/planos")} style={{ fontSize: 12 }}>
              <Zap size={13} fill="currentColor" aria-hidden="true" />Ampliar acesso
            </button>
          </div>
        )}
      </div>

      {!inDrawer && (
        <button type="button" onClick={() => setCollapsed((c) => !c)} title={collapsed ? "Expandir" : "Recolher"} style={{ margin: "0 0 14px", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: 0, cursor: "pointer", color: "var(--t-low)", padding: 8, width: "100%" }}>
          {collapsed ? <ChevronRight size={16} aria-hidden="true" /> : <ChevronLeft size={16} aria-hidden="true" />}
        </button>
      )}
    </>
  );

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--t-hi)" }}>
      <div style={{ display: "flex", minHeight: "100vh" }}>
        {/* sidebar desktop */}
        <aside
          className="shell-sidebar-desktop"
          style={{ width: sidebarWidth, flex: "0 0 auto", borderRight: "1px solid var(--border)", background: "var(--surface)", display: "flex", flexDirection: "column", height: "100vh", position: "sticky", top: 0, transition: "width .2s", overflow: "hidden", zIndex: 20 }}
        >
          {sidebarInner(false)}
        </aside>

        {/* sidebar drawer mobile */}
        {sidebarOpen && (
          <>
            <div onClick={() => setSidebarOpen(false)} aria-hidden="true" style={{ position: "fixed", inset: 0, background: "rgba(4,8,18,.5)", zIndex: 40 }} />
            <aside className="shell-sidebar-drawer" style={{ position: "fixed", top: 0, left: 0, bottom: 0, width: 248, background: "var(--surface)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", zIndex: 50 }}>
              <div className="row between" style={{ padding: "12px 12px 0" }}>
                <span />
                <button className="btn btn--icon btn--ghost btn--sm" type="button" onClick={() => setSidebarOpen(false)} aria-label="Fechar menu">
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
              {sidebarInner(true)}
            </aside>
          </>
        )}

        {/* main */}
        <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <header
            className="no-print"
            style={{ height: 62, borderBottom: "1px solid var(--border)", background: "var(--glass)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", position: "sticky", top: 0, zIndex: 15, display: "flex", alignItems: "center", gap: 12, padding: "0 16px" }}
          >
            <button className="btn btn--icon btn--ghost btn--sm shell-burger" type="button" onClick={() => setSidebarOpen(true)} aria-label="Abrir menu">
              <Menu size={18} aria-hidden="true" />
            </button>
            <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-.01em" }}>{ROUTE_TITLES[route]}</div>
            <div style={{ flex: 1, maxWidth: 420, marginLeft: "auto" }} className="shell-search">
              <div className="searchbar" style={{ cursor: "pointer" }} onClick={() => go("/app/lotes")}>
                <Search size={16} style={{ color: "var(--t-low)" }} aria-hidden="true" />
                <input placeholder="Buscar lote, órgão ou edital…" readOnly style={{ cursor: "pointer", fontSize: 13.5 }} />
                <span className="kbd">⌘K</span>
              </div>
            </div>
            <div className="row" style={{ gap: 6, marginLeft: "auto" }}>
              <ThemeToggle />
              <button className="btn btn--icon btn--ghost" type="button" onClick={() => go("/app/alertas")} title="Alertas" style={{ position: "relative" }}>
                <Bell size={18} aria-hidden="true" />
              </button>
              <button className="btn btn--accent btn--sm shell-upgrade" type="button" onClick={() => go("/app/planos")}>
                <Zap size={14} fill="currentColor" aria-hidden="true" />Upgrade
              </button>
              <button type="button" onClick={() => go("/app/conta")} title="Conta" className="avatar" style={{ width: 36, height: 36, fontSize: 13, border: 0, cursor: "pointer" }}>
                {avatarUrl ? <img src={avatarUrl} alt={displayName} style={{ width: "100%", height: "100%", borderRadius: "50%" }} /> : initialsOf(displayName)}
              </button>
            </div>
          </header>

          <div style={{ padding: "22px clamp(16px,3vw,28px)", flex: 1 }}>
            {checkoutOk && (
              <div
                className="panel elevated"
                role="status"
                style={{ padding: 16, marginBottom: 18, display: "flex", gap: 12, alignItems: "center", borderColor: "color-mix(in srgb,var(--accent) 40%,var(--border))" }}
              >
                <Check size={20} strokeWidth={2.6} style={{ color: "var(--accent-ink)", flexShrink: 0 }} aria-hidden="true" />
                <div style={{ flex: 1 }}>
                  <strong>Pagamento recebido. Estamos ativando sua assinatura.</strong>{" "}
                  <span className="muted small">Se o acesso não liberar em alguns segundos, atualize a página.</span>
                </div>
                <button className="btn btn--icon btn--ghost btn--sm" type="button" onClick={() => setCheckoutOk(false)} aria-label="Fechar">
                  <X size={15} aria-hidden="true" />
                </button>
              </div>
            )}
            {route === "painel" && <DashboardPage onSelectLot={handleSelectLot} onAsk={goToSearch} />}
            {route === "lotes" && <LotesPage onSelectLot={handleSelectLot} />}
            {route === "alertas" && <AlertasPage onSelectLot={handleSelectLot} />}
            {route === "relatorios" && <RelatoriosPage onExplore={() => go("/app/lotes")} />}
            {route === "fontes" && <SourcesPage />}
            {route === "billing" && <BillingPage />}
            {route === "search" && <SearchPage initialQuestion={searchSeed} />}
            {route === "conta" && (
              <AccountPage name={displayName} email={user?.email ?? ""} avatarUrl={avatarUrl} onSignOut={() => void signOut()} />
            )}
            {route === "lot-detail" &&
              (selectedLot ? (
                <LotDetailPage lot={selectedLot} onBack={() => go("/app/lotes")} onAsk={goToSearch} dataMessage={lotLoadMessage ?? undefined} />
              ) : (
                <section className="panel" style={{ padding: 28 }}>
                  <span className="eyebrow">{isLoadingLot ? "Carregando lote" : "Lote não encontrado"}</span>
                  <h2 className="h2" style={{ margin: "8px 0 10px" }}>
                    {isLoadingLot ? "Buscando dados do lote…" : "Este lote não apareceu nas fontes carregadas agora"}
                  </h2>
                  <p className="muted">{lotLoadMessage}</p>
                  {!isLoadingLot && (
                    <button className="btn btn--primary" type="button" onClick={() => go("/app/lotes")} style={{ marginTop: 12 }}>
                      Voltar aos lotes
                    </button>
                  )}
                </section>
              ))}
          </div>
        </main>
      </div>

      {/* bottom nav mobile */}
      <nav className="shell-bottomnav no-print" aria-label="Navegação rápida">
        {NAV.map((item) => {
          const active = route === item.route || (item.route === "lotes" && route === "lot-detail");
          const Icon = item.icon;
          return (
            <button key={item.route} type="button" onClick={() => go(item.path)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, background: "none", border: 0, cursor: "pointer", color: active ? "var(--brand-ink)" : "var(--t-mid)", fontSize: 10.5, fontWeight: active ? 700 : 500, flex: 1, padding: "8px 0" }}>
              <Icon size={20} aria-hidden="true" />
              {item.label}
            </button>
          );
        })}
      </nav>

      <style>{`
        .shell-burger{display:none}
        .shell-bottomnav{display:none}
        @media (max-width:860px){
          .shell-sidebar-desktop{display:none!important}
          .shell-burger{display:inline-flex!important}
          .shell-search{display:none}
          .shell-bottomnav{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:30;background:var(--glass);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border-top:1px solid var(--border);padding-bottom:env(safe-area-inset-bottom)}
        }
        @media (max-width:520px){ .shell-upgrade .btn-label,.shell-upgrade span{ } }
      `}</style>
    </div>
  );
}

export function App() {
  const { user, loading } = useAuth();
  const { path, navigate } = usePathname();
  const [onboarded, setOnboarded] = useState<boolean>(() => hasOnboarded());

  useEffect(() => {
    if (!loading && user && (path === "/" || path === "/entrar")) {
      navigate("/app");
    }
  }, [loading, user, path, navigate]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, background: "var(--bg)", color: "var(--t-hi)" }}>
        <span style={{ width: 44, height: 44, borderRadius: 13, background: "linear-gradient(135deg,var(--brand),var(--accent))", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 22 }}>F</span>
        <span className="muted">Carregando…</span>
      </div>
    );
  }

  const legalKind: LegalKind | null =
    path === "/privacidade" ? "privacidade" : path === "/cookies" ? "cookies" : path === "/termos" ? "termos" : null;

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
