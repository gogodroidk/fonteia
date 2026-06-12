import { ArrowRight, BarChart2, Bell, CheckCircle, FileText, Shield, Zap } from "lucide-react";

interface LandingPageProps {
  onLogin: () => void;
}

const features = [
  {
    icon: BarChart2,
    color: "#0f5f4a",
    bg: "#e4f7ee",
    title: "Score de oportunidade",
    desc: "IA pontua cada lote de 0 a 100 considerando margem, risco, prazo e elegibilidade — antes de você gastar um segundo.",
  },
  {
    icon: Zap,
    color: "#1e40af",
    bg: "#dbeafe",
    title: "Radar em tempo real",
    desc: "Receita Federal SLE, PNCP, Compras.gov e mais. Dados chegam antes do concorrente saber que existem.",
  },
  {
    icon: Bell,
    color: "#7c3aed",
    bg: "#ede9fe",
    title: "Alertas automáticos",
    desc: "Defina critérios uma vez. Receba por app, e-mail ou WhatsApp quando aparecer um lote dentro do seu perfil.",
  },
  {
    icon: Shield,
    color: "#dc2626",
    bg: "#fee2e2",
    title: "Evidência rastreável",
    desc: "Cada dado tem fonte oficial, data de coleta e hash SHA-256. Apresente para o cliente com total confiança.",
  },
  {
    icon: FileText,
    color: "#d97706",
    bg: "#fef3c7",
    title: "Dossiês com IA",
    desc: "Relatórios completos de entidade, lote ou empresa em um clique — prontos para due diligence ou apresentação.",
  },
  {
    icon: CheckCircle,
    color: "#0f5f4a",
    bg: "#e4f7ee",
    title: "Multi-módulo",
    desc: "Leilões hoje. Licitações, CNPJ, INPI, Jurídico e Ambiental chegando. Uma assinatura, toda a inteligência pública.",
  },
];

const plans = [
  {
    id: "free",
    name: "Free",
    price: "R$ 0",
    period: "/mês",
    desc: "Para explorar o produto",
    features: ["Radar de leilões limitado", "5 respostas de IA/mês", "1 alerta ativo"],
    cta: "Começar grátis",
    featured: false,
  },
  {
    id: "individual",
    name: "Individual",
    price: "R$ 299",
    period: "/mês",
    desc: "Para revendedores e compradores solo",
    features: ["500 buscas/mês", "100 respostas de IA", "20 alertas", "Leilões + INPI"],
    cta: "Assinar agora",
    featured: true,
  },
  {
    id: "escritorio",
    name: "Escritório",
    price: "R$ 699",
    period: "/mês",
    desc: "Para advogados e consultores",
    features: ["3.000 buscas/mês", "600 respostas de IA", "5 usuários", "Todos os módulos core"],
    cta: "Liberar Escritório",
    featured: false,
  },
];

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

