import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, Loader2, Scale, Search, X } from "lucide-react";
import { listProposicoes, type ProposicaoItem } from "../../features/juridico/juridico-api";
import { FonteDots } from "../../components/ui";

// Quantas proposições renderizar por vez (o scroll carrega mais sozinho).
const PAGE_SIZE = 36;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface JuridicoPageProps {
  onSelectProposicao?: ((proposicao: ProposicaoItem) => void) | undefined;
}

type SortKey = "recentes" | "tipo";

// ─── Constants ───────────────────────────────────────────────────────────────

// Fonte oficial: Câmara dos Deputados — Dados Abertos. Cor própria (azul institucional).
const FONTE_DOTS_CAMARA = [
  { sigla: "Câmara", cor: "#2D6CDF", nome: "Câmara dos Deputados — Proposições (Dados Abertos)" },
];

const SORT_OPTIONS: ReadonlyArray<readonly [SortKey, string]> = [
  ["recentes", "Mais recentes"],
  ["tipo", "Tipo (A→Z)"],
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Remove acentos e baixa caixa para busca tolerante. */
function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Busca por múltiplos termos (AND), tolerante a acento: cada termo precisa
 * aparecer em algum campo (título, tipo, ano, ementa).
 */
function matchesSearch(p: ProposicaoItem, q: string): boolean {
  const query = normalizeForSearch(q);
  if (query === "") return true;
  const haystack = normalizeForSearch(
    [p.titulo, p.tipo, String(p.ano), p.ementa].join(" "),
  );
  return query.split(/\s+/).every((term) => haystack.includes(term));
}

/** Chave de ordenação numérica estável (ano desc, depois número desc). */
function recencyScore(p: ProposicaoItem): number {
  const ano = Number.isFinite(p.ano) ? p.ano : 0;
  const numero = Number.isFinite(p.numero) ? p.numero : 0;
  return ano * 1_000_000 + numero;
}

// ─── Skeleton card ───────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="card card--pad" aria-hidden="true">
      <div className="skeleton" style={{ height: 12, width: "30%", marginBottom: 12 }} />
      <div className="skeleton" style={{ height: 16, width: "55%", marginBottom: 10 }} />
      <div className="skeleton" style={{ height: 11, width: "92%", marginBottom: 6 }} />
      <div className="skeleton" style={{ height: 11, width: "80%", marginBottom: 6 }} />
      <div className="skeleton" style={{ height: 11, width: "64%" }} />
    </div>
  );
}

// ─── Proposição card ─────────────────────────────────────────────────────────

interface ProposicaoCardProps {
  proposicao: ProposicaoItem;
  onSelect: (() => void) | undefined;
}

