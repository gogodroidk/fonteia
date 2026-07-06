import { useEffect, useMemo, useRef, useState } from "react";
import type { PncpLicitacao } from "@fonteia/sources";
import { Building2, ExternalLink, Loader2, MapPin, Search, X } from "lucide-react";
import { listLicitacoes } from "../../features/licitacoes/licitacoes-api";
import { FonteDots } from "../../components/ui";
import { formatBRLc, FONTES } from "../../data/leiloes-seed";
import { CreateAlertButton } from "../../components/alerts/CreateAlertButton";
import { ReportButton } from "../../components/report/ReportButton";
import type { SavedReport } from "../../features/reports/reports-store";

// Quantas licitações renderizar por vez (o scroll carrega mais sozinho).
const PAGE_SIZE = 24;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LicitacoesPageProps {
  onSelectLicitacao?: ((licitacao: PncpLicitacao) => void) | undefined;
}

type SortKey = "prazo" | "publicacao" | "valor";
type StatusFilter = "todas" | "abertas" | "encerradas";

// ─── Constants ───────────────────────────────────────────────────────────────

// Fonte oficial: PNCP (Compras.gov / MGI). Reaproveita a cor "compras" do catálogo.
const PNCP_FONTE = FONTES.find((f) => f.id === "compras") ?? {
  id: "pncp",
  nome: "Portal Nacional de Contratações Públicas",
  sigla: "PNCP",
  cor: "#C2557D",
};

const FONTE_DOTS_PNCP = [
  { sigla: "PNCP", cor: PNCP_FONTE.cor, nome: "Portal Nacional de Contratações Públicas" },
];

const SORT_OPTIONS: ReadonlyArray<readonly [SortKey, string]> = [
  ["prazo", "Encerrando antes"],
  ["publicacao", "Publicadas há menos tempo"],
  ["valor", "Maior valor"],
];

