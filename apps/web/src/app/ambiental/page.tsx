import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, CalendarDays, Leaf, Loader2, MapPin, Search, User, X } from "lucide-react";
import type { IbamaInfracao } from "@fonteia/sources";
import {
  formatDataInfracao,
  formatMultaCents,
  listInfracoes,
} from "../../features/ambiental/ambiental-api";
import { FonteDots } from "../../components/ui";

// Quantos autos renderizar por vez (o scroll carrega mais sozinho).
const PAGE_SIZE = 36;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AmbientalPageProps {
  onSelectInfracao?: ((infracao: IbamaInfracao) => void) | undefined;
}

type SortKey = "data" | "multa" | "infrator";

// ─── Constants ───────────────────────────────────────────────────────────────

// Fonte oficial: IBAMA Dados Abertos. Cor própria (verde institucional ambiental).
const FONTE_DOTS_IBAMA = [
  { sigla: "IBAMA", cor: "#2FA84F", nome: "IBAMA — Dados Abertos (autos de infração)" },
];

const SORT_OPTIONS: ReadonlyArray<readonly [SortKey, string]> = [
  ["data", "Mais recentes"],
  ["multa", "Maior multa"],
  ["infrator", "Infrator (A→Z)"],
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
 * aparecer em algum campo (infrator, CPF/CNPJ, UF, município, tipo, descrição).
 */
function matchesSearch(item: IbamaInfracao, q: string): boolean {
  const query = normalizeForSearch(q);
  if (query === "") return true;
  const haystack = normalizeForSearch(
    [
      item.infrator,
      item.cpfCnpj ?? "",
      item.uf,
      item.municipio ?? "",
      item.tipoInfracao,
      item.descricao,
    ].join(" "),
  );
  return query.split(/\s+/).every((term) => haystack.includes(term));
}

// ─── Skeleton card ───────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="card card--pad" aria-hidden="true">
      <div className="skeleton" style={{ height: 12, width: "30%", marginBottom: 12 }} />
      <div className="skeleton" style={{ height: 16, width: "72%", marginBottom: 10 }} />
      <div className="skeleton" style={{ height: 11, width: "52%", marginBottom: 8 }} />
      <div className="skeleton" style={{ height: 11, width: "42%" }} />
    </div>
  );
}

// ─── Infração card ─────────────────────────────────────────────────────────────

interface InfracaoCardProps {
  infracao: IbamaInfracao;
  onSelect: (() => void) | undefined;
}