export function LandingPage({ onLogin }: LandingPageProps) {
  return (
    <div className="landing">
      {/* Navbar */}
      <nav className="landing-nav">
        <div className="landing-nav-inner">
          <div className="brand">
            <div className="brand-mark">f</div>
            <div>
              <strong>Fonte.ia</strong>
              <span>by Olli</span>
            </div>
          </div>
          <div className="landing-nav-links">
            <a href="#features">Funcionalidades</a>
            <a href="#pricing">Planos</a>
          </div>
          <button className="btn-nav-cta" onClick={onLogin} type="button">
            Entrar
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="landing-hero">
        {/* Decorative orbs */}
        <div className="hero-orb hero-orb-1" aria-hidden="true" />
        <div className="hero-orb hero-orb-2" aria-hidden="true" />
        <div className="hero-orb hero-orb-3" aria-hidden="true" />

        <div className="landing-hero-inner">
          <div className="hero-eyebrow-row">
            <span className="landing-badge">Alpha · Leilões Judiciais</span>
          </div>

          <h1 className="landing-headline">
            Inteligência em{" "}
            <span className="headline-gradient">dados públicos</span>
            <br />
            brasileiros
          </h1>

          <p className="landing-sub">
            Receita Federal, PNCP, CNPJ e mais — transformados em decisões
            rastreáveis com IA. Score de oportunidade, alertas e dossiês
            com fonte e hash para cada dado.
          </p>

          <div className="landing-hero-ctas">
            <button className="btn-hero-primary" onClick={onLogin} type="button">
              <GoogleIcon />
              Entrar com Google
            </button>
            <a className="btn-hero-ghost" href="#pricing">
              Ver planos <ArrowRight size={16} aria-hidden="true" />
            </a>
          </div>

          {/* Stats row */}
          <div className="hero-stats">
            {[
              { value: "18", label: "fontes catalogadas" },
              { value: "5", label: "módulos planejados" },
              { value: "R$ 299", label: "para começar" },
              { value: "SHA-256", label: "evidência rastreável" },
            ].map((s) => (
              <div className="hero-stat" key={s.label}>
                <strong>{s.value}</strong>
                <span>{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Product mockup */}
        <div className="hero-mockup-wrap" aria-hidden="true">
          <div className="hero-mockup">
            <div className="mockup-window">
              <div className="mockup-titlebar">
                <span style={{ background: "#ff5f57" }} />
                <span style={{ background: "#ffbd2e" }} />
                <span style={{ background: "#28c840" }} />
                <div className="mockup-url-bar">fcbe6bff.fonteia.pages.dev</div>
              </div>
              <div className="mockup-sidebar">
                <div className="msb-brand" />
                {["Cockpit","Perguntar","Fontes","Módulos","Planos"].map((l) => (
                  <div key={l} className={`msb-item${l === "Cockpit" ? " active" : ""}`}>{l}</div>
                ))}
              </div>
              <div className="mockup-body">
                <div className="mockup-topbar">
                  <div className="mockup-h1">Leilões</div>
                  <div className="mockup-topbar-btns">
                    <div className="mockup-btn-ghost" />
                    <div className="mockup-btn-solid" />
                  </div>
                </div>
                {[
                  { score: 86, color: "#22c87c", title: "Edital 0900100/0000007/2026", sub: "CURITIBA · prazo 29/06/2026", val: "R$ 1.490" },
                  { score: 77, color: "#22c87c", title: "Edital 0317900/0000002/2026", sub: "FORTALEZA · prazo 26/06/2026", val: "R$ 320.000" },
                  { score: 72, color: "#f59e0b", title: "Edital 0200100/0000001/2026", sub: "BELÉM · prazo 06/07/2026", val: "R$ 40.000" },
                ].map((row) => (
                  <div className="mockup-row" key={row.title}>
                    <svg width="36" height="36" viewBox="0 0 36 36">
                      <circle cx="18" cy="18" r="14" fill="none" stroke="#e8f5ef" strokeWidth="4" />
                      <circle
                        cx="18" cy="18" r="14"
                        fill="none" stroke={row.color} strokeWidth="4"
                        strokeLinecap="round"
                        strokeDasharray={2 * Math.PI * 14}
                        strokeDashoffset={2 * Math.PI * 14 * (1 - row.score / 100)}
                        transform="rotate(-90 18 18)"
                      />
                      <text x="18" y="18" textAnchor="middle" dominantBaseline="central" fontSize="9" fontWeight="900" fill="#0b6048" fontFamily="Inter,sans-serif">{row.score}</text>
                    </svg>
                    <div className="mockup-row-info">
                      <div className="mockup-row-title">{row.title}</div>
                      <div className="mockup-row-sub">{row.sub}</div>
                    </div>
                    <div className="mockup-row-val" style={{ color: "#0b6048" }}>{row.val}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section className="landing-section" id="como-funciona">
        <div className="landing-section-inner">
          <span className="section-eyebrow">Como funciona</span>
          <h2 className="section-heading">Da fonte oficial à sua decisão<br />em três passos</h2>
          <div className="how-grid">
            {[
              {
                n: "1",
                title: "Conectamos as fontes oficiais",
                desc: "Receita Federal, PNCP, CNPJ, tribunais e mais. Coletamos automaticamente e guardamos cada dado com fonte, data e hash.",
              },
              {
                n: "2",
                title: "A IA analisa e pontua",
                desc: "Cada lote ganha um score de 0 a 100 por margem, risco e prazo. Você pergunta em português e recebe resposta com a prova de cada fato.",
              },
              {
                n: "3",
                title: "Você decide com segurança",
                desc: "Crie alertas, gere dossiês e aja antes do concorrente — com evidência rastreável para mostrar ao cliente.",
              },
            ].map((s) => (
              <div className="how-card" key={s.n}>
                <div className="how-step">{s.n}</div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="landing-section landing-section-alt" id="features">
        <div className="landing-section-inner">
          <span className="section-eyebrow">Funcionalidades</span>
          <h2 className="section-heading">
            Tudo que você precisa para operar<br />com dados públicos
          </h2>
          <div className="features-grid">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <div className="feature-card" key={f.title}>
                  <div className="feature-icon" style={{ background: f.bg, color: f.color }}>
                    <Icon size={22} aria-hidden="true" />
                  </div>
                  <h3>{f.title}</h3>
                  <p>{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="landing-section landing-section-alt" id="pricing">
        <div className="landing-section-inner">
          <span className="section-eyebrow">Planos</span>
          <h2 className="section-heading">Simples, transparente, sem surpresa</h2>
          <div className="pricing-grid">
            {plans.map((plan) => (
              <div
                className={`pricing-card${plan.featured ? " pricing-card-featured" : ""}`}
                key={plan.id}
              >
                {plan.featured && <div className="pricing-badge">Mais popular</div>}
                <div>
                  <h3>{plan.name}</h3>
                  <p className="pricing-desc">{plan.desc}</p>
                </div>
                <div className="pricing-price">
                  <strong>{plan.price}</strong>
                  <span>{plan.period}</span>
                </div>
                <ul className="pricing-features">
                  {plan.features.map((feat) => (
                    <li key={feat}>
                      <span className="pricing-check">✓</span>
                      {feat}
                    </li>
                  ))}
                </ul>
                <button
                  className={plan.featured ? "btn-primary-full" : "btn-outline-full"}
                  onClick={onLogin}
                  type="button"
                >
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
          <p className="pricing-note">
            Planos Corporativo (R$ 1.499), Enterprise e API disponíveis.{" "}
            <button type="button" onClick={onLogin} className="link-btn">
              Fale com a gente
            </button>
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="landing-cta">
        <div className="landing-cta-inner">
          <h2>Comece hoje. É grátis para explorar.</h2>
          <p>Sem cartão de crédito. Sem contrato. Cancele quando quiser.</p>
          <button className="btn-hero-primary btn-hero-primary-light" onClick={onLogin} type="button">
            <GoogleIcon />
            Criar conta grátis com Google
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="brand">
            <div className="brand-mark brand-mark-sm">f</div>
            <div>
              <strong style={{ color: "#b8f0da" }}>Fonte.ia</strong>
              <span style={{ color: "#556560" }}>by Olli</span>
            </div>
          </div>
          <p style={{ color: "#556560", fontSize: "0.8rem" }}>
            © {new Date().getFullYear()} Olli. Dados públicos com evidência rastreável.
          </p>
        </div>
      </footer>
    </div>
  );
}
