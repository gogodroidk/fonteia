import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  BadgeCheck,
  Bell,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Database,
  Brain,
  FileText,
  FileSearch2,
  Gavel,
  History,
  HelpCircle,
  LayoutGrid,
  Landmark,
  Leaf,
  MapPin,
  Menu,
  MoreHorizontal,
  ScanLine,
  Search,
  Scale,
  ShieldCheck,
  Sparkles,
  User,
  Users,
  X,
  Zap,
} from "lucide-react";
import type { CamaraDeputado, IbamaInfracao, ReceitaLeilaoLot } from "@fonteia/sources";
import type { MunicipioWithStats } from "./features/municipios/municipios-api";
import { useAuth } from "./auth/auth-context";
import { useIsAdmin } from "./components/admin/use-is-admin";
import { usePlan } from "./lib/use-plan";
import { usePathname } from "./lib/use-pathname";
import { hasOnboarded, markOnboarded } from "./lib/onboarding";
import { takePendingDestination } from "./lib/pending-intent";
import { ThemeToggle, TrialBadge } from "./components/ui";
import { HelpModeProvider, HelpHint, useHelpMode } from "./components/help-mode";
import { FeedbackButton } from "./components/feedback/FeedbackButton";
import { useFocusTrap } from "./hooks/use-focus-trap";
// LandingPage permanece import ESTÁTICO: é o LCP do visitante anônimo (a rota "/"
// é pré-renderizada/SSG). Carregá-la sob demanda só piscaria um fallback por cima
// do HTML já visível. LoginPage/OnboardingPage e os widgets de IA (Omnibox/Chat)
// NÃO aparecem no first paint da landing, então saem do chunk de entrada (lazy,
// declarados mais abaixo junto das demais rotas code-split).
import { LandingPage } from "./app/landing/page";
import type { LegalKind } from "./app/legal/page";
import { CookieBanner } from "./components/cookie-banner";
import { getLeilaoLotById } from "./data/fonteia-client";
import { isCheckoutSuccess } from "./config/stripe";
import { PwaInstallPrompt } from "./components/pwa-install-prompt";
import { ErrorBoundary } from "./lib/error-boundary";
import { setTelemetryAuthed } from "./lib/telemetry";

// --- Lazy-loaded internal pages (code-split per route) ---
// LoginPage / OnboardingPage: só renderizam atrás de auth (/entrar, /app sem
// sessão, ou pós-login), nunca no first paint da landing — code-split tira o
// peso delas do chunk de entrada.
const LoginPage = lazy(() =>
  import("./app/auth/login-page").then((m) => ({ default: m.LoginPage })),
);
const OnboardingPage = lazy(() =>
  import("./app/onboarding/page").then((m) => ({ default: m.OnboardingPage })),
);
// Widgets de IA do shell autenticado (paleta ⌘K + chat flutuante). Não montam
// para visitante anônimo; lazy mantém o código fora do bundle inicial e os
// carrega quando o shell aparece.
const IntelligenceOmnibox = lazy(() =>
  import("./components/ai/IntelligenceOmnibox").then((m) => ({ default: m.IntelligenceOmnibox })),
);
const ContextChat = lazy(() =>
  import("./components/ai/ContextChat").then((m) => ({ default: m.ContextChat })),
);
const DashboardPage = lazy(() =>
  import("./app/page").then((m) => ({ default: m.DashboardPage })),
);
const LotesPage = lazy(() =>
  import("./app/lotes/page").then((m) => ({ default: m.LotesPage })),
);
const HistoricoPage = lazy(() =>
  import("./app/historico/page").then((m) => ({ default: m.HistoricoPage })),
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
const AdminPage = lazy(() =>
  import("./app/admin/page").then((m) => ({ default: m.AdminPage })),
);
const MunicipiosPage = lazy(() =>
  import("./app/municipios/page").then((m) => ({ default: m.MunicipiosPage })),
);
const PoliticaPage = lazy(() =>
  import("./app/politica/page").then((m) => ({ default: m.PoliticaPage })),
);
const EmpresasPage = lazy(() =>
  import("./app/empresas/page").then((m) => ({ default: m.EmpresasPage })),
);
const AmbientalPage = lazy(() =>
  import("./app/ambiental/page").then((m) => ({ default: m.AmbientalPage })),
);
const JuridicoPage = lazy(() =>
  import("./app/juridico/page").then((m) => ({ default: m.JuridicoPage })),
);
const InpiPage = lazy(() =>
  import("./app/inpi/page").then((m) => ({ default: m.InpiPage })),
);
const DossiePage = lazy(() =>
  import("./app/dossie/page").then((m) => ({ default: m.DossiePage })),
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
const RaioXPage = lazy(() => import("./app/raio-x/page"));
const LeadsPage = lazy(() => import("./app/leads/page").then((m) => ({ default: m.LeadsPage })));
const OnboardingProfissaoPage = lazy(() =>
  import("./app/onboarding/profissao-page").then((m) => ({ default: m.OnboardingProfissaoPage })),
);
const PrivacidadeCentralPage = lazy(() =>
  import("./app/privacidade/page").then((m) => ({ default: m.PrivacidadeCentralPage })),
);
const EmpresaPage = lazy(() => import("./app/publico/empresa-page").then((m) => ({ default: m.EmpresaPage })));
const EnterprisePage = lazy(() =>
  import("./app/enterprise/page").then((m) => ({ default: m.EnterprisePage })),
);
const CerebroPage = lazy(() =>
  import("./app/cerebro/page").then((m) => ({ default: m.CerebroPage })),
);
const ConsultasPage = lazy(() =>
  import("./app/consultas/page").then((m) => ({ default: m.ConsultasPage })),
);
const MunicipioDetailPage = lazy(() =>
  import("./app/municipios/municipio-detail-page").then((m) => ({ default: m.MunicipioDetailPage })),
);
const DeputadoDetailPage = lazy(() =>
  import("./app/politica/deputado-detail-page").then((m) => ({ default: m.DeputadoDetailPage })),
);
const InfracaoDetailPage = lazy(() =>
  import("./app/ambiental/infracao-detail-page").then((m) => ({ default: m.InfracaoDetailPage })),
);

type RouteKey =
  | "painel"
  | "lotes"
  | "historico"
  | "licitacoes"
  | "alertas"
  | "relatorios"
  | "fontes"
  | "conta"
  | "billing"
  | "search"
  | "lot-detail"
  | "modules"
  | "admin"
  | "municipios"
  | "municipio-detail"
  | "politica"
  | "deputado-detail"
  | "empresas"
  | "ambiental"
  | "infracao-detail"
  | "juridico"
  | "inpi"
  | "raio-x"
  | "leads"
  | "cerebro"
  | "dossie"
  | "consultas"
  | "onboarding";

type NavItem = { path: string; route: RouteKey; label: string; icon: typeof LayoutGrid };

// Navegação agrupada em clusters — cara enterprise para a sidebar desktop + drawer mobile.
// A bottom-nav (mobile) consome o NAV plano derivado abaixo e NÃO é afetada.
const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Visão geral",
    items: [
      { path: "/app", route: "painel", label: "Painel", icon: LayoutGrid },
    ],
  },
  {
    label: "Inteligência",
    items: [
      { path: "/app/cerebro", route: "cerebro", label: "Cérebro", icon: Brain },
      { path: "/app/dossie", route: "dossie", label: "Dossiê", icon: FileSearch2 },
      { path: "/app/consultas", route: "consultas", label: "Consultas", icon: BadgeCheck },
      { path: "/app/raio-x", route: "raio-x", label: "Raio-X", icon: ScanLine },
      { path: "/app/leads", route: "leads", label: "Leads", icon: Sparkles },
    ],
  },
  {
    label: "Dados públicos",
    items: [
      { path: "/app/lotes", route: "lotes", label: "Lotes", icon: Gavel },
      { path: "/app/historico", route: "historico", label: "Histórico", icon: History },
      { path: "/app/licitacoes", route: "licitacoes", label: "Licitações", icon: Landmark },
      { path: "/app/politica", route: "politica", label: "Política", icon: Users },
      { path: "/app/municipios", route: "municipios", label: "Municípios", icon: MapPin },
      { path: "/app/empresas", route: "empresas", label: "Empresas", icon: Building2 },
      { path: "/app/ambiental", route: "ambiental", label: "Ambiental", icon: Leaf },
      { path: "/app/juridico", route: "juridico", label: "Jurídico", icon: Scale },
      { path: "/app/inpi", route: "inpi", label: "INPI", icon: BadgeCheck },
    ],
  },
  {
    label: "Operação",
    items: [
      { path: "/app/alertas", route: "alertas", label: "Alertas", icon: Bell },
      { path: "/app/relatorios", route: "relatorios", label: "Relatórios", icon: FileText },
      { path: "/app/fontes", route: "fontes", label: "Fontes", icon: Database },
    ],
  },
];

