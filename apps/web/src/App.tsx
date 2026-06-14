import { Component, lazy, Suspense, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  Database,
  FileText,
  Gavel,
  HelpCircle,
  LayoutGrid,
  Landmark,
  LogOut,
  Menu,
  Search,
  ShieldCheck,
  Sparkles,
  User,
  X,
  Zap,
} from "lucide-react";
import type { ReceitaLeilaoLot } from "@fonteia/sources";
import { useAuth } from "./auth/auth-context";
import { usePathname } from "./lib/use-pathname";
import { hasOnboarded, markOnboarded } from "./lib/onboarding";
import { ThemeToggle } from "./components/ui";
import { HelpModeProvider, HelpHint, useHelpMode } from "./components/help-mode";
import { LoginPage } from "./app/auth/login-page";
import { LandingPage } from "./app/landing/page";
import { OnboardingPage } from "./app/onboarding/page";
import type { LegalKind } from "./app/legal/page";
import { CookieBanner } from "./components/cookie-banner";
import { getLeilaoLotById } from "./data/fonteia-client";

// --- ErrorBoundary: captura erros de chunks lazy e renderiza fallback amigável ---
interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown, info: unknown) {
    console.error("[Fonte.ia] Erro ao carregar página:", error, info);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24, background: "var(--bg)", color: "var(--t-hi)", textAlign: "center" }}>
          <span style={{ fontSize: 40 }}>⚠️</span>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Algo deu errado ao carregar esta página</h2>
          <p style={{ margin: 0, color: "var(--t-mid)", maxWidth: 380 }}>
            Isso pode ter sido causado por uma atualização recente. Recarregue a página para tentar novamente.
          </p>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => window.location.reload()}
            style={{ marginTop: 8 }}
          >
            Recarregar página
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Lazy-loaded internal pages (code-split per route) ---
const DashboardPage = lazy(() =>
  import("./app/page").then((m) => ({ default: m.DashboardPage })),
);
const LotesPage = lazy(() =>
  import("./app/lotes/page").then((m) => ({ default: m.LotesPage })),
);
const LicitacoesPage = lazy(() =>
  import("./app/licitacoes/page").then((m) => ({ default: m.LicitacoesPage })),
);
const AlertasPage = lazy(() =>
  import("./app/alertas/page").then((m) => ({ default: m.AlertasPage })),
);
const RelatoriosPage = lazy(() =>
  import("./app/relatorios/page").then((m) => ({ default: m.RelatoriosPage })),
);
const BillingPage = lazy(() =>
  import("./app/billing/page").then((m) => ({ default: m.BillingPage })),
);
const LotDetailPage = lazy(() =>
  import("./app/leiloes/lot-detail-page").then((m) => ({ default: m.LotDetailPage })),
);
const SearchPage = lazy(() =>
  import("./app/search/page").then((m) => ({ default: m.SearchPage })),
);
const SourcesPage = lazy(() =>
  import("./app/sources/page").then((m) => ({ default: m.SourcesPage })),
);
const AccountPage = lazy(() =>
  import("./app/account/page").then((m) => ({ default: m.AccountPage })),
);
const LegalPage = lazy(() =>
  import("./app/legal/page").then((m) => ({ default: m.LegalPage })),
);
const ModulesPage = lazy(() =>
  import("./app/modules/page").then((m) => ({ default: m.ModulesPage })),
);

