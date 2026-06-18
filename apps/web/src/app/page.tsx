import { useEffect, useMemo, useRef, useState } from "react";
import { Landmark, SearchX } from "lucide-react";
import { navigateSpa } from "./_nav";
import type { ReceitaLeilaoLot } from "@fonteia/sources";
import { lotEconomia, scoreReceitaLeilaoLot } from "@fonteia/scoring";
import { Bar, CountUp, FonteDots, ScoreRing } from "../components/ui";
import { listLeilaoLots } from "../features/leiloes/leiloes-api";
import { listLicitacoes } from "../features/licitacoes/licitacoes-api";
import { listMunicipios } from "../features/municipios/municipios-api";
import { listDeputados } from "../features/politica/politica-api";
import { listInfracoes } from "../features/ambiental/ambiental-api";
import { listProposicoes } from "../features/juridico/juridico-api";
import { listOrgaos } from "../features/empresas/empresas-api";
import { FONTES, formatBRL } from "../data/leiloes-seed";
import { displayCity } from "../lib/receita-localidades";
import { useAuth } from "../auth/auth-context";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ModuleData {
  leiloes: { count: number; items: string[]; loaded: boolean; error: boolean };
  licitacoes: { count: number; items: string[]; loaded: boolean; error: boolean };
  municipios: { count: number; items: string[]; loaded: boolean; error: boolean };
  politica: { count: number; items: string[]; loaded: boolean; error: boolean };
  ambiental: { count: number; items: string[]; loaded: boolean; error: boolean };
  juridico: { count: number; items: string[]; loaded: boolean; error: boolean };
  empresas: { count: number; items: string[]; loaded: boolean; error: boolean };
  inpi: { count: number; items: string[]; loaded: boolean; error: boolean };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function greetingPeriod(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function greetingName(user: ReturnType<typeof useAuth>["user"]): string {
  const meta = user?.user_metadata;
  if (meta != null) {
    const full = meta["full_name"];
    if (typeof full === "string" && full.trim().length > 0) {
      return full.trim().split(" ")[0] ?? full.trim();
    }
  }
  const email = user?.email;
  if (typeof email === "string" && email.length > 0) {
    return email.split("@")[0] ?? "Olá";
  }
  return "Olá";
}

const ROWS_PER_PAGE = 25;

const RFB_FONTE = {
  sigla: "RFB",
  cor: "#1D5FE0",
  nome: "Receita Federal do Brasil",
} as const;

type OpportunityLabel = "baixo" | "medio" | "alto";

interface ConfidenceBadge {
  className: string;
  label: string;
}

function confiancaBadge(label: OpportunityLabel): ConfidenceBadge {
  if (label === "alto") return { className: "badge--ok", label: "Confiança alta" };
  if (label === "medio") return { className: "badge--warn", label: "Confiança média" };
  return { className: "badge--neutral", label: "Cautela" };
}

function confiancaColor(label: OpportunityLabel): string {
  if (label === "alto") return "var(--ok)";
  if (label === "medio") return "var(--warn)";
  return "var(--t-mid)";
}

function daysUntil(value: string): number {
  const deadline = new Date(value).getTime();
  if (Number.isNaN(deadline)) return 999;
  return Math.ceil((deadline - Date.now()) / 86_400_000);
}

function formatDeadline(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function deadlineHint(days: number): string {
  if (days < 0) return "encerrado";
  if (days === 0) return "encerra hoje";
  if (days === 1) return "encerra amanhã";
  return `em ${days} dias`;
}

function deadlineColor(days: number): string {
  if (days <= 3) return "var(--danger)";
  if (days <= 7) return "var(--warn)";
  return "var(--t-mid)";
}

function riskDistribution(scores: number[]): { baixo: number; medio: number; alto: number } {
  if (scores.length === 0) return { baixo: 0, medio: 0, alto: 0 };
  const baixo = scores.filter((s) => s >= 70).length;
  const medio = scores.filter((s) => s >= 45 && s < 70).length;
  const alto = scores.filter((s) => s < 45).length;
  const total = scores.length;
  return {
    baixo: Math.round((baixo / total) * 100),
    medio: Math.round((medio / total) * 100),
    alto: Math.round((alto / total) * 100),
  };
}

function getWatchlistSize(): number {
  try {
    const raw = localStorage.getItem("fonteia_watchlist");
    if (!raw) return 0;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

const KPI_COLORS = [
  "var(--brand-ink)",
  "var(--accent-ink)",
  "#7C5CFC",
  "#C98A2E",
] as const;

// ─── Module card config ───────────────────────────────────────────────────────

interface ModuleCardConfig {
  key: keyof ModuleData;
  nome: string;
  icone: string;
  badge: string;
  badgeColor: string;
  route: string;
  descricao: string;
}

const MODULE_CARDS: ModuleCardConfig[] = [
  {
    key: "leiloes",
    nome: "Leilões",
    icone: "🏛",
    badge: "RFB",
    badgeColor: "#1D5FE0",
    route: "/leiloes",
    descricao: "Lotes da Receita Federal",
  },
  {
    key: "licitacoes",
    nome: "Licitações",
    icone: "📋",
    badge: "PNCP",
    badgeColor: "#0D7B48",
    route: "/licitacoes",
    descricao: "Portal Nacional de Contratações",
  },
  {
    key: "politica",
    nome: "Política",
    icone: "🏛",
    badge: "Câmara",
    badgeColor: "#6B3FA0",
    route: "/politica",
    descricao: "Deputados e mandatos",
  },
  {
    key: "municipios",
    nome: "Municípios",
    icone: "🗺",
    badge: "IBGE",
    badgeColor: "#2563EB",
    route: "/municipios",
    descricao: "Dados do IBGE Localidades",
  },
  {
    key: "empresas",
    nome: "Empresas",
    icone: "🏢",
    badge: "RFB/CEIS",
    badgeColor: "#DC2626",
    route: "/empresas",
    descricao: "CNPJ e sanções CEIS/CNEP",
  },
  {
    key: "ambiental",
    nome: "Ambiental",
    icone: "🌿",
    badge: "IBAMA",
    badgeColor: "#16A34A",
    route: "/ambiental",
    descricao: "Autos de infração do IBAMA",
  },
  {
    key: "juridico",
    nome: "Jurídico",
    icone: "⚖",
    badge: "CNJ/Câmara",
    badgeColor: "#B45309",
    route: "/juridico",
    descricao: "Processos e proposições",
  },
  {
    key: "inpi",
    nome: "INPI",
    icone: "®",
    badge: "INPI",
    badgeColor: "#7C3AED",
    route: "/inpi",
    descricao: "Propriedade industrial",
  },
];

// ─── ModuleCard component ─────────────────────────────────────────────────────

function ModuleCardSkeleton() {
  return (
    <div
      className="panel"
      style={{
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        minHeight: 200,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div className="skeleton" style={{ width: 36, height: 36, borderRadius: "var(--r-md)" }} />
        <div className="skeleton" style={{ width: "50%", height: 16 }} />
      </div>
      <div className="skeleton" style={{ width: "30%", height: 28 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 13, width: i === 2 ? "60%" : "85%" }} />
        ))}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: "auto",
        }}
      >
        <div className="skeleton" style={{ width: 48, height: 20, borderRadius: 999 }} />
        <div className="skeleton" style={{ width: 80, height: 28, borderRadius: "var(--r-md)" }} />
      </div>
    </div>
  );
}

function ModuleCard({
  config,
  data,
}: {
  config: ModuleCardConfig;
  data: ModuleData[keyof ModuleData];
}) {
  return (
    <div
      className="panel"
      style={{
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        minHeight: 200,
      }}
    >
      {/* Header: ícone + nome */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          aria-hidden="true"
          style={{
            fontSize: 22,
            width: 36,
            height: 36,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "var(--r-md)",
            background: "var(--surface-2)",
            flexShrink: 0,
          }}
        >
          {config.icone}
        </span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: "var(--t-hi)" }}>{config.nome}</div>
          <div style={{ fontSize: 11.5, color: "var(--t-mid)", marginTop: 1 }}>{config.descricao}</div>
        </div>
      </div>

      {/* Contador */}
      {data.error ? (
        <div style={{ fontSize: 12.5, color: "var(--danger)" }}>Erro ao carregar</div>
      ) : (
        <div
          style={{
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: "-.025em",
            color: "var(--brand-ink)",
          }}
        >
          <CountUp value={data.count} decimals={0} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--t-mid)", marginLeft: 4 }}>
            registros
          </span>
        </div>
      )}

      {/* Últimos 3 itens */}
      {data.items.length > 0 ? (
        <ul
          style={{
            margin: 0,
            padding: 0,
            listStyle: "none",
            display: "flex",
            flexDirection: "column",
            gap: 4,
            flex: 1,
          }}
        >
          {data.items.slice(0, 3).map((item, i) => (
            <li
              key={i}
              style={{
                fontSize: 12.5,
                color: "var(--t-mid)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              · {item}
            </li>
          ))}
        </ul>
      ) : data.loaded && !data.error ? (
        <p style={{ fontSize: 12.5, color: "var(--t-low)", margin: 0, flex: 1 }}>
          Sem registros disponíveis agora
        </p>
      ) : null}

      {/* Footer: badge da fonte + link */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: "auto",
          paddingTop: 8,
          borderTop: "1px solid var(--border)",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "2px 8px",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: ".03em",
            color: config.badgeColor,
            background: `color-mix(in srgb, ${config.badgeColor} 12%, var(--surface))`,
            border: `1px solid color-mix(in srgb, ${config.badgeColor} 25%, transparent)`,
          }}
        >
          {config.badge}
        </span>
        <button
          type="button"
          onClick={() => navigateSpa(`/app${config.route}`)}
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: "var(--brand-ink)",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
            fontFamily: "inherit",
          }}
        >
          Ver todos →
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DashboardPage(props: {
  onSelectLot?: ((lot: ReceitaLeilaoLot) => void) | undefined;
  onAsk?: ((q?: string) => void) | undefined;
}) {
  const { onSelectLot, onAsk } = props;
  const { user } = useAuth();

  // ── Leilões state (mantido inteiro) ──────────────────────────────────────
  const [lots, setLots] = useState<ReceitaLeilaoLot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>();
  const [term, setTerm] = useState("");
  const [riskFilter, setRiskFilter] = useState("all");
  const [personFilter, setPersonFilter] = useState("all");
  const [sortBy, setSortBy] = useState("score");
  const [watchlistSize, setWatchlistSize] = useState(0);

  // ── Multi-module data ─────────────────────────────────────────────────────
  const emptyMod = { count: 0, items: [], loaded: false, error: false };
  const [moduleData, setModuleData] = useState<ModuleData>({
    leiloes: { ...emptyMod },
    licitacoes: { ...emptyMod },
    municipios: { ...emptyMod },
    politica: { ...emptyMod },
    ambiental: { ...emptyMod },
    juridico: { ...emptyMod },
    empresas: { ...emptyMod },
    inpi: { ...emptyMod },
  });
  const [modulesLoading, setModulesLoading] = useState(true);

  useEffect(() => {
    setWatchlistSize(getWatchlistSize());
  }, []);

  // ── Load leilões (existing logic) ─────────────────────────────────────────
  useEffect(() => {
    let active = true;
    setIsLoading(true);

    listLeilaoLots()
      .then((result) => {
        if (!active) return;
        setLots(result.lots);
        setIsLoading(false);
        // Update leiloes in moduleData
        setModuleData((prev) => ({
          ...prev,
          leiloes: {
            count: result.lots.length,
            items: result.lots
              .slice(0, 3)
              .map((l) => `Lote ${l.lotNumber} — ${displayCity(l.city)}`),
            loaded: true,
            error: false,
          },
        }));
      })
      .catch((err: unknown) => {
        if (!active) return;
        setLoadError(err instanceof Error ? err.message : "Erro ao carregar lotes.");
        setIsLoading(false);
        setModuleData((prev) => ({
          ...prev,
          leiloes: { count: 0, items: [], loaded: true, error: true },
        }));
      });

    return () => {
      active = false;
    };
  }, []);

  // ── Load all other modules in parallel ───────────────────────────────────
  useEffect(() => {
    let active = true;
    setModulesLoading(true);

    Promise.allSettled([
      listLicitacoes(),
      listMunicipios(),
      listDeputados(),
      listInfracoes(),
      listProposicoes(),
      listOrgaos(),
    ]).then(([licitacoesRes, municipiosRes, politicaRes, ambientalRes, juridicoRes, empresasRes]) => {
      if (!active) return;

      setModuleData((prev) => {
        const next = { ...prev };

        // Licitações
        if (licitacoesRes.status === "fulfilled") {
          const r = licitacoesRes.value;
          next.licitacoes = {
            count: r.licitacoes.length,
            items: r.licitacoes
              .slice(0, 3)
              .map((l) => l.objeto || l.numeroControlePNCP || "—"),
            loaded: true,
            error: false,
          };
        } else {
          next.licitacoes = { count: 0, items: [], loaded: true, error: true };
        }

        // Municípios
        if (municipiosRes.status === "fulfilled") {
          const r = municipiosRes.value;
          next.municipios = {
            count: r.municipios.length,
            items: r.municipios.slice(0, 3).map((m) => m.nome || "—"),
            loaded: true,
            error: false,
          };
        } else {
          next.municipios = { count: 0, items: [], loaded: true, error: true };
        }

        // Política
        if (politicaRes.status === "fulfilled") {
          const r = politicaRes.value;
          next.politica = {
            count: r.deputados.length,
            items: r.deputados
              .slice(0, 3)
              .map((d) => `${d.nome || "—"}${d.partido ? ` (${d.partido})` : ""}`),
            loaded: true,
            error: false,
          };
        } else {
          next.politica = { count: 0, items: [], loaded: true, error: true };
        }

        // Ambiental
        if (ambientalRes.status === "fulfilled") {
          const r = ambientalRes.value;
          next.ambiental = {
            count: r.infracoes.length,
            items: r.infracoes
              .slice(0, 3)
              .map((inf) => inf.municipio || inf.uf || inf.id || "—"),
            loaded: true,
            error: false,
          };
        } else {
          next.ambiental = { count: 0, items: [], loaded: true, error: true };
        }

        // Jurídico
        if (juridicoRes.status === "fulfilled") {
          const r = juridicoRes.value;
          next.juridico = {
            count: r.proposicoes.length,
            items: r.proposicoes
              .slice(0, 3)
              .map((p) => p.titulo || `${p.tipo} ${p.numero}/${p.ano}`.trim() || p.ementa.slice(0, 60) || "—"),
            loaded: true,
            error: false,
          };
        } else {
          next.juridico = { count: 0, items: [], loaded: true, error: true };
        }

        // Empresas (órgãos como proxy de empresas monitoradas)
        if (empresasRes.status === "fulfilled") {
          const r = empresasRes.value;
          next.empresas = {
            count: r.orgaos.length,
            items: r.orgaos.slice(0, 3).map((o) => o.nome || o.cnpj || "—"),
            loaded: true,
            error: false,
          };
        } else {
          next.empresas = { count: 0, items: [], loaded: true, error: true };
        }

        // INPI — sem listagem global (busca por CNPJ); mostra estado pendente
        next.inpi = {
          count: 0,
          items: ["Busca por CNPJ disponível", "Integração de marcas em andamento"],
          loaded: true,
          error: false,
        };

        return next;
      });

      setModulesLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  // ── Scoring + derivações (leilões) ────────────────────────────────────────
  const scoredLots = useMemo(
    () => lots.map((lot) => ({ lot, scoring: scoreReceitaLeilaoLot(lot) })),
    [lots],
  );

  const featuredEntry = useMemo(() => {
    if (scoredLots.length === 0) return undefined;
    return scoredLots.reduce(
      (best, entry) => (entry.scoring.score > best.scoring.score ? entry : best),
      scoredLots[0]!,
    );
  }, [scoredLots]);

  const closingSoon = useMemo(() => {
    return scoredLots
      .map((entry) => ({ ...entry, days: daysUntil(entry.lot.proposalDeadline) }))
      .filter((entry) => entry.days >= 0 && entry.lot.id !== featuredEntry?.lot.id)
      .sort((a, b) => a.days - b.days)
      .slice(0, 4);
  }, [scoredLots, featuredEntry]);

  const filteredEntries = useMemo(() => {
    return scoredLots.filter(({ lot, scoring }) => {
      const text =
        `${lot.edital} ${lot.displayNumber} ${lot.city} ${displayCity(lot.city)} ${lot.agency} ${lot.category ?? ""}`.toLowerCase();
      const matchesTerm = term.trim().length === 0 || text.includes(term.trim().toLowerCase());
      const matchesRisk = riskFilter === "all" || scoring.label === riskFilter;
      const matchesPerson =
        personFilter === "all" ||
        lot.eligiblePersonTypes.includes(personFilter as "pf" | "pj");
      return matchesTerm && matchesRisk && matchesPerson;
    });
  }, [scoredLots, term, riskFilter, personFilter]);

  const sortedEntries = useMemo(() => {
    const list = [...filteredEntries];
    list.sort((a, b) => {
      if (sortBy === "desconto") {
        return (lotEconomia(b.lot)?.descontoPct ?? -1) - (lotEconomia(a.lot)?.descontoPct ?? -1);
      }
      if (sortBy === "preco") return a.lot.minimumBidCents - b.lot.minimumBidCents;
      if (sortBy === "prazo") return daysUntil(a.lot.proposalDeadline) - daysUntil(b.lot.proposalDeadline);
      return b.scoring.score - a.scoring.score;
    });
    return list;
  }, [filteredEntries, sortBy]);

  const [visibleRows, setVisibleRows] = useState(ROWS_PER_PAGE);
  const tableSentinelRef = useRef<HTMLTableRowElement | null>(null);

  useEffect(() => {
    setVisibleRows(ROWS_PER_PAGE);
  }, [term, riskFilter, personFilter, sortBy]);

  useEffect(() => {
    const node = tableSentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleRows((current) => Math.min(current + ROWS_PER_PAGE, sortedEntries.length));
        }
      },
      { rootMargin: "500px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [sortedEntries.length]);

  const visibleEntries = sortedEntries.slice(0, visibleRows);

  const kpiLotesDisponiveis = lots.length;
  const kpiEncerrando = useMemo(
    () =>
      lots.filter((l) => {
        const d = daysUntil(l.proposalDeadline);
        return d >= 0 && d <= 7;
      }).length,
    [lots],
  );
  const totalEconomiaCents = useMemo(
    () => lots.reduce((sum, l) => sum + (lotEconomia(l)?.economiaCents ?? 0), 0),
    [lots],
  );

  const dist = useMemo(
    () => riskDistribution(scoredLots.map((e) => e.scoring.score)),
    [scoredLots],
  );

  const kpiStrip = [
    { key: "lotes", label: "Lotes disponíveis", value: kpiLotesDisponiveis, color: KPI_COLORS[0], money: false },
    ...(totalEconomiaCents > 0
      ? [
          {
            key: "economia",
            label: "Economia mapeada",
            value: totalEconomiaCents / 100,
            color: KPI_COLORS[1],
            money: true,
          },
        ]
      : []),
    { key: "encerrando", label: "Encerrando ≤ 7 dias", value: kpiEncerrando, color: KPI_COLORS[3], money: false },
    { key: "watchlist", label: "Acompanhando", value: watchlistSize, color: KPI_COLORS[2], money: false },
  ];

  // Total de registros monitorados entre todos os módulos
  const totalRegistros = useMemo(() => {
    return (
      moduleData.leiloes.count +
      moduleData.licitacoes.count +
      moduleData.municipios.count +
      moduleData.politica.count +
      moduleData.ambiental.count +
      moduleData.juridico.count +
      moduleData.empresas.count
    );
  }, [moduleData]);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="dashboard-page">
      <style>{`
        .dashboard-page {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .dashboard-page .dash-greeting {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .dashboard-page .kpi-strip {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 12px;
        }
        .dashboard-page .global-kpi-strip {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 12px;
        }
        .dashboard-page .dash-spotlight {
          display: grid;
          grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr);
          gap: 16px;
          align-items: stretch;
        }
        .dashboard-page .featured-lot {
          display: flex;
          flex-direction: column;
        }
        .dashboard-page .closing-soon {
          display: flex;
          flex-direction: column;
          padding: 20px;
        }
        .dashboard-page .closing-soon-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-top: 12px;
        }
        .dashboard-page .closing-soon-row {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          text-align: left;
          background: transparent;
          border: 1px solid transparent;
          border-radius: var(--r-md, 12px);
          padding: 9px 10px;
          min-height: 44px;
          cursor: pointer;
          font-family: var(--font, inherit);
          color: var(--t-hi);
          transition: background .16s, border-color .16s, transform .16s;
        }
        .dashboard-page .closing-soon-row:hover,
        .dashboard-page .closing-soon-row:focus-visible {
          background: var(--surface-2);
          border-color: var(--border);
          outline: none;
        }
        .dashboard-page .closing-soon-row:active {
          transform: translateY(1px);
        }
        .dashboard-page .lot-chip {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 8px;
          border-radius: 999px;
          background: var(--surface-2);
          border: 1px solid var(--border);
          color: var(--t-mid);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: .02em;
          text-transform: uppercase;
          white-space: nowrap;
        }
        .dashboard-page .leiloes-filter-row {
          display: grid;
          grid-template-columns: 1.4fr 1fr 1fr 1fr;
          gap: 10px;
        }
        .dashboard-page .leiloes-filter-row input,
        .dashboard-page .leiloes-filter-row select {
          width: 100%;
          min-width: 0;
          font-family: var(--font, inherit);
          font-size: 14px;
          color: var(--t-hi);
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--r-md, 10px);
          padding: 10px 12px;
          outline: none;
        }
        .dashboard-page .leiloes-filter-row input:focus,
        .dashboard-page .leiloes-filter-row select:focus {
          border-color: var(--brand-ink);
          box-shadow: 0 0 0 3px var(--ring);
        }
        .dashboard-page .modules-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 16px;
        }
        .dashboard-page .section-label {
          font-weight: 700;
          font-size: 15px;
          color: var(--t-hi);
          margin-bottom: 4px;
        }
        .dashboard-page .section-sub {
          font-size: 12.5px;
          color: var(--t-mid);
          margin-bottom: 14px;
        }
        @media (max-width: 920px) {
          .dashboard-page .dash-spotlight {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 640px) {
          .dashboard-page .kpi-strip {
            grid-template-columns: 1fr 1fr;
          }
          .dashboard-page .global-kpi-strip {
            grid-template-columns: 1fr 1fr;
          }
          .dashboard-page .leiloes-filter-row {
            grid-template-columns: 1fr;
          }
          .dashboard-page .modules-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      {/* ════════════════════════════════════════════════════════════
          ZONA 1 — Saudação + KPIs globais
      ════════════════════════════════════════════════════════════ */}
      <section className="dash-greeting">
        <div>
          <h1 className="display">{greetingPeriod()}, {greetingName(user)}</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            Inteligência de dados públicos brasileiros — fonte antes de opinião.
          </p>
        </div>
        {onAsk ? (
          <button
            className="btn btn--ghost btn--sm"
            type="button"
            onClick={() => onAsk("Quais oportunidades merecem prioridade hoje?")}
          >
            Perguntar ao Fonte.ia
          </button>
        ) : null}
      </section>

      {/* KPI global: total monitorado */}
      {!modulesLoading && totalRegistros > 0 ? (
        <section className="global-kpi-strip">
          <div className="card card--pad">
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--t-mid)" }}>
              Total monitorado
            </span>
            <div
              style={{
                fontSize: 28,
                fontWeight: 800,
                letterSpacing: "-.025em",
                color: "var(--brand-ink)",
                marginTop: 12,
              }}
            >
              <CountUp value={totalRegistros} decimals={0} />
            </div>
          </div>
          <div className="card card--pad">
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--t-mid)" }}>
              Módulos ativos
            </span>
            <div
              style={{
                fontSize: 28,
                fontWeight: 800,
                letterSpacing: "-.025em",
                color: "var(--accent-ink)",
                marginTop: 12,
              }}
            >
              {MODULE_CARDS.length}
            </div>
          </div>
        </section>
      ) : null}

      {/* KPIs de leilões */}
      <section className="kpi-strip">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div className="card card--pad" key={i} aria-hidden="true">
                <div className="skeleton" style={{ height: 13, width: "60%", marginBottom: 16 }} />
                <div className="skeleton" style={{ height: 30, width: "45%" }} />
              </div>
            ))
          : kpiStrip.map(({ key, label, value, color, money }) => (
              <div className="card card--pad" key={key}>
                <div className="row between" style={{ alignItems: "flex-start" }}>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--t-mid)",
                      lineHeight: 1.3,
                    }}
                  >
                    {label}
                  </span>
                </div>
                <div
                  className="row between"
                  style={{ alignItems: "flex-end", marginTop: 12 }}
                >
                  <div
                    style={{
                      fontSize: 28,
                      fontWeight: 800,
                      letterSpacing: "-.025em",
                      color,
                    }}
                  >
                    {money ? (
                      <span>{formatBRL(value)}</span>
                    ) : (
                      <CountUp value={value} decimals={0} />
                    )}
                  </div>
                </div>
              </div>
            ))}
      </section>

      {/* ════════════════════════════════════════════════════════════
          ZONA 2 — Grid de Módulos
      ════════════════════════════════════════════════════════════ */}
      <section>
        <div className="section-label">Módulos disponíveis</div>
        <div className="section-sub">
          Visão geral de todas as fontes monitoradas pelo Fonte.ia
        </div>
        <div className="modules-grid">
          {MODULE_CARDS.map((config) => {
            const data = moduleData[config.key];
            const isReady = data.loaded || config.key === "inpi";
            return isReady && !modulesLoading ? (
              <ModuleCard key={config.key} config={config} data={data} />
            ) : (
              <ModuleCardSkeleton key={config.key} />
            );
          })}
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          ZONA 3 — Destaque do dia (Leilões)
      ════════════════════════════════════════════════════════════ */}
      <section>
        <div className="section-label">
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            Leilões — Destaque do dia
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "2px 8px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 700,
                color: "#1D5FE0",
                background: "color-mix(in srgb, #1D5FE0 12%, var(--surface))",
                border: "1px solid color-mix(in srgb, #1D5FE0 25%, transparent)",
              }}
            >
              RFB
            </span>
          </span>
        </div>
        <div className="section-sub">Receita Federal do Brasil — Lotes de maior oportunidade</div>

        {/* Spotlight: oportunidade do dia + encerrando em breve */}
        {isLoading ? (
          <section className="dash-spotlight" aria-hidden="true">
            <div className="panel" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="skeleton" style={{ height: 20, width: "30%", marginBottom: 4 }} />
              <div className="skeleton" style={{ height: 26, width: "65%" }} />
              <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="skeleton" style={{ flex: 1, height: 68, borderRadius: "var(--r-md)" }} />
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                <div className="skeleton" style={{ height: 34, width: 90, borderRadius: 999 }} />
                <div className="skeleton" style={{ height: 34, width: 110, borderRadius: "var(--r-md)" }} />
              </div>
            </div>
            <div className="panel" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="skeleton" style={{ height: 14, width: "55%" }} />
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 52, borderRadius: "var(--r-md)" }} />
              ))}
            </div>
          </section>
        ) : featuredEntry ? (
          <div className="dash-spotlight">
            {/* Oportunidade do dia */}
            <article className="featured-lot panel" style={{ padding: 24 }}>
              <div
                className="row between"
                style={{ marginBottom: 16, gap: 14, flexWrap: "wrap" }}
              >
                <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                  <span className="badge badge--accent" style={{ marginBottom: 8 }}>
                    Oportunidade do dia
                  </span>
                  <h2 style={{ fontSize: 18, marginTop: 4 }}>
                    Lote {featuredEntry.lot.lotNumber} — {displayCity(featuredEntry.lot.city)}
                  </h2>
                  <div
                    className="row"
                    style={{ gap: 8, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}
                  >
                    {featuredEntry.lot.category ? (
                      <span className="lot-chip">{featuredEntry.lot.category}</span>
                    ) : null}
                    <span className="small muted">
                      {featuredEntry.lot.agency} · Edital {featuredEntry.lot.edital}
                    </span>
                  </div>
                </div>
                <ScoreRing value={featuredEntry.scoring.score} size={96} />
              </div>

              <div
                className="grid"
                style={{
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: 12,
                  marginBottom: 16,
                }}
              >
                <div className="inset" style={{ padding: 14 }}>
                  <div className="tiny muted" style={{ marginBottom: 4 }}>Lance mínimo</div>
                  <div className="num" style={{ fontWeight: 800, fontSize: 18 }}>
                    {formatBRL(featuredEntry.lot.minimumBidCents / 100)}
                  </div>
                </div>
                <div className="inset" style={{ padding: 14 }}>
                  <div className="tiny muted" style={{ marginBottom: 4 }}>Prazo</div>
                  <div className="num" style={{ fontWeight: 700, fontSize: 18 }}>
                    {formatDeadline(featuredEntry.lot.proposalDeadline)}
                  </div>
                </div>
                <div className="inset" style={{ padding: 14 }}>
                  <div className="tiny muted" style={{ marginBottom: 4 }}>Elegibilidade</div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>
                    {featuredEntry.lot.eligiblePersonTypes.includes("pf") ? "PF e PJ" : "PJ"}
                  </div>
                </div>
                {(() => {
                  const eco = lotEconomia(featuredEntry.lot);
                  return eco ? (
                    <div className="inset" style={{ padding: 14 }}>
                      <div className="tiny muted" style={{ marginBottom: 4 }}>Economia estimada</div>
                      <div
                        className="num"
                        style={{ fontWeight: 800, fontSize: 18, color: "var(--accent-ink)" }}
                      >
                        {formatBRL(eco.economiaCents / 100)}{" "}
                        <span style={{ fontSize: 12, fontWeight: 700 }}>−{eco.descontoPct}%</span>
                      </div>
                    </div>
                  ) : null;
                })()}
              </div>

              <div
                className="row between"
                style={{ gap: 12, flexWrap: "wrap", marginTop: "auto" }}
              >
                <FonteDots fontes={[RFB_FONTE]} />
                <div className="row" style={{ gap: 8 }}>
                  <span className={`badge ${confiancaBadge(featuredEntry.scoring.label).className}`}>
                    {confiancaBadge(featuredEntry.scoring.label).label}
                  </span>
                  {onSelectLot ? (
                    <button
                      className="btn btn--primary btn--sm"
                      type="button"
                      onClick={() => onSelectLot(featuredEntry.lot)}
                    >
                      Analisar lote
                    </button>
                  ) : null}
                </div>
              </div>
            </article>

            {/* Encerrando em breve */}
            <aside className="closing-soon panel">
              <div className="row between" style={{ alignItems: "baseline" }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Encerrando em breve</div>
                <span className="tiny muted">prazo de proposta</span>
              </div>
              {closingSoon.length > 0 ? (
                <div className="closing-soon-list">
                  {closingSoon.map(({ lot, scoring, days }) => {
                    const isClickable = onSelectLot !== undefined;
                    const handleOpen = () => onSelectLot?.(lot);
                    return (
                      <div
                        key={lot.id}
                        className="closing-soon-row"
                        role={isClickable ? "button" : undefined}
                        tabIndex={isClickable ? 0 : undefined}
                        onClick={isClickable ? handleOpen : undefined}
                        onKeyDown={
                          isClickable
                            ? (e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  handleOpen();
                                }
                              }
                            : undefined
                        }
                      >
                        <ScoreRing value={scoring.score} size={36} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          {lot.category != null && lot.category !== "" ? (
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 700,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                textTransform: "capitalize",
                              }}
                            >
                              {lot.category.toLowerCase()}
                            </div>
                          ) : null}
                          <div
                            style={{
                              fontSize: lot.category != null && lot.category !== "" ? 11.5 : 13,
                              fontWeight: lot.category != null && lot.category !== "" ? 500 : 600,
                              color:
                                lot.category != null && lot.category !== ""
                                  ? "var(--t-mid)"
                                  : "var(--t-hi)",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            Lote {lot.lotNumber} · {displayCity(lot.city)}
                          </div>
                          <div
                            className="num"
                            style={{ fontSize: 11.5, color: "var(--t-mid)", marginTop: 1 }}
                          >
                            {formatBRL(lot.minimumBidCents / 100)}
                          </div>
                        </div>
                        <span
                          className="num"
                          style={{
                            fontSize: 11.5,
                            fontWeight: 700,
                            color: deadlineColor(days),
                            whiteSpace: "nowrap",
                            flexShrink: 0,
                          }}
                        >
                          {deadlineHint(days)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="muted" style={{ fontSize: 13, marginTop: 14, lineHeight: 1.5 }}>
                  Nenhum outro lote com prazo aberto agora. Novos leilões entram a cada coleta.
                </p>
              )}
            </aside>
          </div>
        ) : null}

        {/* Tabela de lotes reais */}
        <div className="lot-table-section" style={{ marginTop: 16 }}>
          <div className="row between" style={{ marginBottom: 14 }}>
            <h2 style={{ fontWeight: 700, fontSize: 15 }}>Últimos lotes publicados</h2>
            <span className="small muted">
              {isLoading
                ? "Sincronizando..."
                : loadError
                  ? "Erro ao carregar"
                  : `${lots.length} lote${lots.length !== 1 ? "s" : ""} carregado${lots.length !== 1 ? "s" : ""}`}
            </span>
          </div>

          <div className="leiloes-filter-row" style={{ marginBottom: 14 }}>
            <input
              aria-label="Filtrar por edital, cidade ou órgão"
              placeholder="Buscar por edital, cidade ou órgão"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
            <select
              aria-label="Filtrar confiança"
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value)}
            >
              <option value="all">Toda confiança</option>
              <option value="alto">Confiança alta</option>
              <option value="medio">Confiança média</option>
              <option value="baixo">Cautela</option>
            </select>
            <select
              aria-label="Filtrar pessoa"
              value={personFilter}
              onChange={(e) => setPersonFilter(e.target.value)}
            >
              <option value="all">PF e PJ</option>
              <option value="pf">Permite PF</option>
              <option value="pj">Apenas PJ</option>
            </select>
            <select
              aria-label="Ordenar lotes"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="score">Melhor oportunidade</option>
              <option value="desconto">Maior desconto</option>
              <option value="prazo">Encerrando antes</option>
              <option value="preco">Menor preço</option>
            </select>
          </div>

          {isLoading ? (
            <div className="panel" style={{ overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}
                  aria-busy="true"
                  aria-label="Carregando lotes…"
                >
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      {["Lote", "Órgão / Cidade", "Lance min.", "Prazo", "Score", ""].map((h, i) => (
                        <th
                          key={`${h}-${i}`}
                          style={{
                            padding: "12px 16px",
                            textAlign: i >= 2 ? "right" : "left",
                            fontWeight: 700,
                            fontSize: 11.5,
                            color: "var(--t-low)",
                            letterSpacing: ".06em",
                            textTransform: "uppercase",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 8 }).map((_, rowIdx) => (
                      <tr
                        key={rowIdx}
                        style={{ borderTop: rowIdx > 0 ? "1px solid var(--border)" : undefined }}
                        aria-hidden="true"
                      >
                        <td style={{ padding: "14px 16px" }}>
                          <div className="skeleton" style={{ height: 14, width: "70%", marginBottom: 6 }} />
                          <div className="skeleton" style={{ height: 11, width: "45%" }} />
                        </td>
                        <td style={{ padding: "14px 16px" }}>
                          <div className="skeleton" style={{ height: 13, width: "80%" }} />
                        </td>
                        <td style={{ padding: "14px 16px", textAlign: "right" }}>
                          <div className="skeleton" style={{ height: 14, width: 80, marginLeft: "auto" }} />
                        </td>
                        <td style={{ padding: "14px 16px", textAlign: "right" }}>
                          <div className="skeleton" style={{ height: 13, width: 64, marginLeft: "auto" }} />
                        </td>
                        <td style={{ padding: "14px 16px", textAlign: "right" }}>
                          <div className="skeleton" style={{ height: 26, width: 36, borderRadius: 999, marginLeft: "auto" }} />
                        </td>
                        <td style={{ padding: "14px 14px", textAlign: "right" }}>
                          <div className="skeleton" style={{ height: 30, width: 72, borderRadius: 8, marginLeft: "auto" }} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : loadError ? (
            <p
              className="muted"
              style={{ padding: "32px 0", textAlign: "center", color: "var(--danger)" }}
            >
              {loadError}
            </p>
          ) : lots.length === 0 ? (
            <div
              className="panel"
              style={{
                padding: 48,
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  background: "color-mix(in srgb, var(--brand-ink) 10%, var(--surface))",
                  color: "var(--brand-ink)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Landmark size={26} aria-hidden="true" />
              </div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Nenhum lote disponível agora</div>
              <p className="muted small" style={{ margin: 0, maxWidth: 340 }}>
                A coleta dos leilões da Receita roda periodicamente. Novos lotes aparecem a cada sincronização.
              </p>
            </div>
          ) : sortedEntries.length === 0 ? (
            <div
              className="panel"
              style={{
                padding: 48,
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  background: "color-mix(in srgb, var(--brand-ink) 10%, var(--surface))",
                  color: "var(--brand-ink)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <SearchX size={26} aria-hidden="true" />
              </div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Nenhum lote com esses filtros</div>
              <p className="muted small" style={{ margin: 0, maxWidth: 340 }}>
                Tente ampliar a busca, trocar a cidade ou reduzir os filtros aplicados.
              </p>
              <button
                className="btn btn--ghost btn--sm"
                type="button"
                onClick={() => {
                  setTerm("");
                  setRiskFilter("all");
                  setPersonFilter("all");
                  setSortBy("score");
                }}
              >
                Limpar filtros
              </button>
            </div>
          ) : (
            <div className="panel" style={{ overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontFamily: "inherit",
                    minWidth: 560,
                  }}
                >
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      {["Lote", "Órgão / Cidade", "Lance min.", "Prazo", "Score", ""].map((h, i) => (
                        <th
                          key={`${h}-${i}`}
                          style={{
                            padding: "12px 16px",
                            textAlign: i >= 2 ? "right" : "left",
                            fontWeight: 700,
                            fontSize: 11.5,
                            color: "var(--t-low)",
                            letterSpacing: ".06em",
                            textTransform: "uppercase",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleEntries.map(({ lot, scoring }, rowIdx) => {
                      const days = daysUntil(lot.proposalDeadline);
                      const eco = lotEconomia(lot);
                      const isClickable = onSelectLot !== undefined;
                      return (
                        <tr
                          key={lot.id}
                          style={{
                            borderTop: rowIdx > 0 ? "1px solid var(--border)" : undefined,
                            cursor: isClickable ? "pointer" : undefined,
                          }}
                          onClick={isClickable ? () => onSelectLot(lot) : undefined}
                          role={isClickable ? "button" : undefined}
                          tabIndex={isClickable ? 0 : undefined}
                          aria-label={
                            isClickable
                              ? `Ver detalhes do lote ${lot.lotNumber} — ${lot.agency}, ${displayCity(lot.city)}`
                              : undefined
                          }
                          onKeyDown={
                            isClickable
                              ? (e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    onSelectLot(lot);
                                  }
                                }
                              : undefined
                          }
                        >
                          <td style={{ padding: "14px 16px" }}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                flexWrap: "wrap",
                              }}
                            >
                              <span style={{ fontWeight: 600, fontSize: 13.5 }}>
                                Lote {lot.lotNumber}
                              </span>
                              {lot.category ? (
                                <span className="lot-chip">{lot.category}</span>
                              ) : null}
                            </div>
                            <div
                              style={{
                                fontSize: 11.5,
                                color: "var(--t-low)",
                                marginTop: 2,
                                fontFamily: "monospace",
                              }}
                            >
                              {lot.edital}
                            </div>
                          </td>
                          <td style={{ padding: "14px 16px" }}>
                            <div
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 8,
                              }}
                            >
                              <FonteDots fontes={[RFB_FONTE]} size={20} />
                              <span style={{ fontSize: 12.5, color: "var(--t-mid)" }}>
                                {displayCity(lot.city)}
                              </span>
                            </div>
                          </td>
                          <td
                            style={{
                              padding: "14px 16px",
                              textAlign: "right",
                              whiteSpace: "nowrap",
                            }}
                          >
                            <div
                              style={{
                                fontWeight: 700,
                                fontVariantNumeric: "tabular-nums",
                                fontSize: 13.5,
                              }}
                            >
                              {formatBRL(lot.minimumBidCents / 100)}
                            </div>
                            {eco ? (
                              <div
                                className="num"
                                style={{
                                  fontSize: 11.5,
                                  fontWeight: 700,
                                  color: "var(--accent-ink)",
                                  marginTop: 2,
                                }}
                              >
                                −{eco.descontoPct}% · {formatBRL(eco.economiaCents / 100)}
                              </div>
                            ) : null}
                          </td>
                          <td
                            style={{
                              padding: "14px 16px",
                              textAlign: "right",
                              fontSize: 13,
                              color: deadlineColor(days),
                              whiteSpace: "nowrap",
                            }}
                          >
                            {formatDeadline(lot.proposalDeadline)}
                          </td>
                          <td style={{ padding: "14px 16px", textAlign: "right" }}>
                            <span
                              className="num"
                              title={confiancaBadge(scoring.label).label}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                minWidth: 30,
                                padding: "3px 9px",
                                borderRadius: 999,
                                fontSize: 12,
                                fontWeight: 800,
                                color: confiancaColor(scoring.label),
                                background:
                                  scoring.label === "baixo"
                                    ? "var(--surface-2)"
                                    : `color-mix(in srgb, ${confiancaColor(scoring.label)} 15%, transparent)`,
                              }}
                            >
                              {scoring.score}
                            </span>
                          </td>
                          <td style={{ padding: "14px 14px", textAlign: "right" }}>
                            {isClickable ? (
                              <button
                                className="btn btn--soft btn--sm"
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectLot(lot);
                                }}
                              >
                                Analisar
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                    {visibleRows < sortedEntries.length ? (
                      <tr ref={tableSentinelRef}>
                        <td
                          colSpan={6}
                          style={{
                            padding: "16px",
                            textAlign: "center",
                            color: "var(--t-mid)",
                            fontSize: 12.5,
                          }}
                        >
                          Carregando mais lotes… ({visibleRows} de {sortedEntries.length})
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Distribuição de confiança */}
        {scoredLots.length > 0 ? (
          <div className="panel" style={{ padding: 22, marginTop: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>
              Distribuição de confiança — Leilões
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Bar label="Confiança alta" value={dist.baixo} color="var(--ok)" />
              <Bar label="Confiança média" value={dist.medio} color="var(--warn)" />
              <Bar label="Cautela" value={dist.alto} color="var(--t-mid)" />
            </div>
          </div>
        ) : null}

        {/* Fontes oficiais */}
        <div className="panel" style={{ padding: 20, marginTop: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>
            Receita Federal SLE — fonte oficial conectada
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {FONTES.map((fonte) => (
              <span
                key={fonte.id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 10px",
                  borderRadius: 8,
                  background: "var(--surface-2)",
                  fontSize: 12.5,
                  fontWeight: 600,
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 3,
                    background: fonte.cor,
                    display: "inline-block",
                    flexShrink: 0,
                  }}
                />
                {fonte.sigla}
              </span>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
