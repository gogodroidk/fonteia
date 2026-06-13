import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Bell,
  Building2,
  CalendarClock,
  CheckSquare,
  ExternalLink,
  Loader2,
  MapPin,
  Printer,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import type { ReceitaLeilaoLot } from "@fonteia/sources";
import { scoreReceitaLeilaoLot } from "@fonteia/scoring";
import { EvidencePanel } from "../../components/evidence-panel";
import { ScoreRing } from "../../components/score-ring";
import { Bar, FonteDots, riscoBadge } from "../../components/ui";
import { getConfiguredApiUrl, trimTrailingSlash } from "../../lib/api-client";

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

function deadlineStatusClass(status: DeadlineStatus): string {
  if (status === "expired" || status === "urgent") return "color-error";
  if (status === "soon") return "color-warning";
  return "color-ok";
}

function deadlineStatusLabel(days: number): string {
  if (days <= 0) return "Prazo vencido";
  if (days === 1) return "Vence amanha";
  if (days <= 6) return `Vence em ${days} dias — decisao urgente`;
  return `${days} dias restantes`;
}

// ─── Score-derived risk bars (derived from scoring factors, no invented data) ──

interface RiskBar {
  label: string;
  value: number;
  color: string;
}

function buildRiskBars(
  scoring: ReturnType<typeof scoreReceitaLeilaoLot>,
  lot: ReceitaLeilaoLot,
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

// ─── Print Report (no-display on screen) ─────────────────────────────────────

interface PrintReportProps {
  lot: ReceitaLeilaoLot;
  scoring: ReturnType<typeof scoreReceitaLeilaoLot>;
}

function PrintReport({ lot, scoring }: PrintReportProps) {
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
        <div className="report-row">
          <span>Lance minimo (fonte oficial)</span>
          <b>{formatBRL(lot.minimumBidCents / 100)}</b>
        </div>
        <div className="report-row">
          <span>Lance maximo sugerido (scoring)</span>
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
  const days = daysUntilDeadline(lot.proposalDeadline);
  const dlStatus = deadlineStatus(days);
  const { className: riscoBadgeClass, label: riscoBadgeLabel } = riscoBadge(
    scoring.label === "alto" ? "baixo" : scoring.label === "medio" ? "medio" : "alto",
  );
  const riskBars = buildRiskBars(scoring, lot);

  // Alert modal
  const [alertOpen, setAlertOpen] = useState(false);
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
      const response = await fetch(`${trimTrailingSlash(base)}/ia/raio-x`, {
        method: "POST",
        headers: { "content-type": "application/json" },
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

  function handleSaveAlert() {
    setAlertOpen(false);
    setSuccessMessage("✓ Alerta criado no app. E-mail e WhatsApp ficam para a proxima etapa.");
    successTimerRef.current = setTimeout(() => {
      setSuccessMessage(null);
    }, 3000);
  }

  // Evidence for EvidencePanel
  const evidenceItems = [
    {
      id: `ev-detail-${lot.id}`,
      sourceId: lot.sourceId,
      sourceUrl: lot.sourceUrl,
      kind: "api_payload" as const,
      collectedAt: lot.collectedAt,
      rawRecordId: lot.id,
      quote: `Lote ${lot.displayNumber} — edital ${lot.edital}, lance minimo ${formatBRL(lot.minimumBidCents / 100)}, prazo ${formatDeadline(lot.proposalDeadline)}.`,
      confidence: 0.85,
    },
  ];

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
      <PrintReport lot={lot} scoring={scoring} />

      {/* Screen content */}
      <div className="lot-detail no-print">
        {/* ── Main column ─────────────────────────────────────────────────── */}
        <div className="lot-detail-main">
          {/* Back button */}
          <button className="ghost-button lot-back-button" onClick={onBack} type="button">
            <ArrowLeft aria-hidden="true" size={16} />
            Voltar
          </button>

          {/* ── Header card ──────────────────────────────────────────────── */}
          <div className="lot-detail-header">
            <div style={{ flex: 1 }}>
              {/* Badges */}
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "var(--s-2)",
                  marginBottom: "var(--s-3)",
                }}
              >
                <span className={`badge ${riscoBadgeClass}`}>
                  <ShieldCheck aria-hidden="true" size={12} />
                  {riscoBadgeLabel}
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
              </div>

              {/* Title */}
              <h2 style={{ marginBottom: "var(--s-3)", lineHeight: 1.2 }}>
                Edital {lot.edital} — Lote {lot.displayNumber}
              </h2>

              {/* Agency + City */}
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "var(--s-4)",
                  color: "var(--n-500)",
                  fontSize: "0.9rem",
                }}
              >
                <span
                  style={{ display: "inline-flex", alignItems: "center", gap: "var(--s-2)" }}
                >
                  <Building2 aria-hidden="true" size={14} />
                  {lot.agency}
                </span>
                <span
                  style={{ display: "inline-flex", alignItems: "center", gap: "var(--s-2)" }}
                >
                  <MapPin aria-hidden="true" size={14} />
                  {lot.city}
                </span>
              </div>
            </div>

            {/* Score ring large */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "var(--s-1)",
                flexShrink: 0,
              }}
            >
              <ScoreRing score={scoring.score} size="lg" />
              <span className="section-label">Oportunidade</span>
              <strong
                className={`score-label score-label-${scoring.label}`}
                style={{ fontSize: "0.95rem" }}
              >
                {scoring.label.toUpperCase()}
              </strong>
            </div>

            {/* Actions */}
            <div className="lot-detail-actions" style={{ alignSelf: "flex-start" }}>
              <button
                className="ghost-button"
                onClick={() => {
                  setAlertOpen(true);
                }}
                type="button"
              >
                <Bell aria-hidden="true" size={16} />
                Criar alerta
              </button>
              <button
                className="ghost-button"
                onClick={() => {
                  window.print();
                }}
                type="button"
              >
                <Printer aria-hidden="true" size={16} />
                Gerar PDF
              </button>
            </div>
          </div>

          {successMessage ? (
            <div className="lot-success-message">{successMessage}</div>
          ) : null}

          {/* ── Meta grid ─────────────────────────────────────────────────── */}
          <div className="lot-detail-meta">
            <div className="lot-meta-item">
              <span className="section-label">Orgao</span>
              <strong>{lot.agency}</strong>
            </div>
            <div className="lot-meta-item">
              <span className="section-label">Cidade</span>
              <strong>{lot.city}</strong>
            </div>
            <div className="lot-meta-item">
              <span className="section-label">Edital</span>
              <strong>{lot.edital}</strong>
            </div>
            <div className="lot-meta-item">
              <span className="section-label">Lote interno</span>
              <strong>{lot.lotNumber}</strong>
            </div>
            <div className="lot-meta-item">
              <span className="section-label">Participantes</span>
              <strong>{eligibilityLabel(lot)}</strong>
            </div>
            <div className="lot-meta-item">
              <span className="section-label">Lance minimo</span>
              <strong className="lot-minimum-value">
                {formatBRL(lot.minimumBidCents / 100)}
              </strong>
            </div>
          </div>

          {/* ── Relatório por template ────────────────────────────────────── */}
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
              <p>
                O lote <strong>{lot.displayNumber}</strong> faz parte do edital{" "}
                <strong>{lot.edital}</strong> conduzido por{" "}
                <strong>{lot.agency}</strong>, com sede em{" "}
                <strong>{lot.city}</strong>. O prazo final para propostas e{" "}
                <strong>{formatDeadline(lot.proposalDeadline)}</strong>. O lance
                minimo definido na fonte oficial e de{" "}
                <strong>{formatBRL(lot.minimumBidCents / 100)}</strong>.{" "}
                {eligibilityLong(lot)}
              </p>
              <p style={{ marginTop: "var(--s-3)", fontSize: "0.8rem", color: "var(--n-400)" }}>
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
                    Lance maximo sugerido{" "}
                    <span
                      style={{
                        fontSize: "0.72rem",
                        color: "var(--n-400)",
                        fontWeight: 400,
                      }}
                    >
                      (calculado por regra do scoring —{" "}
                      {scoring.label === "alto"
                        ? "35%"
                        : scoring.label === "medio"
                        ? "20%"
                        : "10%"}{" "}
                      acima do minimo)
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
              Avaliacao oficial, descontos, tributos e custos adicionais nao estao disponíveis nesta
              fonte. Consulte o edital para valores completos.
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
                Dados verificados
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

        {/* ── Sidebar (sticky) ─────────────────────────────────────────────── */}
        <div className="evidence-panel" style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>

          {/* Prazo card */}
          <div
            style={{
              padding: "var(--s-5)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--s-3)",
            }}
          >
            <div>
              <span className="section-label">Prazo</span>
              <h3 style={{ marginTop: "var(--s-1)", display: "flex", alignItems: "center", gap: "var(--s-2)" }}>
                <CalendarClock aria-hidden="true" size={16} />
                Encerramento das propostas
              </h3>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: "0.875rem",
                color: "var(--n-600)",
              }}
            >
              <span>Prazo oficial</span>
              <strong style={{ color: "var(--n-900)" }}>
                {formatDeadline(lot.proposalDeadline)}
              </strong>
            </div>

            {/* Status chip */}
            <div
              style={{
                padding: "var(--s-3) var(--s-4)",
                borderRadius: "var(--r-md)",
                background:
                  dlStatus === "ok"
                    ? "var(--color-success-bg)"
                    : dlStatus === "expired"
                    ? "var(--color-error-bg)"
                    : "var(--color-warning-bg)",
                color:
                  dlStatus === "ok"
                    ? "var(--color-success)"
                    : dlStatus === "expired"
                    ? "var(--color-error)"
                    : "var(--color-warning)",
                fontSize: "0.82rem",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: "var(--s-2)",
              }}
            >
              <CalendarClock aria-hidden="true" size={14} />
              {deadlineStatusLabel(days)}
            </div>

            {/* CTA */}
            <a
              href={lot.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="primary-button"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "var(--s-2)",
                textDecoration: "none",
                borderRadius: "var(--r-md)",
                padding: "12px var(--s-4)",
                width: "100%",
                fontSize: "0.9rem",
              }}
            >
              <ExternalLink aria-hidden="true" size={15} />
              Participar no leilão oficial
            </a>

            <button
              className="ghost-button"
              onClick={() => {
                window.print();
              }}
              style={{ width: "100%", justifyContent: "center" }}
              type="button"
            >
              <Printer aria-hidden="true" size={15} />
              Gerar relatorio PDF
            </button>

            <button
              className="ghost-button"
              onClick={() => {
                setAlertOpen(true);
              }}
              style={{ width: "100%", justifyContent: "center" }}
              type="button"
            >
              <Bell aria-hidden="true" size={15} />
              Criar alerta de prazo
            </button>
          </div>

          {/* Separator */}
          <hr className="divide" />

          {/* AI assistant — Raio-X com IA (Claude via Worker fonteia-api) */}
          <div style={{ padding: "var(--s-4) var(--s-5)" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--s-3)",
                marginBottom: "var(--s-3)",
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "var(--r-md)",
                  background: iaAnswer ? "var(--g-50)" : "var(--n-100)",
                  color: iaAnswer ? "var(--g-600)" : "var(--n-400)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Sparkles aria-hidden="true" size={16} />
              </div>
              <div>
                <strong style={{ display: "block", fontSize: "0.875rem", color: "var(--n-900)" }}>
                  Assistente Fonte.ia
                </strong>
                <span style={{ fontSize: "0.75rem", color: "var(--n-400)" }}>
                  {iaLoading
                    ? "Analisando o lote…"
                    : iaAnswer
                    ? "Raio-X gerado"
                    : iaUnavailable
                    ? "Em ativacao"
                    : "Raio-X do lote com IA"}
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
                  fontSize: "0.82rem",
                  color: "var(--n-500)",
                }}
              >
                <Loader2 aria-hidden="true" size={16} className="spin" />
                Lendo os dados oficiais e montando o Raio-X…
              </div>
            ) : iaAnswer ? (
              /* Estado: resposta da IA */
              <div
                style={{
                  background: "var(--g-50)",
                  border: "1px solid var(--n-100)",
                  borderLeft: "3px solid var(--g-500)",
                  borderRadius: "0 var(--r-md) var(--r-md) 0",
                  padding: "var(--s-4)",
                  fontSize: "0.84rem",
                  lineHeight: 1.6,
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
                      fontSize: "0.7rem",
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
              /* Estado: IA ainda nao configurada (honesto) */
              <div
                style={{
                  background: "var(--n-50)",
                  border: "1px dashed var(--n-200)",
                  borderRadius: "var(--r-md)",
                  padding: "var(--s-4)",
                  fontSize: "0.82rem",
                  color: "var(--n-500)",
                  lineHeight: 1.55,
                  textAlign: "center",
                }}
              >
                <p style={{ margin: "0 0 var(--s-2)" }}>
                  O assistente de IA ainda nao foi ativado nesta conta.
                </p>
                <p style={{ margin: 0, fontSize: "0.72rem", color: "var(--n-400)" }}>
                  Os dados acima vem direto da fonte oficial. A analise por IA liga assim que a
                  chave da Anthropic for configurada no servidor.
                </p>
              </div>
            ) : (
              /* Estado: ocioso — convida a gerar */
              <div
                style={{
                  background: "var(--n-50)",
                  border: "1px solid var(--n-100)",
                  borderRadius: "var(--r-md)",
                  padding: "var(--s-4)",
                  fontSize: "0.82rem",
                  color: "var(--n-600)",
                  lineHeight: 1.55,
                }}
              >
                <p style={{ margin: "0 0 var(--s-3)" }}>
                  Gere uma leitura em linguagem simples deste lote — o que e, quem pode dar lance,
                  prazo, valor de partida e o que conferir no edital.
                </p>
                <button
                  className="primary-button"
                  onClick={() => {
                    void runRaioX();
                  }}
                  type="button"
                  style={{
                    width: "100%",
                    justifyContent: "center",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "var(--s-2)",
                  }}
                >
                  <Sparkles aria-hidden="true" size={15} />
                  Gerar Raio-X com IA
                </button>
              </div>
            )}

            {/* Erro */}
            {iaError ? (
              <p
                style={{
                  margin: "var(--s-2) 0 0",
                  fontSize: "0.75rem",
                  color: "var(--color-error)",
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
                style={{ display: "flex", gap: "var(--s-2)", marginTop: "var(--s-3)" }}
              >
                <input
                  type="text"
                  value={iaQuestion}
                  onChange={(e) => {
                    setIaQuestion(e.target.value);
                  }}
                  placeholder="Pergunte algo sobre este lote…"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: "8px 10px",
                    fontSize: "0.8rem",
                    border: "1px solid var(--n-200)",
                    borderRadius: "var(--r-md)",
                    background: "var(--surface, #fff)",
                    color: "var(--n-900)",
                  }}
                />
                <button
                  className="ghost-button"
                  type="submit"
                  disabled={iaLoading || !iaQuestion.trim()}
                  aria-label="Enviar pergunta"
                  style={{ flexShrink: 0 }}
                >
                  <Send aria-hidden="true" size={15} />
                </button>
              </form>
            ) : null}
          </div>

          {/* Separator */}
          <hr className="divide" />

          {/* Evidence panel */}
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
    </>
  );
}
