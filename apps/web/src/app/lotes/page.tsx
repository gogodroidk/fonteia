import { useEffect, useMemo, useState } from "react";
import type { ReceitaLeilaoLot } from "@fonteia/sources";
import { scoreReceitaLeilaoLot } from "@fonteia/scoring";
import type { LeilaoOpportunityScore } from "@fonteia/scoring";
import { listLeilaoLots } from "../../features/leiloes/leiloes-api";
import { ScoreRing, FonteDots, riscoBadge } from "../../components/ui";
import { formatBRL, FONTES } from "../../data/leiloes-seed";
import { DemoDataBanner } from "../../components/demo-data-banner";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LotesPageProps {
  onSelectLot?: ((lot: ReceitaLeilaoLot) => void) | undefined;
}

type SortKey = "score" | "prazo" | "valor";
type RiscoFilter = "todos" | "baixo" | "medio" | "alto";

interface LotWithScore {
  lot: ReceitaLeilaoLot;
  scoring: LeilaoOpportunityScore;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const RFB_FONTE = FONTES.find((f) => f.id === "rfb") ?? {
  id: "rfb",
  nome: "Receita Federal do Brasil",
  sigla: "RFB",
  cor: "#1D5FE0",
};

const FONTE_DOTS_RFB = [
  {
    sigla: RFB_FONTE.sigla,
    cor: RFB_FONTE.cor,
    nome: RFB_FONTE.nome,
  },
];

function formatDeadlineShort(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function daysUntil(value: string): number {
  const ms = new Date(value).getTime() - Date.now();
  if (Number.isNaN(ms)) return -1;
  return Math.ceil(ms / 86_400_000);
}

function deadlineUrgencyClass(days: number): string {
  if (days <= 0) return "t-danger";
  if (days <= 3) return "t-warn";
  return "t-mid";
}

function matchesSearch(lot: ReceitaLeilaoLot, q: string): boolean {
  if (q === "") return true;
  const needle = q.toLowerCase();
  return (
    lot.city.toLowerCase().includes(needle) ||
    lot.agency.toLowerCase().includes(needle) ||
    lot.edital.toLowerCase().includes(needle) ||
    lot.id.toLowerCase().includes(needle)
  );
}

// ─── Skeleton card ───────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="card card--pad" aria-hidden="true">
      <div
        className="skeleton"
        style={{ height: 100, borderRadius: "var(--r-md)", marginBottom: 14 }}
      />
      <div className="skeleton" style={{ height: 12, width: "60%", marginBottom: 8 }} />
      <div className="skeleton" style={{ height: 10, width: "40%" }} />
    </div>
  );
}

// ─── Lot card ────────────────────────────────────────────────────────────────

interface LotCardProps {
  lot: ReceitaLeilaoLot;
  scoring: LeilaoOpportunityScore;
  onSelect: (() => void) | undefined;
}

