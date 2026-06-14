import { useEffect, useMemo, useRef, useState } from "react";
import type { ReceitaLeilaoLot } from "@fonteia/sources";
import { lotEconomia, scoreReceitaLeilaoLot } from "@fonteia/scoring";
import type { LeilaoOpportunityScore, LotEconomia } from "@fonteia/scoring";
import { ChevronDown, ChevronUp, Heart, Layers, LayoutList, Loader2, Search, Tag, X } from "lucide-react";
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
type StatusFilter = "todos" | "abertos" | "encerrados";
type ViewMode = "editais" | "lotes";

interface LotView {
  lot: ReceitaLeilaoLot;
  scoring: LeilaoOpportunityScore;
  economia: LotEconomia | null;
}

interface EditalGroup {
  edle: string;
  edital: string;
  city: string;
  agency: string;
  /** Earliest deadline among lots in the group. */
  earliestDeadline: string;
  categories: string[];
  views: LotView[];
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

const STATUS_OPTIONS: ReadonlyArray<readonly [StatusFilter, string]> = [
  ["todos", "Todos"],
  ["abertos", "Abertos"],
  ["encerrados", "Encerrados"],
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

// ─── CSV export ──────────────────────────────────────────────────────────────

function escapeCsvCell(value: string): string {
  // Wrap in quotes if value contains ; " or newline; always escape internal quotes.
  const escaped = value.replace(/"/g, '""');
  if (escaped.includes(";") || escaped.includes('"') || escaped.includes("\n")) {
    return `"${escaped}"`;
  }
  return escaped;
}

function exportCsv(views: LotView[]): void {
  const BOM = "﻿";
  const headers = [
    "Cidade",
    "Órgão",
    "Edital",
    "Lote",
    "Categoria",
    "Lance mínimo (R$)",
    "Avaliação (R$)",
    "Desconto (%)",
    "Prazo",
    "Status",
    "Link",
  ];

  const rows = views.map(({ lot, economia }) => {
    const days = daysUntil(lot.proposalDeadline);
    const status = days < 0 ? "Encerrado" : "Aberto";
    const lanceMinimoVal = (lot.minimumBidCents / 100).toFixed(2).replace(".", ",");
    const avaliacaoVal =
      economia !== null
        ? (economia.avaliacaoCents / 100).toFixed(2).replace(".", ",")
        : "";
    const descontoPct =
      economia !== null ? String(economia.descontoPct).replace(".", ",") : "";

    return [
      displayCity(lot.city),
      lot.agency,
      lot.edital,
      lot.displayNumber,
      lot.category ?? "",
      lanceMinimoVal,
      avaliacaoVal,
      descontoPct,
      formatDeadlineShort(lot.proposalDeadline),
      status,
      lot.sourceUrl ?? "",
    ]
      .map(escapeCsvCell)
      .join(";");
  });

  const content = BOM + [headers.map(escapeCsvCell).join(";"), ...rows].join("\r\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `lotes-fonteia-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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

function SkeletonEdital() {
  return (
    <div className="card card--pad" aria-hidden="true" style={{ padding: "18px 20px" }}>
      <div className="skeleton" style={{ height: 14, width: "45%", marginBottom: 10 }} />
      <div className="skeleton" style={{ height: 11, width: "65%", marginBottom: 8 }} />
      <div className="skeleton" style={{ height: 10, width: "30%" }} />
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
      className="heart-btn"
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
        // Scrim via token (--bg) em vez de hex fixo; 70% garante contraste do ícone
        // branco mesmo sobre o gradiente claro (lotes sem foto).
        background: "color-mix(in srgb, var(--bg) 70%, transparent)",
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
  editalCount: number;
  onFilterByEdital: (edital: string) => void;
}

function LotCard({ view, watched, onToggleWatch, onSelect, editalCount, onFilterByEdital }: LotCardProps) {
  const { lot, scoring, economia } = view;
  const badge = confidenceBadge(scoring.label);
  const days = daysUntil(lot.proposalDeadline);
  const isEncerrado = days < 0;
  const cardLabel = `Lote ${lot.displayNumber} — ${lot.agency}, ${displayCity(lot.city)}`;
  const [imgLoaded, setImgLoaded] = useState(false);

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
          background: "linear-gradient(135deg, #1a2e52, #0c1c3a)",
          position: "relative",
          display: "flex",
          alignItems: "flex-end",
          padding: "10px 12px",
        }}
      >
        {/* Lazy-loaded cover image — fade in once loaded */}
        {lot.imageUrl !== undefined && lot.imageUrl !== "" && (
          <img
            src={lot.imageUrl}
            alt={`Foto do lote ${lot.displayNumber} — ${lot.category ?? lot.agency}`}
            loading="lazy"
            decoding="async"
            onLoad={() => setImgLoaded(true)}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
              opacity: imgLoaded ? 1 : 0,
              transition: "opacity 0.4s ease",
            }}
          />
        )}

        {/* "Encerrado" seal — top-right corner when encerrado (below the heart so heart stays clickable) */}
        {isEncerrado && (
          <span
            aria-label="Lote encerrado"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              background: "color-mix(in srgb, var(--danger) 88%, #000)",
              color: "#fff",
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              padding: "3px 8px",
              borderBottomRightRadius: "var(--r-sm)",
              zIndex: 3,
            }}
          >
            Encerrado
          </span>
        )}

