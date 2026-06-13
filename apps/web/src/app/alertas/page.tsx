import { useEffect, useMemo, useState } from "react";
import type { ReceitaLeilaoLot } from "@fonteia/sources";
import { scoreReceitaLeilaoLot } from "@fonteia/scoring";
import { FonteDots, ScoreRing, riscoBadge } from "../../components/ui";
import { listLeilaoLots } from "../../features/leiloes/leiloes-api";
import { formatBRL } from "../../data/leiloes-seed";
import {
  Bell,
  BookmarkX,
  ChevronRight,
  Clock,
  Search,
  Star,
  TrendingDown,
  Zap,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const LS_WATCHLIST = "fonteia_watchlist";
const LS_ALERT_PREFS = "fonteia_alert_prefs";

const RFB_FONTE = {
  sigla: "RFB",
  cor: "#1D5FE0",
  nome: "Receita Federal do Brasil",
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────

interface AlertPrefs {
  novoEdital: boolean;
  prazoEncerrando: boolean;
  scoreAlto: boolean;
  quedaPreco: boolean;
}

const DEFAULT_PREFS: AlertPrefs = {
  novoEdital: true,
  prazoEncerrando: true,
  scoreAlto: false,
  quedaPreco: false,
};

// ─── LocalStorage helpers ─────────────────────────────────────────────────────

function loadWatchlistIds(): string[] {
  try {
    const raw = window.localStorage.getItem(LS_WATCHLIST);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

function saveWatchlistIds(ids: string[]): void {
  try {
    window.localStorage.setItem(LS_WATCHLIST, JSON.stringify(ids));
  } catch {
    // storage unavailable — silent, non-blocking
  }
}

function loadAlertPrefs(): AlertPrefs {
  try {
    const raw = window.localStorage.getItem(LS_ALERT_PREFS);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return { ...DEFAULT_PREFS };
    const p = parsed as Record<string, unknown>;
    return {
      novoEdital:
        typeof p["novoEdital"] === "boolean" ? p["novoEdital"] : DEFAULT_PREFS.novoEdital,
      prazoEncerrando:
        typeof p["prazoEncerrando"] === "boolean"
          ? p["prazoEncerrando"]
          : DEFAULT_PREFS.prazoEncerrando,
      scoreAlto:
        typeof p["scoreAlto"] === "boolean" ? p["scoreAlto"] : DEFAULT_PREFS.scoreAlto,
      quedaPreco:
        typeof p["quedaPreco"] === "boolean" ? p["quedaPreco"] : DEFAULT_PREFS.quedaPreco,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function saveAlertPrefs(prefs: AlertPrefs): void {
  try {
    window.localStorage.setItem(LS_ALERT_PREFS, JSON.stringify(prefs));
  } catch {
    // storage unavailable — silent, non-blocking
  }
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatDeadline(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function daysUntil(value: string): number {
  const deadline = new Date(value).getTime();
  if (Number.isNaN(deadline)) return 999;
  return Math.ceil((deadline - Date.now()) / 86_400_000);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ToggleRowProps {
  label: string;
  description: string;
  icon: React.ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
}

function ToggleRow({ label, description, icon, checked, onChange }: ToggleRowProps) {
  return (
    <div
      className="row between"
      style={{ padding: "13px 0", borderTop: "1px solid var(--border)" }}
    >
      <div className="row" style={{ gap: 10, flex: 1, minWidth: 0 }}>
        <span style={{ color: "var(--t-mid)", flexShrink: 0 }}>{icon}</span>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
          <div style={{ fontSize: 12.5, color: "var(--t-mid)", marginTop: 2 }}>
            {description}
          </div>
        </div>
      </div>
      <div
        className={"switch" + (checked ? " on" : "")}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        tabIndex={0}
        onClick={() => onChange(!checked)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onChange(!checked);
          }
        }}
      >
        <i />
      </div>
    </div>
  );
}

interface WatchlistCardProps {
  lot: ReceitaLeilaoLot;
  score: number;
  scoreLabel: "baixo" | "medio" | "alto";
  onSelect: (() => void) | undefined;
  onRemove: () => void;
}

function WatchlistCard({ lot, score, scoreLabel, onSelect, onRemove }: WatchlistCardProps) {
  const badge = riscoBadge(scoreLabel);
  const days = daysUntil(lot.proposalDeadline);
  const deadlineColor =
    days <= 3 ? "var(--danger)" : days <= 7 ? "var(--warn)" : "var(--t-mid)";

  return (
    <div
      className="panel watchlist-card"
      style={{
        padding: "16px 20px",
        display: "flex",
        gap: 16,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      {/* Score ring */}
      <ScoreRing value={score} size={52} />

      {/* Main content */}
      <div style={{ flex: "1 1 180px", minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>
          Lote {lot.lotNumber} — {lot.city}
        </div>
        <div style={{ fontSize: 12, color: "var(--t-low)", marginBottom: 6 }}>
          {lot.agency} · Edital {lot.edital}
        </div>
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <span
            className="num"
            style={{ fontWeight: 800, fontSize: 15, fontVariantNumeric: "tabular-nums" }}
          >
            {formatBRL(lot.minimumBidCents / 100)}
          </span>
          <span style={{ fontSize: 12, color: deadlineColor, fontWeight: 600 }}>
            encerra {formatDeadline(lot.proposalDeadline)}
            {days <= 7 && days > 0 ? ` (${days}d)` : ""}
            {days <= 0 ? " (vencido)" : ""}
          </span>
          <span className={`badge num ${badge.className}`} style={{ fontSize: 11 }}>
            {badge.label}
          </span>
        </div>
        <div style={{ marginTop: 8 }}>
          <FonteDots fontes={[RFB_FONTE]} size={20} />
        </div>
      </div>

      {/* Actions */}
      <div className="row watchlist-card-actions" style={{ gap: 8, flexShrink: 0 }}>
        {onSelect !== undefined ? (
          <button
            className="btn btn--soft btn--sm"
            type="button"
            onClick={onSelect}
          >
            Analisar
            <ChevronRight size={13} />
          </button>
        ) : null}
        <button
          className="btn btn--icon btn--ghost btn--sm"
          type="button"
          title="Remover da watchlist"
          onClick={onRemove}
          aria-label="Remover da watchlist"
        >
          <BookmarkX size={15} />
        </button>
      </div>
    </div>
  );
}

interface EmptyWatchlistProps {
  onExplore?: (() => void) | undefined;
}

function EmptyWatchlist({ onExplore }: EmptyWatchlistProps) {
  return (
    <div
      className="panel"
      style={{
        padding: "48px 32px",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 14,
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 4,
        }}
      >
        <Star size={24} style={{ color: "var(--t-mid)" }} />
      </div>
      <div style={{ fontWeight: 700, fontSize: 16 }}>Watchlist vazia</div>
      <div
        style={{
          fontSize: 13.5,
          color: "var(--t-mid)",
          maxWidth: 340,
          lineHeight: 1.5,
        }}
      >
        Marque lotes com a estrela na tela de leilões para acompanhá-los aqui e
        receber alertas quando algo mudar.
      </div>
      {onExplore !== undefined ? (
        <button
          className="btn btn--primary"
          type="button"
          onClick={onExplore}
          style={{ marginTop: 8 }}
        >
          <Search size={15} />
          Explorar lotes
        </button>
      ) : (
        <div
          className="inset"
          style={{
            padding: "10px 16px",
            fontSize: 13,
            color: "var(--t-mid)",
            marginTop: 4,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Search size={14} />
          Acesse Leilões para explorar os lotes disponíveis.
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function AlertasPage({ onSelectLot }: { onSelectLot?: (lot: ReceitaLeilaoLot) => void }) {
  // Watchlist state (list of lot IDs)
  const [watchlistIds, setWatchlistIds] = useState<string[]>(() => loadWatchlistIds());

  // All available lots (from API / Supabase / sample fallback)
  const [allLots, setAllLots] = useState<ReceitaLeilaoLot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>();

  // Alert preferences
  const [prefs, setPrefs] = useState<AlertPrefs>(() => loadAlertPrefs());

  // Load all lots on mount so we can cross-reference watchlist IDs
  useEffect(() => {
    let active = true;
    setIsLoading(true);

    listLeilaoLots()
      .then((result) => {
        if (!active) return;
        setAllLots(result.lots);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setLoadError(
          err instanceof Error ? err.message : "Erro ao carregar lotes.",
        );
        setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // Derive the actual lot objects that are in the watchlist
  const watchlistLots = useMemo(() => {
    const idSet = new Set(watchlistIds);
    return allLots.filter((lot) => idSet.has(lot.id));
  }, [allLots, watchlistIds]);

  // Score each watched lot once
  const scoredWatchlist = useMemo(
    () => watchlistLots.map((lot) => ({ lot, scoring: scoreReceitaLeilaoLot(lot) })),
    [watchlistLots],
  );

  // Count lots closing within 7 days
  const closingSoonCount = useMemo(
    () => watchlistLots.filter((lot) => daysUntil(lot.proposalDeadline) <= 7 && daysUntil(lot.proposalDeadline) > 0).length,
    [watchlistLots],
  );

  // Remove a lot from the watchlist
  function removeLot(lotId: string): void {
    setWatchlistIds((prev) => {
      const next = prev.filter((id) => id !== lotId);
      saveWatchlistIds(next);
      return next;
    });
  }

  // Toggle an alert preference
  function togglePref(key: keyof AlertPrefs): void {
    setPrefs((prev) => {
      const next: AlertPrefs = { ...prev, [key]: !prev[key] };
      saveAlertPrefs(next);
      return next;
    });
  }

  return (
    <div className="alertas-layout">
      {/* Scoped responsive layout — 2 columns on desktop, stacked on mobile */}
      <style>{`
        .alertas-layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 340px;
          gap: 20px;
          align-items: start;
        }
        /* Collapse early: the app sidebar eats ~280px of width, so a rigid
           second column gets cramped well before the viewport is "mobile". */
        @media (max-width: 1000px) {
          .alertas-layout {
            grid-template-columns: 1fr;
          }
          /* Stacked: the alert-config panel must not stay sticky */
          .alertas-prefs {
            position: static !important;
          }
        }
        @media (max-width: 420px) {
          .watchlist-card-actions {
            flex: 1 1 100%;
            justify-content: flex-start;
          }
        }
      `}</style>
      {/* ── Left: Watchlist ───────────────────────────────────────── */}
      <div>
        {/* Header */}
        <div className="row between" style={{ marginBottom: 16 }}>
          <div>
            <h1
              style={{
                fontWeight: 700,
                fontSize: 20,
                letterSpacing: "-.02em",
                marginBottom: 2,
              }}
            >
              Watchlist & Alertas
            </h1>
            <p style={{ fontSize: 13.5, color: "var(--t-mid)" }}>
              {watchlistIds.length > 0
                ? `${watchlistIds.length} lote${watchlistIds.length !== 1 ? "s" : ""} acompanhado${watchlistIds.length !== 1 ? "s" : ""}`
                : "Nenhum lote na watchlist"}
            </p>
          </div>
          {watchlistIds.length > 0 ? (
            <span className="badge badge--neutral num" style={{ fontSize: 12 }}>
              {watchlistIds.length}
            </span>
          ) : null}
        </div>

        {/* Lot list */}
        {isLoading ? (
          <div
            className="panel"
            style={{
              padding: "40px 32px",
              textAlign: "center",
              color: "var(--t-mid)",
              fontSize: 14,
            }}
          >
            Carregando lotes...
          </div>
        ) : loadError !== undefined ? (
          <div
            className="panel"
            style={{
              padding: "40px 32px",
              textAlign: "center",
              color: "var(--danger)",
              fontSize: 14,
            }}
          >
            {loadError}
          </div>
        ) : watchlistIds.length === 0 ? (
          <EmptyWatchlist />
        ) : scoredWatchlist.length === 0 ? (
          // IDs exist but lots not found in current data (stale IDs)
          <div
            className="panel"
            style={{
              padding: "32px 24px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              alignItems: "flex-start",
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 14, color: "var(--t-mid)" }}>
              {watchlistIds.length} lote{watchlistIds.length !== 1 ? "s" : ""} na
              watchlist, mas não encontrado{watchlistIds.length !== 1 ? "s" : ""} na
              fonte atual.
            </div>
            <div style={{ fontSize: 13, color: "var(--t-low)" }}>
              Os editais podem ter encerrado ou os IDs estão desatualizados.
            </div>
            <button
              className="btn btn--ghost btn--sm"
              type="button"
              onClick={() => {
                setWatchlistIds([]);
                saveWatchlistIds([]);
              }}
            >
              Limpar watchlist
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {scoredWatchlist.map(({ lot, scoring }) => (
              <WatchlistCard
                key={lot.id}
                lot={lot}
                score={scoring.score}
                scoreLabel={scoring.label}
                onSelect={onSelectLot !== undefined ? () => onSelectLot(lot) : undefined}
                onRemove={() => removeLot(lot.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Right: Alert preferences ──────────────────────────────── */}
      <div className="panel alertas-prefs" style={{ padding: 22, position: "sticky", top: 80 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
          Configurar alertas
        </div>
        <div style={{ fontSize: 13, color: "var(--t-mid)", marginBottom: 2 }}>
          Escolha quando ser avisado sobre novos editais.
        </div>

        <ToggleRow
          label="Novo edital publicado"
          description="Quando um órgão publica um novo lote."
          icon={<Bell size={15} />}
          checked={prefs.novoEdital}
          onChange={() => togglePref("novoEdital")}
        />
        <ToggleRow
          label="Prazo encerrando"
          description="Alerta quando o prazo estiver a menos de 7 dias."
          icon={<Clock size={15} />}
          checked={prefs.prazoEncerrando}
          onChange={() => togglePref("prazoEncerrando")}
        />
        <ToggleRow
          label="Score acima de 80"
          description="Somente lotes com oportunidade classificada alta."
          icon={<Zap size={15} />}
          checked={prefs.scoreAlto}
          onChange={() => togglePref("scoreAlto")}
        />
        <ToggleRow
          label="Queda de preço"
          description="Quando o lance mínimo de um lote cai."
          icon={<TrendingDown size={15} />}
          checked={prefs.quedaPreco}
          onChange={() => togglePref("quedaPreco")}
        />

        {/* Backend notice */}
        <div
          style={{
            marginTop: 16,
            padding: 13,
            borderRadius: 11,
            background:
              "color-mix(in srgb,var(--warn) 8%,var(--surface-2))",
            border:
              "1px solid color-mix(in srgb,var(--warn) 22%,transparent)",
            fontSize: 12.5,
            fontWeight: 600,
            color: "var(--warn)",
            display: "flex",
            gap: 9,
            alignItems: "flex-start",
          }}
        >
          <Clock size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            O envio por e-mail entra quando o backend de notificações estiver
            ativo. Suas preferências já estão salvas e serão respeitadas quando
            o serviço for ativado.
          </span>
        </div>

        {/* Closing soon summary */}
        {closingSoonCount > 0 ? (
          <div
            style={{
              marginTop: 12,
              padding: "10px 13px",
              borderRadius: 10,
              background:
                "color-mix(in srgb,var(--danger) 8%,var(--surface-2))",
              border:
                "1px solid color-mix(in srgb,var(--danger) 20%,transparent)",
              fontSize: 12.5,
              fontWeight: 600,
              color: "var(--danger)",
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            <Clock size={14} style={{ flexShrink: 0 }} />
            {closingSoonCount} lote{closingSoonCount !== 1 ? "s" : ""} da
            watchlist encerra{closingSoonCount !== 1 ? "m" : ""} esta semana.
          </div>
        ) : null}
      </div>
    </div>
  );
}
