import { useEffect, useMemo, useRef, useState } from "react";
import type { ReceitaLeilaoLot } from "@fonteia/sources";
import { lotEconomia, scoreReceitaLeilaoLot } from "@fonteia/scoring";
import type { LeilaoOpportunityScore, LotEconomia } from "@fonteia/scoring";
import { Heart, Loader2, Search, Tag } from "lucide-react";
import { listLeilaoLots } from "../../features/leiloes/leiloes-api";
import { ScoreRing, FonteDots } from "../../components/ui";
import { formatBRL, FONTES } from "../../data/leiloes-seed";
import { readWatchlist, subscribeWatchlist, toggleWatchlist } from "../../lib/watchlist";
import { displayCity, normalizeForSearch } from "../../lib/receita-localidades";

// Quantos lotes renderizar por vez (o scroll carrega mais automaticamente).
const PAGE_SIZE = 24;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LotesPageProps {
  onSelectLot?: ((lot: ReceitaLeilaoLot) => void) | undefined;
}

type SortKey = "score" | "desconto" | "prazo" | "valor";
type PersonFilter = "todos" | "pf" | "pj";
type DescontoFilter = "todos" | "30" | "50";

interface LotView {
  lot: ReceitaLeilaoLot;
  scoring: LeilaoOpportunityScore;
  economia: LotEconomia | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const RFB_FONTE = FONTES.find((f) => f.id === "rfb") ?? {
  id: "rfb",
  nome: "Receita Federal do Brasil",
  sigla: "RFB",
  cor: "#1D5FE0",
};

const FONTE_DOTS_RFB = [{ sigla: RFB_FONTE.sigla, cor: RFB_FONTE.cor, nome: RFB_FONTE.nome }];

const SORT_OPTIONS: ReadonlyArray<readonly [SortKey, string]> = [
  ["score", "Melhor oportunidade"],
  ["desconto", "Maior desconto"],
  ["prazo", "Encerrando antes"],
  ["valor", "Menor preço"],
];

const PERSON_OPTIONS: ReadonlyArray<readonly [PersonFilter, string]> = [
  ["todos", "Todos"],
  ["pf", "Pessoa física"],
  ["pj", "Pessoa jurídica"],
];

const DESCONTO_OPTIONS: ReadonlyArray<readonly [DescontoFilter, string]> = [
  ["todos", "Qualquer"],
  ["30", "≥ 30%"],
  ["50", "≥ 50%"],
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDeadlineShort(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function daysUntil(value: string): number {
  const ms = new Date(value).getTime() - Date.now();
  if (Number.isNaN(ms)) return -1;
  return Math.ceil(ms / 86_400_000);
}

function deadlineColor(days: number): string {
  if (days <= 0) return "var(--danger)";
  if (days <= 3) return "var(--warn)";
  return "var(--t-mid)";
}

function deadlineLabel(value: string): string {
  const days = daysUntil(value);
  if (days < 0) return "Prazo vencido";
  if (days === 0) return "Encerra hoje";
  if (days === 1) return "Encerra amanhã";
  return `${formatDeadlineShort(value)} · ${days}d`;
}

/**
 * Opportunity confidence badge — the scoring `label` is confidence (alto = best),
 * NOT risk, so map it to a positive scale instead of `riscoBadge` (which would
 * paint a great lot red). Higher score → greener, more reassuring badge.
 */
function confidenceBadge(label: LeilaoOpportunityScore["label"]): {
  className: string;
  text: string;
} {
  if (label === "alto") return { className: "badge--ok", text: "Alta oportunidade" };
  if (label === "medio") return { className: "badge--warn", text: "Oportunidade média" };
  return { className: "badge--neutral", text: "Avaliar com cautela" };
}

/**
 * Busca tolerante a acento e por múltiplos termos (AND): todos os termos digitados
 * precisam aparecer em algum campo (cidade limpa, órgão, edital, categoria, número).
 */
function matchesSearch(lot: ReceitaLeilaoLot, q: string): boolean {
  const query = normalizeForSearch(q);
  if (query === "") return true;
  const haystack = normalizeForSearch(
    [
      displayCity(lot.city),
      lot.city,
      lot.agency,
      lot.edital,
      lot.category ?? "",
      lot.displayNumber,
      lot.lotNumber,
      lot.id,
    ].join(" "),
  );
  return query.split(/\s+/).every((term) => haystack.includes(term));
}

// ─── Skeleton card ───────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="card card--pad" aria-hidden="true">
      <div
        className="skeleton"
        style={{ height: 110, borderRadius: "var(--r-md)", marginBottom: 14 }}
      />
      <div className="skeleton" style={{ height: 12, width: "60%", marginBottom: 8 }} />
      <div className="skeleton" style={{ height: 10, width: "40%" }} />
    </div>
  );
}

// ─── Watchlist heart ─────────────────────────────────────────────────────────

function HeartButton({
  watched,
  onToggle,
  lotLabel,
}: {
  watched: boolean;
  onToggle: () => void;
  lotLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-pressed={watched}
      aria-label={watched ? `Remover ${lotLabel} da watchlist` : `Acompanhar ${lotLabel}`}
      title={watched ? "Remover da watchlist" : "Acompanhar este lote"}
      style={{
        position: "absolute",
        top: 8,
        right: 8,
        width: 44,
        height: 44,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "none",
        borderRadius: "50%",
        cursor: "pointer",
        background: "color-mix(in srgb, #0B2240 55%, transparent)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        color: watched ? "#FF5A7A" : "#FFFFFF",
        transition: "transform .12s ease, color .15s ease",
      }}
    >
      <Heart size={20} fill={watched ? "#FF5A7A" : "none"} strokeWidth={2} />
    </button>
  );
}

// ─── Lot card ────────────────────────────────────────────────────────────────

interface LotCardProps {
  view: LotView;
  watched: boolean;
  onToggleWatch: () => void;
  onSelect: (() => void) | undefined;
}

function LotCard({ view, watched, onToggleWatch, onSelect }: LotCardProps) {
  const { lot, scoring, economia } = view;
  const badge = confidenceBadge(scoring.label);
  const days = daysUntil(lot.proposalDeadline);
  const cardLabel = `Lote ${lot.displayNumber} — ${lot.agency}, ${displayCity(lot.city)}`;

  return (
    <article
      className="card card--hover"
      style={{ overflow: "hidden", cursor: onSelect ? "pointer" : "default", position: "relative" }}
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
      aria-label={cardLabel}
    >
      {/* Image / icon area */}
      <div
        style={{
          height: 132,
          background: lot.imageUrl
            ? `url(${lot.imageUrl}) center/cover no-repeat`
            : "linear-gradient(135deg, #1a2e52, #0c1c3a)",
          position: "relative",
          display: "flex",
          alignItems: "flex-end",
          padding: "10px 12px",
        }}
      >
        {/* Heart toggle — top right */}
        <HeartButton watched={watched} onToggle={onToggleWatch} lotLabel={`lote ${lot.displayNumber}`} />

        {/* Category chip — top left, when present */}
        {lot.category && (
          <span
            className="badge badge--neutral"
            style={{
              position: "absolute",
              top: 12,
              left: 12,
              maxWidth: "60%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              textTransform: "capitalize",
            }}
          >
            {lot.category.toLowerCase()}
          </span>
        )}

        {/* Desconto ribbon — bottom left, only when honest economia exists */}
        {economia && (
          <span
            className="badge"
            style={{
              background: "var(--accent-ink)",
              color: "#fff",
              fontWeight: 800,
              boxShadow: "var(--shadow-sm)",
            }}
          >
            -{economia.descontoPct}% vs avaliação
          </span>
        )}

        {/* Score ring on the gradient when there is no photo */}
        {!lot.imageUrl && (
          <div style={{ position: "absolute", bottom: 10, right: 12 }}>
            <ScoreRing value={scoring.score} size={48} />
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {/* City + agency + edital */}
        <div className="row between" style={{ gap: 10, alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
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
              {displayCity(lot.city)}
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
          {lot.imageUrl && <ScoreRing value={scoring.score} size={44} />}
        </div>

        {/* Confidence badge */}
        <div>
          <span className={`badge ${badge.className}`}>{badge.text}</span>
        </div>

        {/* Economia — only when lotEconomia is non-null (honest, no fabrication) */}
        {economia && (
          <div
            style={{
              background: "color-mix(in srgb, var(--accent-ink) 9%, var(--surface))",
              border: "1px solid color-mix(in srgb, var(--accent-ink) 22%, transparent)",
              borderRadius: "var(--r-sm)",
              padding: "8px 10px",
            }}
          >
            <div className="tiny" style={{ color: "var(--accent-ink)", fontWeight: 700 }}>
              Economia potencial
            </div>
            <div className="row between" style={{ gap: 8, marginTop: 2 }}>
              <span
                className="num"
                style={{ fontSize: 15, fontWeight: 800, color: "var(--accent-ink)" }}
              >
                {formatBRL(economia.economiaCents / 100)}
              </span>
              <span className="tiny muted">
                avaliação {formatBRL(economia.avaliacaoCents / 100)}
              </span>
            </div>
          </div>
        )}

        {/* Lance mínimo */}
        <div>
          <div className="tiny muted" style={{ marginBottom: 2 }}>
            Lance mínimo
          </div>
          <div className="num" style={{ fontSize: 16, fontWeight: 800, color: "var(--t-hi)" }}>
            {formatBRL(lot.minimumBidCents / 100)}
          </div>
        </div>

        {/* Deadline + fonte */}
        <div className="row between" style={{ gap: 6, marginTop: 2 }}>
          <div className="tiny" style={{ fontWeight: 600, color: deadlineColor(days) }}>
            {deadlineLabel(lot.proposalDeadline)}
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
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          background: "color-mix(in srgb, var(--brand-ink) 10%, var(--surface))",
          color: "var(--brand-ink)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Search size={28} />
      </div>
      <div style={{ fontWeight: 700, fontSize: 15 }}>Nenhum lote com esses filtros</div>
      <p className="muted small" style={{ margin: 0, maxWidth: 340 }}>
        Tente ampliar a busca, trocar a cidade ou reduzir a faixa de desconto. Os melhores
        achados costumam aparecer ao limpar os filtros.
      </p>
      <button className="btn btn--ghost btn--sm" onClick={onClear} type="button">
        Limpar filtros
      </button>
    </div>
  );
}

// ─── Select control (mobile-friendly native select, styled like a chip) ───────

function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<readonly [T, string]>;
  onChange: (next: T) => void;
}) {
  return (
    <label className="chip" style={{ gap: 8, paddingRight: 10 }}>
      <span style={{ color: "var(--t-low)", fontWeight: 600 }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        style={{
          border: "none",
          background: "transparent",
          color: "var(--t-hi)",
          fontFamily: "inherit",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          outline: "none",
          maxWidth: 160,
        }}
      >
        {options.map(([val, text]) => (
          <option key={val} value={val}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function LotesPage({ onSelectLot }: LotesPageProps) {
  // ── Data state ──────────────────────────────────────────────────────────────
  const [lots, setLots] = useState<ReceitaLeilaoLot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // ── Filter/sort state ───────────────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("todas");
  const [city, setCity] = useState("todas");
  const [person, setPerson] = useState<PersonFilter>("todos");
  const [desconto, setDesconto] = useState<DescontoFilter>("todos");
  const [sortKey, setSortKey] = useState<SortKey>("score");

  // ── Paginação por scroll (cresce sozinha ao rolar, sem clicar) ──────────────
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // ── Watchlist state (kept in sync with localStorage + other views) ──────────
  const [watchIds, setWatchIds] = useState<string[]>(() => readWatchlist());

  useEffect(() => subscribeWatchlist(setWatchIds), []);

  function handleToggleWatch(id: string) {
    setWatchIds(toggleWatchlist(id));
  }

  // ── Load data ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    setIsLoading(true);
    setErrorMessage(null);

    listLeilaoLots()
      .then((result) => {
        if (cancelled) return;
        setLots(result.lots);
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

  // ── Enrich lots with score + economia (memoised) ────────────────────────────
  const views = useMemo<LotView[]>(
    () =>
      lots.map((lot) => ({
        lot,
        scoring: scoreReceitaLeilaoLot(lot),
        economia: lotEconomia(lot),
      })),
    [lots],
  );

  // ── Derived filter option lists ─────────────────────────────────────────────
  const categoryOptions = useMemo<ReadonlyArray<readonly [string, string]>>(() => {
    const distinct = Array.from(
      new Set(
        lots
          .map((lot) => lot.category?.trim())
          .filter((c): c is string => typeof c === "string" && c.length > 0),
      ),
    ).sort((a, b) => a.localeCompare(b, "pt-BR"));
    return [["todas", "Todas"], ...distinct.map((c) => [c, c] as const)];
  }, [lots]);

  const cityOptions = useMemo<ReadonlyArray<readonly [string, string]>>(() => {
    // value = cidade crua (o filtro compara com lot.city); label = cidade limpa
    // (Superintendência Regional vira "Cidade/UF"). Ordena pelo rótulo amigável.
    const seen = new Map<string, string>();
    for (const lot of lots) {
      const raw = lot.city.trim();
      if (raw.length > 0 && !seen.has(raw)) seen.set(raw, displayCity(raw));
    }
    const entries = Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
    return [["todas", "Todas"], ...entries.map(([raw, label]) => [raw, label] as const)];
  }, [lots]);

  const hasAnyEconomia = useMemo(() => views.some((v) => v.economia !== null), [views]);
  const hasAnyCategory = categoryOptions.length > 1;

  // ── Filtered + sorted list ──────────────────────────────────────────────────
  const filtered = useMemo<LotView[]>(() => {
    const list = views.filter(({ lot, economia }) => {
      if (!matchesSearch(lot, query)) return false;
      if (category !== "todas" && lot.category !== category) return false;
      if (city !== "todas" && lot.city !== city) return false;
      if (person !== "todos" && !lot.eligiblePersonTypes.includes(person)) return false;
      if (desconto !== "todos") {
        const threshold = Number(desconto);
        if (!economia || economia.descontoPct < threshold) return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      if (sortKey === "score") return b.scoring.score - a.scoring.score;
      if (sortKey === "desconto") {
        return (b.economia?.descontoPct ?? -1) - (a.economia?.descontoPct ?? -1);
      }
      if (sortKey === "prazo") {
        return (
          new Date(a.lot.proposalDeadline).getTime() -
          new Date(b.lot.proposalDeadline).getTime()
        );
      }
      return a.lot.minimumBidCents - b.lot.minimumBidCents;
    });
  }, [views, query, category, city, person, desconto, sortKey]);

  // Reinicia a janela ao mudar busca/filtros/ordenação.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query, category, city, person, desconto, sortKey]);

  // Carrega mais lotes automaticamente quando o sentinela entra na viewport.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((current) => Math.min(current + PAGE_SIZE, filtered.length));
        }
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [filtered.length, visibleCount]);

  const visibleViews = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  // ── Handlers ────────────────────────────────────────────────────────────────
  function clearFilters() {
    setQuery("");
    setCategory("todas");
    setCity("todas");
    setPerson("todos");
    setDesconto("todos");
    setSortKey("score");
  }

  const hasActiveFilters =
    query !== "" ||
    category !== "todas" ||
    city !== "todas" ||
    person !== "todos" ||
    desconto !== "todos";

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
          <Search size={16} style={{ color: "var(--t-low)", flexShrink: 0 }} aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por cidade, órgão, edital ou categoria…"
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

        {/* Filter selects — wrap on mobile, never overflow */}
        <div className="row wrap" style={{ gap: 10 }}>
          {hasAnyCategory && (
            <FilterSelect
              label="Categoria"
              value={category}
              options={categoryOptions}
              onChange={setCategory}
            />
          )}
          <FilterSelect label="Cidade" value={city} options={cityOptions} onChange={setCity} />
          <FilterSelect
            label="Habilitação"
            value={person}
            options={PERSON_OPTIONS}
            onChange={setPerson}
          />
          {hasAnyEconomia && (
            <FilterSelect
              label="Desconto"
              value={desconto}
              options={DESCONTO_OPTIONS}
              onChange={setDesconto}
            />
          )}
        </div>

        {/* Sort chips */}
        <div className="row wrap" style={{ gap: 7 }}>
          <span
            style={{ fontSize: 12, color: "var(--t-low)", fontWeight: 600, alignSelf: "center" }}
          >
            Ordenar por:
          </span>
          {SORT_OPTIONS.map(([value, label]) => {
            // Hide the desconto sort entirely when no lot has an avaliação.
            if (value === "desconto" && !hasAnyEconomia) return null;
            return (
              <button
                key={value}
                className={`chip${sortKey === value ? " chip--on" : ""}`}
                style={{ fontSize: 12.5, padding: "7px 12px" }}
                onClick={() => setSortKey(value)}
                type="button"
                aria-pressed={sortKey === value}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Count row */}
      {!isLoading && errorMessage === null && lots.length > 0 && (
        <div className="row between wrap" style={{ gap: 8 }}>
          <span style={{ fontSize: 13, color: "var(--t-mid)" }}>
            <b className="num" style={{ color: "var(--t-hi)", fontVariantNumeric: "tabular-nums" }}>
              {filtered.length}
            </b>{" "}
            {filtered.length === 1 ? "lote encontrado" : "lotes encontrados"}
            {filtered.length > visibleViews.length ? ` · mostrando ${visibleViews.length}` : ""}
            {watchIds.length > 0 && (
              <>
                {" · "}
                <span style={{ color: "var(--accent-ink)", fontWeight: 600 }}>
                  <Tag size={12} style={{ verticalAlign: "-1px", marginRight: 3 }} aria-hidden="true" />
                  {watchIds.length} na watchlist
                </span>
              </>
            )}
          </span>
          {hasActiveFilters && (
            <button className="btn btn--ghost btn--sm" onClick={clearFilters} type="button">
              Limpar filtros
            </button>
          )}
        </div>
      )}

      {/* Grid / states */}
      {isLoading ? (
        <div
          className="grid"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}
          aria-busy="true"
          aria-label="Carregando lotes…"
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : errorMessage !== null ? null : lots.length === 0 ? (
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
          <div style={{ fontWeight: 700, fontSize: 15 }}>Nenhum lote disponível no momento</div>
          <p className="muted small" style={{ margin: 0, maxWidth: 360 }}>
            A coleta dos leilões da Receita roda periodicamente. Volte em breve ou aguarde a
            próxima sincronização.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState onClear={clearFilters} />
      ) : (
        <>
          <div
            className="grid"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}
          >
            {visibleViews.map((view) => (
              <LotCard
                key={view.lot.id}
                view={view}
                watched={watchIds.includes(view.lot.id)}
                onToggleWatch={() => handleToggleWatch(view.lot.id)}
                onSelect={onSelectLot !== undefined ? () => onSelectLot(view.lot) : undefined}
              />
            ))}
          </div>
          {hasMore && (
            <div
              ref={sentinelRef}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: 20,
                color: "var(--t-mid)",
                fontSize: 13,
              }}
              aria-hidden="true"
            >
              <Loader2 size={16} className="spin" />
              Carregando mais lotes…
            </div>
          )}
        </>
      )}
    </div>
  );
}
