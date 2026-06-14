import { useEffect, useMemo, useRef, useState } from "react";
import { Gavel, Loader2, MapPin, Search, X } from "lucide-react";
import { listMunicipios, type MunicipioWithStats } from "../../features/municipios/municipios-api";
import { FonteDots } from "../../components/ui";

// Quantos municípios renderizar por vez (o scroll carrega mais sozinho).
const PAGE_SIZE = 36;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MunicipiosPageProps {
  onSelectMunicipio?: ((municipio: MunicipioWithStats) => void) | undefined;
}

type SortKey = "nome" | "licitacoes";

// ─── Constants ───────────────────────────────────────────────────────────────

// Fonte oficial: IBGE Localidades. Cor própria (verde-azulado institucional).
const FONTE_DOTS_IBGE = [
  { sigla: "IBGE", cor: "#0FB7A0", nome: "IBGE — Localidades (municípios)" },
];

const SORT_OPTIONS: ReadonlyArray<readonly [SortKey, string]> = [
  ["nome", "Nome (A→Z)"],
  ["licitacoes", "Mais licitações"],
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
 * aparecer em algum campo (nome, UF, região, mesorregião, microrregião).
 */
function matchesSearch(m: MunicipioWithStats, q: string): boolean {
  const query = normalizeForSearch(q);
  if (query === "") return true;
  const haystack = normalizeForSearch(
    [m.nome, m.uf, m.ufNome, m.regiao, m.mesorregiao, m.microrregiao].join(" "),
  );
  return query.split(/\s+/).every((term) => haystack.includes(term));
}

// ─── Skeleton card ───────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="card card--pad" aria-hidden="true">
      <div className="skeleton" style={{ height: 12, width: "28%", marginBottom: 12 }} />
      <div className="skeleton" style={{ height: 16, width: "70%", marginBottom: 10 }} />
      <div className="skeleton" style={{ height: 11, width: "50%", marginBottom: 8 }} />
      <div className="skeleton" style={{ height: 11, width: "40%" }} />
    </div>
  );
}

// ─── Município card ──────────────────────────────────────────────────────────

interface MunicipioCardProps {
  municipio: MunicipioWithStats;
  onSelect: (() => void) | undefined;
}

