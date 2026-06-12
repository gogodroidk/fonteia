import { useState } from "react";
import { Bell, Mail, MessageCircle, Search, Sparkles, Target, TrendingUp } from "lucide-react";
import { saveOnboardingPrefs } from "../../lib/onboarding";

interface OnboardingPageProps {
  name?: string;
  onFinish: () => void;
}

const goals = [
  { id: "comprar", icon: Target, title: "Arrematar lotes", desc: "Quero achar os melhores leilões antes dos outros." },
  { id: "revender", icon: TrendingUp, title: "Revender com margem", desc: "Compro para revender e preciso enxergar a margem." },
  { id: "consultar", icon: Search, title: "Assessorar clientes", desc: "Sou advogado/consultor e analiso oportunidades." },
];

const channels = [
  { id: "in_app", icon: Bell, title: "No aplicativo", desc: "Aviso dentro da plataforma." },
  { id: "email", icon: Mail, title: "E-mail", desc: "Receba um resumo no seu e-mail." },
  { id: "whatsapp", icon: MessageCircle, title: "WhatsApp", desc: "Alerta direto no seu celular." },
];

export function OnboardingPage({ name, onFinish }: OnboardingPageProps) {
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState<string | null>(null);
  const [channel, setChannel] = useState<string | null>(null);

  const firstName = (name ?? "").split(" ")[0] || "bem-vindo";

  function finish() {
    saveOnboardingPrefs({ goal: goal ?? "", channel: channel ?? "" });
    onFinish();
  }

  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <div className="onboarding-head">
          <div className="brand-mark">f</div>
          <div className="onboarding-steps" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <span key={i} className={`onb-dot${i <= step ? " active" : ""}`} />
            ))}
          </div>
        </div>

        {step === 0 && (
          <div className="onboarding-body">
            <span className="onboarding-eyebrow">
              <Sparkles size={14} aria-hidden="true" /> Passo 1 de 3
            </span>
            <h1>Olá, {firstName}! O que você quer fazer aqui?</h1>
            <p className="onboarding-sub">Isso ajusta o radar pra mostrar o que importa pra você.</p>
            <div className="onboarding-options">
              {goals.map(({ id, icon: Icon, title, desc }) => (
                <button
                  key={id}
                  className={`onboarding-option${goal === id ? " selected" : ""}`}
                  onClick={() => setGoal(id)}
                  type="button"
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
              <button className="link-btn" onClick={finish} type="button">
                Pular
              </button>
              <button className="primary-button" onClick={() => setStep(1)} type="button" disabled={!goal}>
                Continuar
              </button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="onboarding-body">
            <span className="onboarding-eyebrow">
              <Sparkles size={14} aria-hidden="true" /> Passo 2 de 3
            </span>
            <h1>Como prefere ser avisado?</h1>
            <p className="onboarding-sub">Quando aparecer um lote no seu perfil, a gente te avisa por aqui.</p>
            <div className="onboarding-options">
              {channels.map(({ id, icon: Icon, title, desc }) => (
                <button
                  key={id}
                  className={`onboarding-option${channel === id ? " selected" : ""}`}
                  onClick={() => setChannel(id)}
                  type="button"
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
              <button className="link-btn" onClick={() => setStep(0)} type="button">
                Voltar
              </button>
              <button className="primary-button" onClick={() => setStep(2)} type="button" disabled={!channel}>
                Continuar
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="onboarding-body">
            <span className="onboarding-eyebrow">
              <Sparkles size={14} aria-hidden="true" /> Tudo pronto
            </span>
            <h1>Pronto pra começar, {firstName}!</h1>
            <p className="onboarding-sub">
              Seu cockpit já está configurado. Veja o radar de oportunidades, faça uma pergunta
              e crie seu primeiro alerta — leva menos de 2 minutos.
            </p>
            <ul className="onboarding-checklist">
              <li><span className="pricing-check">✓</span> Radar de leilões com score de oportunidade</li>
              <li><span className="pricing-check">✓</span> Pergunte em português e receba resposta com fonte</li>
              <li><span className="pricing-check">✓</span> Alertas automáticos antes do prazo fechar</li>
            </ul>
            <div className="onboarding-actions">
              <button className="link-btn" onClick={() => setStep(1)} type="button">
                Voltar
              </button>
              <button className="btn-primary-full onboarding-finish" onClick={finish} type="button">
                Entrar no meu cockpit
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
