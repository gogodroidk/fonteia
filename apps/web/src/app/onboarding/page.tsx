import { useState } from "react";
import {
  Bell,
  CheckCircle2,
  Gavel,
  Mail,
  MessageCircle,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
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
    desc: "Achar os melhores leilões antes da concorrência.",
  },
  {
    id: "revender",
    icon: TrendingUp,
    title: "Revender com margem",
    desc: "Compro pra revender e preciso enxergar o lucro estimado.",
  },
  {
    id: "consultar",
    icon: Search,
    title: "Assessorar clientes",
    desc: "Sou advogado ou consultor e analiso oportunidades.",
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

const TOTAL_STEPS = 4;

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
      <style>{`
        /* ── Onboarding mobile polish (scoped, não toca CSS global) ── */

        /* Card scroll seguro em telas pequenas */
        .onboarding {
          align-items: flex-start !important;
          padding: 16px !important;
        }
        .onboarding-card {
          margin: auto;
        }

        /* Ícone hero grande no step 0 */
        .onb-hero-icon {
          width: 72px;
          height: 72px;
          border-radius: 20px;
          background: linear-gradient(135deg, var(--brand), var(--accent));
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          margin: 0 auto var(--s-5);
          flex-shrink: 0;
          box-shadow: 0 8px 24px color-mix(in srgb, var(--brand) 35%, transparent);
        }

        /* Pill de features no step 0 */
        .onb-features {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin: 0 0 var(--s-5);
        }
        .onb-feature-row {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 12px 14px;
          border-radius: var(--r-md);
          background: var(--surface-2);
          border: 1px solid var(--border);
        }
        .onb-feature-row-icon {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: color-mix(in srgb, var(--brand) 12%, transparent);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--brand-ink);
          flex-shrink: 0;
        }
        .onb-feature-row-text strong {
          display: block;
          font-size: 14px;
          font-weight: 700;
          color: var(--t-hi);
          line-height: 1.2;
        }
        .onb-feature-row-text span {
          display: block;
          font-size: 12.5px;
          color: var(--t-mid);
          line-height: 1.45;
          margin-top: 2px;
        }

        /* Raio-X card no step 3 */
        .onb-raiox {
          border-radius: var(--r-lg);
          border: 2px solid var(--brand-ink);
          background: color-mix(in srgb, var(--brand) 6%, var(--surface));
          padding: 16px;
          margin: 0 0 var(--s-4);
          position: relative;
          overflow: visible;
        }
        .onb-raiox-badge {
          position: absolute;
          top: -12px;
          left: 16px;
          background: var(--brand-ink);
          color: #fff;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 3px 10px;
          border-radius: 999px;
          white-space: nowrap;
        }
        .onb-raiox-title {
          font-size: 16px;
          font-weight: 800;
          color: var(--t-hi);
          margin: 6px 0 6px;
          line-height: 1.2;
        }
        .onb-raiox-desc {
          font-size: 13.5px;
          color: var(--t-mid);
          line-height: 1.5;
          margin: 0;
        }

        /* Checklist no step 3 */
        .onb-checklist {
          list-style: none;
          padding: 0;
          margin: 0 0 var(--s-5);
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .onb-checklist li {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          font-size: 14px;
          color: var(--t-mid);
          line-height: 1.45;
        }
        .onb-checklist-icon {
          color: var(--accent-ink);
          flex-shrink: 0;
          margin-top: 1px;
        }

        /* Nota honesta */
        .onb-honest {
          font-size: 12px;
          color: var(--t-low);
          text-align: center;
          line-height: 1.45;
          padding: 0 4px;
          margin: 0 0 var(--s-4);
        }

        /* Resumo de escolhas (step 3) */
        .onb-summary {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 12px 14px;
          background: var(--surface-2);
          border: 1px solid var(--border);
          border-radius: var(--r-md);
          margin: 0 0 var(--s-5);
        }
        .onb-summary-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .onb-summary-label {
          font-size: 11.5px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--t-low);
        }
        .onb-summary-value {
          font-size: 13px;
          font-weight: 700;
          color: var(--accent-ink);
        }

        /* Botão primário grande (≥44px, touch-safe) */
        .onb-btn-primary {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          min-height: 52px;
          padding: 14px 20px;
          border-radius: var(--r-md);
          background: linear-gradient(180deg, var(--brand-2), var(--brand));
          color: #fff;
          font-size: 16px;
          font-weight: 700;
          border: 0;
          cursor: pointer;
          transition: opacity 0.15s, transform 0.1s;
          -webkit-tap-highlight-color: transparent;
        }
        .onb-btn-primary:hover { opacity: 0.92; }
        .onb-btn-primary:active { transform: scale(0.98); }
        .onb-btn-primary:disabled {
          opacity: 0.4;
          cursor: not-allowed;
          transform: none;
        }

        /* Botão de skip / voltar (link-style, touch target ≥44px) */
        .onb-btn-skip {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 44px;
          padding: 8px 12px;
          background: none;
          border: 0;
          color: var(--t-mid);
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          border-radius: var(--r-md);
          transition: color 0.15s, background 0.15s;
          -webkit-tap-highlight-color: transparent;
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .onb-btn-skip:hover { color: var(--t-hi); background: var(--surface-2); }

        /* Footer de ações: skip à esquerda, avançar à direita */
        .onb-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-top: var(--s-5);
        }
        .onb-footer-single {
          margin-top: var(--s-5);
        }

        /* Em telas muito pequenas: stack vertical */
        @media (max-width: 400px) {
          .onboarding-card { padding: 24px 16px !important; }
          .onb-footer {
            flex-direction: column-reverse;
            align-items: stretch;
            gap: 8px;
          }
          .onb-btn-skip {
            align-self: center;
          }
          .onboarding-body-h1 { font-size: 20px !important; }
        }

        @media (prefers-reduced-motion: reduce) {
          .onb-btn-primary, .onb-btn-skip { transition: none; }
          .rise { animation: none !important; }
        }
      `}</style>

      <div className="onboarding-card">

        {/* ── Cabeçalho: logo + indicador de passos ── */}
        <div className="onboarding-head">
          <div className="brand-mark">f</div>
          <div
            className="onboarding-steps"
            role="progressbar"
            aria-valuenow={step + 1}
            aria-valuemin={1}
            aria-valuemax={TOTAL_STEPS}
            aria-label={`Passo ${step + 1} de ${TOTAL_STEPS}`}
          >
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <span
                key={i}
                className={`onb-dot${i <= step ? " active" : ""}`}
                aria-hidden="true"
              />
            ))}
          </div>
        </div>

        {/* ── Barra de progresso ── */}
        <div
          className="bar"
          aria-hidden="true"
          style={{ marginBottom: "24px" }}
        >
          <i
            style={{
              width: `${progressPct}%`,
              transition: "width 0.35s cubic-bezier(.4,0,.2,1)",
            }}
          />
        </div>

        {/* ════════════════════════════════
            PASSO 0 — Boas-vindas: o que é a Fonte.ia
            ════════════════════════════════ */}
        {step === 0 && (
          <div className="onboarding-body rise">
            <span className="onboarding-eyebrow">
              <Sparkles size={13} aria-hidden="true" />
              Bem-vindo ao Fonte.ia
            </span>

            <h1 className="onboarding-body-h1">
              Olá, {firstName}!<br />
              Leilões da Receita, descomplicados.
            </h1>
            <p className="onboarding-sub" style={{ marginBottom: "var(--s-5)" }}>
              A Fonte.ia monitora os editais oficiais e te mostra o que vale a pena — com dados rastreáveis, sem achismo.
            </p>

            {/* Ícone hero */}
            <div className="onb-hero-icon" aria-hidden="true">
              <Gavel size={36} strokeWidth={1.8} />
            </div>

            {/* 3 recursos visuais */}
            <div className="onb-features" role="list">
              <div className="onb-feature-row" role="listitem">
                <div className="onb-feature-row-icon" aria-hidden="true">
                  <Gavel size={18} strokeWidth={2} />
                </div>
                <div className="onb-feature-row-text">
                  <strong>Radar de lotes em tempo real</strong>
                  <span>Leilões da Receita Federal atualizados com lance mínimo, prazo e categoria.</span>
                </div>
              </div>
              <div className="onb-feature-row" role="listitem">
                <div className="onb-feature-row-icon" aria-hidden="true">
                  <Zap size={18} strokeWidth={2} />
                </div>
                <div className="onb-feature-row-text">
                  <strong>Raio-X do lote com IA</strong>
                  <span>Análise instantânea de um edital em português — riscos, estimativa de valor e pontos de atenção.</span>
                </div>
              </div>
              <div className="onb-feature-row" role="listitem">
                <div className="onb-feature-row-icon" aria-hidden="true">
                  <ShieldCheck size={18} strokeWidth={2} />
                </div>
                <div className="onb-feature-row-text">
                  <strong>Dado oficial, sempre rastreável</strong>
                  <span>Cada informação tem fonte citada: Portal da Transparência, edital, DOU. Sem invenção.</span>
                </div>
              </div>
            </div>

            <div className="onb-footer-single">
              <button
                type="button"
                className="onb-btn-primary"
                onClick={() => setStep(1)}
              >
                Começar — leva 1 minuto
              </button>
              <div style={{ textAlign: "center", marginTop: "12px" }}>
                <button type="button" className="onb-btn-skip" onClick={finish}>
                  Pular configuração
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════
            PASSO 1 — Objetivo do usuário
            ════════════════════════════════ */}
        {step === 1 && (
          <div className="onboarding-body rise">
            <span className="onboarding-eyebrow">
              <Sparkles size={13} aria-hidden="true" />
              Passo 1 de 3
            </span>

            <h1 className="onboarding-body-h1">
              O que você quer fazer aqui?
            </h1>
            <p className="onboarding-sub">
              Isso ajusta o radar pra mostrar o que importa pra você. Pode mudar depois.
            </p>

            <div className="onboarding-options" role="group" aria-label="Selecione seu objetivo">
              {goals.map(({ id, icon: Icon, title, desc }) => (
                <button
                  key={id}
                  type="button"
                  className={`onboarding-option${goal === id ? " selected" : ""}`}
                  onClick={() => setGoal(id)}
                  aria-pressed={goal === id}
                >
                  <div className="onboarding-option-icon" aria-hidden="true">
                    <Icon size={20} />
                  </div>
                  <div>
                    <strong>{title}</strong>
                    <span>{desc}</span>
                  </div>
                </button>
              ))}
            </div>

            <div className="onb-footer">
              <button type="button" className="onb-btn-skip" onClick={() => setStep(0)}>
                Voltar
              </button>
              <button
                type="button"
                className="onb-btn-primary"
                style={{ flex: "1", maxWidth: "200px" }}
                disabled={goal === null}
                onClick={() => setStep(2)}
              >
                Continuar
              </button>
            </div>
          </div>
        )}

        {/* ════════════════════════════════
            PASSO 2 — Canal de alerta
            ════════════════════════════════ */}
        {step === 2 && (
          <div className="onboarding-body rise">
            <span className="onboarding-eyebrow">
              <Bell size={13} aria-hidden="true" />
              Passo 2 de 3
            </span>

            <h1 className="onboarding-body-h1">
              Como quer ser avisado?
            </h1>
            <p className="onboarding-sub">
              Quando aparecer um lote no seu perfil — ou o prazo de um leilão estiver chegando — te avisamos por aqui.
            </p>

            <div className="onboarding-options" role="group" aria-label="Selecione o canal de alerta">
              {channels.map(({ id, icon: Icon, title, desc }) => (
                <button
                  key={id}
                  type="button"
                  className={`onboarding-option${channel === id ? " selected" : ""}`}
                  onClick={() => setChannel(id)}
                  aria-pressed={channel === id}
                >
                  <div className="onboarding-option-icon" aria-hidden="true">
                    <Icon size={20} />
                  </div>
                  <div>
                    <strong>{title}</strong>
                    <span>{desc}</span>
                  </div>
                </button>
              ))}
            </div>

            <div className="onb-footer">
              <button type="button" className="onb-btn-skip" onClick={() => setStep(1)}>
                Voltar
              </button>
              <button
                type="button"
                className="onb-btn-primary"
                style={{ flex: "1", maxWidth: "200px" }}
                disabled={channel === null}
                onClick={() => setStep(3)}
              >
                Continuar
              </button>
            </div>
          </div>
        )}

        {/* ════════════════════════════════
            PASSO 3 — Raio-X + CTA final
            ════════════════════════════════ */}
        {step === 3 && (
          <div className="onboarding-body rise">
            <span className="onboarding-eyebrow">
              <Sparkles size={13} aria-hidden="true" />
              Passo 3 de 3
            </span>

            <h1 className="onboarding-body-h1">
              Pronto, {firstName}!
            </h1>
            <p className="onboarding-sub">
              Seu painel já está configurado. O primeiro passo é ver os lotes disponíveis — leva menos de 1 minuto.
            </p>

            {/* Destaque Raio-X */}
            <div className="onb-raiox" role="note" aria-label="Diferencial Fonte.ia">
              <span className="onb-raiox-badge" aria-hidden="true">Diferencial Fonte.ia</span>
              <p className="onb-raiox-title">O que é o Raio-X?</p>
              <p className="onb-raiox-desc">
                Em qualquer lote, clique em <strong>Raio-X</strong> e a IA lê o edital
                por você: mostra riscos, estima valor de mercado e aponta o que
                verificar antes de dar um lance. Os dados vêm da fonte oficial — você
                sempre sabe de onde veio cada informação.
              </p>
            </div>

            {/* Resumo das escolhas */}
            {(goal !== null || channel !== null) && (
              <div className="onb-summary" role="region" aria-label="Suas preferências">
                {goal !== null && (
                  <div className="onb-summary-row">
                    <span className="onb-summary-label">Objetivo</span>
                    <span className="onb-summary-value">{goalLabels[goal]}</span>
                  </div>
                )}
                {channel !== null && (
                  <div className="onb-summary-row">
                    <span className="onb-summary-label">Alertas via</span>
                    <span className="onb-summary-value">{channelLabels[channel]}</span>
                  </div>
                )}
              </div>
            )}

            {/* Checklist rápida */}
            <ul className="onb-checklist" aria-label="O que você pode fazer agora">
              <li>
                <CheckCircle2
                  size={17}
                  className="onb-checklist-icon"
                  aria-hidden="true"
                />
                <span>
                  <strong style={{ color: "var(--t-hi)" }}>Ver lotes</strong> — radar com score de oportunidade por categoria
                </span>
              </li>
              <li>
                <CheckCircle2
                  size={17}
                  className="onb-checklist-icon"
                  aria-hidden="true"
                />
                <span>
                  <strong style={{ color: "var(--t-hi)" }}>Raio-X de um lote</strong> — análise com IA em segundos
                </span>
              </li>
              <li>
                <CheckCircle2
                  size={17}
                  className="onb-checklist-icon"
                  aria-hidden="true"
                />
                <span>
                  <strong style={{ color: "var(--t-hi)" }}>Criar alerta de prazo</strong> — aviso antes do leilão fechar
                </span>
              </li>
            </ul>

            {/* Nota honesta */}
            <p className="onb-honest">
              Os lances são feitos no site oficial da Receita Federal. A Fonte.ia ajuda
              você a descobrir e analisar as oportunidades — não garante lucro.
            </p>

            {/* CTA principal */}
            <button
              type="button"
              className="onb-btn-primary"
              onClick={finish}
            >
              <Gavel size={18} aria-hidden="true" />
              Ver os lotes da Receita
            </button>

            <div style={{ textAlign: "center", marginTop: "12px" }}>
              <button type="button" className="onb-btn-skip" onClick={() => setStep(2)}>
                Voltar
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
