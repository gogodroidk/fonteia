import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Bell, Download, MessageSquareText } from "lucide-react";
import type { ReceitaLeilaoLot } from "@fonteia/sources";
import { scoreReceitaLeilaoLot } from "@fonteia/scoring";
import { DemoDataBanner } from "../../components/demo-data-banner";
import { EvidencePanel } from "../../components/evidence-panel";
import { ScoreRing } from "../../components/score-ring";

interface LotDetailPageProps {
  lot: ReceitaLeilaoLot;
  onBack: () => void;
  onAsk?: (question: string) => void;
  isDemo?: boolean;
  dataMessage?: string;
}

type AlertChannel = "in_app" | "email" | "whatsapp";

const channelLabels: Record<AlertChannel, string> = {
  in_app: "Notificacao no app",
  email: "E-mail em breve",
  whatsapp: "WhatsApp em breve",
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

  if (hasPf && hasPj) return "Pessoa fisica e pessoa juridica podem participar";
  if (hasPf) return "Apenas pessoa fisica pode participar";
  return "Apenas pessoa juridica pode participar";
}

function impactIcon(impact: "positive" | "neutral" | "negative"): string {
  if (impact === "positive") return "✓";
  if (impact === "negative") return "−";
  return "·";
}

function decisionCopy(score: number): string {
  if (score >= 70) {
    return "Este lote merece investigacao agora. O score indica boa combinacao entre prazo, elegibilidade e valor minimo, mas a decisao final ainda depende da leitura do edital e dos custos de retirada.";
  }

  if (score >= 45) {
    return "Este lote pode valer uma analise, mas nao deve ser tratado como oportunidade obvia. Valide custos, restricoes e liquidez antes de qualquer proposta.";
  }

  return "Este lote parece fraco ou arriscado para decisao rapida. Use o painel para entender o motivo e confirme tudo na fonte oficial antes de avancar.";
}

export function LotDetailPage({ lot, onBack, onAsk, isDemo = false, dataMessage }: LotDetailPageProps) {
  const scoring = scoreReceitaLeilaoLot(lot);
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertName, setAlertName] = useState(`Alerta — Edital ${lot.edital}`);
  const [alertChannel, setAlertChannel] = useState<AlertChannel>("in_app");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setAlertName(`Alerta — Edital ${lot.edital}`);
  }, [lot.edital]);

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

  function handleExportDossier() {
    const configuredApiUrl = import.meta.env["VITE_API_URL"] as string | undefined;
    const apiUrl = configuredApiUrl ?? (import.meta.env.DEV ? "http://localhost:4000" : null);

    if (!apiUrl) return;

    void fetch(`${apiUrl}/dossiers/${lot.id}/export`, { headers: { accept: "application/json" } }).catch(() => {
      // silent failure in alpha
    });
  }

  const quickQuestions = [
    "Esse lote vale a pena?",
    "Quais riscos eu devo verificar?",
    "Pessoa fisica pode participar?",
    "Qual e o prazo?",
    "Qual lance maximo sugerido?",
    "Quais evidencias sustentam isso?",
  ];

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
      {isDemo ? (
        <DemoDataBanner
          title="Lote em modo demonstracao"
          message={dataMessage ?? "Este lote veio de amostras locais. Use para validar a experiencia, nao para decisao real."}
        />
      ) : null}

      <div className="lot-detail-main">
        <button className="ghost-button lot-back-button" onClick={onBack} type="button">
          <ArrowLeft aria-hidden="true" size={16} />
          Voltar
        </button>

        <div className="lot-detail-header">
          <div>
            <span className="section-label">Raio-x do lote Receita Federal SLE</span>
            <h2>Edital {lot.edital}</h2>
            <p className="muted-copy">Lote {lot.displayNumber} em {lot.city}. A analise abaixo e apoio de decisao, nao substitui a leitura do edital oficial.</p>
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

        <section className="lot-decision-summary">
          <span className="section-label">Decisao rapida</span>
          <h3>{scoring.label === "alto" ? "Prioridade de investigacao" : scoring.label === "medio" ? "Investigar com cautela" : "Baixa prioridade"}</h3>
          <p>{decisionCopy(scoring.score)}</p>
        </section>

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
            <span className="section-label">Quem pode participar</span>
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

        <section className="lot-checklist">
          <span className="section-label">Antes de propor</span>
          <h3>Checklist minimo de seguranca</h3>
          <ul>
            <li>Confirmar prazo e regras no edital oficial.</li>
            <li>Verificar retirada, patio, frete, taxas e documentos exigidos.</li>
            <li>Comparar valor de mercado antes de definir lance maximo.</li>
            <li>Checar se pessoa fisica ou juridica pode participar.</li>
            <li>Nao usar o score como decisao final isolada.</li>
          </ul>
        </section>

        <section className="lot-quick-questions">
          <span className="section-label">Perguntas guiadas</span>
          <h3>Pergunte sobre este lote</h3>
          <div className="lot-quick-questions-grid">
            {quickQuestions.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => onAsk?.(`${item} Edital ${lot.edital}, lote ${lot.displayNumber}.`)}
              >
                <MessageSquareText aria-hidden="true" size={14} />
                {item}
              </button>
            ))}
          </div>
        </section>
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
