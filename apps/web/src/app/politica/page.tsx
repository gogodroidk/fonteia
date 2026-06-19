import { useEffect, useMemo, useRef, useState } from "react";
import {
  ExternalLink,
  Landmark,
  Loader2,
  Mail,
  MapPin,
  Search,
  User,
  Vote,
  X,
} from "lucide-react";
import type { CasaLegislativa, Parlamentar } from "../../features/politica/politica-api";
import {
  listDeputados,
  listVotacoes,
  type VotacaoItem,
} from "../../features/politica/politica-api";
import { FonteDots } from "../../components/ui";

// Quantos parlamentares renderizar por vez (scroll infinito carrega mais).
const PAGE_SIZE = 30;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PoliticaPageProps {
  // Mantém assinatura original: CamaraDeputado é supertype de Parlamentar
  // (Parlamentar estende CamaraDeputado), portanto compatível com callers existentes.
  onSelectDeputado?: ((deputado: Parlamentar) => void) | undefined;
}

type SortKey = "nome" | "partido" | "uf" | "casa";

type PageTab = "parlamentares" | "votacoes";

// ─── Constants ───────────────────────────────────────────────────────────────

const CAMARA_COR = "#1F8A4C";
const SENADO_COR = "#1F4D8A";

const FONTE_DOTS_CAMARA = [
  { sigla: "CD", cor: CAMARA_COR, nome: "Câmara dos Deputados — Dados Abertos" },
];

const FONTE_DOTS_SENADO = [
  { sigla: "SF", cor: SENADO_COR, nome: "Senado Federal — Dados Abertos" },
];

const SORT_OPTIONS: ReadonlyArray<readonly [SortKey, string]> = [
  ["nome", "Nome (A–Z)"],
  ["partido", "Partido"],
  ["uf", "UF"],
  ["casa", "Casa"],
];

const CASA_OPTIONS: ReadonlyArray<readonly [string, string]> = [
  ["todas", "Todas"],
  ["camara", "Câmara"],
  ["senado", "Senado"],
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function parlamentarUrl(p: Parlamentar): string {
  if (p.casa === "senado" && p.urlPagina) return p.urlPagina;
  return `https://www.camara.leg.br/deputados/${p.id}`;
}

function casaLabel(casa: CasaLegislativa): string {
  if (casa === "camara") return "Deputado(a)";
  if (casa === "senado") return "Senador(a)";
  return "Parlamentar";
}

function matchesSearch(p: Parlamentar, q: string): boolean {
  const query = normalizeForSearch(q);
  if (query === "") return true;
  const haystack = normalizeForSearch(
    [p.nome, p.partido, p.uf, p.casa === "senado" ? "senado" : "camara"].join(" "),
  );
  return query.split(/\s+/).every((term) => haystack.includes(term));
}

function formatDateShort(raw: string): string {
  const datePart = raw.slice(0, 10);
  const [yyyy, mm, dd] = datePart.split("-");
  if (!yyyy || !mm || !dd) return raw;
  return `${dd}/${mm}/${yyyy}`;
}

// ─── Skeleton card ───────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="card card--pad" aria-hidden="true">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          className="skeleton"
          style={{ width: 52, height: 52, borderRadius: "50%", flexShrink: 0 }}
        />
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ height: 14, width: "75%", marginBottom: 8 }} />
          <div className="skeleton" style={{ height: 11, width: "45%" }} />
        </div>
      </div>
    </div>
  );
}

// ─── Casa badge ──────────────────────────────────────────────────────────────

function CasaBadge({ casa }: { casa: CasaLegislativa }) {
  const isCamara = casa === "camara";
  const color = isCamara ? CAMARA_COR : casa === "senado" ? SENADO_COR : "var(--t-low)";
  const label = isCamara ? "Câmara" : casa === "senado" ? "Senado" : "Outro";
  return (
    <span
      className="badge"
      style={{
        fontWeight: 700,
        fontSize: 11,
        color,
        background: `color-mix(in srgb, ${color} 12%, var(--surface))`,
        border: `1px solid color-mix(in srgb, ${color} 28%, transparent)`,
      }}
    >
      {label}
    </span>
  );
}

// ─── Parlamentar card ─────────────────────────────────────────────────────────

interface ParlamentarCardProps {
  parlamentar: Parlamentar;
  onSelect: (() => void) | undefined;
}

