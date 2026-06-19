import { useEffect, useMemo, useRef, useState } from "react";
import type { CamaraDeputado } from "@fonteia/sources";
import { ExternalLink, Landmark, Loader2, Mail, MapPin, Search, User, Vote, X } from "lucide-react";
import { listDeputados, listVotacoes, type VotacaoItem } from "../../features/politica/politica-api";
import { FonteDots } from "../../components/ui";

// Quantos deputados renderizar por vez (o scroll carrega mais sozinho).
const PAGE_SIZE = 30;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PoliticaPageProps {
  onSelectDeputado?: ((deputado: CamaraDeputado) => void) | undefined;
}

type SortKey = "nome" | "partido" | "uf";

type PageTab = "deputados" | "votacoes";

// ─── Constants ───────────────────────────────────────────────────────────────

// Fonte oficial: Câmara dos Deputados — Dados Abertos. Cor própria (verde institucional).
const CAMARA_COR = "#1F8A4C";

const FONTE_DOTS_CAMARA = [
  { sigla: "CD", cor: CAMARA_COR, nome: "Câmara dos Deputados — Dados Abertos" },
];

const SORT_OPTIONS: ReadonlyArray<readonly [SortKey, string]> = [
  ["nome", "Nome (A–Z)"],
  ["partido", "Partido"],
  ["uf", "UF"],
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

/** Iniciais do nome para o fallback do avatar quando não há foto. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

/** Página oficial do deputado na Câmara. */
function camaraUrl(deputado: CamaraDeputado): string {
  return `https://www.camara.leg.br/deputados/${deputado.id}`;
}

/**
 * Busca por múltiplos termos (AND), tolerante a acento: cada termo precisa
 * aparecer em algum campo (nome, partido, UF).
 */
function matchesSearch(deputado: CamaraDeputado, q: string): boolean {
  const query = normalizeForSearch(q);
  if (query === "") return true;
  const haystack = normalizeForSearch(
    [deputado.nome, deputado.partido, deputado.uf].join(" "),
  );
  return query.split(/\s+/).every((term) => haystack.includes(term));
}

/** Formata yyyy-mm-dd (ou ISO com hora) para dd/mm/yyyy. */
function formatDateShort(raw: string): string {
  const datePart = raw.slice(0, 10); // "yyyy-mm-dd"
  const [yyyy, mm, dd] = datePart.split("-");
  if (!yyyy || !mm || !dd) return raw;
  return `${dd}/${mm}/${yyyy}`;
}

// ─── Skeleton card ───────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="card card--pad" aria-hidden="true">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div className="skeleton" style={{ width: 52, height: 52, borderRadius: "50%", flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ height: 14, width: "75%", marginBottom: 8 }} />
          <div className="skeleton" style={{ height: 11, width: "45%" }} />
        </div>
      </div>
    </div>
  );
}

// ─── Deputado card ───────────────────────────────────────────────────────────

interface DeputadoCardProps {
  deputado: CamaraDeputado;
  onSelect: (() => void) | undefined;
}

function DeputadoCard({ deputado, onSelect }: DeputadoCardProps) {
  const [imgError, setImgError] = useState(false);
  const local = deputado.uf !== "" ? deputado.uf : "Brasil";
  const cardLabel = `Deputado ${deputado.nome}${deputado.partido ? ` — ${deputado.partido}` : ""}${deputado.uf ? `/${deputado.uf}` : ""}`;

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
        {/* Topo: foto + nome + partido/UF */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {deputado.foto !== "" && !imgError ? (
            <img
              src={deputado.foto}
              alt=""
              loading="lazy"
              onError={() => setImgError(true)}
              style={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                objectFit: "cover",
                flexShrink: 0,
                border: "1px solid var(--border)",
                background: "var(--surface-2, var(--surface))",
              }}
            />
          ) : (
            <div
              aria-hidden="true"
              style={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
                fontSize: 16,
                color: "var(--brand-ink)",
                background: "color-mix(in srgb, var(--brand-ink) 12%, var(--surface))",
                border: "1px solid var(--border)",
              }}
            >
              {initialsOf(deputado.nome)}
            </div>
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: "var(--t-hi)",
                lineHeight: 1.3,
                overflow: "hidden",
                textOverflow: "ellipsis",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
              }}
              title={deputado.nome}
            >
              {deputado.nome || "Nome não informado"}
            </div>
            <div className="row" style={{ gap: 6, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
              {deputado.partido !== "" && (
                <span className="badge badge--neutral" style={{ fontWeight: 700 }}>
                  {deputado.partido}
                </span>
              )}
              <span
                className="tiny muted"
                style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
              >
                <MapPin size={12} style={{ flexShrink: 0 }} aria-hidden="true" />
                {local}
              </span>
            </div>
          </div>
        </div>

        {/* E-mail institucional */}
        {deputado.email !== "" && (
          <a
            href={`mailto:${deputado.email}`}
            onClick={(e) => e.stopPropagation()}
            className="tiny"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              color: "var(--t-mid)",
              textDecoration: "none",
              overflow: "hidden",
            }}
            title={deputado.email}
          >
            <Mail size={13} style={{ flexShrink: 0, color: "var(--t-low)" }} aria-hidden="true" />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {deputado.email}
            </span>
          </a>
        )}

        {/* Footer: fonte + link oficial */}
        <div
          className="row between"
          style={{ gap: 6, marginTop: "auto", paddingTop: 4, alignItems: "center" }}
        >
          <a
            href={camaraUrl(deputado)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="tiny"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              color: "var(--brand-ink)",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Ver na Câmara
            <ExternalLink size={12} aria-hidden="true" />
          </a>
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
        <User size={28} />
      </div>
      <div style={{ fontWeight: 700, fontSize: 15 }}>Nenhum deputado com esses filtros</div>
      <p className="muted small" style={{ margin: 0, maxWidth: 340 }}>
        Tente ampliar a busca ou trocar o partido / a UF.
      </p>
      <button className="btn btn--ghost btn--sm" onClick={onClear} type="button">
        Limpar filtros
      </button>
    </div>
  );
}