// NAV plano derivado — preserva compatibilidade com a bottom-nav mobile e qualquer
// código que precise de NAV.find() / NAV[0] sem ter que saber dos grupos.
const NAV: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

// Item de navegação exclusivo do admin (renderizado só quando isAdmin === true).
const ADMIN_NAV: { path: string; route: RouteKey; label: string; icon: typeof LayoutGrid } = {
  path: "/app/admin",
  route: "admin",
  label: "Administração",
  icon: ShieldCheck,
};

const ROUTE_TITLES: Record<RouteKey, string> = {
  painel: "Painel",
  lotes: "Lotes",
  historico: "Histórico de preços",
  licitacoes: "Licitações",
  alertas: "Alertas",
  relatorios: "Relatórios",
  fontes: "Fontes & Rastreabilidade",
  conta: "Conta",
  billing: "Planos",
  search: "Buscar leilões",
  "lot-detail": "Análise do lote",
  modules: "Módulos",
  admin: "Administração",
  municipios: "Municípios",
  "municipio-detail": "Município",
  politica: "Política",
  "deputado-detail": "Deputado",
  empresas: "Empresas",
  ambiental: "Ambiental",
  "infracao-detail": "Auto de Infração",
  juridico: "Jurídico",
  inpi: "INPI",
  "raio-x": "Raio-X de Empresa",
  leads: "Leads com Motivo",
  cerebro: "Cérebro",
  dossie: "Dossiê da Empresa",
  consultas: "Consultas Premium",
  onboarding: "Perfil",
};