const STATUS_OPTIONS: ReadonlyArray<readonly [StatusFilter, string]> = [
  ["todas", "Todas"],
  ["abertas", "Abertas"],
  ["encerradas", "Encerradas"],
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

function formatDateShort(value: string): string {
  if (value === "") return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Dias até a data (negativo = passou). Number.NaN-safe. */
function daysUntil(value: string): number {
  if (value === "") return Number.NaN;
  const ms = new Date(value).getTime() - Date.now();
  if (Number.isNaN(ms)) return Number.NaN;
  return Math.ceil(ms / 86_400_000);
}

function isEncerrada(licitacao: PncpLicitacao): boolean {
  const days = daysUntil(licitacao.dataEncerramento);
  return !Number.isNaN(days) && days < 0;
}

function deadlineColor(days: number): string {
  if (Number.isNaN(days)) return "var(--t-low)";
  if (days < 0) return "var(--danger)";
  if (days <= 3) return "var(--warn)";
  return "var(--t-mid)";
}

function deadlineLabel(value: string): string {
  if (value === "") return "Prazo não informado";
  const days = daysUntil(value);
  if (Number.isNaN(days)) return formatDateShort(value);
  if (days < 0) return "Encerrada";
  if (days === 0) return "Encerra hoje";
  if (days === 1) return "Encerra amanhã";
  return `${formatDateShort(value)} · ${days}d`;
}

/**
 * Busca por múltiplos termos (AND), tolerante a acento: cada termo precisa aparecer
 * em algum campo (objeto, órgão, unidade, modalidade, município, UF, nº da compra).
 */
function matchesSearch(licitacao: PncpLicitacao, q: string): boolean {
  const query = normalizeForSearch(q);
  if (query === "") return true;
  const haystack = normalizeForSearch(
    [
      licitacao.objeto,
      licitacao.orgao,
      licitacao.unidade ?? "",
      licitacao.modalidade,
      licitacao.municipio ?? "",
      licitacao.uf ?? "",
      licitacao.numeroCompra ?? "",
      licitacao.numeroControlePNCP,
    ].join(" "),
  );
  return query.split(/\s+/).every((term) => haystack.includes(term));
}

// ─── CSV export ──────────────────────────────────────────────────────────────

function escapeCsvCell(value: string): string {
  const escaped = value.replace(/"/g, '""');
  if (escaped.includes(";") || escaped.includes('"') || escaped.includes("\n")) {
    return `"${escaped}"`;
  }
  return escaped;
}

function exportCsv(licitacoes: PncpLicitacao[]): void {
  const BOM = "﻿";
  const headers = [
    "Órgão",
    "Unidade",
    "Município",
    "UF",
    "Modalidade",
    "Objeto",
    "Valor estimado (R$)",
    "Abertura",
    "Encerramento",
    "Status",
    "Link",
  ];

  const rows = licitacoes.map((l) => {
    const status = isEncerrada(l) ? "Encerrada" : "Aberta";
    const valor =
      l.valorEstimadoCents > 0 ? (l.valorEstimadoCents / 100).toFixed(2).replace(".", ",") : "";
    return [
      l.orgao,
      l.unidade ?? "",
      l.municipio ?? "",
      l.uf ?? "",
      l.modalidade,
      l.objeto,
      valor,
      formatDateShort(l.dataAbertura),
      formatDateShort(l.dataEncerramento),
      status,
      l.sourceUrl,
    ]
      .map(escapeCsvCell)
      .join(";");
  });

  const content = BOM + [headers.map(escapeCsvCell).join(";"), ...rows].join("\r\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `licitacoes-fonteia-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Report builder ──────────────────────────────────────────────────────────

/** Monta um SavedReport rastreável a partir de uma licitação (fonte: PNCP). */
function buildLicitacaoReport(licitacao: PncpLicitacao): SavedReport {
  const local =
    licitacao.municipio != null && licitacao.municipio !== ""
      ? `${licitacao.municipio}${licitacao.uf ? `/${licitacao.uf}` : ""}`
      : licitacao.ufNome ?? licitacao.uf ?? "Brasil";

  const fields: SavedReport["fields"] = [
    { label: "Órgão", value: licitacao.orgao },
    ...(licitacao.unidade != null && licitacao.unidade !== ""
      ? [{ label: "Unidade", value: licitacao.unidade }]
      : []),
    { label: "Objeto", value: licitacao.objeto || "Não informado" },
    { label: "Modalidade", value: licitacao.modalidade },
    { label: "Local", value: local },
    ...(licitacao.valorEstimadoCents > 0
      ? [{ label: "Valor estimado", value: formatBRLc(licitacao.valorEstimadoCents / 100) }]
      : []),
    { label: "Abertura", value: formatDateShort(licitacao.dataAbertura) },
    { label: "Encerramento", value: formatDateShort(licitacao.dataEncerramento) },
    { label: "Status", value: isEncerrada(licitacao) ? "Encerrada" : "Aberta" },
    { label: "Nº controle PNCP", value: licitacao.numeroControlePNCP },
  ];

  return {
    id: `licitacao:${licitacao.numeroControlePNCP}`,
    kind: "licitacao",
    kindLabel: "Licitação (PNCP)",
    title: licitacao.objeto || licitacao.orgao || "Licitação",
    subtitle: `${licitacao.orgao} — ${local}`,
    fields,
    sources: [
      {
        label: "PNCP — Portal Nacional de Contratações Públicas",
        url: licitacao.sourceUrl,
        collectedAt: licitacao.collectedAt,
      },
    ],
    createdAt: new Date().toISOString(),
  };
}

// ─── Skeleton card ───────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="card card--pad" aria-hidden="true">
      <div className="skeleton" style={{ height: 12, width: "30%", marginBottom: 12 }} />
      <div className="skeleton" style={{ height: 14, width: "85%", marginBottom: 8 }} />
      <div className="skeleton" style={{ height: 14, width: "70%", marginBottom: 14 }} />
      <div className="skeleton" style={{ height: 11, width: "45%", marginBottom: 8 }} />
      <div className="skeleton" style={{ height: 11, width: "55%" }} />
    </div>
  );
}

// ─── Licitação card ──────────────────────────────────────────────────────────

interface LicitacaoCardProps {
  licitacao: PncpLicitacao;
  onSelect: (() => void) | undefined;
}

function LicitacaoCard({ licitacao, onSelect }: LicitacaoCardProps) {
  const encerrada = isEncerrada(licitacao);
  const days = daysUntil(licitacao.dataEncerramento);
  const local =
    licitacao.municipio != null && licitacao.municipio !== ""
      ? `${licitacao.municipio}${licitacao.uf ? `/${licitacao.uf}` : ""}`
      : licitacao.ufNome ?? licitacao.uf ?? "Brasil";
  const cardLabel = `Licitação — ${licitacao.orgao}: ${licitacao.objeto.slice(0, 80)}`;

  return (
    <article
      className="card card--hover"
      style={{
        overflow: "hidden",
        cursor: onSelect ? "pointer" : "default",
        display: "flex",
        flexDirection: "column",
        // Não esmaecer o card inteiro (derrubava o contraste do texto abaixo do AA).
        // O estado "encerrada" já é sinalizado pelo selo vermelho e pela cor do prazo.
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
      // Só anuncia o card como "botão" quando ele é de fato acionável (onSelect).
      // Sem destino, é um <article> estático — não prometer uma ação inexistente.
      aria-label={onSelect ? cardLabel : undefined}
    >
      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
        {/* Top: modalidade + status */}
        <div className="row between" style={{ gap: 8, alignItems: "center" }}>
          <span
            className="badge badge--neutral"
            style={{
              maxWidth: "70%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {licitacao.modalidade}
          </span>
          {encerrada ? (
            <span
              className="badge"
              style={{
                background: "color-mix(in srgb, var(--danger) 16%, var(--surface))",
                color: "var(--danger)",
                fontWeight: 700,
                fontSize: 10.5,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                flexShrink: 0,
              }}
            >
              Encerrada
            </span>
          ) : (
            <span
              className="badge badge--ok"
              style={{ fontSize: 10.5, fontWeight: 700, flexShrink: 0 }}
            >
              Aberta
            </span>
          )}
        </div>

        {/* Objeto — identidade da licitação */}
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "var(--t-hi)",
            lineHeight: 1.4,
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
          title={licitacao.objeto}
        >
          {licitacao.objeto || "Objeto não informado"}
        </div>

        {/* Órgão + unidade */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              fontWeight: 600,
              color: "var(--t-hi)",
            }}
          >
            <Building2 size={14} style={{ flexShrink: 0, color: "var(--t-low)" }} aria-hidden="true" />
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {licitacao.orgao}
            </span>
          </div>
          {licitacao.unidade != null && licitacao.unidade !== "" && licitacao.unidade !== licitacao.orgao && (
            <div
              className="tiny muted"
              style={{
                marginLeft: 20,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {licitacao.unidade}
            </div>
          )}
          <div
            className="tiny muted"
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <MapPin size={13} style={{ flexShrink: 0 }} aria-hidden="true" />
            {local}
          </div>
        </div>

        {/* Valor estimado */}
        {licitacao.valorEstimadoCents > 0 && (
          <div>
            <div className="tiny muted" style={{ marginBottom: 2 }}>
              Valor estimado
            </div>
            <div className="num" style={{ fontSize: 16, fontWeight: 800, color: "var(--t-hi)" }}>
              {formatBRLc(licitacao.valorEstimadoCents / 100)}
            </div>
          </div>
        )}

        {/* Footer: prazo + fonte */}
        <div
          className="row between"
          style={{ gap: 6, marginTop: "auto", paddingTop: 4, alignItems: "center" }}
        >
          <div className="tiny" style={{ fontWeight: 600, color: deadlineColor(days) }}>
            {deadlineLabel(licitacao.dataEncerramento)}
          </div>
          <FonteDots fontes={FONTE_DOTS_PNCP} size={20} />
        </div>

        {/* Retenção: alerta + relatório (frontend-only; não bloqueiam o clique no card) */}
        <div
          className="row wrap"
          style={{ gap: 8, alignItems: "center" }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          role="presentation"
        >
          <CreateAlertButton
            kind="licitacao"
            entityRef={licitacao.numeroControlePNCP}
            entityLabel={`${licitacao.orgao} — ${licitacao.objeto.slice(0, 80)}`}
            size="sm"
            variant="soft"
          />
          <ReportButton report={buildLicitacaoReport(licitacao)} label="Salvar" />
        </div>

        {/* Link oficial */}
        <a
          href={licitacao.sourceUrl}
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
          Ver no PNCP
          <ExternalLink size={12} aria-hidden="true" />
        </a>
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
      <div style={{ fontWeight: 700, fontSize: 15 }}>Nenhuma licitação com esses filtros</div>
      <p className="muted small" style={{ margin: 0, maxWidth: 340 }}>
        Tente ampliar a busca, trocar a modalidade ou a UF, ou incluir as encerradas.
      </p>
      <button className="btn btn--ghost btn--sm" onClick={onClear} type="button">
        Limpar filtros
      </button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function LicitacoesPage({ onSelectLicitacao }: LicitacoesPageProps) {
  // ── Data state ──
  const [licitacoes, setLicitacoes] = useState<PncpLicitacao[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // ── Filter/sort state ──
  const [query, setQuery] = useState("");
  const [modalidade, setModalidade] = useState("todas");
  const [uf, setUf] = useState("todas");
  const [status, setStatus] = useState<StatusFilter>("abertas");
  const [sortKey, setSortKey] = useState<SortKey>("prazo");

  // ── Paginação por scroll ──
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // ── Retry: incrementar reexecuta o efeito de carga sem recarregar a página ──
  const [reloadKey, setReloadKey] = useState(0);

  // ── Load data ──
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setErrorMessage(null);

    listLicitacoes()
      .then((result) => {
        if (cancelled) return;
        setLicitacoes(result.licitacoes);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (import.meta.env.DEV) console.error("[licitacoes] falha ao carregar:", err);
        setErrorMessage("Não foi possível carregar as licitações. Verifique sua conexão e tente novamente.");
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // ── Derived filter option lists ──
  const modalidadeOptions = useMemo<ReadonlyArray<readonly [string, string]>>(() => {
    const distinct = Array.from(
      new Set(
        licitacoes
          .map((l) => l.modalidade?.trim())
          .filter((m): m is string => typeof m === "string" && m.length > 0),
      ),
    ).sort((a, b) => a.localeCompare(b, "pt-BR"));
    return [["todas", "Todas"], ...distinct.map((m) => [m, m] as const)];
  }, [licitacoes]);

  const ufOptions = useMemo<ReadonlyArray<readonly [string, string]>>(() => {
    const distinct = Array.from(
      new Set(
        licitacoes
          .map((l) => l.uf?.trim())
          .filter((u): u is string => typeof u === "string" && u.length > 0),
      ),
    ).sort((a, b) => a.localeCompare(b, "pt-BR"));
    return [["todas", "Todas"], ...distinct.map((u) => [u, u] as const)];
  }, [licitacoes]);

  // ── Filtered + sorted list ──
  const filtered = useMemo<PncpLicitacao[]>(() => {
    const list = licitacoes.filter((l) => {
      if (!matchesSearch(l, query)) return false;
      if (modalidade !== "todas" && l.modalidade !== modalidade) return false;
      if (uf !== "todas" && l.uf !== uf) return false;
      if (status !== "todas") {
        const encerrada = isEncerrada(l);
        if (status === "abertas" && encerrada) return false;
        if (status === "encerradas" && !encerrada) return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      if (sortKey === "valor") return b.valorEstimadoCents - a.valorEstimadoCents;
      if (sortKey === "publicacao") {
        return new Date(b.dataPublicacao).getTime() - new Date(a.dataPublicacao).getTime();
      }
      // prazo: encerramentos mais próximos primeiro; sem data vai para o fim.
      const da = new Date(a.dataEncerramento).getTime();
      const db = new Date(b.dataEncerramento).getTime();
      const aNa = Number.isNaN(da);
      const bNa = Number.isNaN(db);
      if (aNa && bNa) return 0;
      if (aNa) return 1;
      if (bNa) return -1;
      return da - db;
    });
  }, [licitacoes, query, modalidade, uf, status, sortKey]);

  // Reinicia a janela ao mudar busca/filtros/ordenação.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query, modalidade, uf, status, sortKey]);

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
    setModalidade("todas");
    setUf("todas");
    setStatus("abertas");
    setSortKey("prazo");
  }

  const hasActiveFilters =
    query !== "" || modalidade !== "todas" || uf !== "todas" || status !== "abertas";

  // ── Render ──
  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div>
        <span className="eyebrow">Contratações públicas</span>
        <h2 className="h2" style={{ marginTop: 4 }}>
          Licitações do PNCP
        </h2>
        <p className="muted small" style={{ marginTop: 4, maxWidth: 560 }}>
          Editais e contratações publicadas no Portal Nacional de Contratações Públicas, com órgão,
          objeto, valor estimado e prazo — direto da fonte oficial.
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
            placeholder="Buscar por objeto, órgão, município ou modalidade…"
            aria-label="Buscar licitações"
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
          <FilterSelect label="Status" value={status} options={STATUS_OPTIONS} onChange={setStatus} />
          {modalidadeOptions.length > 1 && (
            <FilterSelect
              label="Modalidade"
              value={modalidade}
              options={modalidadeOptions}
              onChange={setModalidade}
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
      {!isLoading && errorMessage === null && licitacoes.length > 0 && (
        <div className="row between wrap" style={{ gap: 8 }}>
          <span style={{ fontSize: 13, color: "var(--t-mid)" }}>
            <b className="num" style={{ color: "var(--t-hi)", fontVariantNumeric: "tabular-nums" }}>
              {filtered.length}
            </b>{" "}
            {filtered.length === 1 ? "licitação encontrada" : "licitações encontradas"}
            {filtered.length > visible.length ? ` · mostrando ${visible.length}` : ""}
          </span>
          <div className="row wrap" style={{ gap: 8 }}>
            {filtered.length > 0 && (
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => exportCsv(filtered)}
                type="button"
                title="Baixar CSV com as licitações filtradas"
              >
                Exportar CSV
              </button>
            )}
            {hasActiveFilters && (
              <button className="btn btn--ghost btn--sm" onClick={clearFilters} type="button">
                Limpar filtros
              </button>
            )}
          </div>
        </div>
      )}

      {/* Grid / states */}
      {isLoading ? (
        <div
          className="grid"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}
          aria-busy="true"
          aria-label="Carregando licitações…"
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : errorMessage !== null ? null : licitacoes.length === 0 ? (
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
          <div style={{ fontWeight: 700, fontSize: 15 }}>Nenhuma licitação disponível no momento</div>
          <p className="muted small" style={{ margin: 0, maxWidth: 360 }}>
            A coleta do PNCP roda periodicamente. Volte em breve ou aguarde a próxima sincronização.
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
            {visible.map((licitacao) => (
              <LicitacaoCard
                key={licitacao.id}
                licitacao={licitacao}
                onSelect={
                  onSelectLicitacao !== undefined ? () => onSelectLicitacao(licitacao) : undefined
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
              Carregando mais licitações…
            </div>
          )}
        </>
      )}
    </div>
  );
}