function ProposicaoCard({ proposicao, onSelect }: ProposicaoCardProps) {
  const cardLabel = `Proposição — ${proposicao.titulo}`;

  return (
    <article
      className="card card--hover"
      style={{
        overflow: "hidden",
        cursor: onSelect ? "pointer" : "default",
        display: "flex",
        flexDirection: "column",
      }}
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
      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
        {/* Top: tipo + ano */}
        <div className="row between" style={{ gap: 8, alignItems: "center" }}>
          <span className="badge badge--neutral" style={{ flexShrink: 0 }}>
            {proposicao.tipo || "—"}
          </span>
          <span className="tiny muted num" style={{ fontVariantNumeric: "tabular-nums", display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Calendar size={12} aria-hidden="true" />
            {Number.isFinite(proposicao.ano) ? proposicao.ano : "—"}
          </span>
        </div>

        {/* Título — identidade da proposição */}
        <div
          style={{
            fontSize: 16,
            fontWeight: 800,
            color: "var(--t-hi)",
            lineHeight: 1.3,
          }}
          title={proposicao.titulo}
        >
          {proposicao.titulo || "Proposição"}
        </div>

        {/* Ementa */}
        <p
          className="tiny muted"
          style={{
            margin: 0,
            lineHeight: 1.5,
            display: "-webkit-box",
            WebkitLineClamp: 4,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
          title={proposicao.ementa}
        >
          {proposicao.ementa || "Sem ementa registrada."}
        </p>

        {/* Fonte */}
        <div
          className="row between"
          style={{ gap: 6, marginTop: "auto", paddingTop: 4, alignItems: "center" }}
        >
          <span className="tiny" style={{ color: "var(--t-low)", fontWeight: 600 }}>
            Em tramitação
          </span>
          <FonteDots fontes={FONTE_DOTS_CAMARA} size={20} />
        </div>
      </div>
    </article>
  );
}

// ─── Select control (mobile-friendly native select styled como chip) ──────────

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
          maxWidth: 180,
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

// ─── Empty (filters) state ────────────────────────────────────────────────────

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
      <div style={{ fontWeight: 700, fontSize: 15 }}>Nenhuma proposição com esses filtros</div>
      <p className="muted small" style={{ margin: 0, maxWidth: 340 }}>
        Tente ampliar a busca ou trocar o tipo/ano.
      </p>
      <button className="btn btn--ghost btn--sm" onClick={onClear} type="button">
        Limpar filtros
      </button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function JuridicoPage({ onSelectProposicao }: JuridicoPageProps) {
  // ── Data state ──
  const [proposicoes, setProposicoes] = useState<ProposicaoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // ── Filter/sort state ──
  const [query, setQuery] = useState("");
  const [tipo, setTipo] = useState("todos");
  const [ano, setAno] = useState("todos");
  const [sortKey, setSortKey] = useState<SortKey>("recentes");

  // ── Paginação por scroll ──
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // ── Load data ──
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setErrorMessage(null);

    listProposicoes()
      .then((result) => {
        if (cancelled) return;
        setProposicoes(result.proposicoes);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : "Erro ao carregar proposições.");
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Derived filter option list (tipos) ──
  const tipoOptions = useMemo<ReadonlyArray<readonly [string, string]>>(() => {
    const distinct = Array.from(
      new Set(
        proposicoes
          .map((p) => p.tipo?.trim())
          .filter((t): t is string => typeof t === "string" && t.length > 0),
      ),
    ).sort((a, b) => a.localeCompare(b, "pt-BR"));
    return [["todos", "Todos"], ...distinct.map((t) => [t, t] as const)];
  }, [proposicoes]);

  // ── Derived filter option list (anos) ──
  const anoOptions = useMemo<ReadonlyArray<readonly [string, string]>>(() => {
    const distinct = Array.from(
      new Set(
        proposicoes
          .map((p) => (Number.isFinite(p.ano) ? String(p.ano) : ""))
          .filter((a): a is string => a.length > 0),
      ),
    ).sort((a, b) => Number(b) - Number(a));
    return [["todos", "Todos"], ...distinct.map((a) => [a, a] as const)];
  }, [proposicoes]);

  // ── Filtered + sorted list ──
  const filtered = useMemo<ProposicaoItem[]>(() => {
    const list = proposicoes.filter((p) => {
      if (!matchesSearch(p, query)) return false;
      if (tipo !== "todos" && p.tipo !== tipo) return false;
      if (ano !== "todos" && String(p.ano) !== ano) return false;
      return true;
    });

    return [...list].sort((a, b) => {
      if (sortKey === "tipo") {
        const t = (a.tipo || "").localeCompare(b.tipo || "", "pt-BR");
        if (t !== 0) return t;
        return recencyScore(b) - recencyScore(a);
      }
      return recencyScore(b) - recencyScore(a);
    });
  }, [proposicoes, query, tipo, ano, sortKey]);

  // Reinicia a janela ao mudar busca/filtros/ordenação.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query, tipo, ano, sortKey]);

  // Carrega mais quando o sentinela entra na viewport.
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
  }, [filtered.length]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  function clearFilters() {
    setQuery("");
    setTipo("todos");
    setAno("todos");
    setSortKey("recentes");
  }

  const hasActiveFilters =
    query !== "" || tipo !== "todos" || ano !== "todos" || sortKey !== "recentes";

  // ── Render ──
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div>
        <span className="eyebrow">Jurídico</span>
        <h2 className="h2" style={{ marginTop: 4 }}>
          Proposições legislativas
        </h2>
        <p className="muted small" style={{ marginTop: 4, maxWidth: 560 }}>
          Projetos de lei e demais proposições em tramitação na Câmara dos Deputados (Dados
          Abertos), com tipo, ano e ementa oficial — buscáveis por palavra-chave.
        </p>
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
            placeholder="Buscar na ementa, tipo ou número (ex.: PL 3091, saúde mental)…"
            aria-label="Buscar proposições"
          />
          {query !== "" && (
            <button
              className="btn btn--icon btn--ghost btn--sm"
              style={{ width: 28, height: 28, flexShrink: 0 }}
              onClick={() => setQuery("")}
              type="button"
              aria-label="Limpar busca"
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Filter selects */}
        <div className="row wrap" style={{ gap: 10 }}>
          {tipoOptions.length > 1 && (
            <FilterSelect label="Tipo" value={tipo} options={tipoOptions} onChange={setTipo} />
          )}
          {anoOptions.length > 1 && (
            <FilterSelect label="Ano" value={ano} options={anoOptions} onChange={setAno} />
          )}
        </div>

        {/* Sort chips */}
        <div className="row wrap" style={{ gap: 7 }}>
          <span style={{ fontSize: 12, color: "var(--t-low)", fontWeight: 600, alignSelf: "center" }}>
            Ordenar por:
          </span>
          {SORT_OPTIONS.map(([value, label]) => (
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
          ))}
        </div>
      </div>

      {/* Count row */}
      {!isLoading && errorMessage === null && proposicoes.length > 0 && (
        <div className="row between wrap" style={{ gap: 8 }}>
          <span style={{ fontSize: 13, color: "var(--t-mid)" }}>
            <b className="num" style={{ color: "var(--t-hi)", fontVariantNumeric: "tabular-nums" }}>
              {filtered.length}
            </b>{" "}
            {filtered.length === 1 ? "proposição encontrada" : "proposições encontradas"}
            {filtered.length > visible.length ? ` · mostrando ${visible.length}` : ""}
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
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}
          aria-busy="true"
          aria-label="Carregando proposições…"
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : errorMessage !== null ? null : proposicoes.length === 0 ? (
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
          <div style={{ fontWeight: 700, fontSize: 15 }}>Nenhuma proposição disponível no momento</div>
          <p className="muted small" style={{ margin: 0, maxWidth: 360 }}>
            A coleta da Câmara roda periodicamente. Volte em breve ou aguarde a próxima sincronização.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState onClear={clearFilters} />
      ) : (
        <>
          <div
            className="grid"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}
          >
            {visible.map((proposicao) => (
              <ProposicaoCard
                key={proposicao.id}
                proposicao={proposicao}
                onSelect={
                  onSelectProposicao !== undefined ? () => onSelectProposicao(proposicao) : undefined
                }
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
              Carregando mais proposições…
            </div>
          )}
        </>
      )}
    </div>
  );
}
