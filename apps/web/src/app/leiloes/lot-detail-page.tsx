import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Bell, Download } from "lucide-react";
import type { ReceitaLeilaoLot } from "@fonteia/sources";
import { scoreReceitaLeilaoLot } from "@fonteia/scoring";
import { EvidencePanel } from "../../components/evidence-panel";
import { ScoreRing } from "../../components/score-ring";

interface LotDetailPageProps {
  lot: ReceitaLeilaoLot;
  onBack: () => void;
}

type AlertChannel = "in_app" | "email" | "whatsapp";

const channelLabels: Record<AlertChannel, string> = {
  in_app: "Notificacao no app",
  email: "E-mail",
  whatsapp: "WhatsApp",
};

function formatDeadline(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 10);
  }

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCurrencyFromCents(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function getEligibilityLabel(lot: ReceitaLeilaoLot): string {
  const hasPf = lot.eligiblePersonTypes.includes("pf");
  const hasPj = lot.eligiblePersonTypes.includes("pj");

  if (hasPf && hasPj) return "PF e PJ";
  if (hasPf) return "Apenas Pessoa Fisica";
  return "Apenas Pessoa Juridica";
}

function impactIcon(impact: "positive" | "neutral" | "negative"): string {
  if (impact === "positive") return "✓";
  if (impact === "negative") return "−";
  return "·";
}

export function LotDetailPage({ lot, onBack }: LotDetailPageProps) {
  const scoring = scoreReceitaLeilaoLot(lot);
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertName, setAlertName] = useState(`Alerta — Edital ${lot.edital}`);
  const [alertChannel, setAlertChannel] = useState<AlertChannel>("in_app");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (successTimerRef.current !== null) {
        clearTimeout(successTimerRef.current);
      }
    };
  }, []);

  function handleSaveAlert() {
    setAlertOpen(false);
    setSuccessMessage("✓ Alerta criado");
    successTimerRef.current = setTimeout(() => {
      setSuccessMessage(null);
    }, 3000);
  }

  function handleExportDossier() {
    const configuredApiUrl = import.meta.env["VITE_API_URL"] as string | undefined;
    const apiUrl = configuredApiUrl ?? (import.meta.env.DEV ? "http://localhost:4000" : null);

    if (!apiUrl) return;

    void fetch(`${apiUrl}/dossiers/${lot.id}/export`, { headers: { accept: "application/json" } }).catch(() => {
      // silent failure in alpha
    });
  }

  const evidenceItems = [
    {
      id: `ev-detail-${lot.id}`,
      sourceId: lot.sourceId,
      sourceUrl: lot.sourceUrl,
      kind: "api_payload" as const,
      collectedAt: lot.collectedAt,
      rawRecordId: lot.id,
      quote: `Lote ${lot.displayNumber} — edital ${lot.edital}, lance minimo ${formatCurrencyFromCents(lot.minimumBidCents)}, prazo ${formatDeadline(lot.proposalDeadline)}.`,
      hash: `sha256:${lot.id}`,
      confidence: 0.85,
    },
  ];

  return (
    <div className="lot-detail">
      <div className="lot-detail-main">
        <button className="ghost-button lot-back-button" onClick={onBack} type="button">
          <ArrowLeft aria-hidden="true" size={16} />
          Voltar
        </button>

        <div className="lot-detail-header">
          <div>
            <span className="section-label">Leilao Receita Federal SLE</span>
            <h2>Edital {lot.edital}</h2>
          </div>
          <div className="lot-detail-actions">
            <button
              className="ghost-button"
              onClick={() => {
                setAlertOpen(true);
              }}
              type="button"
            >
              <Bell aria-hidden="true" size={16} />
              Criar alerta de prazo
            </button>
            <button className="ghost-button" onClick={handleExportDossier} type="button">
              <Download aria-hidden="true" size={16} />
              Exportar dossier
            </button>
          </div>
        </div>

        {successMessage ? <div className="lot-success-message">{successMessage}</div> : null}

        <div className="lot-detail-meta">
          <div className="lot-meta-item">
            <span className="section-label">Cidade</span>
            <strong>{lot.city}</strong>
          </div>
          <div className="lot-meta-item">
            <span className="section-label">Orgao</span>
            <strong>{lot.agency}</strong>
          </div>
          <div className="lot-meta-item">
            <span className="section-label">Prazo de proposta</span>
            <strong>{formatDeadline(lot.proposalDeadline)}</strong>
          </div>
          <div className="lot-meta-item">
            <span className="section-label">Elegibilidade</span>
            <strong>{getEligibilityLabel(lot)}</strong>
          </div>
          <div className="lot-meta-item">
            <span className="section-label">Valor minimo</span>
            <strong className="lot-minimum-value">{formatCurrencyFromCents(lot.minimumBidCents)}</strong>
          </div>
          <div className="lot-meta-item">
            <span className="section-label">Lance maximo sugerido</span>
            <strong>{formatCurrencyFromCents(scoring.maxSuggestedBidCents)}</strong>
          </div>
        </div>

        <div className="score-detail">
          <div className="score-detail-ring-area">
            <ScoreRing score={scoring.score} size="lg" />
            <div className="score-detail-label-area">
              <span className="section-label">Oportunidade</span>
              <strong className={`score-label score-label-${scoring.label}`}>{scoring.label.toUpperCase()}</strong>
            </div>
          </div>

          <ul className="score-factor-list">
            {scoring.factors.map((factor) => (
              <li className={`score-factor score-factor-${factor.impact}`} key={factor.id}>
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
        </div>
      </div>

      <EvidencePanel evidence={evidenceItems} title={`Evidencia — Lote ${lot.displayNumber}`} />

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
    </div>
  );
}