// ─── Votacao card ─────────────────────────────────────────────────────────────

function VotacaoCard({ votacao }: { votacao: VotacaoItem }) {
  const { data, siglaOrgao, aprovacao, placarSim, placarNao, placarAbstencoes, proposicao } =
    votacao.attributes;

  const siglaLabel =
    proposicao?.sigla && proposicao?.numero && proposicao?.ano
      ? `${proposicao.sigla} ${proposicao.numero}/${proposicao.ano}`
      : null;

  return (
    <article className="card card--hover" style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
        {/* Top row: data + órgão + resultado */}
        <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span className="tiny muted" style={{ fontVariantNumeric: "tabular-nums" }}>
            {formatDateShort(data)}
          </span>
          {siglaOrgao && (
            <span className="badge badge--neutral" style={{ fontWeight: 700 }}>
              {siglaOrgao}
            </span>
          )}
          <span
            className="badge"
            style={{
              fontWeight: 700,
              background: aprovacao
                ? "color-mix(in srgb, #16a34a 14%, var(--surface))"
                : "color-mix(in srgb, #dc2626 14%, var(--surface))",
              color: aprovacao ? "#16a34a" : "#dc2626",
              border: `1px solid ${aprovacao ? "color-mix(in srgb, #16a34a 30%, transparent)" : "color-mix(in srgb, #dc2626 30%, transparent)"}`,
            }}
          >
            {aprovacao ? "Aprovada" : "Rejeitada"}
          </span>
        </div>

        {/* Proposição */}
        {proposicao?.ementa && (
          <div>
            {siglaLabel && (
              <span style={{ fontWeight: 700, fontSize: 13, color: "var(--t-hi)", marginRight: 6 }}>
                {siglaLabel}
              </span>
            )}
            <span
              style={{
                fontSize: 13,
                color: "var(--t-mid)",
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {proposicao.ementa}
            </span>
          </div>
        )}

        {/* Placar */}
        <div className="row" style={{ gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#16a34a" }}>
            {placarSim} Sim
          </span>
          <span style={{ fontSize: 13, color: "var(--t-low)" }} aria-hidden="true">·</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#dc2626" }}>
            {placarNao} Não
          </span>
          {placarAbstencoes > 0 && (
            <>
              <span style={{ fontSize: 13, color: "var(--t-low)" }} aria-hidden="true">·</span>
              <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>
                {placarAbstencoes} Abs.
              </span>
            </>
          )}
        </div>

        {/* Footer: fonte */}
        <div style={{ marginTop: "auto", paddingTop: 4 }}>
          <FonteDots fontes={FONTE_DOTS_CAMARA} size={20} />
        </div>
      </div>
    </article>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function PoliticaPage({ onSelectDeputado }: PoliticaPageProps = {}) {
  // ── Tab state ──
  const [pageTab, setPageTab] = useState<PageTab>("deputados");

  // ── Deputados data state ──
  const [deputados, setDeputados] = useState<CamaraDeputado[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // ── Filter/sort state ──
  const [query, setQuery] = useState("");
  const [partido, setPartido] = useState("todos");
  const [uf, setUf] = useState("todas");
  const [sortKey, setSortKey] = useState<SortKey>("nome");

  // ── Paginação por scroll ──
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // ── Votações data state ──
  const [votacoes, setVotacoes] = useState<VotacaoItem[]>([]);
  const [isLoadingVotacoes, setIsLoadingVotacoes] = useState(false);
  const [errorVotacoes, setErrorVotacoes] = useState<string | null>(null);
  const hasLoadedVotacoes = useRef(false);

  // ── Load deputados on mount ──
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setErrorMessage(null);

    listDeputados()
      .then((result) => {
        if (cancelled) return;
        setDeputados(result.deputados);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : "Erro ao carregar deputados.");
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Load votações lazily on first tab switch ──
  useEffect(() => {
    if (pageTab !== "votacoes") return;
    if (hasLoadedVotacoes.current) return;

    hasLoadedVotacoes.current = true;
    let cancelled = false;
    setIsLoadingVotacoes(true);
    setErrorVotacoes(null);

    listVotacoes()
      .then((result) => {
        if (cancelled) return;
        setVotacoes(result.votacoes);
        setIsLoadingVotacoes(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorVotacoes(err instanceof Error ? err.message : "Erro ao carregar votações.");
        setIsLoadingVotacoes(false);
      });

    return () => {
      cancelled = true;
    };
  }, [pageTab]);

  // ── Derived filter option lists ──
  const partidoOptions = useMemo<ReadonlyArray<readonly [string, string]>>(() => {
    const distinct = Array.from(
      new Set(
        deputados
          .map((d) => d.partido?.trim())
          .filter((p): p is string => typeof p === "string" && p.length > 0),
      ),
    ).sort((a, b) => a.localeCompare(b, "pt-BR"));
    return [["todos", "Todos"], ...distinct.map((p) => [p, p] as const)];
  }, [deputados]);

  const ufOptions = useMemo<ReadonlyArray<readonly [string, string]>>(() => {
    const distinct = Array.from(
      new Set(
        deputados
          .map((d) => d.uf?.trim())
          .filter((u): u is string => typeof u === "string" && u.length > 0),
      ),
    ).sort((a, b) => a.localeCompare(b, "pt-BR"));
    return [["todas", "Todas"], ...distinct.map((u) => [u, u] as const)];
  }, [deputados]);

  // ── Filtered + sorted list ──
  const filtered = useMemo<CamaraDeputado[]>(() => {
    const list = deputados.filter((d) => {
      if (!matchesSearch(d, query)) return false;
      if (partido !== "todos" && d.partido !== partido) return false;
      if (uf !== "todas" && d.uf !== uf) return false;
      return true;
    });

    return [...list].sort((a, b) => {
      if (sortKey === "partido") {
        const byPartido = a.partido.localeCompare(b.partido, "pt-BR");
        if (byPartido !== 0) return byPartido;
        return a.nome.localeCompare(b.nome, "pt-BR");
      }
      if (sortKey === "uf") {
        const byUf = a.uf.localeCompare(b.uf, "pt-BR");
        if (byUf !== 0) return byUf;
        return a.nome.localeCompare(b.nome, "pt-BR");
      }
      return a.nome.localeCompare(b.nome, "pt-BR");
    });
  }, [deputados, query, partido, uf, sortKey]);

  // Reinicia a janela ao mudar busca/filtros/ordenação.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query, partido, uf, sortKey]);

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
    setPartido("todos");
    setUf("todas");
    setSortKey("nome");
  }

  const hasActiveFilters =
    query !== "" || partido !== "todos" || uf !== "todas" || sortKey !== "nome";

  // ── Tab bar styles ──
  const tabStyle = (tab: PageTab): React.CSSProperties => ({
    background: "none",
    border: "none",
    borderBottom: pageTab === tab ? "2px solid var(--brand-ink)" : "2px solid transparent",
    color: pageTab === tab ? "var(--brand-ink)" : "var(--t-mid)",
    fontFamily: "inherit",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    padding: "10px 16px",
    transition: "color 0.15s, border-color 0.15s",
  });

  // ── Render ──
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Tab bar */}
      <div
        role="tablist"
        aria-label="Seções de Política"
        style={{
          display: "flex",
          borderBottom: "1px solid var(--border)",
          gap: 0,
          marginBottom: 4,
        }}
      >
        <button
          role="tab"
          aria-selected={pageTab === "deputados"}
          aria-controls="tabpanel-deputados"
          id="tab-deputados"
          style={tabStyle("deputados")}
          onClick={() => setPageTab("deputados")}
          type="button"
        >
          Deputados
        </button>
        <button
          role="tab"
          aria-selected={pageTab === "votacoes"}
          aria-controls="tabpanel-votacoes"
          id="tab-votacoes"
          style={tabStyle("votacoes")}
          onClick={() => setPageTab("votacoes")}
          type="button"
        >
          Votações
        </button>
      </div>

      {/* ── Deputados tab ── */}
      <div
        role="tabpanel"
        id="tabpanel-deputados"
        aria-labelledby="tab-deputados"
        hidden={pageTab !== "deputados"}
        style={{ display: pageTab === "deputados" ? "flex" : "none", flexDirection: "column", gap: 16 }}
      >
        {/* Header */}
        <div>
          <span className="eyebrow">Política — Câmara dos Deputados</span>
          <h2 className="h2" style={{ marginTop: 4 }}>
            Deputados Federais em exercício
          </h2>
          <p className="muted small" style={{ marginTop: 4, maxWidth: 560 }}>
            Os deputados federais em exercício na legislatura atual, com partido, UF e contato —
            direto dos Dados Abertos da Câmara dos Deputados.
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
              placeholder="Buscar por nome, partido ou UF…"
              aria-label="Buscar deputados"
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
            {partidoOptions.length > 1 && (
              <FilterSelect
                label="Partido"
                value={partido}
                options={partidoOptions}
                onChange={setPartido}
              />
            )}
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
        {!isLoading && errorMessage === null && deputados.length > 0 && (
          <div className="row between wrap" style={{ gap: 8 }}>
            <span style={{ fontSize: 13, color: "var(--t-mid)" }}>
              <b className="num" style={{ color: "var(--t-hi)", fontVariantNumeric: "tabular-nums" }}>
                {filtered.length}
              </b>{" "}
              {filtered.length === 1 ? "deputado encontrado" : "deputados encontrados"}
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
            aria-label="Carregando deputados…"
          >
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : errorMessage !== null ? null : deputados.length === 0 ? (
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
            <Landmark size={28} style={{ color: "var(--t-low)" }} aria-hidden="true" />
            <div style={{ fontWeight: 700, fontSize: 15 }}>Nenhum deputado disponível no momento</div>
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
              {visible.map((deputado) => (
                <DeputadoCard
                  key={deputado.id}
                  deputado={deputado}
                  onSelect={
                    onSelectDeputado !== undefined ? () => onSelectDeputado(deputado) : undefined
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
                Carregando mais deputados…
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Votações tab ── */}
      <div
        role="tabpanel"
        id="tabpanel-votacoes"
        aria-labelledby="tab-votacoes"
        hidden={pageTab !== "votacoes"}
        style={{ display: pageTab === "votacoes" ? "flex" : "none", flexDirection: "column", gap: 16 }}
      >
        {/* Header */}
        <div>
          <span className="eyebrow">Política — Câmara dos Deputados</span>
          <h2 className="h2" style={{ marginTop: 4 }}>
            Votações do Plenário
          </h2>
          <p className="muted small" style={{ marginTop: 4, maxWidth: 560 }}>
            Votações recentes do Plenário da Câmara com placar completo e resultado — Dados Abertos
            da Câmara dos Deputados.
          </p>
        </div>

        {/* Loading */}
        {isLoadingVotacoes && (
          <div
            className="grid"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}
            aria-busy="true"
            aria-label="Carregando votações…"
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {/* Error */}
        {!isLoadingVotacoes && errorVotacoes !== null && (
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
            Erro ao carregar votações: {errorVotacoes}
          </div>
        )}

        {/* Empty */}
        {!isLoadingVotacoes && errorVotacoes === null && votacoes.length === 0 && (
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
            <Vote size={28} style={{ color: "var(--t-low)" }} aria-hidden="true" />
            <div style={{ fontWeight: 700, fontSize: 15 }}>Nenhuma votação disponível ainda</div>
            <p className="muted small" style={{ margin: 0, maxWidth: 360 }}>
              As votações vêm dos Dados Abertos da Câmara. Aguarde a próxima sincronização.
            </p>
          </div>
        )}

        {/* Data */}
        {!isLoadingVotacoes && errorVotacoes === null && votacoes.length > 0 && (
          <>
            {/* Count row */}
            <div style={{ fontSize: 13, color: "var(--t-mid)" }}>
              <b className="num" style={{ color: "var(--t-hi)", fontVariantNumeric: "tabular-nums" }}>
                {votacoes.length}
              </b>{" "}
              {votacoes.length === 1 ? "votação encontrada" : "votações encontradas"}
            </div>

            {/* Grid */}
            <div
              className="grid"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}
            >
              {votacoes.map((votacao) => (
                <VotacaoCard key={votacao.id} votacao={votacao} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
