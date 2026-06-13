import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bell,
  Building2,
  CalendarClock,
  CheckSquare,
  ExternalLink,
  ImageOff,
  Loader2,
  MapPin,
  Package,
  FileText,
  Printer,
  Send,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  Users,
} from "lucide-react";
import type { ReceitaLeilaoLot } from "@fonteia/sources";
import { lotEconomia, scoreReceitaLeilaoLot } from "@fonteia/scoring";
import type { LotEconomia } from "@fonteia/scoring";
import { EvidencePanel } from "../../components/evidence-panel";
import { ScoreRing } from "../../components/score-ring";
import { Bar, FonteDots } from "../../components/ui";
import { getConfiguredApiUrl, getSupabasePublicConfig, trimTrailingSlash } from "../../lib/api-client";
import { displayCity } from "../../lib/receita-localidades";
import { useAuth } from "../../auth/auth-context";
import { fetchLoteDetalhe, type LoteDetalhe } from "../../features/leiloes/lote-detalhe-api";
import { ComoDarLance } from "../../components/como-dar-lance";
import { estimarCustoTotal } from "../../lib/custo-total";
import { isVeiculo, fetchFipePreco, type FipePrecoResponse } from "../../features/leiloes/fipe-api";
import { supabase } from "../../auth/supabase-client";
import { usePlan } from "../../lib/use-plan";

// Renderiza **negrito** simples dentro de uma linha (sem libs de markdown).
function renderInline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

// ─── SHA-256 helper (Web Crypto, async) ──────────────────────────────────────

/**
 * Computes a SHA-256 hex digest of an arbitrary string via Web Crypto.
 * Returns null if the API is unavailable (e.g. non-secure context in tests).
 */
async function sha256Hex(input: string): Promise<string | null> {
  if (typeof globalThis.crypto?.subtle?.digest !== "function") return null;
  const encoded = new TextEncoder().encode(input);
  const buf = await globalThis.crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface LotDetailPageProps {
  lot: ReceitaLeilaoLot;
  onBack: () => void;
  onAsk?: ((question: string) => void) | undefined;
}

// ─── Alert modal state ───────────────────────────────────────────────────────

type AlertChannel = "in_app" | "email" | "whatsapp";

const channelLabels: Record<AlertChannel, string> = {
  in_app: "Notificacao no app",
  email: "E-mail em breve",
  whatsapp: "WhatsApp em breve",
};

// ─── Formatting helpers ───────────────────────────────────────────────────────

function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDeadline(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateShort(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function daysUntilDeadline(value: string): number {
  const ms = new Date(value).getTime() - Date.now();
  if (Number.isNaN(ms)) return -1;
  return Math.ceil(ms / 86_400_000);
}

// ─── Eligibility ──────────────────────────────────────────────────────────────

function eligibilityLabel(lot: ReceitaLeilaoLot): string {
  const hasPf = lot.eligiblePersonTypes.includes("pf");
  const hasPj = lot.eligiblePersonTypes.includes("pj");
  if (hasPf && hasPj) return "Pessoa fisica e juridica";
  if (hasPf) return "Somente pessoa fisica";
  return "Somente pessoa juridica";
}

function eligibilityLong(lot: ReceitaLeilaoLot): string {
  const hasPf = lot.eligiblePersonTypes.includes("pf");
  const hasPj = lot.eligiblePersonTypes.includes("pj");
  if (hasPf && hasPj) return "Pessoa fisica e pessoa juridica podem participar deste lote.";
  if (hasPf) return "Apenas pessoa fisica pode participar. Pessoa juridica esta excluida.";
  return "Restrito a pessoa juridica. Pessoa fisica nao pode participar.";
}

// ─── Score impact icon ────────────────────────────────────────────────────────

function impactIcon(impact: "positive" | "neutral" | "negative"): string {
  if (impact === "positive") return "✓";
  if (impact === "negative") return "−";
  return "·";
}

// ─── Deadline status ──────────────────────────────────────────────────────────

type DeadlineStatus = "expired" | "urgent" | "soon" | "ok";

function deadlineStatus(days: number): DeadlineStatus {
  if (days <= 0) return "expired";
  if (days <= 2) return "urgent";
  if (days < 7) return "soon";
  return "ok";
}

function deadlineStatusLabel(days: number): string {
  if (days <= 0) return "Prazo vencido";
  if (days === 1) return "Vence amanha";
  if (days <= 6) return `Vence em ${days} dias — decisao urgente`;
  return `${days} dias restantes`;
}

interface DeadlineTone {
  bg: string;
  fg: string;
}

function deadlineTone(status: DeadlineStatus): DeadlineTone {
  if (status === "ok") return { bg: "var(--color-success-bg)", fg: "var(--color-success)" };
  if (status === "expired") return { bg: "var(--color-error-bg)", fg: "var(--color-error)" };
  return { bg: "var(--color-warning-bg)", fg: "var(--color-warning)" };
}

// ─── Score-derived risk bars (derived from scoring factors, no invented data) ──

interface RiskBar {
  label: string;
  value: number;
  color: string;
}

function buildRiskBars(
  scoring: ReturnType<typeof scoreReceitaLeilaoLot>,
  _lot: ReceitaLeilaoLot,
): RiskBar[] {
  const bars: RiskBar[] = [];

  // Elegibilidade
  const pjOnly = scoring.factors.some((f) => f.id === "pj-only");
  bars.push({
    label: "Elegibilidade de participantes",
    value: pjOnly ? 45 : 90,
    color: pjOnly ? "var(--color-warning)" : "var(--g-500)",
  });

  // Prazo
  const deadlineExpired = scoring.factors.some((f) => f.id === "deadline-expired");
  const deadlineSoon = scoring.factors.some((f) => f.id === "deadline-soon");
  const deadlineOk = scoring.factors.some((f) => f.id === "enough-time");
  const prazoVal = deadlineExpired ? 10 : deadlineSoon ? 40 : deadlineOk ? 85 : 50;
  bars.push({
    label: "Prazo disponivel para analise",
    value: prazoVal,
    color: deadlineExpired ? "var(--color-error)" : deadlineSoon ? "var(--color-warning)" : "var(--g-500)",
  });

  // Ticket de entrada
  const lowTicket = scoring.factors.some((f) => f.id === "low-entry-ticket");
  const highTicket = scoring.factors.some((f) => f.id === "high-entry-ticket");
  const ticketVal = lowTicket ? 88 : highTicket ? 30 : 60;
  bars.push({
    label: "Acessibilidade do valor minimo",
    value: ticketVal,
    color: highTicket ? "var(--color-error)" : lowTicket ? "var(--g-500)" : "var(--color-warning)",
  });

  // Imagem disponivel
  const hasImage = scoring.factors.some((f) => f.id === "has-image");
  bars.push({
    label: "Visibilidade do lote (imagem)",
    value: hasImage ? 80 : 40,
    color: hasImage ? "var(--g-500)" : "var(--color-warning)",
  });

  return bars;
}

// ─── Imagens do lote (gracioso: imageUrls[] preferido, senão imageUrl) ─────────

function collectImages(lot: ReceitaLeilaoLot): string[] {
  const out: string[] = [];
  const push = (value: string | undefined) => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length > 0 && !out.includes(trimmed)) out.push(trimmed);
    }
  };
  if (Array.isArray(lot.imageUrls)) {
    for (const url of lot.imageUrls) push(url);
  }
  push(lot.imageUrl);
  return out;
}

// ─── Itens do lote (gracioso: só renderiza quando a fonte traz os campos) ──────

interface LotItem {
  descricao: string;
  quantidade?: string | undefined;
  unidade?: string | undefined;
}