        {/* Heart toggle — top right; zIndex above img and seal */}
        <div style={{ position: "absolute", top: 0, right: 0, zIndex: 4 }}>
          <HeartButton watched={watched} onToggle={onToggleWatch} lotLabel={`lote ${lot.displayNumber}`} />
        </div>

        {/* A categoria aparece na linha de identidade do corpo (abaixo) — não
            repetimos o chip sobre a foto para evitar a categoria renderizada 2x. */}

        {/* Desconto ribbon — bottom left, only when honest economia exists */}
        {economia && (
          <span
            className="badge"
            style={{
              background: "var(--accent)",
              color: "#04231F",
              fontWeight: 800,
              boxShadow: "var(--shadow-sm)",
              position: "relative",
              zIndex: 2,
            }}
          >
            −{economia.descontoPct}% vs. avaliação
          </span>
        )}

        {/* Score ring on the gradient when there is no photo */}
        {(lot.imageUrl === undefined || lot.imageUrl === "") && (
          <div style={{ position: "absolute", bottom: 10, right: 12, zIndex: 2 }}>
            <ScoreRing value={scoring.score} size={48} />
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Category — "o que é": prominent identity line when available */}
        {lot.category != null && lot.category !== "" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 800,
                color: "var(--t-hi)",
                textTransform: "capitalize",
                letterSpacing: "0.01em",
              }}
            >
              {lot.category.toLowerCase()}
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--t-low)",
                fontFamily: "monospace",
              }}
            >
              Lote {lot.displayNumber}
            </span>
          </div>
        ) : (
          <div
            style={{
              fontSize: 11.5,
              fontWeight: 600,
              color: "var(--t-low)",
              fontFamily: "monospace",
            }}
          >
            Lote {lot.displayNumber}
          </div>
        )}

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
            <div
              className="tiny muted"
              style={{ marginTop: 1, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}
            >
              <span style={{ fontFamily: "monospace" }}>{lot.edital}</span>
              {editalCount > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFilterByEdital(lot.edital);
                  }}
                  title={`Filtrar pelos ${editalCount} lotes deste edital`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 3,
                    padding: "1px 6px",
                    border: "1px solid color-mix(in srgb, var(--brand-ink) 30%, transparent)",
                    borderRadius: 99,
                    background: "color-mix(in srgb, var(--brand-ink) 10%, transparent)",
                    color: "var(--brand-ink)",
                    fontSize: 10,
                    fontWeight: 700,
                    cursor: "pointer",
                    lineHeight: 1.5,
                    letterSpacing: "0.02em",
                    fontFamily: "inherit",
                    flexShrink: 0,
                  }}
                  aria-label={`${editalCount} lotes neste edital — clique para filtrar`}
                >
                  +{editalCount - 1} neste edital
                </button>
              )}
            </div>
          </div>
          {lot.imageUrl !== undefined && lot.imageUrl !== "" && (
            <ScoreRing value={scoring.score} size={44} />
          )}
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