// --- Páginas PÚBLICAS de marketing/SEO (fora do login, indexáveis pelos robôs) ---
const CalculadoraLancePage = lazy(() =>
  import("./app/ferramentas/calculadora-lance/page").then((m) => ({ default: m.CalculadoraLancePage })),
);
const GuiasPage = lazy(() =>
  import("./app/guias/page").then((m) => ({ default: m.GuiasPage })),
);
const GuiaComoComprarPage = lazy(() =>
  import("./app/guias/como-comprar-leilao-receita").then((m) => ({ default: m.GuiaComoComprarPage })),
);
const GuiaComparacaoPage = lazy(() =>
  import("./app/guias/leilao-receita-vs-judicial").then((m) => ({ default: m.GuiaComparacaoPage })),
);
const LeiloesReceitaFederalPage = lazy(() =>
  import("./app/publico/leiloes-receita-federal").then((m) => ({ default: m.LeiloesReceitaFederalPage })),
);
const AnaliseEditalIAPage = lazy(() =>
  import("./app/publico/analise-de-edital-com-ia").then((m) => ({ default: m.AnaliseEditalIAPage })),
);
const GlossarioLeiloesPage = lazy(() =>
  import("./app/publico/glossario-leiloes").then((m) => ({ default: m.GlossarioLeiloesPage })),
);
const FaqPage = lazy(() =>
  import("./app/publico/faq").then((m) => ({ default: m.FaqPage })),
);
const RiscosLeiloesPage = lazy(() =>
  import("./app/publico/riscos-leiloes-publicos").then((m) => ({ default: m.RiscosLeiloesPage })),
);
const FonteiaVsPlanilhaPage = lazy(() =>
  import("./app/publico/fonteia-vs-planilha").then((m) => ({ default: m.FonteiaVsPlanilhaPage })),
);
const FonteiaVsManualPage = lazy(() =>
  import("./app/publico/fonteia-vs-analise-manual").then((m) => ({ default: m.FonteiaVsManualPage })),
);
const ComoParticiparPage = lazy(() =>
  import("./app/publico/como-participar-leilao-receita-federal").then((m) => ({ default: m.ComoParticiparPage })),
);
const MelhoresFerramentasPage = lazy(() =>
  import("./app/publico/melhores-ferramentas-analisar-leiloes").then((m) => ({ default: m.MelhoresFerramentasPage })),
);
const BlogIndexPage = lazy(() =>
  import("./app/publico/blog/page").then((m) => ({ default: m.BlogIndexPage })),
);
const PostValeAPenaPage = lazy(() =>
  import("./app/publico/blog/leilao-receita-vale-a-pena").then((m) => ({ default: m.PostValeAPenaPage })),
);
const PostErrosIniciantesPage = lazy(() =>
  import("./app/publico/blog/erros-iniciantes-leilao").then((m) => ({ default: m.PostErrosIniciantesPage })),
);
const PostComoLerEditalPage = lazy(() =>
  import("./app/publico/blog/como-ler-edital-leilao").then((m) => ({ default: m.PostComoLerEditalPage })),
);
const SobrePage = lazy(() =>
  import("./app/publico/sobre").then((m) => ({ default: m.SobrePage })),
);
const SegurancaPage = lazy(() =>
  import("./app/publico/seguranca").then((m) => ({ default: m.SegurancaPage })),
);
const ParaQuemPage = lazy(() =>
  import("./app/publico/para-quem").then((m) => ({ default: m.ParaQuemPage })),
);
const ContatoPage = lazy(() =>
  import("./app/publico/contato").then((m) => ({ default: m.ContatoPage })),
);

type RouteKey =
  | "painel"
  | "lotes"
  | "licitacoes"
  | "alertas"
  | "relatorios"
  | "fontes"
  | "conta"
  | "billing"
  | "search"
  | "lot-detail"
  | "modules";

const NAV: Array<{ path: string; route: RouteKey; label: string; icon: typeof LayoutGrid }> = [
  { path: "/app", route: "painel", label: "Painel", icon: LayoutGrid },
  { path: "/app/lotes", route: "lotes", label: "Lotes", icon: Gavel },
  { path: "/app/licitacoes", route: "licitacoes", label: "Licitações", icon: Landmark },
  { path: "/app/alertas", route: "alertas", label: "Alertas", icon: Bell },
  { path: "/app/relatorios", route: "relatorios", label: "Relatórios", icon: FileText },
  { path: "/app/fontes", route: "fontes", label: "Fontes", icon: Database },
];