function pathToRoute(path: string): RouteKey {
  if (/^\/app\/(?:lotes|leiloes)\/[^/]+/.test(path)) return "lot-detail";
  if (/^\/app\/municipios\/[^/]+/.test(path)) return "municipio-detail";
  if (/^\/app\/politica\/[^/]+/.test(path)) return "deputado-detail";
  if (/^\/app\/ambiental\/[^/]+/.test(path)) return "infracao-detail";
  if (path.startsWith("/app/historico")) return "historico";
  if (path.startsWith("/app/lotes") || path.startsWith("/app/leiloes")) return "lotes";
  if (path.startsWith("/app/licitacoes")) return "licitacoes";
  if (path.startsWith("/app/politica")) return "politica";
  if (path.startsWith("/app/municipios")) return "municipios";
  if (path.startsWith("/app/empresas")) return "empresas";
  if (path.startsWith("/app/ambiental")) return "ambiental";
  if (path.startsWith("/app/juridico")) return "juridico";
  if (path.startsWith("/app/inpi")) return "inpi";
  if (path.startsWith("/app/cerebro")) return "cerebro";
  if (path.startsWith("/app/dossie")) return "dossie";
  if (path.startsWith("/app/consultas")) return "consultas";
  if (path.startsWith("/app/raio-x")) return "raio-x";
  if (path.startsWith("/app/leads")) return "leads";
  if (path.startsWith("/app/onboarding")) return "onboarding";
  if (path.startsWith("/app/alertas")) return "alertas";
  if (path.startsWith("/app/relatorios")) return "relatorios";
  if (path.startsWith("/app/fontes")) return "fontes";
  if (path.startsWith("/app/conta")) return "conta";
  if (path.startsWith("/app/planos")) return "billing";
  if (path.startsWith("/app/buscar")) return "search";
  if (path.startsWith("/app/modules")) return "modules";
  if (path.startsWith("/app/admin")) return "admin";
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
  const { user, session, signOut } = useAuth();
  const { isAdmin } = useIsAdmin();
  // Plano efetivo do usuário: define se a topbar/sidebar mostram "Upgrade"
  // (free) ou um selo "Plano ativo" (pago/teste). Enquanto planLoading, não
  // renderizamos nem um nem outro para evitar o flash de "Upgrade" em quem
  // já pagou (o estado inicial do hook é free+loading).
  const { isPro, plan, trial, status: planStatus, until: planUntil, loading: planLoading } = usePlan();
  const planLabel = plan === "corporativo" ? "Corporativo ativo" : "Profissional ativo";
  const [avatarError, setAvatarError] = useState(false);
  const [selectedLot, setSelectedLot] = useState<ReceitaLeilaoLot | null>(null);
  const [isLoadingLot, setIsLoadingLot] = useState(false);
  const [lotLoadMessage, setLotLoadMessage] = useState<string | null>(null);
  const [selectedMunicipio, setSelectedMunicipio] = useState<MunicipioWithStats | null>(null);
  const [selectedDeputado, setSelectedDeputado] = useState<CamaraDeputado | null>(null);
  const [selectedInfracao, setSelectedInfracao] = useState<IbamaInfracao | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [moreDrawerOpen, setMoreDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  // Menu do avatar/conta (topbar). Só vira um menu de fato para admin — para o
  // usuário comum o avatar continua sendo um atalho direto para /app/conta.
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  // Menu "mais ações" (kebab) da topbar — no mobile agrupa Tema/Ajuda/Feedback
  // para que nenhum botão vaze da viewport. Sino e avatar permanecem sempre
  // visíveis fora do kebab (são os itens que o usuário mais aciona).
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const moreActionsRef = useRef<HTMLDivElement | null>(null);
  // Focus traps para os dois drawers mobile (menu lateral e bottom sheet "Mais"):
  // ao abrir, o foco vai pra dentro e Tab/Shift+Tab circulam só ali, sem vazar
  // pro conteúdo de fundo; ao fechar, o foco volta pra quem abriu (ACES-04).
  const sidebarTrapRef = useFocusTrap<HTMLElement>(sidebarOpen);
  const moreDrawerTrapRef = useFocusTrap<HTMLDivElement>(moreDrawerOpen);
  const [searchSeed, setSearchSeed] = useState("");
  const [topbarQuery, setTopbarQuery] = useState("");
  const topbarInputRef = useRef<HTMLInputElement | null>(null);
  const [checkoutOk, setCheckoutOk] = useState<boolean>(
    () => typeof window !== "undefined" && isCheckoutSuccess(window.location.search),
  );

  // Limpa o ?checkout=sucesso da URL após exibir o banner — evita que um link
  // compartilhado/favoritado mostre "pagamento confirmado" para outra pessoa.
  useEffect(() => {
    if (checkoutOk && typeof window !== "undefined" && window.location.search.includes("checkout=")) {
      window.history.replaceState(null, "", window.location.pathname + window.location.hash);
    }
  }, [checkoutOk]);

  // Fecha os drawers mobile no Escape (teclado externo / leitor de tela). Sem
  // isso, o menu lateral e o bottom sheet "Mais" só fechavam por clique no scrim,
  // deixando quem navega por teclado preso com o drawer aberto (ACES-04).
  useEffect(() => {
    if (!sidebarOpen && !moreDrawerOpen) return;
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key !== "Escape") return;
      setSidebarOpen(false);
      setMoreDrawerOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [sidebarOpen, moreDrawerOpen]);

  // Fecha o menu do avatar/conta no Escape ou clique fora. O foco volta ao
  // gatilho no onKeyDown (o próprio botão do avatar mantém o foco em desktop).
  useEffect(() => {
    if (!accountMenuOpen) return;
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") setAccountMenuOpen(false);
    }
    function onPointerDown(e: PointerEvent): void {
      const el = accountMenuRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) {
        setAccountMenuOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [accountMenuOpen]);

  // Fecha o menu "mais ações" (kebab) no Escape ou clique fora — mesmo padrão
  // do menu de conta acima.
  useEffect(() => {
    if (!moreActionsOpen) return;
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") setMoreActionsOpen(false);
    }
    function onPointerDown(e: PointerEvent): void {
      const el = moreActionsRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) {
        setMoreActionsOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [moreActionsOpen]);

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

  // ⌘K / Ctrl+K agora abre o IntelligenceOmnibox (atalho próprio do componente).
  // O antigo handler que focava a busca textual foi removido para não competir.

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

  function handleSelectMunicipio(municipio: MunicipioWithStats) {
    setSelectedMunicipio(municipio);
    go(`/app/municipios/${encodeURIComponent(municipio.id)}`);
  }

  function handleSelectDeputado(deputado: CamaraDeputado) {
    setSelectedDeputado(deputado);
    go(`/app/politica/${encodeURIComponent(deputado.id)}`);
  }

  function handleSelectInfracao(infracao: IbamaInfracao) {
    setSelectedInfracao(infracao);
    go(`/app/ambiental/${encodeURIComponent(infracao.id)}`);
  }

  const displayName =
    (user?.user_metadata?.["full_name"] as string | undefined) ?? user?.email?.split("@")[0] ?? "Você";
  const avatarUrl = user?.user_metadata?.["avatar_url"] as string | undefined;

  // Se a URL do avatar mudar (troca de conta/foto), damos uma nova chance de
  // carregar — senão um erro anterior manteria as iniciais para sempre.
  useEffect(() => {
    setAvatarError(false);
  }, [avatarUrl]);

  const { helpOn, toggleHelp } = useHelpMode();

  // Contexto repassado à IA (omnibox + chat): tela atual + lote aberto, se houver.
  const aiAccessToken = session?.access_token;
  const aiContext = (() => {
    const parts = [`Tela atual: ${ROUTE_TITLES[route]} (${path})`];
    if (route === "lot-detail" && selectedLot) {
      parts.push(
        `Lote aberto: ${selectedLot.lotNumber} em ${selectedLot.city}, órgão ${selectedLot.agency}, edital ${selectedLot.edital}.`,
      );
    }
    if (route === "municipio-detail" && selectedMunicipio) {
      parts.push(`Município aberto: ${selectedMunicipio.nome}/${selectedMunicipio.uf}, IBGE ${selectedMunicipio.codigoIbge}.`);
    }
    if (route === "deputado-detail" && selectedDeputado) {
      parts.push(`Deputado aberto: ${selectedDeputado.nome}, ${selectedDeputado.partido}/${selectedDeputado.uf}.`);
    }
    if (route === "infracao-detail" && selectedInfracao) {
      parts.push(`Auto de infração aberto: ${selectedInfracao.infrator}, ${selectedInfracao.tipoInfracao}, ${selectedInfracao.uf}.`);
    }
    return parts.join(" ");
  })();

  const navItem = (item: (typeof NAV)[number], inDrawer: boolean): ReactNode => {
    const active = route === item.route
      || (item.route === "lotes" && route === "lot-detail")
      || (item.route === "municipios" && route === "municipio-detail")
      || (item.route === "politica" && route === "deputado-detail")
      || (item.route === "ambiental" && route === "infracao-detail");
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

      <nav aria-label="Navegação principal" style={{ padding: collapsed && !inDrawer ? "0 10px" : "0 12px", display: "flex", flexDirection: "column", gap: 0 }}>
        {NAV_GROUPS.map((group) => (
          <div key={group.label} role="group" aria-label={group.label} style={{ marginBottom: 6 }}>
            {/* Cabeçalho de seção: visível apenas quando expandido; divisor fino quando colapsado */}
            {collapsed && !inDrawer ? (
              <div aria-hidden="true" style={{ margin: "8px 0 6px", borderTop: "1px solid var(--border)" }} />
            ) : (
              <p
                aria-hidden="true"
                style={{
                  margin: "10px 4px 3px",
                  padding: 0,
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: "0.09em",
                  textTransform: "uppercase",
                  color: "var(--t-low)",
                  userSelect: "none",
                  lineHeight: 1,
                }}
              >
                {group.label}
              </p>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {group.items.map((item) => navItem(item, inDrawer))}
            </div>
          </div>
        ))}
        {isAdmin && (
          <div role="group" aria-label="Administração" style={{ marginBottom: 6 }}>
            {collapsed && !inDrawer ? (
              <div aria-hidden="true" style={{ margin: "8px 0 6px", borderTop: "1px solid var(--border)" }} />
            ) : (
              <p
                aria-hidden="true"
                style={{
                  margin: "10px 4px 3px",
                  padding: 0,
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: "0.09em",
                  textTransform: "uppercase",
                  color: "var(--t-low)",
                  userSelect: "none",
                  lineHeight: 1,
                }}
              >
                Sistema
              </p>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {navItem(ADMIN_NAV, inDrawer)}
            </div>
          </div>
        )}
      </nav>

      <div style={{ flex: 1 }} />

      <nav aria-label="Conta" style={{ padding: collapsed && !inDrawer ? "0 10px" : "0 12px" }}>
        {navItem({ path: "/app/conta", route: "conta", label: "Conta", icon: User }, inDrawer)}
        {/* Botão de feedback: visível apenas quando a sidebar está expandida */}
        {(!collapsed || inDrawer) && (
          <div style={{ padding: "8px 2px 2px" }}>
            <FeedbackButton
              currentPath={path}
              {...(user?.email ? { userEmail: user.email } : {})}
              variant="pill"
              className="btn-feedback-sidebar"
            />
          </div>
        )}
      </nav>

      {/* Bloco de plano na sidebar. Enquanto o plano resolve (planLoading) não
          mostramos nada, para não piscar "Assinar agora" para quem já é Pro.
          Pro/Corporativo → resumo estático "Plano ativo" com atalho para a
          conta. Free → CTA de assinatura (comportamento original). */}
      {!planLoading && (
        <div style={{ padding: collapsed && !inDrawer ? "12px 10px" : "12px 14px" }}>
          {isPro ? (
            collapsed && !inDrawer ? (
              <HelpHint id="nav.planos">
                <button
                  className="btn btn--ghost btn--icon btn--sm"
                  type="button"
                  onClick={() => go("/app/conta")}
                  title={planLabel}
                  aria-label={planLabel}
                  style={{ width: "100%", color: "var(--accent-ink)" }}
                >
                  <BadgeCheck size={16} aria-hidden="true" />
                </button>
              </HelpHint>
            ) : (
              <button
                type="button"
                onClick={() => go("/app/conta")}
                className="inset"
                style={{
                  padding: 13,
                  width: "100%",
                  textAlign: "left",
                  border: "1px solid var(--border)",
                  background: "var(--surface-2)",
                  cursor: "pointer",
                  font: "inherit",
                  borderRadius: 12,
                }}
                title="Gerenciar assinatura"
              >
                <span className="badge badge--accent">
                  <BadgeCheck size={13} aria-hidden="true" />
                  {planLabel}
                </span>
                <span style={{ display: "block", marginTop: 8, fontSize: 11.5, color: "var(--t-mid)" }}>
                  {trial ? "Teste ativo — gerenciar assinatura" : "Gerenciar assinatura"}
                </span>
              </button>
            )
          ) : collapsed && !inDrawer ? (
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
      )}

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
          style={{ width: sidebarWidth, flex: "0 0 auto", borderRight: "1px solid var(--border)", background: "var(--surface)", display: "flex", flexDirection: "column", height: "100dvh", position: "sticky", top: 0, transition: "width .2s", overflowX: "hidden", overflowY: "auto", zIndex: 20 }}
        >
          {sidebarInner(false)}
        </aside>

        {/* sidebar drawer mobile */}
        {sidebarOpen && (
          <>
            <div className="shell-scrim" onClick={() => setSidebarOpen(false)} aria-hidden="true" style={{ position: "fixed", inset: 0, background: "rgba(4,8,18,.5)", zIndex: 40 }} />
            <aside ref={sidebarTrapRef} className="shell-sidebar-drawer" role="dialog" aria-modal="true" aria-label="Menu de navegação" style={{ position: "fixed", top: 0, left: 0, bottom: 0, width: "min(86vw, 300px)", maxHeight: "100dvh", overflowY: "auto", paddingLeft: "env(safe-area-inset-left)", background: "var(--surface)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", zIndex: 50, boxShadow: "var(--shadow-xl)" }}>
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
                {/* Busca literal de leilões (Enter ou clique na lupa). É distinta
                    da Inteligência (IA) ao lado, que responde perguntas livres. */}
                <form
                  className="searchbar"
                  role="search"
                  aria-label="Buscar leilões"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (topbarQuery.trim().length > 0) {
                      goToSearch(topbarQuery);
                      setTopbarQuery("");
                    }
                  }}
                >
                  <Search size={16} style={{ color: "var(--t-low)", flexShrink: 0 }} aria-hidden="true" />
                  <input
                    ref={topbarInputRef}
                    placeholder="Buscar leilões por cidade, órgão…"
                    value={topbarQuery}
                    onChange={(e) => setTopbarQuery(e.target.value)}
                    aria-label="Buscar leilões"
                    enterKeyHint="search"
                    style={{ fontSize: 13.5 }}
                  />
                  {topbarQuery.trim().length > 0 ? (
                    <button
                      type="submit"
                      className="btn btn--icon btn--ghost btn--sm shell-search-go"
                      title="Buscar"
                      aria-label="Buscar"
                    >
                      <Search size={15} aria-hidden="true" />
                    </button>
                  ) : (
                    <kbd className="shell-search-kbd" aria-hidden="true">Enter</kbd>
                  )}
                </form>
              </HelpHint>
            </div>
            <div className="shell-actions">
              {/* Botão de inteligência (omnibox + paleta ⌘K) — IA da Fonte.ia */}
              <HelpHint id="topbar.ai">
                <div className="shell-omnibox">
                  {/* fallback null: o omnibox aparece ao terminar de carregar;
                      sem reservar espaço extra (não causa layout shift). */}
                  <Suspense fallback={null}>
                    <IntelligenceOmnibox
                      context={aiContext}
                      {...(aiAccessToken ? { accessToken: aiAccessToken } : {})}
                      placeholder="Inteligência…"
                      onNavigate={go}
                    />
                  </Suspense>
                </div>
              </HelpHint>
              {/* Ações secundárias (Tema, Ajuda, Feedback): visíveis inline no
                  desktop; no mobile (<=560px) colapsam no botão "mais ações"
                  (kebab) logo abaixo, para nenhum botão vazar da viewport. */}
              <div className="shell-secondary-actions">
                <HelpHint id="topbar.theme">
                  <ThemeToggle />
                </HelpHint>
                {/* Botão Modo Ajuda */}
                <HelpHint id="topbar.help">
                  <button
                    className="btn btn--icon btn--ghost shell-help"
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
                </HelpHint>
                <HelpHint id="topbar.feedback">
                  <FeedbackButton
                    currentPath={path}
                    {...(user?.email ? { userEmail: user.email } : {})}
                  />
                </HelpHint>
              </div>
              {/* Botão "mais ações" (kebab): só existe no mobile via CSS
                  (display:none no desktop). Reúne Tema/Ajuda/Feedback num
                  dropdown ancorado à direita, mesmo padrão do menu de conta. */}
              <div ref={moreActionsRef} className="shell-more-actions" style={{ position: "relative" }}>
                <button
                  className="btn btn--icon btn--ghost"
                  type="button"
                  onClick={() => setMoreActionsOpen((o) => !o)}
                  aria-label="Mais ações"
                  aria-haspopup="menu"
                  aria-expanded={moreActionsOpen}
                  title="Mais ações"
                >
                  <MoreHorizontal size={18} aria-hidden="true" />
                </button>
                {moreActionsOpen && (
                  <div
                    role="menu"
                    aria-label="Mais ações"
                    style={{
                      position: "absolute",
                      top: "calc(100% + 8px)",
                      right: 0,
                      zIndex: 9999,
                      minWidth: 200,
                      maxWidth: "calc(100vw - 16px)",
                      background: "var(--elevated, #fff)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--r-md, 12px)",
                      boxShadow: "var(--shadow-lg, 0 18px 44px rgba(11,34,64,.16))",
                      padding: 6,
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                    }}
                  >
                    <div
                      role="menuitem"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                        width: "100%",
                        minHeight: 44,
                        padding: "8px 10px",
                        borderRadius: "var(--r-sm, 8px)",
                        fontSize: 13.5,
                        color: "var(--t-hi)",
                      }}
                    >
                      <span>Tema</span>
                      <ThemeToggle />
                    </div>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMoreActionsOpen(false);
                        toggleHelp();
                      }}
                      aria-pressed={helpOn}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        width: "100%",
                        minHeight: 44,
                        padding: "8px 10px",
                        borderRadius: "var(--r-sm, 8px)",
                        border: 0,
                        background: helpOn ? "color-mix(in srgb,var(--brand) 12%,transparent)" : "transparent",
                        color: helpOn ? "var(--brand-ink, #1D5FE0)" : "var(--t-hi)",
                        font: "inherit",
                        fontSize: 13.5,
                        textAlign: "left",
                        cursor: "pointer",
                      }}
                    >
                      <HelpCircle size={16} aria-hidden="true" style={{ flexShrink: 0 }} />
                      {helpOn ? "Desligar modo ajuda" : "Ligar modo ajuda"}
                    </button>
                    <div
                      role="menuitem"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        width: "100%",
                        minHeight: 44,
                        padding: "8px 10px",
                        borderRadius: "var(--r-sm, 8px)",
                      }}
                    >
                      <FeedbackButton
                        variant="pill"
                        currentPath={path}
                        {...(user?.email ? { userEmail: user.email } : {})}
                      />
                    </div>
                  </div>
                )}
              </div>
              <HelpHint id="topbar.alerts">
                <button className="btn btn--icon btn--ghost shell-bell" type="button" onClick={() => go("/app/alertas")} title="Alertas" aria-label="Alertas" style={{ position: "relative" }}>
                  <Bell size={18} aria-hidden="true" />
                </button>
              </HelpHint>
              {/* Selo de teste (trial) na topbar — contagem regressiva compacta,
                  só quando o acesso premium vem de um teste vigente (trial + prazo).
                  Fica ANTES do bloco de plano: um Pro em trialing vê o selo + o
                  "Plano ativo". Guardado por planLoading para não piscar. O caso
                  "expired" (agora free) cai no ramo Upgrade abaixo, coerente com o
                  paywall honesto das páginas de conta/planos. */}
              {!planLoading && trial && planUntil !== undefined && (
                <span className="shell-trial">
                  <TrialBadge trial={trial} status={planStatus} until={planUntil} size="sm" />
                </span>
              )}
              {/* Plano na topbar. Enquanto planLoading, nada é renderizado — sem
                  isso o botão "Upgrade" piscaria para quem já pagou a cada
                  navegação. Pro/Corporativo → selo estático "Plano ativo" que
                  leva à conta (gerenciar). Free → botão "Upgrade" original. */}
              {planLoading ? null : isPro ? (
                <HelpHint id="topbar.upgrade">
                  <button
                    className="btn btn--sm shell-plan-active"
                    type="button"
                    onClick={() => go("/app/conta")}
                    title="Gerenciar assinatura"
                    aria-label={`${planLabel} — gerenciar assinatura`}
                  >
                    <BadgeCheck size={14} aria-hidden="true" />
                    <span className="shell-upgrade-label">{planLabel}</span>
                  </button>
                </HelpHint>
              ) : (
                <HelpHint id="topbar.upgrade">
                  <button className="btn btn--accent btn--sm shell-upgrade" type="button" onClick={() => go("/app/planos")} aria-label="Fazer upgrade de plano">
                    <Zap size={14} fill="currentColor" aria-hidden="true" />
                    <span className="shell-upgrade-label">Upgrade</span>
                  </button>
                </HelpHint>
              )}
              {/* Avatar/conta. Para admin, o clique na FOTO abre um menu com
                  "Minha conta" e "Administração" (acesso claro ao painel do dono,
                  pedido explícito). Para o usuário comum, o avatar continua sendo
                  um atalho direto para /app/conta — sem menu. O popover é ancorado
                  à direita do avatar (o elemento mais à direita da topbar), com
                  max-width seguro para nunca vazar da viewport, e fecha no Escape
                  ou clique fora. */}
              <div ref={accountMenuRef} style={{ position: "relative", display: "inline-flex" }}>
                <button
                  type="button"
                  onClick={() => {
                    if (isAdmin) {
                      setAccountMenuOpen((o) => !o);
                    } else {
                      go("/app/conta");
                    }
                  }}
                  title="Conta"
                  aria-label={isAdmin ? "Conta e administração" : "Conta"}
                  className="avatar shell-avatar"
                  style={{ border: 0, cursor: "pointer" }}
                  {...(isAdmin
                    ? { "aria-haspopup": "menu" as const, "aria-expanded": accountMenuOpen }
                    : {})}
                >
                  {avatarUrl && !avatarError ? (
                    <img
                      src={avatarUrl}
                      alt={displayName}
                      width={40}
                      height={40}
                      loading="lazy"
                      decoding="async"
                      onError={() => setAvatarError(true)}
                      style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }}
                    />
                  ) : (
                    initialsOf(displayName)
                  )}
                </button>
                {isAdmin && accountMenuOpen && (
                  <div
                    role="menu"
                    aria-label="Conta e administração"
                    style={{
                      position: "absolute",
                      top: "calc(100% + 8px)",
                      right: 0,
                      zIndex: 9999,
                      minWidth: 216,
                      maxWidth: "calc(100vw - 16px)",
                      background: "var(--elevated, #fff)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--r-md, 12px)",
                      boxShadow: "var(--shadow-lg, 0 18px 44px rgba(11,34,64,.16))",
                      padding: 6,
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                    }}
                  >
                    <div
                      style={{
                        padding: "6px 10px 8px",
                        borderBottom: "1px solid var(--border)",
                        marginBottom: 4,
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--t-hi)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {displayName}
                      </div>
                      {user?.email && (
                        <div style={{ fontSize: 11.5, color: "var(--t-low)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {user.email}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        go("/app/conta");
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        width: "100%",
                        minHeight: 44,
                        padding: "8px 10px",
                        borderRadius: "var(--r-sm, 8px)",
                        border: 0,
                        background: "transparent",
                        color: "var(--t-hi)",
                        font: "inherit",
                        fontSize: 13.5,
                        textAlign: "left",
                        cursor: "pointer",
                      }}
                    >
                      <User size={16} aria-hidden="true" style={{ color: "var(--t-mid)", flexShrink: 0 }} />
                      Minha conta
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        go("/app/admin");
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        width: "100%",
                        minHeight: 44,
                        padding: "8px 10px",
                        borderRadius: "var(--r-sm, 8px)",
                        border: 0,
                        background: "transparent",
                        color: "var(--brand-ink)",
                        font: "inherit",
                        fontSize: 13.5,
                        fontWeight: 600,
                        textAlign: "left",
                        cursor: "pointer",
                      }}
                    >
                      <ShieldCheck size={16} aria-hidden="true" style={{ flexShrink: 0 }} />
                      Administração
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          <div className="shell-content">
            {/* Banner global de "pagamento recebido" — mostrado em qualquer tela
                do retorno do Stripe, EXCETO na própria página de Planos, que já
                renderiza o seu banner de sucesso. Sem esse guard, os dois
                aparecem empilhados no momento pós-pagamento (BILL-02). */}
            {checkoutOk && route !== "billing" && (
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
            <ErrorBoundary key={route} route={path}>
              <Suspense fallback={
                <div className="fade-in" aria-busy="true" aria-label="Carregando" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div className="skeleton skeleton-text" style={{ width: 220, height: 26 }} />
                  <div className="skeleton skeleton-text" style={{ width: 340, maxWidth: "80%" }} />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(260px, 100%), 1fr))", gap: 16, marginTop: 6 }}>
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="skeleton-card" style={{ height: 150 }} />
                    ))}
                  </div>
                </div>
              }>
                {route === "painel" && <DashboardPage onSelectLot={handleSelectLot} onAsk={goToSearch} />}
                {route === "lotes" && <LotesPage onSelectLot={handleSelectLot} />}
                {route === "historico" && <HistoricoPage />}
                {route === "licitacoes" && <LicitacoesPage />}
                {route === "politica" && <PoliticaPage onSelectDeputado={handleSelectDeputado} />}
                {route === "municipios" && <MunicipiosPage onSelectMunicipio={handleSelectMunicipio} />}
                {route === "empresas" && <EmpresasPage />}
                {route === "ambiental" && <AmbientalPage onSelectInfracao={handleSelectInfracao} />}
                {route === "municipio-detail" && (
                  selectedMunicipio
                    ? <MunicipioDetailPage municipio={selectedMunicipio} onBack={() => go("/app/municipios")} />
                    : (
                      <section className="panel" style={{ padding: 28 }}>
                        <span className="eyebrow">Município não encontrado</span>
                        <h2 className="h2" style={{ margin: "8px 0 10px" }}>Este município não está carregado</h2>
                        <p className="muted">Navegue pela lista de municípios e clique em um card para ver os detalhes.</p>
                        <button className="btn btn--primary" type="button" onClick={() => go("/app/municipios")} style={{ marginTop: 12 }}>
                          Ir para Municípios
                        </button>
                      </section>
                    )
                )}
                {route === "deputado-detail" && (
                  selectedDeputado
                    ? <DeputadoDetailPage deputado={selectedDeputado} onBack={() => go("/app/politica")} />
                    : (
                      <section className="panel" style={{ padding: 28 }}>
                        <span className="eyebrow">Deputado não encontrado</span>
                        <h2 className="h2" style={{ margin: "8px 0 10px" }}>Este deputado não está carregado</h2>
                        <p className="muted">Navegue pela lista de deputados e clique em um card para ver os detalhes.</p>
                        <button className="btn btn--primary" type="button" onClick={() => go("/app/politica")} style={{ marginTop: 12 }}>
                          Ir para Política
                        </button>
                      </section>
                    )
                )}
                {route === "infracao-detail" && (
                  selectedInfracao
                    ? <InfracaoDetailPage infracao={selectedInfracao} onBack={() => go("/app/ambiental")} />
                    : (
                      <section className="panel" style={{ padding: 28 }}>
                        <span className="eyebrow">Auto de infração não encontrado</span>
                        <h2 className="h2" style={{ margin: "8px 0 10px" }}>Este auto não está carregado</h2>
                        <p className="muted">Navegue pela lista de autos de infração e clique em um card para ver os detalhes.</p>
                        <button className="btn btn--primary" type="button" onClick={() => go("/app/ambiental")} style={{ marginTop: 12 }}>
                          Ir para Ambiental
                        </button>
                      </section>
                    )
                )}
                {route === "juridico" && <JuridicoPage />}
                {route === "inpi" && <InpiPage />}
                {route === "raio-x" && <RaioXPage />}
                {route === "cerebro" && <CerebroPage />}
                {route === "dossie" && <DossiePage />}
                {route === "consultas" && <ConsultasPage />}
                {route === "leads" && <LeadsPage />}
                {route === "onboarding" && <OnboardingProfissaoPage onFinish={() => go("/app")} />}
                {route === "alertas" && <AlertasPage onSelectLot={handleSelectLot} />}
                {route === "relatorios" && <RelatoriosPage onExplore={() => go("/app/lotes")} />}
                {route === "fontes" && <SourcesPage />}
                {route === "billing" && <BillingPage />}
                {route === "search" && <SearchPage initialQuestion={searchSeed} onSelectLot={handleSelectLot} />}
                {route === "modules" && <ModulesPage />}
                {route === "admin" && <AdminPage />}
                {route === "conta" && (
                  <AccountPage name={displayName} email={user?.email ?? ""} avatarUrl={avatarUrl} onSignOut={() => void signOut()} />
                )}
                {route === "lot-detail" &&
                  (selectedLot ? (
                    <LotDetailPage lot={selectedLot} onBack={() => go("/app/lotes")} onSelectLot={handleSelectLot} />
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

      {/* Assistente flutuante (chat contextual). No mobile a IA fica no FAB "Perguntar"
          abaixo (evita dois botões flutuantes empilhados), então escondemos este wrapper. */}
      <div className="shell-chat">
        {/* fallback null: o botão flutuante do chat aparece ao carregar. */}
        <Suspense fallback={null}>
          <ContextChat context={aiContext} {...(aiAccessToken ? { accessToken: aiAccessToken } : {})} />
        </Suspense>
      </div>

      {/* Convite para instalar o app no celular (Android/Chrome e iOS/Safari). */}
      <PwaInstallPrompt />

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

      {/* bottom nav mobile — 5 itens primários + "Mais" para o restante */}
      {(() => {
        const navByRoute = (route: RouteKey) => {
          const found = NAV.find((n) => n.route === route);
          return found ?? NAV[0]!;
        };
        const PRIMARY_NAV = [
          navByRoute("painel"),
          navByRoute("lotes"),
          navByRoute("licitacoes"),
          navByRoute("alertas"),
          navByRoute("relatorios"),
        ];
        const MORE_NAV = [
          navByRoute("politica"),
          navByRoute("municipios"),
          navByRoute("empresas"),
          navByRoute("ambiental"),
          navByRoute("juridico"),
          navByRoute("inpi"),
          navByRoute("consultas"),
          navByRoute("fontes"),
          { path: "/app/modules", route: "modules" as RouteKey, label: "Módulos", icon: LayoutGrid },
        ];
        const moreActive = MORE_NAV.some((item) => route === item.route);
        return (
          <>
            <nav className="shell-bottomnav no-print" aria-label="Navegação rápida">
              {PRIMARY_NAV.map((item) => {
                const active = route === item.route
                  || (item.route === "lotes" && route === "lot-detail")
                  || (item.route === "municipios" && route === "municipio-detail")
                  || (item.route === "politica" && route === "deputado-detail")
                  || (item.route === "ambiental" && route === "infracao-detail");
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
              {/* Botão "Mais" */}
              <button
                type="button"
                onClick={() => setMoreDrawerOpen(true)}
                className="shell-bottomnav-item"
                aria-label="Mais seções"
                style={{ color: moreActive ? "var(--brand-ink)" : "var(--t-mid)", fontWeight: moreActive ? 700 : 500 }}
              >
                <MoreHorizontal size={21} strokeWidth={moreActive ? 2.2 : 1.8} aria-hidden="true" />
                <span>Mais</span>
              </button>
            </nav>

            {/* Drawer "Mais" — slide-up sheet no mobile */}
            {moreDrawerOpen && (
              <>
                <div
                  className="shell-scrim"
                  onClick={() => setMoreDrawerOpen(false)}
                  aria-hidden="true"
                  style={{ position: "fixed", inset: 0, background: "rgba(4,8,18,.5)", zIndex: 40 }}
                />
                <div
                  ref={moreDrawerTrapRef}
                  className="shell-more-drawer"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Mais seções"
                  style={{
                    position: "fixed",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 50,
                    background: "var(--surface)",
                    borderTop: "1px solid var(--border)",
                    borderRadius: "var(--r-xl) var(--r-xl) 0 0",
                    boxShadow: "0 -8px 32px rgba(0,0,0,.18)",
                    paddingBottom: "env(safe-area-inset-bottom)",
                    animation: "shellSlideUp .22s cubic-bezier(.2,.7,.3,1)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px 8px" }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: "var(--t-hi)" }}>Mais seções</span>
                    <button
                      className="btn btn--icon btn--ghost btn--sm"
                      type="button"
                      onClick={() => setMoreDrawerOpen(false)}
                      aria-label="Fechar"
                    >
                      <X size={16} aria-hidden="true" />
                    </button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, padding: "4px 12px 20px" }}>
                    {MORE_NAV.map((item) => {
                      const active = route === item.route;
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.route}
                          type="button"
                          onClick={() => { setMoreDrawerOpen(false); go(item.path); }}
                          className="shell-more-item"
                          aria-current={active ? "page" : undefined}
                          style={{ color: active ? "var(--brand-ink)" : "var(--t-mid)", fontWeight: active ? 700 : 500 }}
                        >
                          <Icon size={22} strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
                          <span>{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </>
        );
      })()}

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
        /* Dica "Enter" dentro da busca: some ao começar a digitar (dá lugar ao
           botão de submit). Puramente decorativa, oculta de leitores de tela. */
        .shell-search-kbd{
          flex:0 0 auto;font-family:var(--font);font-size:10.5px;font-weight:600;
          line-height:1;padding:3px 6px;border-radius:6px;color:var(--t-low);
          background:var(--surface-2);border:1px solid var(--border);
        }
        .shell-search-go{flex:0 0 auto;margin-right:-6px}
        /* .shell-actions nunca deve estourar a viewport: min-width:0 permite que
           filhos com texto encolham/elipsem em vez de forçar scroll horizontal;
           flex-shrink:0 no container evita que ele "suma" espremido pelo -search. */
        .shell-actions{display:flex;align-items:center;gap:6px;margin-left:auto;flex:0 1 auto;min-width:0}
        /* Ações secundárias (Tema/Ajuda/Feedback): inline no desktop, colapsam
           no kebab abaixo de 560px. */
        .shell-secondary-actions{display:flex;align-items:center;gap:6px;flex:0 0 auto}
        /* Botão kebab "mais ações": só existe no mobile (ver media query) */
        .shell-more-actions{display:none}
        /* Omnibox de IA na topbar: largura compacta de botão, cresce um pouco no desktop */
        .shell-omnibox{flex:0 0 auto;width:200px;max-width:34vw}
        .shell-omnibox>*{width:100%}
        .shell-upgrade-label{display:inline}
        /* Selo de plano ativo na topbar (substitui o "Upgrade" para quem já paga).
           Aparência sóbria de status, não de CTA: superfície neutra + tinta de
           acento. Compartilha .shell-upgrade-label para virar ícone-only no mobile
           pela mesma regra de breakpoint do botão de upgrade. */
        .shell-plan-active{
          background:color-mix(in srgb,var(--accent) 14%,transparent);
          color:var(--accent-ink);
          border:1px solid color-mix(in srgb,var(--accent) 30%,transparent);
          font-weight:700;
        }
        .shell-plan-active:hover{background:color-mix(in srgb,var(--accent) 22%,transparent)}
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
        @keyframes shellSlideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @media (prefers-reduced-motion:reduce){
          .shell-scrim,.shell-sidebar-drawer,.shell-more-drawer{animation:none}
        }

        /* =========================================================
           MOBILE — <= 900px
           ========================================================= */
        @media (max-width:900px){
          .shell-sidebar-desktop{display:none!important}
          .shell-burger{display:inline-flex!important}
          .shell-search{display:none}
          /* mobile: IA fica no FAB "Perguntar" (abaixo). Esconde omnibox e chat flutuante. */
          .shell-omnibox{display:none}
          .shell-chat{display:none}
          /* No mobile o upgrade vira ícone e o espaçamento aperta, garantindo que
             Ajuda, Tema, Alertas e Conta caibam sempre — sem nenhum botão sair da tela. */
          .shell-actions{gap:4px}
          .shell-upgrade-label{display:none}
          .shell-upgrade,.shell-plan-active{padding:0;width:36px;height:36px;border-radius:11px}
          .shell-help{flex:0 0 auto}
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

          /* ---- "Mais" drawer grid items ---- */
          .shell-more-item{
            min-height:72px;min-width:44px;
            display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;
            background:none;border:0;cursor:pointer;border-radius:12px;
            font-size:11px;font-family:inherit;line-height:1.2;
            padding:10px 4px;
            -webkit-tap-highlight-color:transparent;
            transition:background .12s,color .12s;
          }
          .shell-more-item span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
          .shell-more-item:active{background:color-mix(in srgb,var(--brand) 10%,transparent);transform:scale(.94)}

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
          /* icon-only upgrade/plano button to free horizontal space */
          .shell-upgrade-label{display:none}
          .shell-upgrade,.shell-plan-active{padding:0;width:36px;height:36px;border-radius:11px}
          /* selo de contagem do trial sai do topo no mobile (segue visível em Conta/Planos) */
          .shell-trial{display:none}
          /* Tema/Ajuda/Feedback colapsam no botão kebab — mantém sino e avatar
             sempre visíveis e impede que qualquer botão vaze da tela, mesmo em
             320px. O kebab é claramente rotulado ("Mais ações") e reabre os
             três itens num menu acessível. */
          .shell-secondary-actions{display:none}
          .shell-more-actions{display:inline-flex}
        }
      `}</style>
    </div>
  );
}

export function App() {
  const { user, loading } = useAuth();
  const { path, navigate } = usePathname();
  const [onboarded, setOnboarded] = useState<boolean>(() => hasOnboarded());

  // Informa ao módulo de telemetria se há sessão ativa — sem expor o id do usuário.
  useEffect(() => {
    setTelemetryAuthed(!!user);
  }, [user]);

  useEffect(() => {
    if (!loading && user && (path === "/" || path === "/entrar")) {
      // Usuário já onboardado: se veio de um CTA de plano na landing, leva ao
      // checkout do plano escolhido (consumo único); senão cai no painel.
      //
      // Usuário NOVO (ainda não onboardado): NÃO consumimos a intenção aqui —
      // se consumíssemos, ela seria perdida antes do onboarding renderar (o
      // onboarding sobrescreveria o destino ao terminar). Deixamos a intenção
      // no sessionStorage e mandamos pro /app, que renderiza o onboarding; o
      // takePendingDestination() só é consumido no onFinish do onboarding
      // (abaixo), priorizando o checkout sobre a rota do objetivo.
      if (onboarded) {
        const dest = takePendingDestination();
        navigate(dest ?? "/app");
      } else {
        navigate("/app");
      }
    }
  }, [loading, user, path, navigate, onboarded]);

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
    path === "/central-privacidade" || path === "/privacidade-central" ? <PrivacidadeCentralPage /> :
    path === "/empresa" ? <EmpresaPage /> :
    path === "/enterprise" ? <EnterprisePage /> :
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
      content = (
        <ErrorBoundary>
          <Suspense fallback={pageFallback}>
            <LoginPage onGoToLanding={() => navigate("/")} initialMode={new URLSearchParams(typeof window !== "undefined" ? window.location.search : "").get("mode") === "login" ? "login" : "signup"} />
          </Suspense>
        </ErrorBoundary>
      );
    } else if (!onboarded) {
      content = (
        <ErrorBoundary>
          <Suspense fallback={pageFallback}>
            <OnboardingPage
              name={(user.user_metadata?.["full_name"] as string | undefined) ?? user.email?.split("@")[0]}
              onFinish={(dest) => {
                markOnboarded();
                setOnboarded(true);
                // Prioridade de destino ao sair do onboarding:
                // 1) Intenção de compra pendente (clicou "Assinar Profissional"
                //    na landing) → vai direto ao checkout do plano. É o usuário
                //    de maior valor; não pode cair numa lista genérica.
                // 2) Deep-link do objetivo escolhido no onboarding (ex.: Lotes).
                // 3) Painel.
                const pending = takePendingDestination();
                navigate(pending ?? dest ?? "/app");
              }}
            />
          </Suspense>
        </ErrorBoundary>
      );
    } else {
      content = <AppShell path={path} navigate={navigate} />;
    }
  } else if (path === "/entrar") {
    content = (
      <ErrorBoundary>
        <Suspense fallback={pageFallback}>
          <LoginPage onGoToLanding={() => navigate("/")} initialMode={new URLSearchParams(typeof window !== "undefined" ? window.location.search : "").get("mode") === "login" ? "login" : "signup"} />
        </Suspense>
      </ErrorBoundary>
    );
  } else {
    content = (
      <LandingPage
        onLogin={() => navigate("/entrar")}
        onLoginExisting={() => navigate("/entrar?mode=login")}
      />
    );
  }

  return (
    <HelpModeProvider>
      {content}
      <CookieBanner onOpenPolicy={() => navigate("/cookies")} />
    </HelpModeProvider>
  );
}
