import { useEffect, useMemo, useRef, useState } from "react";
import type { ReceitaLeilaoLot } from "@fonteia/sources";
import { lotEconomia, scoreReceitaLeilaoLot } from "@fonteia/scoring";
import { Bar, CountUp, FonteDots, ScoreRing } from "../components/ui";
import { listLeilaoLots } from "../features/leiloes/leiloes-api";
import { FONTES, formatBRL } from "../data/leiloes-seed";
import { displayCity } from "../lib/receita-localidades";

// Linhas por vez na tabela do painel (o scroll carrega mais sozinho, sem clicar).
const ROWS_PER_PAGE = 25;

// The single FonteItem for Receita Federal — used in every lot row
const RFB_FONTE = {
  sigla: "RFB",
  cor: "#1D5FE0",
  nome: "Receita Federal do Brasil",
} as const;

// O `label` do scoring é CONFIANÇA DA OPORTUNIDADE ("alto" = melhor), não risco.
// `riscoBadge` pintaria os melhores lotes de vermelho ("Risco alto") — semântica
// invertida. Este helper local devolve um selo POSITIVO de confiança.
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

// Cor (CSS var) coerente com a confiança — usada para colorir o número do score
// na tabela. Score alto = verde, médio = âmbar, baixo = neutro (nunca vermelho).
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

// Texto curto de prazo para a lista compacta ("encerra hoje", "em 3 dias"…)
function deadlineHint(days: number): string {
  if (days < 0) return "encerrado";
  if (days === 0) return "encerra hoje";
  if (days === 1) return "encerra amanhã";
  return `em ${days} dias`;
}

// Cor do prazo conforme urgência (≤3d perigo, ≤7d alerta)
function deadlineColor(days: number): string {
  if (days <= 3) return "var(--danger)";
  if (days <= 7) return "var(--warn)";
  return "var(--t-mid)";
}

// Derive a risk distribution (percent) from scored lots
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

// Read watchlist size from localStorage
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