interface LotItensInfo {
  recinto?: string | undefined;
  itens: LotItem[];
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

/**
 * Lê descrições/quantidades/recinto de um payload mais rico (catálogo completo),
 * SEM fabricar nada: se os campos não existirem no `raw`, devolve null e a seção
 * inteira some. Faz narrowing seguro sobre `unknown` para passar no strict TS.
 */
function extractLotItens(lot: ReceitaLeilaoLot): LotItensInfo | null {
  const raw = lot.raw as unknown as Record<string, unknown>;
  if (!raw || typeof raw !== "object") return null;

  const recinto =
    asString(raw["recinto"]) ?? asString(raw["patio"]) ?? asString(raw["localRetirada"]);

  // Procura a primeira coleção de itens conhecida.
  const candidateKeys = ["itensDetalhesLote", "itensLote", "itens", "detalhesLote"];
  let rawItens: unknown;
  for (const key of candidateKeys) {
    const value = raw[key];
    if (Array.isArray(value) && value.length > 0) {
      rawItens = value;
      break;
    }
  }

  const itens: LotItem[] = [];
  if (Array.isArray(rawItens)) {
    for (const entry of rawItens) {
      if (!entry || typeof entry !== "object") continue;
      const obj = entry as Record<string, unknown>;
      const descricao =
        asString(obj["descricao"]) ??
        asString(obj["descricaoItem"]) ??
        asString(obj["nome"]) ??
        asString(obj["item"]);
      if (!descricao) continue;
      const quantidade = asString(obj["quantidade"]) ?? asString(obj["qtd"]);
      const unidade = asString(obj["unidade"]) ?? asString(obj["unidadeMedida"]);
      itens.push({ descricao, quantidade, unidade });
    }
  }

  if (itens.length === 0 && !recinto) return null;
  return { recinto, itens };
}

// ─── Photo / gallery ──────────────────────────────────────────────────────────

interface LotPhotoProps {
  images: string[];
  alt: string;
  /** Overlay rendered on top of the photo (badges, score, etc.). */
  overlay?: React.ReactNode;
}

function LotPhoto({ images, alt, overlay }: LotPhotoProps) {
  const [active, setActive] = useState(0);
  // Falha de carregamento por índice — cai para o placeholder gracioso.
  const [broken, setBroken] = useState<Record<number, boolean>>({});
  // Track which images have finished loading (for fade-in).
  const [loaded, setLoaded] = useState<Record<number, boolean>>({});

  // Reseta ao trocar o conjunto de imagens (troca de lote).
  useEffect(() => {
    setActive(0);
    setBroken({});
    setLoaded({});
  }, [images]);

  const current = images[active];
  const showImage = typeof current === "string" && broken[active] !== true;
  const isLoaded = loaded[active] === true;
  const hasGallery = images.length > 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-2)" }}>
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "16 / 10",
          borderRadius: "var(--r-lg)",
          overflow: "hidden",
          background: "linear-gradient(135deg, #1a2e52, #0c1c3a)",
          border: "1px solid var(--n-100)",
        }}
      >
        {/* Placeholder always visible beneath the image; fades out once image loads */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "var(--s-2)",
            color: "rgba(255,255,255,0.78)",
            textAlign: "center",
            padding: "var(--s-4)",
            opacity: showImage && isLoaded ? 0 : 1,
            transition: "opacity 0.3s ease",
          }}
        >
          <ImageOff aria-hidden="true" size={34} />
          {!showImage && (
            <>
              <span style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                Sem foto publicada para este lote
              </span>
              <span style={{ fontSize: "0.72rem", opacity: 0.8 }}>
                A fonte oficial nao disponibilizou imagem.
              </span>
            </>
          )}
        </div>

        {showImage ? (
          <img
            src={current}
            alt={alt}
            loading="lazy"
            onLoad={() => {
              setLoaded((prev) => ({ ...prev, [active]: true }));
            }}
            onError={() => {
              setBroken((prev) => ({ ...prev, [active]: true }));
            }}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
              opacity: isLoaded ? 1 : 0,
              transition: "opacity 0.4s ease",
            }}
          />
        ) : null}

        {overlay ? (
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>{overlay}</div>
        ) : null}
      </div>

      {/* Thumbnails — only when there is a real gallery */}
      {hasGallery ? (
        <div
          style={{
            display: "flex",
            gap: "var(--s-2)",
            overflowX: "auto",
            paddingBottom: 2,
            WebkitOverflowScrolling: "touch",
          }}
        >
          {images.map((url, i) => {
            const selected = i === active;
            return (
              <button
                key={`${url}-${i}`}
                type="button"
                onClick={() => {
                  setActive(i);
                }}
                aria-label={`Ver foto ${i + 1} de ${images.length}`}
                aria-pressed={selected}
                style={{
                  flexShrink: 0,
                  width: 56,
                  height: 56,
                  minWidth: 44,
                  minHeight: 44,
                  padding: 0,
                  borderRadius: "var(--r-sm)",
                  overflow: "hidden",
                  cursor: "pointer",
                  background: "var(--n-100)",
                  border: selected ? "2px solid var(--g-500)" : "1px solid var(--n-200)",
                }}
              >
                {broken[i] === true ? (
                  <span
                    aria-hidden="true"
                    style={{
                      display: "flex",
                      width: "100%",
                      height: "100%",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--n-400)",
                    }}
                  >
                    <ImageOff size={16} />
                  </span>
                ) : (
                  <img
                    src={url}
                    alt=""
                    loading="lazy"
                    onError={() => {
                      setBroken((prev) => ({ ...prev, [i]: true }));
                    }}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                )}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

// ─── Print Report (no-display on screen) ─────────────────────────────────────

interface PrintReportProps {
  lot: ReceitaLeilaoLot;
  scoring: ReturnType<typeof scoreReceitaLeilaoLot>;
  economia: LotEconomia | null;
}

function PrintReport({ lot, scoring, economia }: PrintReportProps) {
  const today = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  return (
    <div className="print-report">
      <div className="report-header">
        <div>
          <div className="report-title">Fonte.ia — Raio-X do Lote</div>
          <div className="report-sub">by Olli · {today} · Dados rastreados a fonte oficial</div>
        </div>
        <div style={{ textAlign: "right", fontSize: "9pt", color: "#5A6B82" }}>
          <div style={{ fontWeight: 800, fontSize: "14pt", color: "#0B2240" }}>
            {scoring.score}/100
          </div>
          <div>Score Fonte.ia</div>
        </div>
      </div>

      <div className="report-section">
        <div className="report-section-title">Identificacao do lote</div>
        {lot.category ? (
          <div className="report-row">
            <span>Categoria</span>
            <b>{lot.category}</b>
          </div>
        ) : null}
        <div className="report-row">
          <span>Lote</span>
          <b>
            {lot.displayNumber} (interno: {lot.lotNumber})
          </b>
        </div>
        <div className="report-row">
          <span>Edital</span>
          <b>{lot.edital}</b>
        </div>
        <div className="report-row">
          <span>EDLE</span>
          <b>{lot.edle}</b>
        </div>
        <div className="report-row">
          <span>Orgao responsavel</span>
          <b>{lot.agency}</b>
        </div>
        <div className="report-row">
          <span>Cidade</span>
          <b>{lot.city}</b>
        </div>
        <div className="report-row">
          <span>Quem pode participar</span>
          <b>{eligibilityLabel(lot)}</b>
        </div>
        <div className="report-row">
          <span>Prazo de proposta</span>
          <b>{formatDeadline(lot.proposalDeadline)}</b>
        </div>
      </div>

      <div className="report-section">
        <div className="report-section-title">Resumo financeiro</div>
        {economia ? (
          <>
            <div className="report-row">
              <span>Avaliacao oficial</span>
              <b>{formatBRL(economia.avaliacaoCents / 100)}</b>
            </div>
            <div className="report-row">
              <span>Economia (avaliacao − minimo)</span>
              <b>
                {formatBRL(economia.economiaCents / 100)} ({economia.descontoPct}%)
              </b>
            </div>
          </>
        ) : null}
        <div className="report-row">
          <span>Lance minimo (fonte oficial)</span>
          <b>{formatBRL(lot.minimumBidCents / 100)}</b>
        </div>
        <div className="report-row">
          <span>
            Teto sugerido por regra{" "}
            <span style={{ fontSize: "0.7rem", fontWeight: 400, opacity: 0.7 }}>
              heurística (
              {scoring.label === "alto" ? "35%" : scoring.label === "medio" ? "20%" : "10%"}
              {" "}acima do mínimo) — não é valor de mercado; pesquise FIPE/mercado antes de definir seu lance
            </span>
          </span>
          <b>{formatBRL(scoring.maxSuggestedBidCents / 100)}</b>
        </div>
      </div>

      <div className="report-section">
        <div className="report-section-title">Fatores de risco detectados (por regra)</div>
        {scoring.factors.map((f) => (
          <div className="report-row" key={f.id}>
            <span>
              {impactIcon(f.impact)} {f.label}
            </span>
            <b style={{ color: f.impact === "negative" ? "#991b1b" : f.impact === "positive" ? "#0b6048" : "#556560" }}>
              {f.points > 0 ? "+" : ""}
              {f.points !== 0 ? `${f.points} pts` : "neutro"}
            </b>
          </div>
        ))}
      </div>

      <div className="report-section">
        <div className="report-section-title">Fonte oficial</div>
        <div className="report-row">
          <span>Receita Federal SLE</span>
          <b>receita-leiloes-sle</b>
        </div>
        <div className="report-row">
          <span>URL</span>
          <b style={{ wordBreak: "break-all" }}>{lot.sourceUrl}</b>
        </div>
        <div className="report-row">
          <span>Coletado em</span>
          <b>{formatDeadline(lot.collectedAt)}</b>
        </div>
      </div>

      <div className="report-footer">
        <span>Fonte.ia by Olli</span>
        <span>
          Relatorio gerado a partir de dados publicos oficiais. Nao constitui assessoria juridica ou
          financeira. Confirme tudo na fonte oficial antes de tomar qualquer decisao.
        </span>
        <span>{today}</span>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function LotDetailPage({
  lot,
  onBack,
  onAsk: _onAsk,
}: LotDetailPageProps) {
  const scoring = scoreReceitaLeilaoLot(lot);
  const economia = lotEconomia(lot);
  const days = daysUntilDeadline(lot.proposalDeadline);
  const dlStatus = deadlineStatus(days);
  const dlTone = deadlineTone(dlStatus);
  // Confiança da oportunidade (NÃO risco): "alto" do scoring = melhor lote.
  // O selo positivo evita pintar o melhor lote de "Risco baixo" (semântica invertida).
  const confianca =
    scoring.label === "alto"
      ? { className: "badge--ok", label: "Alta oportunidade" }
      : scoring.label === "medio"
        ? { className: "badge--warn", label: "Oportunidade media" }
        : { className: "badge--neutral", label: "Avaliar com cautela" };
  const riskBars = buildRiskBars(scoring, lot);

  // Detalhe rico do lote (descrição dos bens, quantidade, recinto, avisos, fotos):
  // o catálogo não traz isso, então buscamos sob demanda do SLE via Edge Function.
  const { session } = useAuth();
  const { isPro } = usePlan();
  const [detalhe, setDetalhe] = useState<LoteDetalhe | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDetalhe(null);
    void fetchLoteDetalhe(lot, session?.access_token).then((d) => {
      if (!cancelled) setDetalhe(d);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lot.id, lot.edle, lot.lotNumber, session?.access_token]);

  const images = useMemo(() => {
    const base = collectImages(lot);
    if (base.length > 0) return base;
    return detalhe?.imagens ?? [];
  }, [lot, detalhe]);

  // Prefere os itens ricos do SLE (com descrição + quantidade); cai para o que o
  // payload base eventualmente tiver. Some inteiro quando não há nada honesto a mostrar.
  const itensInfo = useMemo<LotItensInfo | null>(() => {
    if (detalhe && detalhe.itens.length > 0) {
      return { recinto: detalhe.recinto ?? undefined, itens: detalhe.itens };
    }
    return extractLotItens(lot);
  }, [lot, detalhe]);

  const lotTitle = `Edital ${lot.edital} — Lote ${lot.displayNumber}`;
  const itemTitle = detalhe?.titulo ?? null;
  const cityLabel = displayCity(lot.city);
  const avisos = detalhe?.avisos ?? [];

  // Referência de mercado (FIPE) só para veículos — match heurístico, nunca chuta.
  const [fipe, setFipe] = useState<FipePrecoResponse | null>(null);
  useEffect(() => {
    if (!isVeiculo(lot.category)) {
      setFipe(null);
      return;
    }
    let cancelled = false;
    const termo = detalhe?.titulo ?? lot.category ?? "";
    void fetchFipePreco(termo, lot.category).then((r) => {
      if (!cancelled) setFipe(r);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lot.id, lot.category, detalhe?.titulo]);

  // SHA-256 hash do conteúdo factual exibido (prova de integridade do que está na tela).
  // Computado async via Web Crypto a partir de campos estáveis do lote (sem inferências).
  const [contentHash, setContentHash] = useState<string | null>(null);

  const buildHashInput = useCallback((l: ReceitaLeilaoLot): string => {
    // Serialização estável e determinística dos campos factuais exibidos.
    return JSON.stringify({
      id: l.id,
      edital: l.edital,
      minimumBidCents: l.minimumBidCents,
      proposalDeadline: l.proposalDeadline,
      collectedAt: l.collectedAt,
      sourceUrl: l.sourceUrl,
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setContentHash(null);
    void sha256Hex(buildHashInput(lot)).then((h) => {
      if (!cancelled) setContentHash(h);
    });
    return () => {
      cancelled = true;
    };
  }, [lot, buildHashInput]);

  // Alert modal
  const [alertOpen, setAlertOpen] = useState(false);
  const [editalLoading, setEditalLoading] = useState(false);
  const [relacaoLoading, setRelacaoLoading] = useState(false);
  const [editalIA, setEditalIA] = useState<string | null>(null);
  const [editalIALoading, setEditalIALoading] = useState(false);
  const [editalIAError, setEditalIAError] = useState<string | null>(null);
  const [alertName, setAlertName] = useState(`Alerta — Edital ${lot.edital}`);
  const [alertChannel, setAlertChannel] = useState<AlertChannel>("in_app");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Assistente de IA (Raio-X do lote)
  const [iaLoading, setIaLoading] = useState(false);
  const [iaAnswer, setIaAnswer] = useState<string | null>(null);
  const [iaModel, setIaModel] = useState<string | null>(null);
  const [iaDisclaimer, setIaDisclaimer] = useState<string | null>(null);
  const [iaError, setIaError] = useState<string | null>(null);
  const [iaUnavailable, setIaUnavailable] = useState(false);
  const [iaQuestion, setIaQuestion] = useState("");

  async function runRaioX(question?: string) {
    setIaLoading(true);
    setIaError(null);
    setIaUnavailable(false);
    try {
      const base = getConfiguredApiUrl();
      if (!base) {
        throw new Error("Backend nao configurado.");
      }
      const trimmed = question?.trim();
      // A função `fonteia` tem verify_jwt: a página é logada, então mandamos o
      // token da sessão (cai para a chave pública se, por algum motivo, não houver).
      const { key } = getSupabasePublicConfig();
      const response = await fetch(`${trimTrailingSlash(base)}/ia/raio-x`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          apikey: key,
          authorization: `Bearer ${session?.access_token ?? key}`,
        },
        body: JSON.stringify(trimmed ? { lot, question: trimmed } : { lot }),
      });
      const data = (await response.json()) as {
        answer?: string;
        model?: string;
        disclaimer?: string;
        error?: string;
        message?: string;
      };

      if (response.status === 503) {
        setIaUnavailable(true);
        setIaAnswer(null);
        return;
      }
      if (!response.ok) {
        throw new Error(data.message ?? data.error ?? `Erro ${response.status}`);
      }

      setIaAnswer(data.answer ?? null);
      setIaModel(data.model ?? null);
      setIaDisclaimer(data.disclaimer ?? null);
    } catch (error) {
      setIaError(error instanceof Error ? error.message : String(error));
    } finally {
      setIaLoading(false);
    }
  }

  useEffect(() => {
    setAlertName(`Alerta — Edital ${lot.edital}`);
  }, [lot.edital]);

  // Reinicia o assistente ao trocar de lote
  useEffect(() => {
    setIaAnswer(null);
    setIaModel(null);
    setIaDisclaimer(null);
    setIaError(null);
    setIaUnavailable(false);
    setIaQuestion("");
  }, [lot.id]);

  useEffect(() => {
    return () => {
      if (successTimerRef.current !== null) {
        clearTimeout(successTimerRef.current);
      }
    };
  }, []);

  async function handleSaveAlert() {
    setAlertOpen(false);
    if (!isPro) {
      setSuccessMessage("Alertas por e-mail sao do plano Profissional. Assine (ou use o cupom de teste) para receber avisos de prazo.");
      successTimerRef.current = setTimeout(() => setSuccessMessage(null), 6000);
      return;
    }
    const email = session?.user?.email ?? "";
    if (supabase && email) {
      // Alerta REAL no servidor (RPC create_alert) — dispara e-mail quando o prazo chega.
      try {
        const { data, error } = await supabase.rpc("create_alert", {
          p_lot_id: lot.id,
          p_lot_label: `Lote ${lot.displayNumber} — ${lot.edital}`,
          p_edital: lot.edital,
          p_deadline: lot.proposalDeadline,
          p_email: email,
        });
        const d = (data ?? {}) as { ok?: boolean; message?: string };
        setSuccessMessage(
          !error && d.ok
            ? `✓ ${d.message ?? "Alerta criado!"} (${email})`
            : d.message ?? "Nao consegui criar o alerta agora. Tente de novo.",
        );
      } catch {
        setSuccessMessage("Nao consegui criar o alerta agora. Tente de novo.");
      }
    } else {
      setSuccessMessage("Entre na sua conta para receber alertas por e-mail deste lote.");
    }
    successTimerRef.current = setTimeout(() => {
      setSuccessMessage(null);
    }, 5000);
  }

  async function baixarEdital() {
    setEditalLoading(true);
    try {
      const { url, key } = getSupabasePublicConfig();
      const res = await fetch(
        `${trimTrailingSlash(url)}/functions/v1/edital-pdf?edle=${encodeURIComponent(lot.edle)}`,
        { headers: { apikey: key } },
      );
      if (!res.ok) {
        setSuccessMessage(
          res.status === 404
            ? "Este edital ainda nao tem PDF publicado no SLE."
            : "Nao consegui baixar o edital agora.",
        );
        successTimerRef.current = setTimeout(() => setSuccessMessage(null), 4000);
        return;
      }
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = `edital_${lot.edital.replaceAll("/", "_")}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objUrl);
    } catch {
      setSuccessMessage("Nao consegui baixar o edital agora.");
      successTimerRef.current = setTimeout(() => setSuccessMessage(null), 4000);
    } finally {
      setEditalLoading(false);
    }
  }

  async function baixarRelacao() {
    setRelacaoLoading(true);
    try {
      const { url, key } = getSupabasePublicConfig();
      const res = await fetch(
        `${trimTrailingSlash(url)}/functions/v1/edital-pdf?edle=${encodeURIComponent(lot.edle)}&doc=relacao-lotes`,
        { headers: { apikey: key } },
      );
      if (!res.ok) {
        setSuccessMessage(
          res.status === 404
            ? "Este edital nao tem relacao de itens publicada no SLE."
            : "Nao consegui baixar a relacao de itens agora.",
        );
        successTimerRef.current = setTimeout(() => setSuccessMessage(null), 4000);
        return;
      }
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = `relacao-itens_${lot.edital.replaceAll("/", "_")}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objUrl);
    } catch {
      setSuccessMessage("Nao consegui baixar a relacao de itens agora.");
      successTimerRef.current = setTimeout(() => setSuccessMessage(null), 4000);
    } finally {
      setRelacaoLoading(false);
    }
  }

  async function analisarEdital() {
    if (!isPro) {
      setEditalIA(null);
      setEditalIAError("A analise do edital por IA e do plano Profissional. Assine (ou use o cupom de teste) para destravar.");
      return;
    }
    setEditalIALoading(true);
    setEditalIAError(null);
    setEditalIA(null);
    try {
      const base = getConfiguredApiUrl();
      if (!base) throw new Error("Backend nao configurado.");
      const { key } = getSupabasePublicConfig();
      const res = await fetch(`${trimTrailingSlash(base)}/ia/edital`, {
        method: "POST",
        // Manda o token da sessão: o backend confere o plano (my_plan) antes de gastar IA.
        headers: {
          "content-type": "application/json",
          apikey: key,
          authorization: `Bearer ${session?.access_token ?? key}`,
        },
        body: JSON.stringify({ edle: lot.edle }),
      });
      const data = (await res.json()) as { answer?: string; error?: string; message?: string };
      if (res.status === 403) {
        setEditalIAError("A analise do edital por IA e do plano Profissional. Assine (ou use o cupom de teste) para destravar.");
        return;
      }
      if (res.status === 404) {
        setEditalIAError("Este edital ainda nao tem PDF publicado no SLE.");
        return;
      }
      if (res.status === 503) {
        setEditalIAError("A analise por IA ainda nao foi ativada.");
        return;
      }
      if (!res.ok || !data.answer) throw new Error(data.message ?? data.error ?? `Erro ${res.status}`);
      setEditalIA(data.answer);
    } catch (e) {
      setEditalIAError(e instanceof Error ? e.message : String(e));
    } finally {
      setEditalIALoading(false);
    }
  }

  // Evidence for EvidencePanel.
  // confidence: 1 = "cópia direta da fonte oficial, sem interpretação" (sem metodologia inventada).
  // hash: SHA-256 do conteúdo factual exibido — prova que o que está na tela não foi alterado
  // após a computação. NÃO é hash verificado na coleta; é hash do que a tela exibe agora.
  const evidenceItems = useMemo(() => [
    {
      id: `ev-detail-${lot.id}`,
      sourceId: lot.sourceId,
      sourceUrl: lot.sourceUrl,
      kind: "api_payload" as const,
      collectedAt: lot.collectedAt,
      rawRecordId: lot.id,
      quote: `Lote ${lot.displayNumber} — edital ${lot.edital}, lance minimo ${formatBRL(lot.minimumBidCents / 100)}, prazo ${formatDeadline(lot.proposalDeadline)}.`,
      confidence: 1 as const,
      ...(contentHash !== null ? { hash: `sha256:${contentHash}` } : {}),
    },
  ], [lot, contentHash]);

  // FonteDots source
  const fonteDotsSources = [
    {
      sigla: "SLE",
      cor: "#0f5f4a",
      nome: "Receita Federal — Sistema de Leiloes Eletronicos",
    },
  ];

  return (
    <>
      {/* Print block — hidden on screen, visible only on print */}
      <PrintReport lot={lot} scoring={scoring} economia={economia} />

      {/* Screen content */}
      <div className="lot-detail no-print">
        {/* ── Main column ─────────────────────────────────────────────────── */}
        <div className="lot-detail-main">
          {/* Back button */}
          <button className="ghost-button lot-back-button" onClick={onBack} type="button">
            <ArrowLeft aria-hidden="true" size={16} />
            Voltar
          </button>

          {/* ════════════════════════════════════════════════════════════════
              HERO — foto + identidade + valor + ações (tudo no topo)
              ════════════════════════════════════════════════════════════════ */}
          <section
            className="lot-detail-header"
            style={{ display: "flex", flexDirection: "column", gap: "var(--s-5)", padding: "var(--s-5)" }}
          >
            {/* Foto / galeria com overlays */}
            <LotPhoto
              images={images}
              alt={`Foto do lote ${lot.displayNumber} — ${lot.category ?? lot.agency}`}
              overlay={
                <>
                  {/* Categoria — canto superior esquerdo, quando existe */}
                  {lot.category ? (
                    <span
                      className="badge badge--neutral"
                      style={{
                        position: "absolute",
                        top: "var(--s-3)",
                        left: "var(--s-3)",
                        maxWidth: "60%",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        textTransform: "capitalize",
                      }}
                    >
                      <Package aria-hidden="true" size={12} />
                      {lot.category.toLowerCase()}
                    </span>
                  ) : null}

                  {/* Desconto — canto superior direito, só com economia honesta */}
                  {economia ? (
                    <span
                      className="badge"
                      style={{
                        position: "absolute",
                        top: "var(--s-3)",
                        right: "var(--s-3)",
                        background: "var(--g-700)",
                        color: "#fff",
                        fontWeight: 800,
                        boxShadow: "var(--shadow-sm)",
                      }}
                    >
                      <TrendingDown aria-hidden="true" size={12} />-{economia.descontoPct}% vs avaliacao
                    </span>
                  ) : null}

                  {/* Score — canto inferior direito */}
                  <div style={{ position: "absolute", bottom: "var(--s-3)", right: "var(--s-3)" }}>
                    <ScoreRing score={scoring.score} size="lg" />
                  </div>
                </>
              }
            />

            {/* Badges de identidade */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--s-2)" }}>
              <span className={`badge ${confianca.className}`}>
                <ShieldCheck aria-hidden="true" size={12} />
                {confianca.label}
              </span>
              <span className="badge badge--neutral" style={{ fontFamily: "monospace" }}>
                Lote {lot.displayNumber}
              </span>
              {lot.eligiblePersonTypes.includes("pf") ? (
                <span className="badge badge--info">
                  <Users aria-hidden="true" size={12} />
                  PF permitida
                </span>
              ) : (
                <span className="badge badge--warn">
                  <Users aria-hidden="true" size={12} />
                  Somente PJ
                </span>
              )}
              <span
                className={`badge score-label-${scoring.label}`}
                style={{ background: "var(--n-50)", border: "1px solid var(--n-100)" }}
              >
                Oportunidade {scoring.label.toUpperCase()}
              </span>
            </div>

            {/* Título — o que é o lote (descrição real dos bens), com o edital de subtítulo */}
            {itemTitle ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-1)" }}>
                <span className="section-label">O que e este lote</span>
                <h2 style={{ margin: 0, lineHeight: 1.2, overflowWrap: "anywhere" }}>{itemTitle}</h2>
                <span style={{ fontSize: "0.8rem", color: "var(--n-400)", fontFamily: "monospace" }}>
                  {lotTitle}
                </span>
              </div>
            ) : (
              <h2 style={{ margin: 0, lineHeight: 1.2, overflowWrap: "anywhere" }}>{lotTitle}</h2>
            )}

            {/* Órgão + cidade */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "var(--s-4)",
                color: "var(--n-500)",
                fontSize: "0.9rem",
                marginTop: "calc(-1 * var(--s-2))",
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--s-2)" }}>
                <Building2 aria-hidden="true" size={14} />
                {lot.agency}
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--s-2)" }}>
                <MapPin aria-hidden="true" size={14} />
                {cityLabel}
              </span>
            </div>

            {/* Avisos oficiais do lote (ex.: bens em outra unidade) — só quando a fonte traz */}
            {avisos.length > 0 ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--s-2)",
                  padding: "var(--s-3) var(--s-4)",
                  borderRadius: "var(--r-md)",
                  background: "var(--color-warning-bg)",
                  border: "1px solid var(--color-warning)",
                }}
              >
                <span
                  className="section-label"
                  style={{ display: "inline-flex", alignItems: "center", gap: "var(--s-2)", color: "var(--color-warning)" }}
                >
                  <ShieldCheck aria-hidden="true" size={13} />
                  Avisos da fonte oficial
                </span>
                {avisos.map((aviso, i) => (
                  <p key={i} style={{ margin: 0, fontSize: "0.82rem", lineHeight: 1.5, color: "var(--n-700)" }}>
                    {aviso}
                  </p>
                ))}
              </div>
            ) : null}

            {/* Bloco de valor — lance mínimo + economia (quando houver) */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "var(--s-3)",
              }}
            >
              {/* Lance mínimo (sempre) */}
              <div
                style={{
                  flex: "1 1 200px",
                  minWidth: 0,
                  background: "var(--g-50)",
                  border: "1px solid var(--n-100)",
                  borderLeft: "3px solid var(--g-500)",
                  borderRadius: "0 var(--r-md) var(--r-md) 0",
                  padding: "var(--s-3) var(--s-4)",
                }}
              >
                <span className="section-label">Lance minimo</span>
                <strong
                  style={{
                    display: "block",
                    marginTop: "var(--s-1)",
                    fontSize: "1.5rem",
                    fontWeight: 800,
                    color: "var(--g-700)",
                    fontVariantNumeric: "tabular-nums",
                    lineHeight: 1.1,
                  }}
                >
                  {formatBRL(lot.minimumBidCents / 100)}
                </strong>
              </div>

              {/* Economia real (avaliação − mínimo) — só quando honesta */}
              {economia ? (
                <div
                  style={{
                    flex: "1 1 200px",
                    minWidth: 0,
                    background: "var(--color-success-bg)",
                    border: "1px solid var(--g-200)",
                    borderLeft: "3px solid var(--g-600)",
                    borderRadius: "0 var(--r-md) var(--r-md) 0",
                    padding: "var(--s-3) var(--s-4)",
                  }}
                >
                  <span
                    className="section-label"
                    style={{ display: "inline-flex", alignItems: "center", gap: "var(--s-1)" }}
                  >
                    <TrendingDown aria-hidden="true" size={12} />
                    Economia potencial
                  </span>
                  <strong
                    style={{
                      display: "block",
                      marginTop: "var(--s-1)",
                      fontSize: "1.5rem",
                      fontWeight: 800,
                      color: "var(--color-success)",
                      fontVariantNumeric: "tabular-nums",
                      lineHeight: 1.1,
                    }}
                  >
                    {formatBRL(economia.economiaCents / 100)}
                  </strong>
                  <span style={{ fontSize: "0.75rem", color: "var(--n-500)" }}>
                    -{economia.descontoPct}% sobre avaliacao de {formatBRL(economia.avaliacaoCents / 100)}
                  </span>
                </div>
              ) : null}
            </div>

            {/* Prazo / urgência */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--s-2)",
                flexWrap: "wrap",
                padding: "var(--s-3) var(--s-4)",
                borderRadius: "var(--r-md)",
                background: dlTone.bg,
                color: dlTone.fg,
                fontSize: "0.85rem",
                fontWeight: 700,
              }}
            >
              <CalendarClock aria-hidden="true" size={15} />
              <span>{deadlineStatusLabel(days)}</span>
              <span style={{ fontWeight: 400, opacity: 0.85 }}>
                · encerra {formatDeadline(lot.proposalDeadline)}
              </span>
            </div>

            {/* Ações primárias — alvos de toque ≥44px, empilham no mobile */}
            <div className="lot-hero-actions">
              <a
                href={lot.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="primary-button lot-hero-action"
              >
                <ExternalLink aria-hidden="true" size={16} />
                Participar no leilao
              </a>
              <button
                className="ghost-button lot-hero-action"
                onClick={() => {
                  setAlertOpen(true);
                }}
                type="button"
              >
                <Bell aria-hidden="true" size={16} />
                Criar alerta de prazo
              </button>
              <button
                className="ghost-button lot-hero-action"
                onClick={() => void baixarEdital()}
                type="button"
                disabled={editalLoading}
              >
                {editalLoading ? (
                  <Loader2 aria-hidden="true" size={16} className="spin" />
                ) : (
                  <FileText aria-hidden="true" size={16} />
                )}
                Baixar edital (PDF)
              </button>
              <button
                className="ghost-button lot-hero-action"
                onClick={() => void baixarRelacao()}
                type="button"
                disabled={relacaoLoading}
              >
                {relacaoLoading ? (
                  <Loader2 aria-hidden="true" size={16} className="spin" />
                ) : (
                  <FileText aria-hidden="true" size={16} />
                )}
                Baixar relacao de itens (PDF)
              </button>
              <button
                className="ghost-button lot-hero-action"
                onClick={() => void analisarEdital()}
                type="button"
                disabled={editalIALoading}
                title={isPro ? "Analisar o edital com IA" : "Recurso do plano Profissional"}
              >
                {editalIALoading ? (
                  <Loader2 aria-hidden="true" size={16} className="spin" />
                ) : (
                  <Sparkles aria-hidden="true" size={16} />
                )}
                Analisar edital com IA
              </button>
              <button
                className="ghost-button lot-hero-action"
                onClick={() => {
                  window.print();
                }}
                type="button"
              >
                <Printer aria-hidden="true" size={16} />
                Gerar relatorio PDF
              </button>
            </div>

            {successMessage ? (
              <div className="lot-success-message">{successMessage}</div>
            ) : null}
          </section>

          {/* ══════════════════════════════════════════════════════════════════
              RAIO-X COM IA — card proeminente logo após o hero, visível em
              destaque antes de qualquer outra seção (desktop e mobile).
              ══════════════════════════════════════════════════════════════════ */}
          <section
            className="lot-detail-header raio-x-featured"
            aria-label="Assistente Fonte.ia — Raio-X do lote"
            style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)", padding: "var(--s-5)" }}
          >
            {/* Cabeçalho do card */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--s-3)",
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "var(--r-md)",
                  background: iaAnswer ? "var(--g-700)" : "linear-gradient(135deg, var(--g-600), var(--g-500))",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                <Sparkles aria-hidden="true" size={20} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ display: "block", fontSize: "1rem", color: "var(--n-900)", fontWeight: 800 }}>
                  Assistente Fonte.ia
                </strong>
                <span style={{ fontSize: "0.78rem", color: iaAnswer ? "var(--g-700)" : "var(--n-400)", fontWeight: iaAnswer ? 700 : 400 }}>
                  {iaLoading
                    ? "Analisando o lote…"
                    : iaAnswer
                    ? "Raio-X gerado com IA"
                    : iaUnavailable
                    ? "Em ativacao"
                    : "Raio-X do lote com IA — entenda este lote em segundos"}
                </span>
              </div>
            </div>

            {/* Estado: carregando */}
            {iaLoading ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "var(--s-2)",
                  padding: "var(--s-5)",
                  background: "var(--n-50)",
                  border: "1px solid var(--n-100)",
                  borderRadius: "var(--r-md)",
                  fontSize: "0.85rem",
                  color: "var(--n-500)",
                }}
              >
                <Loader2 aria-hidden="true" size={18} className="spin" />
                Lendo os dados oficiais e montando o Raio-X…
              </div>
            ) : iaAnswer ? (
              /* Estado: resposta da IA */
              <div
                style={{
                  background: "var(--g-50)",
                  border: "1px solid var(--g-200)",
                  borderLeft: "4px solid var(--g-500)",
                  borderRadius: "0 var(--r-md) var(--r-md) 0",
                  padding: "var(--s-4) var(--s-5)",
                  fontSize: "0.88rem",
                  lineHeight: 1.65,
                  color: "var(--n-700)",
                }}
              >
                {iaAnswer.split("\n").map((line, i) =>
                  line.trim() === "" ? (
                    <div key={i} style={{ height: "var(--s-2)" }} />
                  ) : (
                    <p key={i} style={{ margin: "0 0 var(--s-2)" }}>
                      {renderInline(line)}
                    </p>
                  ),
                )}
                {iaDisclaimer ? (
                  <p
                    style={{
                      margin: "var(--s-3) 0 0",
                      fontSize: "0.72rem",
                      color: "var(--n-400)",
                      borderTop: "1px solid var(--n-100)",
                      paddingTop: "var(--s-2)",
                    }}
                  >
                    {iaDisclaimer}
                    {iaModel ? ` · Modelo: ${iaModel}` : ""}
                  </p>
                ) : null}
              </div>
            ) : iaUnavailable ? (
              /* Estado: IA ainda nao configurada */
              <div
                style={{
                  background: "var(--n-50)",
                  border: "1px dashed var(--n-200)",
                  borderRadius: "var(--r-md)",
                  padding: "var(--s-4)",
                  fontSize: "0.85rem",
                  color: "var(--n-500)",
                  lineHeight: 1.55,
                  textAlign: "center",
                }}
              >
                <p style={{ margin: "0 0 var(--s-2)" }}>
                  O assistente de IA ainda nao foi ativado nesta conta.
                </p>
                <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--n-400)" }}>
                  Os dados acima vem direto da fonte oficial. A analise por IA liga assim que a
                  chave da Anthropic for configurada no servidor.
                </p>
              </div>
            ) : (
              /* Estado: ocioso — convida a gerar (CTA grande e destacado) */
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--s-3)",
                  padding: "var(--s-4)",
                  background: "var(--g-50)",
                  border: "1px solid var(--g-200)",
                  borderRadius: "var(--r-md)",
                }}
              >
                <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--n-600)", lineHeight: 1.55 }}>
                  Gere uma leitura em linguagem simples deste lote — o que e, quem pode dar lance,
                  prazo, valor de partida e o que conferir no edital.
                </p>
                <button
                  className="primary-button raio-x-cta"
                  onClick={() => { void runRaioX(); }}
                  type="button"
                >
                  <Sparkles aria-hidden="true" size={18} />
                  Gerar Raio-X com IA
                </button>
              </div>
            )}

            {/* Erro */}
            {iaError ? (
              <p
                style={{
                  margin: 0,
                  fontSize: "0.78rem",
                  color: "var(--color-error)",
                  padding: "var(--s-2) var(--s-3)",
                  background: "var(--color-error-bg)",
                  borderRadius: "var(--r-sm)",
                }}
              >
                Nao consegui gerar agora: {iaError}
              </p>
            ) : null}

            {/* Pergunta livre — disponivel quando a IA respondeu ao menos uma vez */}
            {iaAnswer ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!iaLoading && iaQuestion.trim()) {
                    void runRaioX(iaQuestion);
                  }
                }}
                style={{ display: "flex", gap: "var(--s-2)" }}
              >
                <input
                  type="text"
                  value={iaQuestion}
                  onChange={(e) => { setIaQuestion(e.target.value); }}
                  placeholder="Pergunte algo sobre este lote…"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: "10px var(--s-3)",
                    fontSize: "0.88rem",
                    border: "1.5px solid var(--n-200)",
                    borderRadius: "var(--r-md)",
                    background: "var(--surface, #fff)",
                    color: "var(--n-900)",
                    outline: "none",
                  }}
                />
                <button
                  className="ghost-button"
                  type="submit"
                  disabled={iaLoading || !iaQuestion.trim()}
                  aria-label="Enviar pergunta"
                  style={{ flexShrink: 0, minHeight: 44 }}
                >
                  <Send aria-hidden="true" size={16} />
                </button>
              </form>
            ) : null}
          </section>

          {/* ── Análise do edital por IA (Pro: Gemini lê o PDF inteiro) ────── */}
          {editalIA || editalIAError || editalIALoading ? (
            <section className="lot-detail-header" style={{ display: "flex", flexDirection: "column", gap: "var(--s-3)" }}>
              <div>
                <span className="section-label">Análise do edital por IA</span>
                <h3 style={{ marginTop: "var(--s-1)", display: "flex", alignItems: "center", gap: "var(--s-2)" }}>
                  <Sparkles aria-hidden="true" size={16} /> O que diz o edital
                </h3>
              </div>
              {editalIALoading ? (
                <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", color: "var(--n-500)", fontSize: "0.85rem" }}>
                  <Loader2 size={16} className="spin" aria-hidden="true" /> Lendo o edital oficial…
                </div>
              ) : editalIAError ? (
                <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--n-600)" }}>{editalIAError}</p>
              ) : editalIA ? (
                <div style={{ fontSize: "0.88rem", lineHeight: 1.65, color: "var(--n-700)" }}>
                  {editalIA.split("\n").map((line, i) =>
                    line.trim() === "" ? (
                      <div key={i} style={{ height: "var(--s-2)" }} />
                    ) : (
                      <p key={i} style={{ margin: "0 0 var(--s-2)" }}>{renderInline(line)}</p>
                    ),
                  )}
                  <p style={{ margin: "var(--s-2) 0 0", fontSize: "0.72rem", color: "var(--n-400)" }}>
                    Análise por IA do PDF oficial do edital. Confirme tudo no edital antes de dar lance.
                  </p>
                </div>
              ) : null}
            </section>
          ) : null}

          {/* ── Como dar lance (guia honesto pra quem nunca participou) ────── */}
          <ComoDarLance sourceUrl={lot.sourceUrl} />

          {/* ── Custo total estimado (o que realmente sai do bolso) ───────── */}
          <section className="lot-detail-header" style={{ display: "flex", flexDirection: "column", gap: "var(--s-3)" }}>
            <div>
              <span className="section-label">Quanto voce paga de verdade</span>
              <h3 style={{ marginTop: "var(--s-1)" }}>Custo total estimado</h3>
            </div>
            {(() => {
              const custo = estimarCustoTotal({ lanceCents: lot.minimumBidCents });
              const rowTd: React.CSSProperties = {
                padding: "10px 0",
                fontSize: "0.9rem",
                color: "var(--n-600)",
                borderBottom: "1px solid var(--n-100)",
              };
              const valTd: React.CSSProperties = {
                padding: "10px 0",
                textAlign: "right",
                fontWeight: 700,
                color: "var(--n-700)",
                fontVariantNumeric: "tabular-nums",
                borderBottom: "1px solid var(--n-100)",
              };
              return (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <tbody>
                    <tr>
                      <td style={rowTd}>Lance minimo</td>
                      <td style={valTd}>{formatBRL(custo.lanceCents / 100)}</td>
                    </tr>
                    <tr>
                      <td style={rowTd}>Comissao do leiloeiro (5%)</td>
                      <td style={valTd}>{formatBRL(custo.comissaoCents / 100)}</td>
                    </tr>
                    <tr>
                      <td style={{ ...rowTd, borderBottom: "none", fontWeight: 800, color: "var(--n-900)" }}>
                        Custo estimado (no minimo)
                      </td>
                      <td style={{ ...valTd, borderBottom: "none", fontWeight: 800, fontSize: "1.1rem", color: "var(--g-700)" }}>
                        {formatBRL(custo.totalCents / 100)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              );
            })()}
            <p style={{ fontSize: "0.75rem", color: "var(--n-400)", margin: 0 }}>
              Estimativa: lance + comissao padrao de 5% do leiloeiro. <strong>Nao inclui</strong> tributos
              (ICMS/IOF), retirada, frete e encargos — que variam por edital. Confirme no edital antes de propor.
            </p>

            {/* Referência de mercado (FIPE) — só veículos, só quando casou com confiança */}
            {fipe?.encontrado ? (
              <div
                style={{
                  marginTop: "var(--s-2)",
                  padding: "var(--s-3) var(--s-4)",
                  borderRadius: "0 var(--r-md) var(--r-md) 0",
                  background: "var(--g-50)",
                  border: "1px solid var(--n-100)",
                  borderLeft: "3px solid var(--g-500)",
                }}
              >
                <span className="section-label">Referencia de mercado (FIPE)</span>
                <strong
                  style={{
                    display: "block",
                    marginTop: "var(--s-1)",
                    fontSize: "1.2rem",
                    fontWeight: 800,
                    color: "var(--g-700)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {formatBRL(fipe.fipeCents / 100)}
                </strong>
                <span style={{ fontSize: "0.78rem", color: "var(--n-500)" }}>{fipe.modelo}</span>
                <p style={{ fontSize: "0.72rem", color: "var(--n-400)", margin: "var(--s-2) 0 0", lineHeight: 1.5 }}>
                  Valor FIPE de referencia — nao e o valor do bem leiloado (pode ter avarias ou faltar
                  documento). Use como orientacao e confirme.
                </p>
              </div>
            ) : null}
          </section>

          {/* ── Itens do lote (gracioso: só quando a fonte traz os dados) ──── */}
          {itensInfo ? (
            <section
              className="lot-detail-header"
              style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}
            >
              <div>
                <span className="section-label">Conteudo</span>
                <h3
                  style={{
                    marginTop: "var(--s-1)",
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--s-2)",
                  }}
                >
                  <Package aria-hidden="true" size={16} />
                  Itens do lote
                </h3>
              </div>

              {itensInfo.recinto ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--s-2)",
                    fontSize: "0.875rem",
                    color: "var(--n-600)",
                  }}
                >
                  <MapPin aria-hidden="true" size={14} />
                  <span>
                    Recinto / patio: <strong style={{ color: "var(--n-900)" }}>{itensInfo.recinto}</strong>
                  </span>
                </div>
              ) : null}

              {itensInfo.itens.length > 0 ? (
                <ul
                  style={{
                    listStyle: "none",
                    margin: 0,
                    padding: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--s-2)",
                  }}
                >
                  {itensInfo.itens.map((item, i) => (
                    <li
                      key={`${item.descricao}-${i}`}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: "var(--s-3)",
                        padding: "10px var(--s-3)",
                        background: "var(--n-50)",
                        border: "1px solid var(--n-100)",
                        borderRadius: "var(--r-md)",
                        fontSize: "0.875rem",
                        color: "var(--n-700)",
                        lineHeight: 1.45,
                      }}
                    >
                      <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{item.descricao}</span>
                      {item.quantidade ? (
                        <span
                          className="badge badge--neutral"
                          style={{ flexShrink: 0, fontVariantNumeric: "tabular-nums" }}
                        >
                          {item.quantidade}
                          {item.unidade ? ` ${item.unidade}` : ""}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}

              <p style={{ fontSize: "0.75rem", color: "var(--n-400)", margin: 0 }}>
                Descricoes conforme publicadas na fonte oficial. Confirme quantidades e estado dos bens
                no edital antes de propor.
              </p>
            </section>
          ) : null}

          {/* ── Resumo factual + riscos por regra + checklist ─────────────── */}
          <section
            className="lot-detail-header"
            style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}
          >
            <div>
              <span className="section-label">Relatorio por template</span>
              <h3 style={{ marginTop: "var(--s-1)" }}>Resumo factual do lote</h3>
            </div>

            {/* Factual summary */}
            <div
              style={{
                background: "var(--g-50)",
                border: "1px solid var(--n-100)",
                borderLeft: "3px solid var(--g-500)",
                borderRadius: "0 var(--r-md) var(--r-md) 0",
                padding: "var(--s-4)",
                fontSize: "0.9rem",
                lineHeight: 1.65,
                color: "var(--n-700)",
              }}
            >
              <p style={{ margin: 0 }}>
                O lote <strong>{lot.displayNumber}</strong> faz parte do edital{" "}
                <strong>{lot.edital}</strong> conduzido por{" "}
                <strong>{lot.agency}</strong>, com sede em{" "}
                <strong>{cityLabel}</strong>.{" "}
                {lot.category ? (
                  <>
                    Categoria do bem: <strong>{lot.category}</strong>.{" "}
                  </>
                ) : null}
                O prazo final para propostas e{" "}
                <strong>{formatDeadline(lot.proposalDeadline)}</strong>. O lance
                minimo definido na fonte oficial e de{" "}
                <strong>{formatBRL(lot.minimumBidCents / 100)}</strong>.{" "}
                {economia ? (
                  <>
                    A avaliacao oficial e de{" "}
                    <strong>{formatBRL(economia.avaliacaoCents / 100)}</strong>, o que representa uma
                    economia potencial de{" "}
                    <strong>{formatBRL(economia.economiaCents / 100)}</strong> ({economia.descontoPct}%
                    abaixo da avaliacao).{" "}
                  </>
                ) : null}
                {eligibilityLong(lot)}
              </p>
              <p style={{ marginTop: "var(--s-3)", marginBottom: 0, fontSize: "0.8rem", color: "var(--n-400)" }}>
                Fonte: Receita Federal — SLE (receita-leiloes-sle). Coletado em{" "}
                {formatDateShort(lot.collectedAt)}. Todos os dados acima sao exatamente os
                publicados na fonte — sem estimativas ou complementos.
              </p>
            </div>

            {/* Rule-based risks */}
            <div>
              <h3 style={{ marginBottom: "var(--s-3)" }}>
                Riscos detectados por regra (scoring)
              </h3>
              <ul className="score-factor-list">
                {scoring.factors.map((factor) => (
                  <li
                    className={`score-factor score-factor-${factor.impact}`}
                    key={factor.id}
                  >
                    <span className="score-factor-icon" aria-hidden="true">
                      {impactIcon(factor.impact)}
                    </span>
                    <span>{factor.label}</span>
                    {factor.points !== 0 ? (
                      <span className="score-factor-points">
                        {factor.points > 0 ? "+" : ""}
                        {factor.points}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
              <p
                style={{
                  fontSize: "0.75rem",
                  color: "var(--n-400)",
                  marginTop: "var(--s-2)",
                }}
              >
                Estes riscos sao calculados automaticamente por regras fixas — nao sao opiniao de
                IA nem analise humana. Consulte o edital para confirmacao.
              </p>
            </div>

            {/* Generic checklist */}
            <div>
              <span className="section-label">Orientacoes gerais</span>
              <h3 style={{ marginTop: "var(--s-1)", marginBottom: "var(--s-3)" }}>
                Checklist antes de propor
              </h3>
              <ul
                style={{
                  listStyle: "none",
                  margin: 0,
                  padding: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--s-2)",
                }}
              >
                {[
                  "Leia o edital oficial completo antes de qualquer proposta.",
                  "Confirme as regras de retirada, patio de armazenagem e frete.",
                  "Verifique documentos exigidos para participacao e habilitacao.",
                  "Pesquise o valor de mercado do bem para definir seu lance maximo.",
                  "Cheque tributos, onus e encargos que possam recair sobre o lote.",
                  "Certifique-se de que voce atende ao criterio de elegibilidade (PF/PJ).",
                  "O score e um apoio de decisao — nao substitui a leitura do edital.",
                ].map((item) => (
                  <li
                    key={item}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "var(--s-2)",
                      fontSize: "0.875rem",
                      color: "var(--n-700)",
                      lineHeight: 1.5,
                    }}
                  >
                    <CheckSquare
                      aria-hidden="true"
                      size={15}
                      style={{
                        flexShrink: 0,
                        marginTop: 2,
                        color: "var(--g-600)",
                      }}
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* ── Financeiro ────────────────────────────────────────────────── */}
          <section className="lot-detail-header" style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
            <div>
              <span className="section-label">Financeiro</span>
              <h3 style={{ marginTop: "var(--s-1)" }}>Valores do lote</h3>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {economia ? (
                  <>
                    <tr>
                      <td
                        style={{
                          padding: "12px 0",
                          fontSize: "0.9rem",
                          color: "var(--n-600)",
                          borderBottom: "1px solid var(--n-100)",
                        }}
                      >
                        Avaliacao oficial
                      </td>
                      <td
                        style={{
                          padding: "12px 0",
                          textAlign: "right",
                          fontSize: "1rem",
                          fontWeight: 700,
                          color: "var(--n-700)",
                          fontVariantNumeric: "tabular-nums",
                          borderBottom: "1px solid var(--n-100)",
                        }}
                      >
                        {formatBRL(economia.avaliacaoCents / 100)}
                      </td>
                    </tr>
                    <tr>
                      <td
                        style={{
                          padding: "12px 0",
                          fontSize: "0.9rem",
                          color: "var(--n-600)",
                          borderBottom: "1px solid var(--n-100)",
                        }}
                      >
                        Economia (avaliacao − minimo){" "}
                        <span style={{ fontSize: "0.72rem", color: "var(--n-400)", fontWeight: 400 }}>
                          ({economia.descontoPct}% de desconto)
                        </span>
                      </td>
                      <td
                        style={{
                          padding: "12px 0",
                          textAlign: "right",
                          fontSize: "1rem",
                          fontWeight: 800,
                          color: "var(--color-success)",
                          fontVariantNumeric: "tabular-nums",
                          borderBottom: "1px solid var(--n-100)",
                        }}
                      >
                        {formatBRL(economia.economiaCents / 100)}
                      </td>
                    </tr>
                  </>
                ) : null}
                <tr>
                  <td
                    style={{
                      padding: "12px 0",
                      fontSize: "0.9rem",
                      color: "var(--n-600)",
                      borderBottom: "1px solid var(--n-100)",
                    }}
                  >
                    Lance minimo (fonte oficial)
                  </td>
                  <td
                    style={{
                      padding: "12px 0",
                      textAlign: "right",
                      fontSize: "1.1rem",
                      fontWeight: 800,
                      color: "var(--g-700)",
                      fontVariantNumeric: "tabular-nums",
                      borderBottom: "1px solid var(--n-100)",
                    }}
                  >
                    {formatBRL(lot.minimumBidCents / 100)}
                  </td>
                </tr>
                <tr>
                  <td
                    style={{
                      padding: "12px 0",
                      fontSize: "0.9rem",
                      color: "var(--n-600)",
                    }}
                  >
                    Teto sugerido por regra{" "}
                    <span
                      style={{
                        fontSize: "0.72rem",
                        color: "var(--n-400)",
                        fontWeight: 400,
                      }}
                    >
                      heurística (
                      {scoring.label === "alto"
                        ? "35%"
                        : scoring.label === "medio"
                        ? "20%"
                        : "10%"}
                      {" "}acima do mínimo) — não é valor de mercado; pesquise FIPE/mercado antes de definir seu lance
                    </span>
                  </td>
                  <td
                    style={{
                      padding: "12px 0",
                      textAlign: "right",
                      fontSize: "1rem",
                      fontWeight: 700,
                      fontVariantNumeric: "tabular-nums",
                      color: "var(--n-700)",
                    }}
                  >
                    {formatBRL(scoring.maxSuggestedBidCents / 100)}
                  </td>
                </tr>
              </tbody>
            </table>
            <p style={{ fontSize: "0.75rem", color: "var(--n-400)", margin: 0 }}>
              {economia
                ? "Tributos, onus e custos de remocao nao estao inclusos. Consulte o edital para os valores completos."
                : "Avaliacao oficial, descontos, tributos e custos adicionais nao estao disponiveis nesta fonte. Consulte o edital para valores completos."}
            </p>
          </section>

          {/* ── Analise de risco (barras por regra) ──────────────────────── */}
          <section className="lot-detail-header" style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
            <div>
              <span className="section-label">Analise de risco</span>
              <h3 style={{ marginTop: "var(--s-1)" }}>
                Dimensoes calculadas por regra
              </h3>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
              {riskBars.map((bar) => (
                <Bar key={bar.label} label={bar.label} value={bar.value} color={bar.color} />
              ))}
            </div>
            <p style={{ fontSize: "0.75rem", color: "var(--n-400)", margin: 0 }}>
              Valores calculados por regras fixas do scoring — nao por analise semantica. Use como
              orientacao inicial, nao como avaliacao definitiva.
            </p>
          </section>

          {/* ── Rastreabilidade ───────────────────────────────────────────── */}
          <section className="lot-detail-header" style={{ display: "flex", flexDirection: "column", gap: "var(--s-3)" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "var(--s-3)",
              }}
            >
              <div>
                <span className="section-label">Rastreabilidade</span>
                <h3 style={{ marginTop: "var(--s-1)" }}>Origem dos dados</h3>
              </div>
              <span className="badge badge--ok">
                <ShieldCheck aria-hidden="true" size={12} />
                Origem oficial rastreada
              </span>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--s-4)",
                padding: "var(--s-4)",
                background: "var(--n-50)",
                border: "1px solid var(--n-100)",
                borderRadius: "var(--r-md)",
                flexWrap: "wrap",
              }}
            >
              <FonteDots fontes={fonteDotsSources} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ display: "block", fontSize: "0.9rem", color: "var(--n-900)" }}>
                  Receita Federal — Sistema de Leiloes Eletronicos (SLE)
                </strong>
                <span style={{ fontSize: "0.78rem", color: "var(--n-400)" }}>
                  {lot.sourceId} · Coletado em {formatDateShort(lot.collectedAt)}
                </span>
              </div>
              <a
                href={lot.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="ghost-button"
                style={{ fontSize: "0.8rem", flexShrink: 0 }}
              >
                <ExternalLink aria-hidden="true" size={13} />
                Ver fonte
              </a>
            </div>
          </section>
        </div>

        {/* ── Sidebar (sticky) — apenas Evidência, Raio-X está no topo da coluna principal ── */}
        <div className="evidence-panel">
          <EvidencePanel
            evidence={evidenceItems}
            title={`Evidencia — Lote ${lot.displayNumber}`}
          />
        </div>
      </div>

      {/* ── Alert modal ──────────────────────────────────────────────────── */}
      {alertOpen ? (
        <div
          className="alert-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAlertOpen(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Criar alerta de prazo"
        >
          <div className="alert-modal">
            <h3>Criar alerta de prazo</h3>
            <div className="alert-modal-field">
              <label htmlFor="alert-name">Nome do alerta</label>
              <input
                id="alert-name"
                type="text"
                value={alertName}
                onChange={(e) => {
                  setAlertName(e.target.value);
                }}
              />
            </div>
            <div className="alert-modal-field">
              <label htmlFor="alert-channel">Canal de notificacao</label>
              <select
                id="alert-channel"
                value={alertChannel}
                onChange={(e) => {
                  setAlertChannel(e.target.value as AlertChannel);
                }}
              >
                {(Object.keys(channelLabels) as AlertChannel[]).map((key) => (
                  <option key={key} value={key}>
                    {channelLabels[key]}
                  </option>
                ))}
              </select>
            </div>
            <div className="alert-modal-actions">
              <button
                className="ghost-button"
                onClick={() => {
                  setAlertOpen(false);
                }}
                type="button"
              >
                Cancelar
              </button>
              <button className="primary-button" onClick={handleSaveAlert} type="button">
                Salvar alerta
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Local styles — escopo do componente, sem CSS global. */}
      <style>{`
        .lot-hero-actions {
          display: flex;
          flex-direction: column;
          gap: var(--s-2);
        }
        .lot-hero-action {
          width: 100%;
          justify-content: center;
          min-height: 44px;
          font-size: 0.9rem;
          text-decoration: none;
        }
        @media (min-width: 480px) {
          .lot-hero-actions {
            flex-direction: row;
            flex-wrap: wrap;
          }
          .lot-hero-actions .lot-hero-action:first-child {
            flex: 1 1 100%;
          }
          .lot-hero-actions .ghost-button.lot-hero-action {
            flex: 1 1 0;
          }
        }
      `}</style>
    </>
  );
}