function LotCard({ lot, scoring, onSelect }: LotCardProps) {
  const { className: riscoBadgeClass, label: riscoBadgeLabel } = riscoBadge(scoring.label);
  const days = daysUntil(lot.proposalDeadline);
  const urgencyClass = deadlineUrgencyClass(days);
  const deadlineLabel = formatDeadlineShort(lot.proposalDeadline);
  const bidLabel = formatBRL(lot.minimumBidCents / 100);

  return (
    <article
      className="card card--hover"
      style={{ overflow: "hidden", cursor: onSelect ? "pointer" : "default" }}
      onClick={onSelect}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onKeyDown={
        onSelect
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect();
              }
            }
          : undefined
      }
      aria-label={`Lote ${lot.displayNumber} — ${lot.agency}, ${lot.city}`}
    >
      {/* Image / icon area */}
      <div
        style={{
          height: 100,
          background: lot.imageUrl
            ? `url(${lot.imageUrl}) center/cover no-repeat`
            : "linear-gradient(135deg, #1a2e52, #0c1c3a)",
          position: "relative",
          display: "flex",
          alignItems: "flex-end",
          padding: "10px 12px",
        }}
      >
        {/* Risco badge — top right */}
        <span
          className={`badge ${riscoBadgeClass}`}
          style={{ position: "absolute", top: 10, right: 10 }}
        >
          {riscoBadgeLabel}
        </span>

        {/* ScoreRing — bottom left over gradient */}
        {!lot.imageUrl && (
          <div style={{ marginBottom: 2 }}>
            <ScoreRing value={scoring.score} size={48} />
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {/* City + agency */}
        <div>
          <div
            style={{
              fontSize: 13.5,
              fontWeight: 700,
              color: "var(--t-hi)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {lot.city}
          </div>
          <div
            className="tiny muted"
            style={{
              marginTop: 2,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {lot.agency}
          </div>
          <div className="tiny muted" style={{ marginTop: 1, fontFamily: "monospace" }}>
            {lot.edital}
          </div>
        </div>

        {/* Bid + score row */}
        <div className="row between" style={{ gap: 8 }}>
          <div>
            <div className="tiny muted" style={{ marginBottom: 2 }}>
              Lance mínimo
            </div>
            <div
              className="num"
              style={{ fontSize: 15, fontWeight: 800, color: "var(--t-hi)" }}
            >
              {bidLabel}
            </div>
          </div>
          {/* If there was an image, show score ring here */}
          {lot.imageUrl && (
            <ScoreRing value={scoring.score} size={44} />
          )}
        </div>

        {/* Deadline + FonteDots */}
        <div className="row between" style={{ gap: 6, marginTop: 2 }}>
          <div className={`tiny ${urgencyClass}`} style={{ fontWeight: 600 }}>
            {days <= 0
              ? "Prazo vencido"
              : days === 1
              ? "Vence amanhã"
              : `${deadlineLabel} · ${days}d`}
          </div>
          <FonteDots fontes={FONTE_DOTS_RFB} size={20} />
        </div>
      </div>
    </article>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div
      className="panel"
      style={{
        padding: 48,
        textAlign: "center",
        gridColumn: "1 / -1",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div style={{ fontSize: 32 }} aria-hidden="true">🔍</div>
      <div style={{ fontWeight: 700, fontSize: 15 }}>Nenhum lote encontrado</div>
      <p className="muted small" style={{ margin: 0, maxWidth: 320 }}>
        Nenhum lote corresponde aos filtros ativos. Ajuste a busca ou limpe os filtros.
      </p>
      <button className="btn btn--ghost btn--sm" onClick={onClear} type="button">
        Limpar filtros
      </button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function LotesPage({ onSelectLot }: LotesPageProps) {
  // ── Data state ──────────────────────────────────────────────────────────────
  const [lots, setLots] = useState<ReceitaLeilaoLot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dataMessage, setDataMessage] = useState("");

  // ── Filter/sort state ───────────────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [riscoFilter, setRiscoFilter] = useState<RiscoFilter>("todos");
  const [sortKey, setSortKey] = useState<SortKey>("score");

  // ── Load data ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    setIsLoading(true);
    setErrorMessage(null);

    listLeilaoLots()
      .then((result) => {
        if (cancelled) return;
        setLots(result.lots);
        setIsDemo(result.isDemo);
        setDataMessage(result.message);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : "Erro ao carregar lotes.");
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Score all lots (memoised) ───────────────────────────────────────────────
  const lotsWithScore = useMemo<LotWithScore[]>(
    () => lots.map((lot) => ({ lot, scoring: scoreReceitaLeilaoLot(lot) })),
    [lots],
  );

  // ── Filtered + sorted list ──────────────────────────────────────────────────
  const filtered = useMemo<LotWithScore[]>(() => {
    let list = lotsWithScore.filter(({ lot, scoring }) => {
      if (!matchesSearch(lot, query)) return false;
      if (riscoFilter !== "todos" && scoring.label !== riscoFilter) return false;
      return true;
    });

    list = [...list].sort((a, b) => {
      if (sortKey === "score") return b.scoring.score - a.scoring.score;
      if (sortKey === "prazo")
        return (
          new Date(a.lot.proposalDeadline).getTime() -
          new Date(b.lot.proposalDeadline).getTime()
        );
      // valor
      return a.lot.minimumBidCents - b.lot.minimumBidCents;
    });

    return list;
  }, [lotsWithScore, query, riscoFilter, sortKey]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  function clearFilters() {
    setQuery("");
    setRiscoFilter("todos");
    setSortKey("score");
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div>
        <span className="eyebrow">Leilões governamentais</span>
        <h2 className="h2" style={{ marginTop: 4 }}>
          Lotes disponíveis
        </h2>
      </div>

      {/* Demo banner */}
      {isDemo && (
        <DemoDataBanner
          title="Modo demonstração"
          message={dataMessage}
        />
      )}

      {/* Error banner */}
      {errorMessage !== null && (
        <div
          className="panel"
          style={{
            padding: "14px 18px",
            background: "color-mix(in srgb, var(--danger) 10%, var(--surface))",
            border: "1px solid color-mix(in srgb, var(--danger) 28%, transparent)",
            color: "var(--danger)",
            fontSize: 13.5,
            fontWeight: 600,
          }}
          role="alert"
        >
          Erro ao carregar dados: {errorMessage}
        </div>
      )}

      {/* Filter bar */}
      <div
        className="panel"
        style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 12 }}
      >
        {/* Search */}
        <div className="searchbar">
          <svg
            width={16}
            height={16}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: "var(--t-low)", flexShrink: 0 }}
            aria-hidden="true"
          >
            <circle cx={11} cy={11} r={8} />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por cidade, órgão ou edital…"
            aria-label="Buscar lotes"
          />
          {query !== "" && (
            <button
              className="btn btn--icon btn--ghost btn--sm"
              style={{ width: 28, height: 28, flexShrink: 0 }}
              onClick={() => setQuery("")}
              type="button"
              aria-label="Limpar busca"
            >
              ×
            </button>
          )}
        </div>

        {/* Chips row */}
        <div className="row between wrap" style={{ gap: 10 }}>
          {/* Risco chips */}
          <div className="row wrap" style={{ gap: 7 }}>
            <span
              style={{ fontSize: 12, color: "var(--t-low)", fontWeight: 600, alignSelf: "center" }}
            >
              Risco:
            </span>
            {(
              [
                ["todos", "Todos"],
                ["baixo", "Baixo"],
                ["medio", "Médio"],
                ["alto", "Alto"],
              ] as [RiscoFilter, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                className={`chip${riscoFilter === value ? " chip--on" : ""}`}
                style={{ fontSize: 12.5, padding: "7px 12px" }}
                onClick={() => setRiscoFilter(value)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>

          {/* Sort chips */}
          <div className="row wrap" style={{ gap: 7 }}>
            <span
              style={{ fontSize: 12, color: "var(--t-low)", fontWeight: 600, alignSelf: "center" }}
            >
              Ordenar:
            </span>
            {(
              [
                ["score", "Score"],
                ["prazo", "Prazo"],
                ["valor", "Menor valor"],
              ] as [SortKey, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                className={`chip${sortKey === value ? " chip--on" : ""}`}
                style={{ fontSize: 12.5, padding: "7px 12px" }}
                onClick={() => setSortKey(value)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Count row */}
      {!isLoading && errorMessage === null && (
        <div className="row between">
          <span style={{ fontSize: 13, color: "var(--t-mid)" }}>
            <b
              className="num"
              style={{ color: "var(--t-hi)", fontVariantNumeric: "tabular-nums" }}
            >
              {filtered.length}
            </b>{" "}
            {filtered.length === 1 ? "lote encontrado" : "lotes encontrados"}
          </span>
          {isDemo && (
            <span
              className="tiny"
              style={{ color: "var(--t-low)", display: "flex", alignItems: "center", gap: 6 }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "var(--warn)",
                  display: "inline-block",
                }}
              />
              Dados de demonstração
            </span>
          )}
          {!isDemo && (
            <span
              className="tiny"
              style={{ color: "var(--t-low)", display: "flex", alignItems: "center", gap: 6 }}
            >
              <span
                className="pulse"
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "var(--accent-ink)",
                  display: "inline-block",
                }}
              />
              Atualizado em tempo real
            </span>
          )}
        </div>
      )}

      {/* Grid */}
      {isLoading ? (
        <div
          className="grid"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 16,
          }}
          aria-busy="true"
          aria-label="Carregando lotes…"
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : errorMessage !== null ? null : filtered.length === 0 ? (
        <div
          className="grid"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          }}
        >
          <EmptyState onClear={clearFilters} />
        </div>
      ) : (
        <div
          className="grid"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 16,
          }}
        >
          {filtered.map(({ lot, scoring }) => (
            <LotCard
              key={lot.id}
              lot={lot}
              scoring={scoring}
              onSelect={onSelectLot !== undefined ? () => onSelectLot(lot) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