function InfracaoCard({ infracao, onSelect }: InfracaoCardProps) {
  const cardLabel = `Auto de infração — ${infracao.infrator}${
    infracao.uf ? `/${infracao.uf}` : ""
  }`;
  const temMulta = infracao.valorMultaCents !== undefined && infracao.valorMultaCents > 0;
  // CNPJ tem 14 dígitos -> pessoa jurídica; senão tratamos como pessoa física.
  const digits = (infracao.cpfCnpj ?? "").replace(/\D/g, "");
  const isPj = digits.length > 11;
  const InfratorIcon = isPj ? Building2 : User;

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
        {/* Top: UF + tipo de infração */}
        <div className="row between" style={{ gap: 8, alignItems: "center" }}>
          <span className="badge badge--neutral" style={{ flexShrink: 0 }}>
            {infracao.uf || "—"}
          </span>
          <span
            className="tiny muted"
            style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            title={infracao.tipoInfracao}
          >
            {infracao.tipoInfracao}
          </span>
        </div>

        {/* Infrator — identidade do auto */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <InfratorIcon
            size={15}
            style={{ flexShrink: 0, marginTop: 3, color: "var(--t-low)" }}
            aria-hidden="true"
          />
          <div
            style={{
              fontSize: 15.5,
              fontWeight: 800,
              color: "var(--t-hi)",
              lineHeight: 1.3,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
            title={infracao.infrator}
          >
            {infracao.infrator || "Infrator não informado"}
          </div>
        </div>

        {/* Localização: município + UF */}
        <div className="tiny muted" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <MapPin size={13} style={{ flexShrink: 0 }} aria-hidden="true" />
          <span
            style={{
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {infracao.municipio ? `${infracao.municipio}` : "Município não informado"}
            {infracao.uf ? ` · ${infracao.uf}` : ""}
          </span>
        </div>

        {/* Descrição curta (quando houver) */}
        {infracao.descricao !== "" && (
          <p
            className="tiny muted"
            style={{
              margin: 0,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              lineHeight: 1.4,
            }}
            title={infracao.descricao}
          >
            {infracao.descricao}
          </p>
        )}

        {/* Rodapé: multa + data + fonte */}
        <div
          className="row between"
          style={{ gap: 8, marginTop: "auto", paddingTop: 4, alignItems: "center" }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <span
              className="num"
              style={{
                fontSize: 15,
                fontWeight: 800,
                fontVariantNumeric: "tabular-nums",
                color: temMulta ? "var(--t-hi)" : "var(--t-low)",
              }}
            >
              {formatMultaCents(infracao.valorMultaCents)}
            </span>
            <span
              className="tiny muted"
              style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
            >
              <CalendarDays size={11} style={{ flexShrink: 0 }} aria-hidden="true" />
              {formatDataInfracao(infracao.data)}
            </span>
          </div>
          <FonteDots fontes={FONTE_DOTS_IBAMA} size={20} />
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
      <div style={{ fontWeight: 700, fontSize: 15 }}>Nenhum auto de infração com esses filtros</div>
      <p className="muted small" style={{ margin: 0, maxWidth: 340 }}>
        Tente ampliar a busca ou trocar a UF.
      </p>
      <button className="btn btn--ghost btn--sm" onClick={onClear} type="button">
        Limpar filtros
      </button>
    </div>
  );
}

// ─── Source empty state (degradação elegante quando não há dados) ──────────────

function SourceEmptyState() {
  return (
    <div
      className="panel"
      role="status"
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
        <Leaf size={28} />
      </div>
      <div style={{ fontWeight: 700, fontSize: 15 }}>
        Nenhum auto de infração disponível no momento
      </div>
      <p className="muted small" style={{ margin: 0, maxWidth: 380 }}>
        A coleta do IBAMA roda periodicamente. Volte em breve ou aguarde a próxima sincronização.
      </p>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function AmbientalPage({ onSelectInfracao }: AmbientalPageProps) {
  // ── Data state ──
  const [infracoes, setInfracoes] = useState<IbamaInfracao[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // ── Filter/sort state ──
  const [query, setQuery] = useState("");
  const [uf, setUf] = useState("todas");
  const [sortKey, setSortKey] = useState<SortKey>("data");

  // ── Paginação por scroll ──
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // ── Retry: incrementar recarrega os dados sem F5 na página ──
  const [reloadKey, setReloadKey] = useState(0);

  // ── Load data ──
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setErrorMessage(null);

    listInfracoes()
      .then((result) => {
        if (cancelled) return;
        setInfracoes(result.infracoes);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (import.meta.env.DEV) console.error("[ambiental] falha ao carregar:", err);
        setErrorMessage("Não foi possível carregar os autos de infração. Verifique sua conexão e tente novamente.");
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // ── Derived filter option list (UFs) ──
  const ufOptions = useMemo<ReadonlyArray<readonly [string, string]>>(() => {
    const distinct = Array.from(
      new Set(
        infracoes
          .map((m) => m.uf?.trim())
          .filter((u): u is string => typeof u === "string" && u.length > 0),
      ),
    ).sort((a, b) => a.localeCompare(b, "pt-BR"));
    return [["todas", "Todas"], ...distinct.map((u) => [u, u] as const)];
  }, [infracoes]);

  // ── Filtered + sorted list ──
  const filtered = useMemo<IbamaInfracao[]>(() => {
    const list = infracoes.filter((m) => {
      if (!matchesSearch(m, query)) return false;
      if (uf !== "todas" && m.uf !== uf) return false;
      return true;
    });

    return [...list].sort((a, b) => {
      if (sortKey === "multa") {
        const av = a.valorMultaCents ?? 0;
        const bv = b.valorMultaCents ?? 0;
        if (bv !== av) return bv - av;
        return a.infrator.localeCompare(b.infrator, "pt-BR");
      }
      if (sortKey === "infrator") {
        return a.infrator.localeCompare(b.infrator, "pt-BR");
      }
      // "data" (desc) — string ISO ordena lexicograficamente.
      return (b.data ?? "").localeCompare(a.data ?? "");
    });
  }, [infracoes, query, uf, sortKey]);

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
    setSortKey("data");
  }

  const hasActiveFilters = query !== "" || uf !== "todas" || sortKey !== "data";

  // ── Render ──
  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div>
        <span className="eyebrow">Ambiental</span>
        <h2 className="h2" style={{ marginTop: 4 }}>
          Autos de Infração Ambiental
        </h2>
        <p className="muted small" style={{ marginTop: 4, maxWidth: 600 }}>
          Amostra recente de autos de infração ambiental lavrados pelo IBAMA (Dados Abertos), com
          infrator, CPF/CNPJ, UF, município, tipo de infração e valor da multa.
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
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            fontSize: 13.5,
            fontWeight: 600,
          }}
          role="alert"
        >
          <span>{errorMessage}</span>
          <button
            className="btn btn--ghost btn--sm"
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            style={{ flexShrink: 0 }}
          >
            Tentar novamente
          </button>
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
            placeholder="Buscar por infrator, CPF/CNPJ, município ou tipo…"
            aria-label="Buscar autos de infração"
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
      {!isLoading && errorMessage === null && infracoes.length > 0 && (
        <div className="row between wrap" style={{ gap: 8 }}>
          <span style={{ fontSize: 13, color: "var(--t-mid)" }}>
            <b className="num" style={{ color: "var(--t-hi)", fontVariantNumeric: "tabular-nums" }}>
              {filtered.length}
            </b>{" "}
            {filtered.length === 1 ? "auto encontrado" : "autos encontrados"}
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
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}
          aria-busy="true"
          aria-label="Carregando autos de infração…"
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : errorMessage !== null ? null : infracoes.length === 0 ? (
        <SourceEmptyState />
      ) : filtered.length === 0 ? (
        <EmptyState onClear={clearFilters} />
      ) : (
        <>
          <div
            className="grid"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}
          >
            {visible.map((infracao) => (
              <InfracaoCard
                key={infracao.id}
                infracao={infracao}
                onSelect={
                  onSelectInfracao !== undefined ? () => onSelectInfracao(infracao) : undefined
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
              Carregando mais autos…
            </div>
          )}
        </>
      )}
    </div>
  );
}