function ParlamentarCard({ parlamentar: p, onSelect }: ParlamentarCardProps) {
  const [imgError, setImgError] = useState(false);
  const local = p.uf !== "" ? p.uf : "Brasil";
  const role = casaLabel(p.casa);
  const cardLabel = `${role} ${p.nome}${p.partido ? ` — ${p.partido}` : ""}${p.uf ? `/${p.uf}` : ""}`;
  const fontes = p.casa === "senado" ? FONTE_DOTS_SENADO : FONTE_DOTS_CAMARA;
  const linkLabel = p.casa === "senado" ? "Ver no Senado" : "Ver na Câmara";

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
      <div
        style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12, flex: 1 }}
      >
        {/* Topo: foto + nome + partido/UF + casa */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {p.foto !== "" && !imgError ? (
            <img
              src={p.foto}
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
              {initialsOf(p.nome)}
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
              title={p.nome}
            >
              {p.nome || "Nome não informado"}
            </div>
            <div
              className="row"
              style={{ gap: 6, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}
            >
              <CasaBadge casa={p.casa} />
              {p.partido !== "" && (
                <span className="badge badge--neutral" style={{ fontWeight: 700 }}>
                  {p.partido}
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
        {p.email !== "" && (
          <a
            href={`mailto:${p.email}`}
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
            title={p.email}
          >
            <Mail size={13} style={{ flexShrink: 0, color: "var(--t-low)" }} aria-hidden="true" />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {p.email}
            </span>
          </a>
        )}

        {/* Footer: fonte + link oficial */}
        <div
          className="row between"
          style={{ gap: 6, marginTop: "auto", paddingTop: 4, alignItems: "center" }}
        >
          <a
            href={parlamentarUrl(p)}
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
            {linkLabel}
            <ExternalLink size={12} aria-hidden="true" />
          </a>
          <FonteDots fontes={fontes} size={20} />
        </div>
      </div>
    </article>
  );
}

// ─── FilterSelect ─────────────────────────────────────────────────────────────

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

// ─── Casa tab chips ───────────────────────────────────────────────────────────

interface CasaTabsProps {
  active: string;
  camaraCount: number;
  senadoCount: number;
  onChange: (next: string) => void;
}

function CasaTabs({ active, camaraCount, senadoCount, onChange }: CasaTabsProps) {
  const total = camaraCount + senadoCount;

  const items: Array<{ key: string; label: string; count: number; color: string }> = [
    { key: "todas", label: "Todas", count: total, color: "var(--brand-ink)" },
    { key: "camara", label: "Câmara", count: camaraCount, color: CAMARA_COR },
    { key: "senado", label: "Senado", count: senadoCount, color: SENADO_COR },
  ];

  return (
    <div
      className="row"
      style={{ gap: 8, flexWrap: "wrap" }}
      role="group"
      aria-label="Filtrar por casa legislativa"
    >
      {items.map(({ key, label, count, color }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-pressed={isActive}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 14px",
              borderRadius: 999,
              border: isActive
                ? `1.5px solid ${color}`
                : "1.5px solid var(--border)",
              background: isActive
                ? `color-mix(in srgb, ${color} 12%, var(--surface))`
                : "var(--surface)",
              color: isActive ? color : "var(--t-mid)",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {label}
            <span
              style={{
                fontSize: 11,
                fontVariantNumeric: "tabular-nums",
                fontWeight: 600,
                padding: "1px 6px",
                borderRadius: 999,
                background: isActive
                  ? `color-mix(in srgb, ${color} 18%, var(--surface))`
                  : "var(--surface-2, color-mix(in srgb, var(--border) 50%, var(--surface)))",
                color: isActive ? color : "var(--t-low)",
              }}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Empty (filters) state ────────────────────────────────────────────────────

function EmptyFiltersState({ onClear }: { onClear: () => void }) {
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
      <div style={{ fontWeight: 700, fontSize: 15 }}>Nenhum parlamentar com esses filtros</div>
      <p className="muted small" style={{ margin: 0, maxWidth: 340 }}>
        Tente ampliar a busca ou trocar o partido / a UF / a casa.
      </p>
      <button className="btn btn--ghost btn--sm" onClick={onClear} type="button">
        Limpar filtros
      </button>
    </div>
  );
}

// ─── Senado empty-state (ingestion not yet run) ───────────────────────────────

function SenadoEmptyState() {
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
          background: `color-mix(in srgb, ${SENADO_COR} 10%, var(--surface))`,
          color: SENADO_COR,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Landmark size={28} />
      </div>
      <div style={{ fontWeight: 700, fontSize: 15 }}>Coleta do Senado em andamento</div>
      <p className="muted small" style={{ margin: 0, maxWidth: 380 }}>
        Os dados dos senadores ainda estão sendo sincronizados. Volte em breve — a coleta roda
        periodicamente.
      </p>
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
      <div
        style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12, flex: 1 }}
      >
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
              <span
                style={{ fontWeight: 700, fontSize: 13, color: "var(--t-hi)", marginRight: 6 }}
              >
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
          <span style={{ fontSize: 13, color: "var(--t-low)" }} aria-hidden="true">
            ·
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#dc2626" }}>
            {placarNao} Não
          </span>
          {placarAbstencoes > 0 && (
            <>
              <span style={{ fontSize: 13, color: "var(--t-low)" }} aria-hidden="true">
                ·
              </span>
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
  const [pageTab, setPageTab] = useState<PageTab>("parlamentares");

  // ── Parlamentares data state ──
  const [parlamentares, setParlamentares] = useState<Parlamentar[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // ── Filter/sort state ──
  const [query, setQuery] = useState("");
  const [casa, setCasa] = useState("todas");
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

  // ── Load parlamentares on mount ──
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setErrorMessage(null);

    listDeputados()
      .then((result) => {
        if (cancelled) return;
        setParlamentares(result.deputados);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : "Erro ao carregar parlamentares.");
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

  // ── Counts per casa (from raw unfiltered list) ──
  const camaraCount = useMemo(
    () => parlamentares.filter((p) => p.casa === "camara").length,
    [parlamentares],
  );
  const senadoCount = useMemo(
    () => parlamentares.filter((p) => p.casa === "senado").length,
    [parlamentares],
  );

  // ── Filter option lists derived from all parlamentares (not filtered subset) ──
  const partidoOptions = useMemo<ReadonlyArray<readonly [string, string]>>(() => {
    const source =
      casa === "todas"
        ? parlamentares
        : parlamentares.filter((p) => p.casa === (casa as CasaLegislativa));
    const distinct = Array.from(
      new Set(
        source
          .map((p) => p.partido?.trim())
          .filter((v): v is string => typeof v === "string" && v.length > 0),
      ),
    ).sort((a, b) => a.localeCompare(b, "pt-BR"));
    return [["todos", "Todos"], ...distinct.map((v) => [v, v] as const)];
  }, [parlamentares, casa]);

  const ufOptions = useMemo<ReadonlyArray<readonly [string, string]>>(() => {
    const source =
      casa === "todas"
        ? parlamentares
        : parlamentares.filter((p) => p.casa === (casa as CasaLegislativa));
    const distinct = Array.from(
      new Set(
        source
          .map((p) => p.uf?.trim())
          .filter((v): v is string => typeof v === "string" && v.length > 0),
      ),
    ).sort((a, b) => a.localeCompare(b, "pt-BR"));
    return [["todas", "Todas"], ...distinct.map((v) => [v, v] as const)];
  }, [parlamentares, casa]);

  // ── Filtered + sorted list ──
  const filtered = useMemo<Parlamentar[]>(() => {
    const list = parlamentares.filter((p) => {
      if (!matchesSearch(p, query)) return false;
      if (casa !== "todas" && p.casa !== casa) return false;
      if (partido !== "todos" && p.partido !== partido) return false;
      if (uf !== "todas" && p.uf !== uf) return false;
      return true;
    });

    return [...list].sort((a, b) => {
      if (sortKey === "casa") {
        const byCasa = a.casa.localeCompare(b.casa, "pt-BR");
        if (byCasa !== 0) return byCasa;
        return a.nome.localeCompare(b.nome, "pt-BR");
      }
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
  }, [parlamentares, query, casa, partido, uf, sortKey]);

  // Reset visible window on filter/sort change.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query, casa, partido, uf, sortKey]);

  // Reset partido/uf when casa changes to avoid stuck filters.
  useEffect(() => {
    setPartido("todos");
    setUf("todas");
  }, [casa]);

  // Infinite scroll sentinel.
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

  // Whether the user chose Senado but there are none yet (ingestion not run).
  const senadoFilteredButEmpty = casa === "senado" && senadoCount === 0 && !isLoading;

  function clearFilters() {
    setQuery("");
    setCasa("todas");
    setPartido("todos");
    setUf("todas");
    setSortKey("nome");
  }

  const hasActiveFilters =
    query !== "" ||
    casa !== "todas" ||
    partido !== "todos" ||
    uf !== "todas" ||
    sortKey !== "nome";

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
          aria-selected={pageTab === "parlamentares"}
          aria-controls="tabpanel-parlamentares"
          id="tab-parlamentares"
          style={tabStyle("parlamentares")}
          onClick={() => setPageTab("parlamentares")}
          type="button"
        >
          Parlamentares
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

      {/* ── Parlamentares tab ── */}
      <div
        role="tabpanel"
        id="tabpanel-parlamentares"
        aria-labelledby="tab-parlamentares"
        hidden={pageTab !== "parlamentares"}
        style={{
          display: pageTab === "parlamentares" ? "flex" : "none",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* Header */}
        <div>
          <span className="eyebrow">Política — Congresso Nacional</span>
          <h2 className="h2" style={{ marginTop: 4 }}>
            Parlamentares em exercício
          </h2>
          <p className="muted small" style={{ marginTop: 4, maxWidth: 560 }}>
            Deputados federais e senadores em exercício no Congresso Nacional — direto dos Dados
            Abertos da Câmara e do Senado Federal.
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

        {/* Casa tabs (only when data loaded) */}
        {!isLoading && errorMessage === null && parlamentares.length > 0 && (
          <CasaTabs
            active={casa}
            camaraCount={camaraCount}
            senadoCount={senadoCount}
            onChange={setCasa}
          />
        )}

        {/* Filter bar */}
        <div
          className="panel"
          style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 12 }}
        >
          {/* Search */}
          <div className="searchbar">
            <Search
              size={16}
              style={{ color: "var(--t-low)", flexShrink: 0 }}
              aria-hidden="true"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome, partido, UF ou casa…"
              aria-label="Buscar parlamentares"
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
            {/* Casa select (fallback for mobile/search) */}
            <FilterSelect
              label="Casa"
              value={casa}
              options={CASA_OPTIONS}
              onChange={setCasa}
            />
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
            <span
              style={{ fontSize: 12, color: "var(--t-low)", fontWeight: 600, alignSelf: "center" }}
            >
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
        {!isLoading && errorMessage === null && parlamentares.length > 0 && (
          <div className="row between wrap" style={{ gap: 8 }}>
            <span style={{ fontSize: 13, color: "var(--t-mid)" }}>
              <b
                className="num"
                style={{ color: "var(--t-hi)", fontVariantNumeric: "tabular-nums" }}
              >
                {filtered.length}
              </b>{" "}
              {filtered.length === 1 ? "parlamentar encontrado" : "parlamentares encontrados"}
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
            aria-label="Carregando parlamentares…"
          >
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : errorMessage !== null ? null : parlamentares.length === 0 ? (
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
            <div style={{ fontWeight: 700, fontSize: 15 }}>Nenhum parlamentar disponível</div>
            <p className="muted small" style={{ margin: 0, maxWidth: 360 }}>
              A coleta da Câmara e do Senado roda periodicamente. Volte em breve ou aguarde a
              próxima sincronização.
            </p>
          </div>
        ) : senadoFilteredButEmpty ? (
          <SenadoEmptyState />
        ) : filtered.length === 0 ? (
          <EmptyFiltersState onClear={clearFilters} />
        ) : (
          <>
            <div
              className="grid"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}
            >
              {visible.map((p) => (
                <ParlamentarCard
                  key={`${p.casa}-${p.id}`}
                  parlamentar={p}
                  onSelect={onSelectDeputado !== undefined ? () => onSelectDeputado(p) : undefined}
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
                Carregando mais parlamentares…
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
        style={{
          display: pageTab === "votacoes" ? "flex" : "none",
          flexDirection: "column",
          gap: 16,
        }}
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
              <b
                className="num"
                style={{ color: "var(--t-hi)", fontVariantNumeric: "tabular-nums" }}
              >
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