export function DashboardPage(props: {
  onSelectLot?: ((lot: ReceitaLeilaoLot) => void) | undefined;
  onAsk?: ((q?: string) => void) | undefined;
}) {
  const { onSelectLot, onAsk } = props;

  const [lots, setLots] = useState<ReceitaLeilaoLot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>();
  const [term, setTerm] = useState("");
  const [riskFilter, setRiskFilter] = useState("all");
  const [personFilter, setPersonFilter] = useState("all");
  const [sortBy, setSortBy] = useState("score");
  const [watchlistSize, setWatchlistSize] = useState(0);

  useEffect(() => {
    setWatchlistSize(getWatchlistSize());
  }, []);

  useEffect(() => {
    let active = true;
    setIsLoading(true);

    listLeilaoLots()
      .then((result) => {
        if (!active) return;
        setLots(result.lots);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setLoadError(err instanceof Error ? err.message : "Erro ao carregar lotes.");
        setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // Score each lot once
  const scoredLots = useMemo(
    () => lots.map((lot) => ({ lot, scoring: scoreReceitaLeilaoLot(lot) })),
    [lots],
  );

  // Best lot = highest score
  const featuredEntry = useMemo(() => {
    if (scoredLots.length === 0) return undefined;
    return scoredLots.reduce(
      (best, entry) => (entry.scoring.score > best.scoring.score ? entry : best),
      scoredLots[0]!,
    );
  }, [scoredLots]);

  // Encerrando em breve: lotes com prazo válido e ainda aberto, do mais próximo
  // ao mais distante (exclui o destaque para não repetir o mesmo lote).
  const closingSoon = useMemo(() => {
    return scoredLots
      .map((entry) => ({ ...entry, days: daysUntil(entry.lot.proposalDeadline) }))
      .filter((entry) => entry.days >= 0 && entry.lot.id !== featuredEntry?.lot.id)
      .sort((a, b) => a.days - b.days)
      .slice(0, 4);
  }, [scoredLots, featuredEntry]);

  // Filtered list for table
  const filteredEntries = useMemo(() => {
    return scoredLots.filter(({ lot, scoring }) => {
      const text =
        `${lot.edital} ${lot.displayNumber} ${lot.city} ${displayCity(lot.city)} ${lot.agency} ${lot.category ?? ""}`.toLowerCase();
      const matchesTerm =
        term.trim().length === 0 || text.includes(term.trim().toLowerCase());
      const matchesRisk =
        riskFilter === "all" || scoring.label === riskFilter;
      const matchesPerson =
        personFilter === "all" ||
        lot.eligiblePersonTypes.includes(personFilter as "pf" | "pj");
      return matchesTerm && matchesRisk && matchesPerson;
    });
  }, [scoredLots, term, riskFilter, personFilter]);

  // Ordenação (visível já: score / preço / prazo; desconto quando houver avaliação)
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

  // ── Paginação por scroll da tabela (cresce sozinha ao rolar) ────────────────
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
  }, [sortedEntries.length, visibleRows]);

  const visibleEntries = sortedEntries.slice(0, visibleRows);

  // KPIs derived from real lots
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

  // Risk distribution from real scored lots
  const dist = useMemo(
    () => riskDistribution(scoredLots.map((e) => e.scoring.score)),
    [scoredLots],
  );

  // KPI strip derived from real data
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

  return (
    <div className="dashboard-page">
      {/*
        Scoped layout: this dashboard has no evidence sidebar, so it must stay a
        single-column stack at every breakpoint (the global .dashboard-grid turns
        into a 2-column grid on desktop, which would break this page). Internally,
        the "spotlight" área usa duas colunas no desktop para ocupar a largura.
      */}
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
        /* Spotlight: oportunidade do dia + encerrando em breve lado a lado no desktop. */
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
        @media (max-width: 920px) {
          .dashboard-page .dash-spotlight {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 640px) {
          .dashboard-page .kpi-strip {
            grid-template-columns: 1fr 1fr;
          }
          .dashboard-page .leiloes-filter-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      {/* ── Saudação ─────────────────────────────────────────────── */}
      <section className="dash-greeting">
        <div>
          <h1 className="display">Bom dia, Fonte.ia</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            Leiloes governamentais monitorados em tempo real — Fonte antes de opiniao.
          </p>
        </div>
        {onAsk ? (
          <button
            className="btn btn--ghost btn--sm"
            type="button"
            onClick={() => onAsk("Quais lotes merecem prioridade hoje?")}
          >
            Perguntar ao Fonte.ia
          </button>
        ) : null}
      </section>

      {/* ── KPIs derivados dos lotes reais ───────────────────────── */}
      <section className="kpi-strip">
        {kpiStrip.map(({ key, label, value, color, money }) => (
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
                {isLoading ? (
                  <span className="muted" style={{ fontSize: 18 }}>—</span>
                ) : money ? (
                  <span>{formatBRL(value)}</span>
                ) : (
                  <CountUp value={value} decimals={0} />
                )}
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* ── Spotlight: oportunidade do dia + encerrando em breve ─── */}
      {featuredEntry ? (
        <section className="dash-spotlight">
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
                <div className="tiny muted" style={{ marginBottom: 4 }}>
                  Lance minimo
                </div>
                <div className="num" style={{ fontWeight: 800, fontSize: 18 }}>
                  {formatBRL(featuredEntry.lot.minimumBidCents / 100)}
                </div>
              </div>
              <div className="inset" style={{ padding: 14 }}>
                <div className="tiny muted" style={{ marginBottom: 4 }}>
                  Prazo
                </div>
                <div className="num" style={{ fontWeight: 700, fontSize: 18 }}>
                  {formatDeadline(featuredEntry.lot.proposalDeadline)}
                </div>
              </div>
              <div className="inset" style={{ padding: 14 }}>
                <div className="tiny muted" style={{ marginBottom: 4 }}>
                  Elegibilidade
                </div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>
                  {featuredEntry.lot.eligiblePersonTypes.includes("pf")
                    ? "PF e PJ"
                    : "PJ"}
                </div>
              </div>
              {(() => {
                const eco = lotEconomia(featuredEntry.lot);
                return eco ? (
                  <div className="inset" style={{ padding: 14 }}>
                    <div className="tiny muted" style={{ marginBottom: 4 }}>
                      Economia estimada
                    </div>
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
                <span
                  className={`badge ${confiancaBadge(featuredEntry.scoring.label).className}`}
                >
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

          {/* Encerrando em breve (lista compacta) */}
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
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
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
              <p
                className="muted"
                style={{ fontSize: 13, marginTop: 14, lineHeight: 1.5 }}
              >
                Nenhum outro lote com prazo aberto agora. Novos leilões entram a cada coleta.
              </p>
            )}
          </aside>
        </section>
      ) : null}

      {/* ── Tabela de lotes reais ────────────────────────────────── */}
      <section className="lot-table-section">
        <div className="row between" style={{ marginBottom: 14 }}>
          <h2 style={{ fontWeight: 700, fontSize: 15 }}>
            Ultimos lotes publicados
          </h2>
          <span className="small muted">
            {isLoading
              ? "Sincronizando..."
              : loadError
                ? "Erro ao carregar"
                : `${lots.length} lote${lots.length !== 1 ? "s" : ""} carregado${lots.length !== 1 ? "s" : ""}`}
          </span>
        </div>

        {/* Filtros */}
        <div className="leiloes-filter-row" style={{ marginBottom: 14 }}>
          <input
            aria-label="Filtrar por edital, cidade ou orgao"
            placeholder="Buscar edital, cidade ou orgao"
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
          <p className="muted" style={{ padding: "32px 0", textAlign: "center" }}>
            Carregando lotes...
          </p>
        ) : loadError ? (
          <p
            className="muted"
            style={{ padding: "32px 0", textAlign: "center", color: "var(--danger)" }}
          >
            {loadError}
          </p>
        ) : lots.length === 0 ? (
          <p className="muted" style={{ padding: "32px 0", textAlign: "center" }}>
            Nenhum lote disponivel no momento. A coleta dos leiloes da Receita roda periodicamente.
          </p>
        ) : sortedEntries.length === 0 ? (
          <p className="muted" style={{ padding: "32px 0", textAlign: "center" }}>
            Nenhum lote encontrado para os filtros aplicados.
          </p>
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
                  {["Lote", "Orgao / Cidade", "Lance min.", "Prazo", "Score", ""].map(
                    (h, i) => (
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
                    ),
                  )}
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
                      onClick={
                        isClickable ? () => onSelectLot(lot) : undefined
                      }
                      role={isClickable ? "button" : undefined}
                      tabIndex={isClickable ? 0 : undefined}
                      onKeyDown={
                        isClickable
                          ? (e) => {
                              if (e.key === "Enter" || e.key === " ") {
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
                      <td
                        style={{ padding: "14px 14px", textAlign: "right" }}
                      >
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
                      style={{ padding: "16px", textAlign: "center", color: "var(--t-mid)", fontSize: 12.5 }}
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
      </section>

      {/* ── Distribuição de confiança dos lotes reais ───────────── */}
      {scoredLots.length > 0 ? (
        <section className="panel" style={{ padding: 22 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>
            Distribuicao de confianca
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Bar
              label="Confiança alta"
              value={dist.baixo}
              color="var(--ok)"
            />
            <Bar
              label="Confiança média"
              value={dist.medio}
              color="var(--warn)"
            />
            <Bar
              label="Cautela"
              value={dist.alto}
              color="var(--t-mid)"
            />
          </div>
        </section>
      ) : null}

      {/* ── Fontes oficiais ──────────────────────────────────────── */}
      <section className="panel" style={{ padding: 20 }}>
        <div
          style={{
            fontWeight: 700,
            fontSize: 14,
            marginBottom: 12,
          }}
        >
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
      </section>
    </div>
  );
}
