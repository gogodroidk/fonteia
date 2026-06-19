import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, FileText, Loader2, Scale, Search, X } from "lucide-react";
import {
  assuntoPrincipal,
  listProposicoes,
  listProcessos,
  type ProposicaoItem,
  type ProcessoJudicialItem,
} from "../../features/juridico/juridico-api";
import { FonteDots } from "../../components/ui";

// Quantos itens renderizar por vez (o scroll carrega mais sozinho).
const PAGE_SIZE = 36;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface JuridicoPageProps {
  onSelectProposicao?: ((proposicao: ProposicaoItem) => void) | undefined;
}

type SortKey = "recentes" | "tipo";
type TabKey = "proposicoes" | "processos";

// ─── Constants ───────────────────────────────────────────────────────────────

// Fonte oficial: Câmara dos Deputados — Dados Abertos. Cor própria (azul institucional).
const FONTE_DOTS_CAMARA = [
  { sigla: "Câmara", cor: "#2D6CDF", nome: "Câmara dos Deputados — Proposições (Dados Abertos)" },
];

// Fonte oficial: CNJ DataJud.
const FONTE_DOTS_CNJ = [
  { sigla: "CNJ", cor: "#1A4B8C", nome: "CNJ DataJud — processos judiciais" },
];

const SORT_OPTIONS: ReadonlyArray<readonly [SortKey, string]> = [
  ["recentes", "Mais recentes"],
  ["tipo", "Tipo (A→Z)"],
];