const ROUTE_TITLES: Record<RouteKey, string> = {
  painel: "Painel",
  lotes: "Lotes",
  licitacoes: "Licitações",
  alertas: "Alertas",
  relatorios: "Relatórios",
  fontes: "Fontes & Rastreabilidade",
  conta: "Conta",
  billing: "Planos",
  search: "Perguntar",
  "lot-detail": "Análise do lote",
  modules: "Módulos",
};

function pathToRoute(path: string): RouteKey {
  if (/^\/app\/(?:lotes|leiloes)\/[^/]+/.test(path)) return "lot-detail";
  if (path.startsWith("/app/lotes")) return "lotes";
  if (path.startsWith("/app/licitacoes")) return "licitacoes";
  if (path.startsWith("/app/alertas")) return "alertas";
  if (path.startsWith("/app/relatorios")) return "relatorios";
  if (path.startsWith("/app/fontes")) return "fontes";
  if (path.startsWith("/app/conta")) return "conta";
  if (path.startsWith("/app/planos")) return "billing";
  if (path.startsWith("/app/buscar")) return "search";
  if (path.startsWith("/app/modules")) return "modules";
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
  const [topbarQuery, setTopbarQuery] = useState("");
  const topbarInputRef = useRef<HTMLInputElement | null>(null);
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

  // Global ⌘K / Ctrl+K shortcut → focus topbar search input
  useEffect(() => {
    function handleGlobalKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        topbarInputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleGlobalKey);
    return () => window.removeEventListener("keydown", handleGlobalKey);
  }, []);

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

  const { helpOn, toggleHelp } = useHelpMode();

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
    const hintId = `nav.${item.route}` as const;
    return (
      <HelpHint key={item.route} id={hintId}>
        <button type="button" onClick={() => go(item.path)} style={style} title={item.label}>
          {active && (
            <span style={{ position: "absolute", left: 0, top: 10, bottom: 10, width: 3, borderRadius: 2, background: "var(--brand-ink)" }} />
          )}
          <Icon size={18} strokeWidth={active ? 2.1 : 1.8} aria-hidden="true" />
          {(!collapsed || inDrawer) && <span>{item.label}</span>}
        </button>
      </HelpHint>
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
              <span style={{ fontSize: 10.5, color: "var(--t-low)", letterSpacing: "0.22em" }}>by Olli</span>
            </span>
          )}
        </button>
      </div>

      <nav aria-label="Navegação principal" style={{ padding: collapsed && !inDrawer ? "0 10px" : "0 12px", display: "flex", flexDirection: "column", gap: 3 }}>
        {NAV.map((item) => navItem(item, inDrawer))}
      </nav>

      <div style={{ flex: 1 }} />

      <nav aria-label="Conta" style={{ padding: collapsed && !inDrawer ? "0 10px" : "0 12px" }}>
        {navItem({ path: "/app/conta", route: "conta", label: "Conta", icon: User }, inDrawer)}
      </nav>

      <div style={{ padding: collapsed && !inDrawer ? "12px 10px" : "12px 14px" }}>
        {collapsed && !inDrawer ? (
          <HelpHint id="nav.planos">
            <button className="btn btn--accent btn--icon btn--sm" type="button" onClick={() => go("/app/planos")} title="Ampliar acesso" style={{ width: "100%" }}>
              <Zap size={15} fill="currentColor" aria-hidden="true" />
            </button>
          </HelpHint>
        ) : (
          <div className="inset" style={{ padding: 13 }}>
            <div className="row between" style={{ marginBottom: 7 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--t-hi)" }}>Fonte.ia Pro</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent-ink)" }}>7 dias grátis</span>
            </div>
            <HelpHint id="nav.planos">
              <button className="btn btn--accent btn--sm btn--block" type="button" onClick={() => go("/app/planos")} style={{ fontSize: 12 }}>
                <Zap size={13} fill="currentColor" aria-hidden="true" />Assinar agora
              </button>
            </HelpHint>
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
    <div className="shell-root" style={{ background: "var(--bg)", color: "var(--t-hi)" }}>
      <div className="shell-layout">
        {/* sidebar desktop */}
        <aside
          className="shell-sidebar-desktop"
          style={{ width: sidebarWidth, flex: "0 0 auto", borderRight: "1px solid var(--border)", background: "var(--surface)", display: "flex", flexDirection: "column", height: "100dvh", position: "sticky", top: 0, transition: "width .2s", overflow: "hidden", zIndex: 20 }}
        >
          {sidebarInner(false)}
        </aside>

        {/* sidebar drawer mobile */}
        {sidebarOpen && (
          <>
            <div className="shell-scrim" onClick={() => setSidebarOpen(false)} aria-hidden="true" style={{ position: "fixed", inset: 0, background: "rgba(4,8,18,.5)", zIndex: 40 }} />
            <aside className="shell-sidebar-drawer" style={{ position: "fixed", top: 0, left: 0, bottom: 0, width: "min(86vw, 300px)", maxHeight: "100dvh", overflowY: "auto", paddingLeft: "env(safe-area-inset-left)", background: "var(--surface)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", zIndex: 50, boxShadow: "var(--shadow-xl)" }}>
              <div className="row between" style={{ padding: "calc(12px + env(safe-area-inset-top)) 12px 0" }}>
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
        <main className="shell-main" style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <header className="shell-topbar no-print">
            <button className="btn btn--icon btn--ghost btn--sm shell-burger" type="button" onClick={() => setSidebarOpen(true)} aria-label="Abrir menu">
              <Menu size={18} aria-hidden="true" />
            </button>
            <h1 className="shell-title">{ROUTE_TITLES[route]}</h1>
            <div className="shell-search">
              <HelpHint id="topbar.search">
                <div className="searchbar" role="search" aria-label="Buscar lote, órgão ou edital">
                  <Search size={16} style={{ color: "var(--t-low)", flexShrink: 0 }} aria-hidden="true" />
                  <input
                    ref={topbarInputRef}
                    placeholder="Buscar lote, órgão ou edital…"
                    value={topbarQuery}
                    onChange={(e) => setTopbarQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && topbarQuery.trim().length > 0) {
                        goToSearch(topbarQuery);
                        setTopbarQuery("");
                      }
                    }}
                    aria-label="Buscar lote, órgão ou edital"
                    style={{ fontSize: 13.5 }}
                  />
                  <span className="kbd" aria-hidden="true">⌘K</span>
                </div>
              </HelpHint>
            </div>
            <div className="shell-actions">
              <HelpHint id="topbar.theme">
                <ThemeToggle />
              </HelpHint>
              {/* Botão Modo Ajuda */}
              <button
                className="btn btn--icon btn--ghost"
                type="button"
                onClick={toggleHelp}
                aria-label={helpOn ? "Desligar modo ajuda" : "Ligar modo ajuda"}
                aria-pressed={helpOn}
                title={helpOn ? "Desligar ajuda" : "Ligar ajuda"}
                style={{
                  color: helpOn ? "var(--brand-ink, #1D5FE0)" : undefined,
                  background: helpOn ? "color-mix(in srgb,var(--brand) 12%,transparent)" : undefined,
                  borderRadius: 9,
                }}
              >
                <HelpCircle size={18} aria-hidden="true" />
              </button>
              <HelpHint id="topbar.alerts">
                <button className="btn btn--icon btn--ghost shell-bell" type="button" onClick={() => go("/app/alertas")} title="Alertas" aria-label="Alertas" style={{ position: "relative" }}>
                  <Bell size={18} aria-hidden="true" />
                </button>
              </HelpHint>
              <HelpHint id="topbar.upgrade">
                <button className="btn btn--accent btn--sm shell-upgrade" type="button" onClick={() => go("/app/planos")} aria-label="Ampliar acesso">
                  <Zap size={14} fill="currentColor" aria-hidden="true" />
                  <span className="shell-upgrade-label">Upgrade</span>
                </button>
              </HelpHint>
              <button type="button" onClick={() => go("/app/conta")} title="Conta" aria-label="Conta" className="avatar shell-avatar" style={{ border: 0, cursor: "pointer" }}>
                {avatarUrl ? <img src={avatarUrl} alt={displayName} style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} /> : initialsOf(displayName)}
              </button>
            </div>
          </header>

          <div className="shell-content">
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
            <ErrorBoundary>
              <Suspense fallback={
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 240, gap: 12, color: "var(--t-mid)" }}>
                  <ShieldCheck size={28} strokeWidth={1.6} aria-hidden="true" style={{ opacity: .4 }} />
                  <span className="muted">Carregando…</span>
                </div>
              }>
                {route === "painel" && <DashboardPage onSelectLot={handleSelectLot} onAsk={goToSearch} />}
                {route === "lotes" && <LotesPage onSelectLot={handleSelectLot} />}
                {route === "licitacoes" && <LicitacoesPage />}
                {route === "alertas" && <AlertasPage onSelectLot={handleSelectLot} />}
                {route === "relatorios" && <RelatoriosPage onExplore={() => go("/app/lotes")} />}
                {route === "fontes" && <SourcesPage />}
                {route === "billing" && <BillingPage />}
                {route === "search" && <SearchPage initialQuestion={searchSeed} onSelectLot={handleSelectLot} />}
                {route === "modules" && <ModulesPage />}
                {route === "conta" && (
                  <AccountPage name={displayName} email={user?.email ?? ""} avatarUrl={avatarUrl} onSignOut={() => void signOut()} />
                )}
                {route === "lot-detail" &&
                  (selectedLot ? (
                    <LotDetailPage lot={selectedLot} onBack={() => go("/app/lotes")} onAsk={goToSearch} />
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
              </Suspense>
            </ErrorBoundary>
          </div>
        </main>
      </div>

      {/* floating "Perguntar" button — mobile only, sits above the bottom nav */}
      {route !== "search" && (
        <button
          type="button"
          className="shell-fab no-print"
          onClick={() => goToSearch()}
          aria-label="Perguntar com IA"
          title="Perguntar"
        >
          <Sparkles size={24} strokeWidth={2.1} aria-hidden="true" />
        </button>
      )}

      {/* bottom nav mobile */}
      <nav className="shell-bottomnav no-print" aria-label="Navegação rápida">
        {NAV.map((item) => {
          const active = route === item.route || (item.route === "lotes" && route === "lot-detail");
          const Icon = item.icon;
          return (
            <button
              key={item.route}
              type="button"
              onClick={() => go(item.path)}
              className="shell-bottomnav-item"
              aria-current={active ? "page" : undefined}
              style={{ color: active ? "var(--brand-ink)" : "var(--t-mid)", fontWeight: active ? 700 : 500 }}
            >
              <Icon size={21} strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <style>{`
        /* =========================================================
           Fonte.ia — App Shell, responsive system
           ONE coherent set of breakpoints:
             • desktop  > 900px  → fixed sidebar, full topbar
             • mobile  <= 900px  → burger + drawer + bottom nav
             • compact <= 560px  → condensed topbar (icon-only upgrade)
           No horizontal scroll. Safe-area aware. Touch targets >= 44px.
           ========================================================= */
        .shell-root{min-height:100svh;overflow-x:clip}
        .shell-layout{display:flex;min-height:100dvh}

        /* ---- Topbar ---- */
        .shell-topbar{
          height:62px;flex:0 0 auto;
          border-bottom:1px solid var(--border);
          background:var(--glass);
          backdrop-filter:blur(18px) saturate(1.3);-webkit-backdrop-filter:blur(18px) saturate(1.3);
          position:sticky;top:0;z-index:15;
          display:flex;align-items:center;gap:12px;
          padding:0 clamp(12px,3vw,20px);
          padding-top:env(safe-area-inset-top);
          padding-right:max(clamp(12px,3vw,20px),env(safe-area-inset-right));
        }
        .shell-title{
          font-size:clamp(15px,1.4vw,17px);font-weight:700;letter-spacing:-.01em;
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:0 1 auto;min-width:0;
        }
        .shell-search{flex:1 1 auto;max-width:420px;margin-left:auto;min-width:0}
        .shell-actions{display:flex;align-items:center;gap:6px;margin-left:auto;flex:0 0 auto}
        .shell-upgrade-label{display:inline}
        .shell-avatar{width:36px;height:36px;font-size:13px;flex:0 0 auto}

        /* ---- Main content ---- */
        .shell-content{flex:1 1 auto;min-width:0;padding:22px clamp(16px,3vw,28px)}

        /* ---- Burger + bottom nav + mobile FAB: hidden on desktop ---- */
        .shell-burger{display:none}
        .shell-bottomnav{display:none}
        .shell-fab{display:none}

        /* ---- Drawer / scrim entrance ---- */
        .shell-scrim{animation:shellFade .18s ease}
        .shell-sidebar-drawer{animation:shellSlideIn .24s cubic-bezier(.2,.7,.3,1)}
        @keyframes shellFade{from{opacity:0}to{opacity:1}}
        @keyframes shellSlideIn{from{transform:translateX(-100%)}to{transform:translateX(0)}}
        @media (prefers-reduced-motion:reduce){
          .shell-scrim,.shell-sidebar-drawer{animation:none}
        }

        /* =========================================================
           MOBILE — <= 900px
           ========================================================= */
        @media (max-width:900px){
          .shell-sidebar-desktop{display:none!important}
          .shell-burger{display:inline-flex!important}
          .shell-search{display:none}
          /* clear the fixed bottom nav so content is never hidden behind it */
          .shell-content{padding-bottom:calc(64px + env(safe-area-inset-bottom) + 16px)}
          .shell-bottomnav{
            display:flex;
            position:fixed;left:0;right:0;bottom:0;z-index:30;
            background:var(--glass);
            backdrop-filter:blur(18px) saturate(1.3);-webkit-backdrop-filter:blur(18px) saturate(1.3);
            border-top:1px solid var(--border);
            padding:0 max(0px,env(safe-area-inset-left)) env(safe-area-inset-bottom) max(0px,env(safe-area-inset-right));
            box-shadow:0 -6px 18px rgba(0,0,0,.10);
          }
          .shell-bottomnav-item{
            flex:1 1 0;min-width:0;min-height:56px;
            display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;
            background:none;border:0;cursor:pointer;
            font-size:10.5px;font-family:inherit;line-height:1.1;
            padding:8px 2px;
            -webkit-tap-highlight-color:transparent;
            transition:color .15s;
          }
          .shell-bottomnav-item span{
            max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
          }
          .shell-bottomnav-item:active{transform:scale(.94)}

          /* ---- Floating "Perguntar" (AI) button ---- */
          .shell-fab{
            display:inline-flex;align-items:center;justify-content:center;
            position:fixed;z-index:35;
            right:max(16px,calc(env(safe-area-inset-right) + 16px));
            bottom:calc(64px + env(safe-area-inset-bottom) + 16px);
            width:56px;height:56px;min-width:44px;min-height:44px;
            border:0;border-radius:50%;cursor:pointer;
            color:#fff;
            background:linear-gradient(140deg,var(--brand-2),var(--brand));
            box-shadow:0 12px 28px rgba(29,95,224,.42),0 4px 10px rgba(11,34,64,.18),inset 0 1px 0 rgba(255,255,255,.25);
            -webkit-tap-highlight-color:transparent;
            transition:transform .16s cubic-bezier(.2,.7,.3,1),box-shadow .2s;
          }
          .shell-fab:hover{transform:translateY(-2px);box-shadow:0 18px 38px rgba(29,95,224,.5),0 6px 14px rgba(11,34,64,.2)}
          .shell-fab:active{transform:scale(.94)}
          @media (prefers-reduced-motion:reduce){
            .shell-fab{transition:none}
            .shell-fab:hover,.shell-fab:active{transform:none}
          }
        }

        /* =========================================================
           COMPACT — <= 560px  (small phones)
           ========================================================= */
        @media (max-width:560px){
          .shell-topbar{gap:8px;height:58px}
          /* icon-only upgrade button to free horizontal space */
          .shell-upgrade-label{display:none}
          .shell-upgrade{padding:0;width:36px;height:36px;border-radius:11px}
        }
        @media (max-width:380px){
          /* ultra-narrow: drop the standalone bell (alerts still reachable via bottom nav) */
          .shell-bell{display:none}
        }
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
      <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, background: "var(--bg)", color: "var(--t-hi)" }}>
        <span style={{ width: 44, height: 44, borderRadius: 13, background: "linear-gradient(135deg,var(--brand),var(--accent))", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 22 }}>F</span>
        <span className="muted">Carregando…</span>
      </div>
    );
  }

  const legalKind: LegalKind | null =
    path === "/privacidade" ? "privacidade" : path === "/cookies" ? "cookies" : path === "/termos" ? "termos" : null;

  // Rotas públicas de marketing/SEO: renderizam sem login e são indexáveis.
  const publicMarketing: ReactNode | null =
    path === "/ferramentas/calculadora-lance" ? <CalculadoraLancePage /> :
    path === "/guias" ? <GuiasPage /> :
    path === "/guias/como-comprar-leilao-receita" ? <GuiaComoComprarPage /> :
    path === "/guias/leilao-receita-vs-judicial" ? <GuiaComparacaoPage /> :
    path === "/leiloes-receita-federal" ? <LeiloesReceitaFederalPage /> :
    path === "/analise-de-edital-com-ia" ? <AnaliseEditalIAPage /> :
    path === "/glossario-leiloes" ? <GlossarioLeiloesPage /> :
    path === "/faq" ? <FaqPage /> :
    path === "/riscos-leiloes-publicos" ? <RiscosLeiloesPage /> :
    path === "/fonteia-vs-planilha" ? <FonteiaVsPlanilhaPage /> :
    path === "/fonteia-vs-analise-manual" ? <FonteiaVsManualPage /> :
    path === "/como-participar-leilao-receita-federal" ? <ComoParticiparPage /> :
    path === "/melhores-ferramentas-analisar-leiloes" ? <MelhoresFerramentasPage /> :
    path === "/blog" ? <BlogIndexPage /> :
    path === "/blog/leilao-receita-vale-a-pena" ? <PostValeAPenaPage /> :
    path === "/blog/erros-iniciantes-leilao" ? <PostErrosIniciantesPage /> :
    path === "/blog/como-ler-edital-leilao" ? <PostComoLerEditalPage /> :
    path === "/sobre" ? <SobrePage /> :
    path === "/seguranca" ? <SegurancaPage /> :
    path === "/para-quem" ? <ParaQuemPage /> :
    path === "/contato" ? <ContatoPage /> :
    null;

  const inApp = path.startsWith("/app");
  let content: ReactNode;

  const pageFallback = (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span className="muted">Carregando…</span>
    </div>
  );

  if (legalKind) {
    content = (
      <ErrorBoundary>
        <Suspense fallback={pageFallback}>
          <LegalPage kind={legalKind} onHome={() => navigate("/")} />
        </Suspense>
      </ErrorBoundary>
    );
  } else if (publicMarketing) {
    content = <ErrorBoundary><Suspense fallback={pageFallback}>{publicMarketing}</Suspense></ErrorBoundary>;
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
    <HelpModeProvider>
      {content}
      <CookieBanner onOpenPolicy={() => navigate("/cookies")} />
    </HelpModeProvider>
  );
}
