import { useState } from "react";
import {
  Bell,
  CheckCircle2,
  FileSearch,
  Gavel,
  Landmark,
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
  /**
   * Encerra o onboarding. Recebe o destino escolhido pelo objetivo do usuário
   * (ex.: "/app/lotes"): quem chama navega para lá em vez de cair no painel
   * genérico. Sem objetivo selecionado, `dest` vem indefinido.
   */
  onFinish: (dest?: string) => void;
}

const goals = [
  {
    id: "comprar",
    icon: Target,
    title: "Arrematar lotes",
    desc: "Achar os melhores leilões antes da concorrência.",
    hint: "Recomendamos começar por: Lotes (Receita Federal) — explore o radar de oportunidades.",
    hintRoute: "/lotes",
  },
  {
    id: "revender",
    icon: TrendingUp,
    title: "Revender com margem",
    desc: "Compro pra revender e preciso enxergar o lucro estimado.",
    hint: "Recomendamos começar por: Raio-X do lote — veja riscos e estimativa de valor antes do lance.",
    hintRoute: "/lotes",
  },
  {
    id: "consultar",
    icon: Search,
    title: "Assessorar clientes",
    desc: "Sou advogado ou consultor e analiso oportunidades.",
    hint: "Recomendamos começar por: Empresas (CNPJ + sanções) — due diligence antes de orientar o cliente.",
    hintRoute: "/empresas",
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

// Nome humano do módulo de destino (evita mostrar a rota crua "/lotes" ao usuário).
const routeLabels: Record<string, string> = {
  "/lotes": "Lotes (Receita Federal)",
  "/empresas": "Empresas (CNPJ)",
};

export function OnboardingPage({ name, onFinish }: OnboardingPageProps) {
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState<GoalId | null>(null);
  const [channel, setChannel] = useState<ChannelId | null>(null);

  const firstName = (name ?? "").split(" ")[0] || "bem-vindo";

  function finish() {
    saveOnboardingPrefs({ goal: goal ?? "", channel: channel ?? "" });
    // Roteia o usuário para o módulo que casa com o objetivo escolhido
    // (hintRoute é relativo à app; ex.: "/lotes" → "/app/lotes"). Assim o
    // primeiro clique já entrega valor em vez de largar no painel genérico.
    const dest = selectedGoalData ? `/app${selectedGoalData.hintRoute}` : undefined;
    onFinish(dest);
  }

  const progressPct = Math.round(((step + 1) / TOTAL_STEPS) * 100);

  const selectedGoalData = goal !== null ? goals.find((g) => g.id === goal) ?? null : null;

  return (
    <div className="onboarding">
      <style>{`
        /* ── Onboarding mobile polish (scoped, não toca CSS global) ── */

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

        /* Módulos chip list no step 0 */
        .onb-modulos {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin: 0 0 var(--s-5);
        }
        .onb-modulo-chip {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 10px;
          border-radius: 999px;
          background: color-mix(in srgb, var(--brand) 10%, var(--surface-2));
          border: 1px solid color-mix(in srgb, var(--brand) 20%, transparent);
          font-size: 12px;
          font-weight: 600;
          color: var(--brand-ink);
          white-space: nowrap;
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

        /* Hint de recomendação após escolha de objetivo */
        .onb-hint {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 11px 13px;
          border-radius: var(--r-md);
          background: color-mix(in srgb, var(--ok) 8%, var(--surface));
          border: 1px solid color-mix(in srgb, var(--ok) 25%, transparent);
          margin-top: 12px;
          animation: onb-hint-in 0.2s ease both;
        }
        @keyframes onb-hint-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .onb-hint-icon {
          color: var(--ok);
          flex-shrink: 0;
          margin-top: 1px;
        }
        .onb-hint-text {
          font-size: 13px;
          color: var(--t-mid);
          line-height: 1.45;
        }
        .onb-hint-text strong {
          color: var(--t-hi);
          display: block;
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-bottom: 3px;
          color: var(--ok);
        }

        /* Botão primário grande (>=44px, touch-safe) */
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
        .onb-btn-primary:focus-visible {
          outline: 2px solid var(--ring, var(--brand));
          outline-offset: 3px;
        }
        .onb-btn-primary:disabled {
          opacity: 0.4;
          cursor: not-allowed;
          transform: none;
        }

        /* Botão de skip / voltar (link-style, touch target >=44px) */
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
        .onb-btn-skip:focus-visible {
          outline: 2px solid var(--ring, var(--brand));
          outline-offset: 2px;
        }

        /* Footer de acoes: skip a esquerda, avancar a direita */
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
          .onb-hint { animation: none; }
          @keyframes onb-hint-in { from { opacity: 1; } }
        }
      `}</style>

      <div className="onboarding-card">

        {/* -- Cabecalho: logo + indicador de passos -- */}
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

        {/* -- Barra de progresso -- */}
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

        {/* ================================================
            PASSO 0 -- Boas-vindas: o que e a Fonte.ia
            ================================================ */}
        {step === 0 && (
          <div className="onboarding-body rise">
            <span className="onboarding-eyebrow">
              <Sparkles size={13} aria-hidden="true" />
              Bem-vindo ao Fonte.ia
            </span>

            <h1 className="onboarding-body-h1">
              Ola, {firstName}!<br />
              Dados publicos do Brasil, sem enrolacao.
            </h1>
            <p className="onboarding-sub" style={{ marginBottom: "var(--s-4)" }}>
              A Fonte.ia transforma dados oficiais em respostas rastreáveis —
              com a fonte sempre citada. Sem achismo, sem invenção.
            </p>

            {/* Icone hero */}
            <div className="onb-hero-icon" aria-hidden="true">
              <Gavel size={36} strokeWidth={1.8} />
            </div>

            {/* 3 exemplos do que o usuario pode fazer */}
            <div className="onb-features" role="list">
              <div className="onb-feature-row" role="listitem">
                <div className="onb-feature-row-icon" aria-hidden="true">
                  <Gavel size={18} strokeWidth={2} />
                </div>
                <div className="onb-feature-row-text">
                  <strong>Encontre leilões da Receita Federal</strong>
                  <span>Lotes com lance mínimo, prazo e score de oportunidade — atualizados em tempo real.</span>
                </div>
              </div>
              <div className="onb-feature-row" role="listitem">
                <div className="onb-feature-row-icon" aria-hidden="true">
                  <FileSearch size={18} strokeWidth={2} />
                </div>
                <div className="onb-feature-row-text">
                  <strong>Pesquise empresas, sócios e sanções</strong>
                  <span>CNPJ, situação cadastral, sócios, CEIS/CNEP — due diligence em segundos.</span>
                </div>
              </div>
              <div className="onb-feature-row" role="listitem">
                <div className="onb-feature-row-icon" aria-hidden="true">
                  <Zap size={18} strokeWidth={2} />
                </div>
                <div className="onb-feature-row-text">
                  <strong>Analise com IA — fonte citada sempre</strong>
                  <span>Raio-X de editais, licitações e empresas: riscos, alertas e resumo em português.</span>
                </div>
              </div>
            </div>

            {/* Chips dos modulos disponiveis */}
            <div className="onb-modulos" role="list" aria-label="Módulos disponíveis">
              {[
                { label: "Leiloes", icon: Gavel },
                { label: "Licitacoes", icon: FileSearch },
                { label: "Empresas", icon: ShieldCheck },
                { label: "Politica", icon: Landmark },
                { label: "Juridico", icon: Search },
                { label: "INPI Marcas", icon: Target },
                { label: "Municipios", icon: Bell },
                { label: "Ambiental", icon: Sparkles },
              ].map(({ label, icon: Icon }) => (
                <span key={label} className="onb-modulo-chip" role="listitem">
                  <Icon size={11} aria-hidden="true" />
                  {label}
                </span>
              ))}
            </div>

            <div className="onb-footer-single">
              <button
                type="button"
                className="onb-btn-primary"
                onClick={() => setStep(1)}
              >
                Comecar — leva 1 minuto
              </button>
              <div style={{ textAlign: "center", marginTop: "12px" }}>
                <button type="button" className="onb-btn-skip" onClick={finish}>
                  Pular configuracao e entrar direto
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================================================
            PASSO 1 -- Objetivo do usuario
            ================================================ */}
        {step === 1 && (
          <div className="onboarding-body rise">
            <span className="onboarding-eyebrow">
              <Sparkles size={13} aria-hidden="true" />
              Passo 1 de 3
            </span>

            <h1 className="onboarding-body-h1">
              O que voce quer fazer aqui?
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

            {/* Hint personalizado apos escolha */}
            {selectedGoalData !== null && (
              <div className="onb-hint" role="note" aria-live="polite">
                <CheckCircle2 size={16} className="onb-hint-icon" aria-hidden="true" />
                <div className="onb-hint-text">
                  <strong>Recomendado para voce</strong>
                  {selectedGoalData.hint}
                </div>
              </div>
            )}

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

        {/* ================================================
            PASSO 2 -- Canal de alerta
            ================================================ */}
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
              Quando aparecer um lote ou edital no seu perfil — ou o prazo estiver chegando — te avisamos por aqui.
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

        {/* ================================================
            PASSO 3 -- Raio-X + CTA final
            ================================================ */}
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
              Seu painel esta configurado. O primeiro passo e explorar — leva menos de 1 minuto.
            </p>

            {/* Destaque Raio-X */}
            <div className="onb-raiox" role="note" aria-label="Diferencial Fonte.ia">
              <span className="onb-raiox-badge" aria-hidden="true">Diferencial Fonte.ia</span>
              <p className="onb-raiox-title">O que e o Raio-X?</p>
              <p className="onb-raiox-desc">
                Em qualquer lote ou edital, clique em <strong>Raio-X</strong> e a IA lê o
                documento por você: mostra riscos, estima valor e aponta o que verificar.
                Cada dado tem fonte oficial citada — você sempre sabe de onde veio.
              </p>
            </div>

            {/* Resumo das escolhas */}
            {(goal !== null || channel !== null) && (
              <div className="onb-summary" role="region" aria-label="Suas preferencias">
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
                {selectedGoalData !== null && (
                  <div className="onb-summary-row">
                    <span className="onb-summary-label">Comecar por</span>
                    <span className="onb-summary-value">
                      {routeLabels[selectedGoalData.hintRoute] ?? "Painel"}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Checklist rapida */}
            <ul className="onb-checklist" aria-label="O que voce pode fazer agora">
              <li>
                <CheckCircle2
                  size={17}
                  className="onb-checklist-icon"
                  aria-hidden="true"
                />
                <span>
                  <strong style={{ color: "var(--t-hi)" }}>Explorar lotes</strong> — radar com score de oportunidade por categoria
                </span>
              </li>
              <li>
                <CheckCircle2
                  size={17}
                  className="onb-checklist-icon"
                  aria-hidden="true"
                />
                <span>
                  <strong style={{ color: "var(--t-hi)" }}>Raio-X de qualquer documento</strong> — analise com IA em segundos
                </span>
              </li>
              <li>
                <CheckCircle2
                  size={17}
                  className="onb-checklist-icon"
                  aria-hidden="true"
                />
                <span>
                  <strong style={{ color: "var(--t-hi)" }}>Criar alerta de prazo</strong> — aviso antes de encerrar
                </span>
              </li>
            </ul>

            {/* Nota honesta */}
            <p className="onb-honest">
              Os lances de leiloes sao feitos no site oficial da Receita Federal. A Fonte.ia ajuda
              você a descobrir e analisar oportunidades — nao garante lucro.
            </p>

            {/* CTA principal */}
            <button
              type="button"
              className="onb-btn-primary"
              onClick={finish}
            >
              <Gavel size={18} aria-hidden="true" />
              Entrar na plataforma
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