// ─── Edital card ─────────────────────────────────────────────────────────────

interface EditalCardProps {
  group: EditalGroup;
  isExpanded: boolean;
  onToggle: () => void;
  watchIds: string[];
  onToggleWatch: (id: string) => void;
  onSelectLot: ((lot: ReceitaLeilaoLot) => void) | undefined;
  editalCountMap: ReadonlyMap<string, number>;
  onFilterByEdital: (edital: string) => void;
}

function EditalCard({
  group,
  isExpanded,
  onToggle,
  watchIds,
  onToggleWatch,
  onSelectLot,
  editalCountMap,
  onFilterByEdital,
}: EditalCardProps) {
  const days = daysUntil(group.earliestDeadline);
  const allEncerrado = group.views.every((v) => daysUntil(v.lot.proposalDeadline) < 0);
  const watchedCount = group.views.filter((v) => watchIds.includes(v.lot.id)).length;

  return (
    <div
      className="card"
      style={{
        overflow: "hidden",
        border: isExpanded
          ? "1.5px solid color-mix(in srgb, var(--brand-ink) 40%, transparent)"
          : undefined,
      }}
    >
      {/* Header row — clickable to expand */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-label={`${isExpanded ? "Recolher" : "Expandir"} edital ${group.edital}`}
        style={{
          display: "flex",
          width: "100%",
          alignItems: "flex-start",
          gap: 14,
          padding: "16px 18px",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          color: "inherit",
          fontFamily: "inherit",
        }}
      >
        {/* Left: icon area */}
        <div
          aria-hidden="true"
          style={{
            width: 40,
            height: 40,
            flexShrink: 0,
            borderRadius: "var(--r-md)",
            background: allEncerrado
              ? "color-mix(in srgb, var(--danger) 12%, var(--surface))"
              : "color-mix(in srgb, var(--brand-ink) 12%, var(--surface))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: allEncerrado ? "var(--danger)" : "var(--brand-ink)",
          }}
        >
          <Layers size={20} />
        </div>

        {/* Center: text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 800,
                color: "var(--t-hi)",
                fontFamily: "monospace",
              }}
            >
              {group.edital}
            </span>
            {allEncerrado && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "var(--danger)",
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                }}
              >
                Encerrado
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--t-hi)",
              marginTop: 2,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {displayCity(group.city)}
          </div>
          <div
            className="tiny muted"
            style={{
              marginTop: 1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {group.agency}
          </div>

          {/* Meta row */}
          <div
            style={{
              marginTop: 8,
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            {/* Lot count badge */}
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 8px",
                borderRadius: 99,
                background: "color-mix(in srgb, var(--brand-ink) 12%, transparent)",
                color: "var(--brand-ink)",
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {group.views.length} {group.views.length === 1 ? "lote" : "lotes"}
            </span>

            {/* Watchlist count */}
            {watchedCount > 0 && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#FF5A7A",
                }}
              >
                <Heart size={11} fill="#FF5A7A" strokeWidth={0} />
                {watchedCount}
              </span>
            )}

            {/* Categories */}
            {group.categories.slice(0, 3).map((cat) => (
              <span
                key={cat}
                className="badge badge--neutral"
                style={{ fontSize: 10, textTransform: "capitalize" }}
              >
                {cat.toLowerCase()}
              </span>
            ))}
            {group.categories.length > 3 && (
              <span className="tiny muted">+{group.categories.length - 3}</span>
            )}

            {/* Deadline */}
            <span
              className="tiny"
              style={{ fontWeight: 600, color: deadlineColor(days), marginLeft: "auto" }}
            >
              {deadlineLabel(group.earliestDeadline)}
            </span>
          </div>
        </div>

        {/* Right: chevron */}
        <div
          aria-hidden="true"
          style={{ flexShrink: 0, color: "var(--t-low)", marginTop: 2, transition: "transform .2s" }}
        >
          {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
      </button>

      {/* Expanded lot grid */}
      {isExpanded && (
        <div
          style={{
            padding: "0 16px 20px",
            borderTop: "1px solid color-mix(in srgb, var(--brand-ink) 12%, transparent)",
          }}
        >
          <div
            className="grid"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              gap: 14,
              marginTop: 16,
            }}
          >
            {group.views.map((view) => (
              <LotCard
                key={view.lot.id}
                view={view}
                watched={watchIds.includes(view.lot.id)}
                onToggleWatch={() => onToggleWatch(view.lot.id)}
                onSelect={onSelectLot !== undefined ? () => onSelectLot(view.lot) : undefined}
                editalCount={editalCountMap.get(view.lot.edital.trim()) ?? 1}
                onFilterByEdital={onFilterByEdital}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── View mode toggle ─────────────────────────────────────────────────────────

function ViewToggle({
  mode,
  onChange,
}: {
  mode: ViewMode;
  onChange: (m: ViewMode) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Modo de visualização"
      style={{
        display: "inline-flex",
        borderRadius: "var(--r-md)",
        border: "1px solid color-mix(in srgb, var(--brand-ink) 20%, transparent)",
        overflow: "hidden",
        background: "var(--surface)",
      }}
    >
      {(
        [
          ["editais", "Por edital", Layers],
          ["lotes", "Todos os lotes", LayoutList],
        ] as const
      ).map(([value, label, Icon]) => (
        <button
          key={value}
          type="button"
          aria-pressed={mode === value}
          onClick={() => onChange(value)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 14px",
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 13,
            fontWeight: 600,
            transition: "background .15s, color .15s",
            background:
              mode === value
                ? "color-mix(in srgb, var(--brand-ink) 14%, var(--surface))"
                : "transparent",
            color: mode === value ? "var(--brand-ink)" : "var(--t-mid)",
            borderRight: value === "editais"
              ? "1px solid color-mix(in srgb, var(--brand-ink) 20%, transparent)"
              : "none",
          }}
        >
          <Icon size={15} aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
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
  const [status, setStatus] = useState<StatusFilter>("abertos");
  const [sortKey, setSortKey] = useState<SortKey>("score");

  // ── View mode ───────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>("editais");
  // Track which editais are expanded (in "Por edital" mode)
  const [expandedEditais, setExpandedEditais] = useState<ReadonlySet<string>>(new Set());

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
      // Status filter
      if (status !== "todos") {
        const isEncerrado = daysUntil(lot.proposalDeadline) < 0;
        if (status === "abertos" && isEncerrado) return false;
        if (status === "encerrados" && !isEncerrado) return false;
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
  }, [views, query, category, city, person, desconto, status, sortKey]);

  // Mapa edital → quantidade de lotes no conjunto filtrado atual.
  const editalCountMap = useMemo<ReadonlyMap<string, number>>(() => {
    const map = new Map<string, number>();
    for (const { lot } of filtered) {
      const key = lot.edital.trim();
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [filtered]);

  // ── Edital groups (for "Por edital" mode) ───────────────────────────────────
  const editalGroups = useMemo<EditalGroup[]>(() => {
    const map = new Map<string, EditalGroup>();

    for (const view of filtered) {
      const key = view.lot.edle.trim();
      const existing = map.get(key);

      if (existing === undefined) {
        const cats: string[] = [];
        if (view.lot.category !== undefined && view.lot.category.trim() !== "") {
          cats.push(view.lot.category.trim());
        }
        map.set(key, {
          edle: view.lot.edle,
          edital: view.lot.edital,
          city: view.lot.city,
          agency: view.lot.agency,
          earliestDeadline: view.lot.proposalDeadline,
          categories: cats,
          views: [view],
        });
      } else {
        // Merge: track earliest deadline
        const currentMs = new Date(existing.earliestDeadline).getTime();
        const thisMs = new Date(view.lot.proposalDeadline).getTime();
        if (!Number.isNaN(thisMs) && (Number.isNaN(currentMs) || thisMs < currentMs)) {
          existing.earliestDeadline = view.lot.proposalDeadline;
        }
        // Accumulate distinct categories
        if (
          view.lot.category !== undefined &&
          view.lot.category.trim() !== "" &&
          !existing.categories.includes(view.lot.category.trim())
        ) {
          existing.categories.push(view.lot.category.trim());
        }
        existing.views.push(view);
      }
    }

    // Sort groups by earliest deadline ascending (closest first), encerrados last
    return Array.from(map.values()).sort((a, b) => {
      const dA = daysUntil(a.earliestDeadline);
      const dB = daysUntil(b.earliestDeadline);
      // Encerrados (days < 0) sink to the bottom
      if (dA < 0 && dB >= 0) return 1;
      if (dB < 0 && dA >= 0) return -1;
      return new Date(a.earliestDeadline).getTime() - new Date(b.earliestDeadline).getTime();
    });
  }, [filtered]);

  // Reinicia a janela ao mudar busca/filtros/ordenação.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query, category, city, person, desconto, status, sortKey]);

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
    // Depende só de filtered.length: o observer persiste enquanto a janela cresce
  }, [filtered.length]);

  const visibleViews = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  // ── Handlers ────────────────────────────────────────────────────────────────
  function handleFilterByEdital(edital: string) {
    setQuery(edital.trim());
  }

  function handleToggleEdital(edle: string) {
    setExpandedEditais((prev) => {
      const next = new Set(prev);
      if (next.has(edle)) {
        next.delete(edle);
      } else {
        next.add(edle);
      }
      return next;
    });
  }

  function clearFilters() {
    setQuery("");
    setCategory("todas");
    setCity("todas");
    setPerson("todos");
    setDesconto("todos");
    setStatus("abertos");
    setSortKey("score");
  }

  const hasActiveFilters =
    query !== "" ||
    category !== "todas" ||
    city !== "todas" ||
    person !== "todos" ||
    desconto !== "todos" ||
    status !== "abertos";

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <style>{`
        /* Foco visível explícito no coração (o anel global pode ficar atrás do z-index do overlay). */
        .heart-btn:focus-visible {
          outline: 2px solid var(--brand-ink);
          outline-offset: 2px;
        }
      `}</style>
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
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Filter selects — wrap on mobile, never overflow */}
        <div className="row wrap" style={{ gap: 10 }}>
          <FilterSelect
            label="Status"
            value={status}
            options={STATUS_OPTIONS}
            onChange={setStatus}
          />
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

      {/* Count row + view toggle */}
      {!isLoading && errorMessage === null && lots.length > 0 && (
        <div className="row between wrap" style={{ gap: 8 }}>
          <span style={{ fontSize: 13, color: "var(--t-mid)" }}>
            <b className="num" style={{ color: "var(--t-hi)", fontVariantNumeric: "tabular-nums" }}>
              {filtered.length}
            </b>{" "}
            {filtered.length === 1 ? "lote encontrado" : "lotes encontrados"}
            {viewMode === "editais" && (
              <>
                {" · "}
                <b className="num" style={{ color: "var(--t-hi)", fontVariantNumeric: "tabular-nums" }}>
                  {editalGroups.length}
                </b>{" "}
                {editalGroups.length === 1 ? "edital" : "editais"}
              </>
            )}
            {viewMode === "lotes" && filtered.length > visibleViews.length
              ? ` · mostrando ${visibleViews.length}`
              : ""}
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
          <div className="row wrap" style={{ gap: 8 }}>
            <ViewToggle mode={viewMode} onChange={setViewMode} />
            {filtered.length > 0 && (
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => exportCsv(filtered)}
                type="button"
                title="Baixar CSV com os lotes filtrados"
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
        viewMode === "editais" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }} aria-busy="true" aria-label="Carregando editais…">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonEdital key={i} />
            ))}
          </div>
        ) : (
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
        )
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
      ) : viewMode === "editais" ? (
        /* ── Por edital view ── */
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {editalGroups.map((group) => (
            <EditalCard
              key={group.edle}
              group={group}
              isExpanded={expandedEditais.has(group.edle)}
              onToggle={() => handleToggleEdital(group.edle)}
              watchIds={watchIds}
              onToggleWatch={handleToggleWatch}
              onSelectLot={onSelectLot}
              editalCountMap={editalCountMap}
              onFilterByEdital={handleFilterByEdital}
            />
          ))}
        </div>
      ) : (
        /* ── Todos os lotes view ── */
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
                editalCount={editalCountMap.get(view.lot.edital.trim()) ?? 1}
                onFilterByEdital={handleFilterByEdital}
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
