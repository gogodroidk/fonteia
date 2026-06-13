import { useState } from "react";
import {
  Bell,
  CheckCircle2,
  Mail,
  MessageCircle,
  Search,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { saveOnboardingPrefs } from "../../lib/onboarding";

interface OnboardingPageProps {
  name?: string | undefined;
  onFinish: () => void;
}

const goals = [
  {
    id: "comprar",
    icon: Target,
    title: "Arrematar lotes",
    desc: "Quero achar os melhores leilões antes dos outros.",
  },
  {
    id: "revender",
    icon: TrendingUp,
    title: "Revender com margem",
    desc: "Compro para revender e preciso enxergar a margem.",
  },
  {
    id: "consultar",
    icon: Search,
    title: "Assessorar clientes",
    desc: "Sou advogado/consultor e analiso oportunidades.",
  },
] as const;

const channels = [
  {
    id: "in_app",
    icon: Bell,
    title: "No aplicativo",
    desc: "Aviso dentro da plataforma.",
  },
  {
    id: "email",
    icon: Mail,
    title: "E-mail",
    desc: "Receba um resumo no seu e-mail.",
  },
  {
    id: "whatsapp",
    icon: MessageCircle,
    title: "WhatsApp",
    desc: "Alerta direto no seu celular.",
  },
] as const;

type GoalId = (typeof goals)[number]["id"];
type ChannelId = (typeof channels)[number]["id"];

const TOTAL_STEPS = 3;

const goalLabels: Record<GoalId, string> = {
  comprar: "Arrematar lotes",
  revender: "Revender com margem",
  consultar: "Assessorar clientes",
};

const channelLabels: Record<ChannelId, string> = {
  in_app: "Aplicativo",
  email: "E-mail",
  whatsapp: "WhatsApp",
};

export function OnboardingPage({ name, onFinish }: OnboardingPageProps) {
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState<GoalId | null>(null);
  const [channel, setChannel] = useState<ChannelId | null>(null);

  const firstName = (name ?? "").split(" ")[0] || "bem-vindo";

  function finish() {
    saveOnboardingPrefs({ goal: goal ?? "", channel: channel ?? "" });
    onFinish();
  }

  const progressPct = Math.round(((step + 1) / TOTAL_STEPS) * 100);

  return (
    <div className="onboarding">
      {/* Card */}
      <div className="onboarding-card">

        {/* ── Header ── */}
        <div className="onboarding-head">
          <div className="brand-mark">f</div>

          {/* Step pills */}
          <div className="onboarding-steps" aria-label={`Passo ${step + 1} de ${TOTAL_STEPS}`}>
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <span
                key={i}
                className={`onb-dot${i <= step ? " active" : ""}`}
                aria-hidden="true"
              />
            ))}
          </div>
        </div>

        {/* ── Progress bar ── */}
        <div
          className="bar"
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progresso do cadastro"
          style={{ marginBottom: "24px" }}
        >
          <i style={{ width: `${progressPct}%`, transition: "width 0.35s cubic-bezier(.4,0,.2,1)" }} />
        </div>

        {/* ── Step 0: objetivo ── */}
        {step === 0 && (
          <div className="onboarding-body rise">
            <span className="onboarding-eyebrow">
              <Sparkles size={13} aria-hidden="true" />
              Passo 1 de {TOTAL_STEPS}
            </span>

            <h1 className="onboarding-body-h1">
              Olá, {firstName}!<br />O que você quer fazer aqui?
            </h1>
            <p className="onboarding-sub">
              Isso ajusta o radar pra mostrar o que importa pra você.
            </p>

            <div className="onboarding-options">
              {goals.map(({ id, icon: Icon, title, desc }) => (
                <button
                  key={id}
                  type="button"
                  className={`onboarding-option${goal === id ? " selected" : ""}`}
                  onClick={() => setGoal(id)}
                  aria-pressed={goal === id}
                >
                  <div className="onboarding-option-icon">
                    <Icon size={20} aria-hidden="true" />
                  </div>
                  <div>
                    <strong>{title}</strong>
                    <span>{desc}</span>
                  </div>
                </button>
              ))}
            </div>

            <div className="onboarding-actions">
              <button type="button" className="link-btn" onClick={finish}>
                Pular
              </button>
              <button
                type="button"
                className="primary-button onboarding-actions-advance"
                disabled={goal === null}
                onClick={() => setStep(1)}
              >
                Continuar
              </button>
            </div>
          </div>
        )}

        {/* ── Step 1: canal ── */}
        {step === 1 && (
          <div className="onboarding-body rise">
            <span className="onboarding-eyebrow">
              <Sparkles size={13} aria-hidden="true" />
              Passo 2 de {TOTAL_STEPS}
            </span>

            <h1 className="onboarding-body-h1">Como prefere ser avisado?</h1>
            <p className="onboarding-sub">
              Quando aparecer um lote no seu perfil, a gente te avisa por aqui.
            </p>

            <div className="onboarding-options">
              {channels.map(({ id, icon: Icon, title, desc }) => (
                <button
                  key={id}
                  type="button"
                  className={`onboarding-option${channel === id ? " selected" : ""}`}
                  onClick={() => setChannel(id)}
                  aria-pressed={channel === id}
                >
                  <div className="onboarding-option-icon">
                    <Icon size={20} aria-hidden="true" />
                  </div>
                  <div>
                    <strong>{title}</strong>
                    <span>{desc}</span>
                  </div>
                </button>
              ))}
            </div>

            <div className="onboarding-actions">
              <button type="button" className="link-btn" onClick={() => setStep(0)}>
                Voltar
              </button>
              <button
                type="button"
                className="primary-button onboarding-actions-advance"
                disabled={channel === null}
                onClick={() => setStep(2)}
              >
                Continuar
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: tudo pronto ── */}
        {step === 2 && (
          <div className="onboarding-body rise">
            <span className="onboarding-eyebrow">
              <Sparkles size={13} aria-hidden="true" />
              Tudo pronto
            </span>

            <h1 className="onboarding-body-h1">
              Pronto pra começar,&nbsp;{firstName}!
            </h1>
            <p className="onboarding-sub">
              Seu cockpit já está configurado. Veja o radar de oportunidades,
              faça uma pergunta e crie seu primeiro alerta — leva menos de
              2 minutos.
            </p>

            {/* Resumo das escolhas */}
            {(goal !== null || channel !== null) && (
              <div className="onboarding-summary">
                {goal !== null && (
                  <div className="onboarding-summary-row">
                    <span className="onboarding-summary-label">Objetivo</span>
                    <span className="onboarding-summary-value">{goalLabels[goal]}</span>
                  </div>
                )}
                {channel !== null && (
                  <div className="onboarding-summary-row">
                    <span className="onboarding-summary-label">Alertas via</span>
                    <span className="onboarding-summary-value">{channelLabels[channel]}</span>
                  </div>
                )}
              </div>
            )}

            <ul className="onboarding-checklist">
              <li>
                <CheckCircle2 size={16} aria-hidden="true" className="onboarding-check-icon" />
                Radar de leilões com score de oportunidade
              </li>
              <li>
                <CheckCircle2 size={16} aria-hidden="true" className="onboarding-check-icon" />
                Pergunte em português e receba resposta com fonte
              </li>
              <li>
                <CheckCircle2 size={16} aria-hidden="true" className="onboarding-check-icon" />
                Alertas automáticos antes do prazo fechar
              </li>
            </ul>

            <div className="onboarding-actions">
              <button type="button" className="link-btn" onClick={() => setStep(1)}>
                Voltar
              </button>
              <button
                type="button"
                className="btn-primary-full onboarding-finish"
                onClick={finish}
              >
                Entrar no meu cockpit
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
