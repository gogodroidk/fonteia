import { useEffect, useMemo, useState } from "react";
import type { ReceitaLeilaoLot } from "@fonteia/sources";
import { scoreReceitaLeilaoLot } from "@fonteia/scoring";
import { AreaChart, Bar, CountUp, FonteDots, ScoreRing, Spark, riscoBadge } from "../components/ui";
import { DemoDataBanner } from "../components/demo-data-banner";
import { listLeilaoLots } from "../features/leiloes/leiloes-api";
import { OVERVIEW_STATS, FONTES, formatBRL } from "../data/leiloes-seed";

// The single FonteItem for Receita Federal — used in every lot row
const RFB_FONTE = {
  sigla: "RFB",
  cor: "#1D5FE0",
  nome: "Receita Federal do Brasil",
} as const;

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

// Derive a risk distribution (percent) from scored lots
function riskDistribution(scores: number[]): { baixo: number; medio: number; alto: number } {
  if (scores.length === 0) return { baixo: 34, medio: 46, alto: 20 };
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

const KPI_COLORS = [
  "var(--brand-ink)",
  "var(--accent-ink)",
  "#7C5CFC",
  "#C98A2E",
] as const;

// OVERVIEW_STATS key order for KPI strip
const KPI_KEYS = ["oportunidades", "economia", "rastreadas", "watchlist"] as const;

export function DashboardPage(props: {
  onSelectLot?: ((lot: ReceitaLeilaoLot) => void) | undefined;
  onAsk?: ((q?: string) => void) | undefined;
}) {
  const { onSelectLot, onAsk } = props;

  const [lots, setLots] = useState<ReceitaLeilaoLot[]>([]);
  const [isDemo, setIsDemo] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>();
  const [term, setTerm] = useState("");
  const [riskFilter, setRiskFilter] = useState("all");
  const [personFilter, setPersonFilter] = useState("all");

  useEffect(() => {
    let active = true;
    setIsLoading(true);

    listLeilaoLots()
      .then((result) => {
        if (!active) return;
        setLots(result.lots);
        setIsDemo(result.isDemo);
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

  // Filtered list for table
  const filteredEntries = useMemo(() => {
    return scoredLots.filter(({ lot, scoring }) => {
      const text =
        `${lot.edital} ${lot.displayNumber} ${lot.city} ${lot.agency}`.toLowerCase();
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

  // Spark data for trend chart: derive from spark series of "oportunidades" stat
  const trendData = OVERVIEW_STATS.oportunidades.spark;

  // Risk distribution from real scored lots
  const dist = useMemo(
    () => riskDistribution(scoredLots.map((e) => e.scoring.score)),
    [scoredLots],
  );

  return (
    <div className="dashboard-grid">
      {isDemo ? (
        <DemoDataBanner
          title="Modo demonstracao"
          message="O cockpit esta usando amostras locais. Use para validar a experiencia, nao para tomar decisao real de leilao."
        />
      ) : null}

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

      {/* ── 4 KPIs ───────────────────────────────────────────────── */}
      <section className="kpi-strip">
        {KPI_KEYS.map((key, i) => {
          const stat = OVERVIEW_STATS[key];
          const color = KPI_COLORS[i] ?? "var(--brand-ink)";
          const up = stat.delta >= 0;
          return (
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
                  {stat.label}
                </span>
                <span
                  className={`badge num ${up ? "badge--ok" : "badge--danger"}`}
                  style={{ fontSize: 11 }}
                >
                  {up ? "+" : ""}
                  {stat.delta}%
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
                  }}
                >
                  <CountUp
                    value={stat.value}
                    prefix={stat.prefix}
                    suffix={stat.suffix}
                    decimals={stat.suffix === "M" ? 1 : 0}
                  />
                </div>
                <Spark data={stat.spark} color={color} width={80} height={30} />
              </div>
            </div>
          );
        })}
      </section>

      {/* ── Oportunidade do dia ──────────────────────────────────── */}
      {featuredEntry ? (
        <section className="featured-lot panel" style={{ padding: 24 }}>
          <div className="row between" style={{ marginBottom: 16 }}>
            <div>
              <span className="badge badge--accent" style={{ marginBottom: 8 }}>
                Oportunidade do dia
              </span>
              <h2 style={{ fontSize: 18, marginTop: 4 }}>
                Lote {featuredEntry.lot.lotNumber} — {featuredEntry.lot.city}
              </h2>
              <p className="small muted" style={{ marginTop: 4 }}>
                {featuredEntry.lot.agency} · Edital {featuredEntry.lot.edital}
              </p>
            </div>
            <ScoreRing value={featuredEntry.scoring.score} size={96} />
          </div>

          <div
            className="grid"
            style={{
              gridTemplateColumns: "repeat(3, 1fr)",
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
          </div>

          <div className="row between">
            <FonteDots fontes={[RFB_FONTE]} />
            <div className="row" style={{ gap: 8 }}>
              <span
                className={`badge num ${riscoBadge(featuredEntry.scoring.label).className}`}
              >
                {riscoBadge(featuredEntry.scoring.label).label}
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
            aria-label="Filtrar risco"
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
          >
            <option value="all">Todos os riscos</option>
            <option value="alto">Oportunidade alta</option>
            <option value="medio">Risco medio</option>
            <option value="baixo">Risco baixo</option>
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
        ) : filteredEntries.length === 0 ? (
          <p className="muted" style={{ padding: "32px 0", textAlign: "center" }}>
            Nenhum lote encontrado para os filtros aplicados.
          </p>
        ) : (
          <div className="panel" style={{ overflow: "hidden" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontFamily: "inherit",
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
                {filteredEntries.map(({ lot, scoring }, rowIdx) => {
                  const badge = riscoBadge(scoring.label);
                  const days = daysUntil(lot.proposalDeadline);
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
                        <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                          Lote {lot.lotNumber}
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
                            {lot.city}
                          </span>
                        </div>
                      </td>
                      <td
                        style={{
                          padding: "14px 16px",
                          textAlign: "right",
                          fontWeight: 700,
                          fontVariantNumeric: "tabular-nums",
                          fontSize: 13.5,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatBRL(lot.minimumBidCents / 100)}
                      </td>
                      <td
                        style={{
                          padding: "14px 16px",
                          textAlign: "right",
                          fontSize: 13,
                          color:
                            days <= 3
                              ? "var(--danger)"
                              : days <= 7
                                ? "var(--warn)"
                                : "var(--t-mid)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatDeadline(lot.proposalDeadline)}
                      </td>
                      <td style={{ padding: "14px 16px", textAlign: "right" }}>
                        <span
                          className={`badge num ${badge.className}`}
                          style={{ fontSize: 12 }}
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
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Gráficos ─────────────────────────────────────────────── */}
      <section
        className="grid"
        style={{ gridTemplateColumns: "1.5fr 1fr", gap: 18, alignItems: "start" }}
      >
        {/* Tendência — lotes mapeados */}
        <div className="panel" style={{ padding: 22 }}>
          <div className="row between" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>
              Lotes mapeados — tendencia
            </div>
            <span className="badge badge--ok num" style={{ fontSize: 11 }}>
              +{OVERVIEW_STATS.oportunidades.delta}%
            </span>
          </div>
          <AreaChart data={trendData} height={120} color="var(--brand-ink)" />
          <div
            className="row between tiny muted"
            style={{ marginTop: 6 }}
          >
            <span>inicio</span>
            <span>hoje</span>
          </div>
        </div>

        {/* Distribuição de risco dos lotes reais */}
        <div className="panel" style={{ padding: 22 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>
            Distribuicao de risco
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Bar
              label="Oportunidade alta"
              value={dist.baixo}
              color="var(--ok)"
            />
            <Bar
              label="Risco medio"
              value={dist.medio}
              color="var(--warn)"
            />
            <Bar
              label="Risco alto"
              value={dist.alto}
              color="var(--danger)"
            />
          </div>
        </div>
      </section>

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