const TABS: ReadonlyArray<readonly [TabKey, string]> = [
  ["proposicoes", "Proposições"],
  ["processos", "Processos"],
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

/** Busca tolerante em processo judicial. */
function matchesSearchProcesso(p: ProcessoJudicialItem, q: string): boolean {
  const query = normalizeForSearch(q);
  if (query === "") return true;
  const haystack = normalizeForSearch(
    [
      p.numeroProcesso,
      p.attributes.tribunal ?? "",
      p.attributes.classe ?? "",
      p.attributes.grau ?? "",
      p.attributes.orgaoJulgador ?? "",
      assuntoPrincipal(p.attributes),
    ].join(" "),
  );
  return query.split(/\s+/).every((term) => haystack.includes(term));
}

/** Chave de ordenação numérica estável (ano desc, depois número desc). */
function recencyScore(p: ProposicaoItem): number {
  const ano = Number.isFinite(p.ano) ? p.ano : 0;
  const numero = Number.isFinite(p.numero) ? p.numero : 0;
  return ano * 1_000_000 + numero;
}

/** Formata uma data ISO/yyyy-mm-dd em dd/mm/aaaa; devolve cru se não der. */
function formatDate(value: string): string {
  if (!value) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return value;
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

// ─── Processo judicial card ───────────────────────────────────────────────────

function ProcessoCard({ processo }: { processo: ProcessoJudicialItem }) {
  const { attributes, numeroProcesso } = processo;
  const assunto = assuntoPrincipal(attributes);

  return (
    <article
      className="card card--hover"
      style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}
      aria-label={`Processo — ${numeroProcesso || attributes.classe || "Sem número"}`}
    >
      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
        {/* Top: classe + grau */}
        <div className="row between" style={{ gap: 8, alignItems: "center" }}>
          <span className="badge badge--neutral" style={{ flexShrink: 0 }}>
            {attributes.classe || "—"}
          </span>
          {attributes.grau && (
            <span className="tiny muted" style={{ flexShrink: 0 }}>
              {attributes.grau}
            </span>
          )}
        </div>

        {/* Número do processo */}
        <div
          style={{
            fontSize: 14,
            fontWeight: 800,
            color: "var(--t-hi)",
            lineHeight: 1.3,
            fontVariantNumeric: "tabular-nums",
            wordBreak: "break-all",
          }}
          title={numeroProcesso}
        >
          {numeroProcesso || "Número não disponível"}
        </div>

        {/* Tribunal */}
        {attributes.tribunal && (
          <div
            className="tiny muted"
            style={{ display: "flex", alignItems: "center", gap: 5 }}
          >
            <Scale size={12} style={{ flexShrink: 0 }} aria-hidden="true" />
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {attributes.tribunal}
            </span>
          </div>
        )}

        {/* Assunto principal */}
        {assunto !== "" && (
          <p
            className="tiny muted"
            style={{
              margin: 0,
              lineHeight: 1.5,
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {assunto}
          </p>
        )}

        {/* Rodapé: data de ajuizamento + fonte */}
        <div
          className="row between"
          style={{ gap: 6, marginTop: "auto", paddingTop: 4, alignItems: "center" }}
        >
          {attributes.dataAjuizamento ? (
            <span
              className="tiny muted"
              style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
            >
              <Calendar size={12} aria-hidden="true" />
              {formatDate(attributes.dataAjuizamento)}
            </span>
          ) : (
            <span />
          )}
          <FonteDots fontes={FONTE_DOTS_CNJ} size={20} />
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

function EmptyState({ onClear, label }: { onClear: () => void; label: string }) {
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
      <div style={{ fontWeight: 700, fontSize: 15 }}>Nenhum(a) {label} com esses filtros</div>
      <p className="muted small" style={{ margin: 0, maxWidth: 340 }}>
        Tente ampliar a busca ou trocar o filtro.
      </p>
      <button className="btn btn--ghost btn--sm" onClick={onClear} type="button">
        Limpar filtros
      </button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function JuridicoPage({ onSelectProposicao }: JuridicoPageProps) {
  // ── Tab ──
  const [activeTab, setActiveTab] = useState<TabKey>("proposicoes");

  // ── Proposições data state ──
  const [proposicoes, setProposicoes] = useState<ProposicaoItem[]>([]);
  const [isLoadingProp, setIsLoadingProp] = useState(true);
  const [errorProp, setErrorProp] = useState<string | null>(null);

  // ── Processos data state ──
  const [processos, setProcessos] = useState<ProcessoJudicialItem[]>([]);
  const [isLoadingProc, setIsLoadingProc] = useState(true);
  const [errorProc, setErrorProc] = useState<string | null>(null);

  // ── Filter/sort state (proposições) ──
  const [query, setQuery] = useState("");
  const [tipo, setTipo] = useState("todos");
  const [ano, setAno] = useState("todos");
  const [sortKey, setSortKey] = useState<SortKey>("recentes");

  // ── Filter state (processos) ──
  const [queryProc, setQueryProc] = useState("");
  const [tribunal, setTribunal] = useState("todos");

  // ── Paginação por scroll ──
  const [visibleCountProp, setVisibleCountProp] = useState(PAGE_SIZE);
  const [visibleCountProc, setVisibleCountProc] = useState(PAGE_SIZE);
  const sentinelPropRef = useRef<HTMLDivElement | null>(null);
  const sentinelProcRef = useRef<HTMLDivElement | null>(null);

  // ── Load proposições ──
  useEffect(() => {
    let cancelled = false;
    setIsLoadingProp(true);
    setErrorProp(null);

    listProposicoes()
      .then((result) => {
        if (cancelled) return;
        setProposicoes(result.proposicoes);
        setIsLoadingProp(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorProp(err instanceof Error ? err.message : "Erro ao carregar proposições.");
        setIsLoadingProp(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Load processos ──
  useEffect(() => {
    let cancelled = false;
    setIsLoadingProc(true);
    setErrorProc(null);

    listProcessos()
      .then((result) => {
        if (cancelled) return;
        setProcessos(result.processos);
        setIsLoadingProc(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorProc(err instanceof Error ? err.message : "Erro ao carregar processos.");
        setIsLoadingProc(false);
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

  // ── Derived filter option list (tribunais) ──
  const tribunalOptions = useMemo<ReadonlyArray<readonly [string, string]>>(() => {
    const distinct = Array.from(
      new Set(
        processos
          .map((p) => p.attributes.tribunal?.trim())
          .filter((t): t is string => typeof t === "string" && t.length > 0),
      ),
    ).sort((a, b) => a.localeCompare(b, "pt-BR"));
    return [["todos", "Todos"], ...distinct.map((t) => [t, t] as const)];
  }, [processos]);

  // ── Filtered + sorted list (proposições) ──
  const filteredProp = useMemo<ProposicaoItem[]>(() => {
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

  // ── Filtered list (processos) ──
  const filteredProc = useMemo<ProcessoJudicialItem[]>(() => {
    return processos.filter((p) => {
      if (!matchesSearchProcesso(p, queryProc)) return false;
      if (tribunal !== "todos" && (p.attributes.tribunal ?? "") !== tribunal) return false;
      return true;
    });
  }, [processos, queryProc, tribunal]);

  // Reinicia as janelas ao mudar busca/filtros/ordenação.
  useEffect(() => {
    setVisibleCountProp(PAGE_SIZE);
  }, [query, tipo, ano, sortKey]);

  useEffect(() => {
    setVisibleCountProc(PAGE_SIZE);
  }, [queryProc, tribunal]);

  // Carrega mais quando o sentinela de proposições entra na viewport.
  useEffect(() => {
    const node = sentinelPropRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCountProp((current) => Math.min(current + PAGE_SIZE, filteredProp.length));
        }
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [filteredProp.length]);

  // Carrega mais quando o sentinela de processos entra na viewport.
  useEffect(() => {
    const node = sentinelProcRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCountProc((current) => Math.min(current + PAGE_SIZE, filteredProc.length));
        }
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [filteredProc.length]);

  const visibleProp = filteredProp.slice(0, visibleCountProp);
  const hasMoreProp = visibleCountProp < filteredProp.length;

  const visibleProc = filteredProc.slice(0, visibleCountProc);
  const hasMoreProc = visibleCountProc < filteredProc.length;

  function clearFiltersProp() {
    setQuery("");
    setTipo("todos");
    setAno("todos");
    setSortKey("recentes");
  }

  function clearFiltersProc() {
    setQueryProc("");
    setTribunal("todos");
  }

  const hasActiveFiltersProp =
    query !== "" || tipo !== "todos" || ano !== "todos" || sortKey !== "recentes";
  const hasActiveFiltersProc = queryProc !== "" || tribunal !== "todos";

  // ── Render ──
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div>
        <span className="eyebrow">Jurídico</span>
        <h2 className="h2" style={{ marginTop: 4 }}>
          Legislação e processos
        </h2>
        <p className="muted small" style={{ marginTop: 4, maxWidth: 560 }}>
          Proposições legislativas da Câmara dos Deputados e processos judiciais do CNJ DataJud —
          buscáveis por palavra-chave.
        </p>
      </div>

      {/* Tabs */}
      <div className="row" style={{ gap: 4, borderBottom: "1px solid var(--border)", paddingBottom: 0 }}>
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`chip${activeTab === key ? " chip--on" : ""}`}
            style={{
              fontSize: 13.5,
              padding: "8px 16px",
              borderBottom: activeTab === key ? "2px solid var(--brand-ink)" : "2px solid transparent",
              borderRadius: "6px 6px 0 0",
            }}
            aria-selected={activeTab === key}
            role="tab"
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── TAB: Proposições ── */}
      {activeTab === "proposicoes" && (
        <>
          {/* Error banner */}
          {errorProp !== null && (
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
              Erro ao carregar dados: {errorProp}
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
          {!isLoadingProp && errorProp === null && proposicoes.length > 0 && (
            <div className="row between wrap" style={{ gap: 8 }}>
              <span style={{ fontSize: 13, color: "var(--t-mid)" }}>
                <b className="num" style={{ color: "var(--t-hi)", fontVariantNumeric: "tabular-nums" }}>
                  {filteredProp.length}
                </b>{" "}
                {filteredProp.length === 1 ? "proposição encontrada" : "proposições encontradas"}
                {filteredProp.length > visibleProp.length ? ` · mostrando ${visibleProp.length}` : ""}
              </span>
              {hasActiveFiltersProp && (
                <button className="btn btn--ghost btn--sm" onClick={clearFiltersProp} type="button">
                  Limpar filtros
                </button>
              )}
            </div>
          )}

          {/* Grid / states */}
          {isLoadingProp ? (
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
          ) : errorProp !== null ? null : proposicoes.length === 0 ? (
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
          ) : filteredProp.length === 0 ? (
            <EmptyState onClear={clearFiltersProp} label="proposição" />
          ) : (
            <>
              <div
                className="grid"
                style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}
              >
                {visibleProp.map((proposicao) => (
                  <ProposicaoCard
                    key={proposicao.id}
                    proposicao={proposicao}
                    onSelect={
                      onSelectProposicao !== undefined ? () => onSelectProposicao(proposicao) : undefined
                    }
                  />
                ))}
              </div>
              {hasMoreProp && (
                <div
                  ref={sentinelPropRef}
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
        </>
      )}

      {/* ── TAB: Processos Judiciais ── */}
      {activeTab === "processos" && (
        <>
          {/* Error banner */}
          {errorProc !== null && (
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
              Erro ao carregar dados: {errorProc}
            </div>
          )}

          {/* Filter bar */}
          <div
            className="panel"
            style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 12 }}
          >
            <div className="searchbar">
              <Search size={16} style={{ color: "var(--t-low)", flexShrink: 0 }} aria-hidden="true" />
              <input
                value={queryProc}
                onChange={(e) => setQueryProc(e.target.value)}
                placeholder="Buscar por número, tribunal, classe ou assunto…"
                aria-label="Buscar processos judiciais"
              />
              {queryProc !== "" && (
                <button
                  className="btn btn--icon btn--ghost btn--sm"
                  style={{ width: 28, height: 28, flexShrink: 0 }}
                  onClick={() => setQueryProc("")}
                  type="button"
                  aria-label="Limpar busca"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              )}
            </div>

            {tribunalOptions.length > 1 && (
              <div className="row wrap" style={{ gap: 10 }}>
                <FilterSelect
                  label="Tribunal"
                  value={tribunal}
                  options={tribunalOptions}
                  onChange={setTribunal}
                />
              </div>
            )}
          </div>

          {/* Count row */}
          {!isLoadingProc && errorProc === null && processos.length > 0 && (
            <div className="row between wrap" style={{ gap: 8 }}>
              <span style={{ fontSize: 13, color: "var(--t-mid)" }}>
                <b className="num" style={{ color: "var(--t-hi)", fontVariantNumeric: "tabular-nums" }}>
                  {filteredProc.length}
                </b>{" "}
                {filteredProc.length === 1 ? "processo encontrado" : "processos encontrados"}
                {filteredProc.length > visibleProc.length ? ` · mostrando ${visibleProc.length}` : ""}
              </span>
              {hasActiveFiltersProc && (
                <button className="btn btn--ghost btn--sm" onClick={clearFiltersProc} type="button">
                  Limpar filtros
                </button>
              )}
            </div>
          )}

          {/* Grid / states */}
          {isLoadingProc ? (
            <div
              className="grid"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}
              aria-busy="true"
              aria-label="Carregando processos…"
            >
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : errorProc !== null ? null : processos.length === 0 ? (
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
              <FileText size={28} style={{ color: "var(--t-low)" }} aria-hidden="true" />
              <div style={{ fontWeight: 700, fontSize: 15 }}>Nenhum processo judicial disponível</div>
              <p className="muted small" style={{ margin: 0, maxWidth: 360 }}>
                Os processos vêm do CNJ DataJud. Aguarde a próxima coleta.
              </p>
            </div>
          ) : filteredProc.length === 0 ? (
            <EmptyState onClear={clearFiltersProc} label="processo" />
          ) : (
            <>
              <div
                className="grid"
                style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}
              >
                {visibleProc.map((processo) => (
                  <ProcessoCard key={processo.id} processo={processo} />
                ))}
              </div>
              {hasMoreProc && (
                <div
                  ref={sentinelProcRef}
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
                  Carregando mais processos…
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