function MunicipioCard({ municipio, onSelect }: MunicipioCardProps) {
  const cardLabel = `Município — ${municipio.nome}${municipio.uf ? `/${municipio.uf}` : ""}`;
  const temLicitacoes = municipio.licitacoesCount > 0;

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
        {/* Top: UF + código IBGE */}
        <div className="row between" style={{ gap: 8, alignItems: "center" }}>
          <span className="badge badge--neutral" style={{ flexShrink: 0 }}>
            {municipio.uf || "—"}
          </span>
          <span className="tiny muted num" style={{ fontVariantNumeric: "tabular-nums" }}>
            IBGE {municipio.codigoIbge}
          </span>
        </div>

        {/* Nome — identidade do município */}
        <div
          style={{
            fontSize: 16,
            fontWeight: 800,
            color: "var(--t-hi)",
            lineHeight: 1.3,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
          title={municipio.nome}
        >
          {municipio.nome || "Município sem nome"}
        </div>

        {/* Localização: UF + região */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div className="tiny muted" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <MapPin size={13} style={{ flexShrink: 0 }} aria-hidden="true" />
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {municipio.ufNome || municipio.uf || "Brasil"}
              {municipio.regiao ? ` · ${municipio.regiao}` : ""}
            </span>
          </div>
          {municipio.mesorregiao !== "" && (
            <div
              className="tiny muted"
              style={{ marginLeft: 19, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              title={`Mesorregião ${municipio.mesorregiao}`}
            >
              {municipio.mesorregiao}
            </div>
          )}
        </div>

        {/* Licitações cruzadas (PNCP) */}
        <div
          className="row between"
          style={{ gap: 6, marginTop: "auto", paddingTop: 4, alignItems: "center" }}
        >
          <div
            className="tiny"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontWeight: 700,
              color: temLicitacoes ? "var(--t-hi)" : "var(--t-low)",
            }}
          >
            <Gavel size={13} style={{ flexShrink: 0, color: temLicitacoes ? "var(--brand-ink)" : "var(--t-low)" }} aria-hidden="true" />
            <span className="num" style={{ fontVariantNumeric: "tabular-nums" }}>
              {municipio.licitacoesCount}
            </span>
            {municipio.licitacoesCount === 1 ? "licitação" : "licitações"}
          </div>
          <FonteDots fontes={FONTE_DOTS_IBGE} size={20} />
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
      <div style={{ fontWeight: 700, fontSize: 15 }}>Nenhum município com esses filtros</div>
      <p className="muted small" style={{ margin: 0, maxWidth: 340 }}>
        Tente ampliar a busca ou trocar a UF.
      </p>
      <button className="btn btn--ghost btn--sm" onClick={onClear} type="button">
        Limpar filtros
      </button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function MunicipiosPage({ onSelectMunicipio }: MunicipiosPageProps) {
  // ── Data state ──
  const [municipios, setMunicipios] = useState<MunicipioWithStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // ── Filter/sort state ──
  const [query, setQuery] = useState("");
  const [uf, setUf] = useState("todas");
  const [sortKey, setSortKey] = useState<SortKey>("nome");

  // ── Paginação por scroll ──
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // ── Load data ──
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setErrorMessage(null);

    listMunicipios()
      .then((result) => {
        if (cancelled) return;
        setMunicipios(result.municipios);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : "Erro ao carregar municípios.");
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Derived filter option list (UFs) ──
  const ufOptions = useMemo<ReadonlyArray<readonly [string, string]>>(() => {
    const distinct = Array.from(
      new Set(
        municipios
          .map((m) => m.uf?.trim())
          .filter((u): u is string => typeof u === "string" && u.length > 0),
      ),
    ).sort((a, b) => a.localeCompare(b, "pt-BR"));
    return [["todas", "Todas"], ...distinct.map((u) => [u, u] as const)];
  }, [municipios]);

  // ── Filtered + sorted list ──
  const filtered = useMemo<MunicipioWithStats[]>(() => {
    const list = municipios.filter((m) => {
      if (!matchesSearch(m, query)) return false;
      if (uf !== "todas" && m.uf !== uf) return false;
      return true;
    });

    return [...list].sort((a, b) => {
      if (sortKey === "licitacoes") {
        if (b.licitacoesCount !== a.licitacoesCount) return b.licitacoesCount - a.licitacoesCount;
        return a.nome.localeCompare(b.nome, "pt-BR");
      }
      return a.nome.localeCompare(b.nome, "pt-BR");
    });
  }, [municipios, query, uf, sortKey]);

  // Reinicia a janela ao mudar busca/filtros/ordenação.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query, uf, sortKey]);

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
    setUf("todas");
    setSortKey("nome");
  }

  const hasActiveFilters = query !== "" || uf !== "todas" || sortKey !== "nome";

  // ── Render ──
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div>
        <span className="eyebrow">Territórios</span>
        <h2 className="h2" style={{ marginTop: 4 }}>
          Municípios do Brasil
        </h2>
        <p className="muted small" style={{ marginTop: 4, maxWidth: 560 }}>
          Catálogo oficial dos municípios brasileiros (IBGE Localidades), com UF, região e o total de
          licitações públicas registradas em cada um — cruzado com o PNCP.
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
            placeholder="Buscar por município, UF ou região…"
            aria-label="Buscar municípios"
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
          {ufOptions.length > 1 && (
            <FilterSelect label="UF" value={uf} options={ufOptions} onChange={setUf} />
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
      {!isLoading && errorMessage === null && municipios.length > 0 && (
        <div className="row between wrap" style={{ gap: 8 }}>
          <span style={{ fontSize: 13, color: "var(--t-mid)" }}>
            <b className="num" style={{ color: "var(--t-hi)", fontVariantNumeric: "tabular-nums" }}>
              {filtered.length}
            </b>{" "}
            {filtered.length === 1 ? "município encontrado" : "municípios encontrados"}
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
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}
          aria-busy="true"
          aria-label="Carregando municípios…"
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : errorMessage !== null ? null : municipios.length === 0 ? (
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
          <div style={{ fontWeight: 700, fontSize: 15 }}>Nenhum município disponível no momento</div>
          <p className="muted small" style={{ margin: 0, maxWidth: 360 }}>
            A coleta do IBGE roda periodicamente. Volte em breve ou aguarde a próxima sincronização.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState onClear={clearFilters} />
      ) : (
        <>
          <div
            className="grid"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}
          >
            {visible.map((municipio) => (
              <MunicipioCard
                key={municipio.id}
                municipio={municipio}
                onSelect={
                  onSelectMunicipio !== undefined ? () => onSelectMunicipio(municipio) : undefined
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
              Carregando mais municípios…
            </div>
          )}
        </>
      )}
    </div>
  );
}
