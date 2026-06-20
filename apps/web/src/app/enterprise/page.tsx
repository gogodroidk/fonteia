import { LogoMark } from "../../components/ui/logo-mark";
import { ThemeToggle } from "../../components/ui/ThemeToggle";
import {
  useSeo,
  breadcrumbJsonLd,
  SITE_URL,
} from "../../lib/seo";
import {
  Shield,
  Briefcase,
  AlertTriangle,
  Scale,
  Zap,
  Users,
  Database,
  Brain,
  ClipboardList,
  FileText,
  Headphones,
  CheckCircle,
} from "lucide-react";

/* ── Primitivos ───────────────────────────────────────────────────────────── */
function P({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: "clamp(15px, 2vw, 17px)",
        lineHeight: 1.75,
        color: "var(--t-mid)",
        marginBottom: "16px",
        maxWidth: "68ch",
      }}
    >
      {children}
    </p>
  );
}

function SectionTitle({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  return (
    <h2
      id={id}
      style={{
        fontSize: "clamp(20px, 4vw, 26px)",
        fontWeight: 800,
        letterSpacing: "-0.025em",
        marginBottom: "16px",
        color: "var(--t-hi)",
      }}
    >
      {children}
    </h2>
  );
}

/* ── Card "Para quem" ────────────────────────────────────────────────────── */
function AudienceCard({
  icon,
  titulo,
  descricao,
}: {
  icon: React.ReactNode;
  titulo: string;
  descricao: string;
}) {
  return (
    <div
      className="card card--pad"
      style={{ display: "flex", flexDirection: "column", gap: "14px", padding: "24px" }}
    >
      <div
        style={{
          width: "44px",
          height: "44px",
          borderRadius: "12px",
          background: "color-mix(in srgb, var(--brand) 10%, var(--surface))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--brand)",
          flexShrink: 0,
        }}
        aria-hidden="true"
      >
        {icon}
      </div>
      <p style={{ fontWeight: 700, fontSize: "15.5px", color: "var(--t-hi)", margin: 0 }}>
        {titulo}
      </p>
      <p style={{ fontSize: "14px", lineHeight: 1.7, color: "var(--t-mid)", margin: 0 }}>
        {descricao}
      </p>
    </div>
  );
}

/* ── Card "Recursos Enterprise" ──────────────────────────────────────────── */
function ResourceCard({
  icon,
  titulo,
  descricao,
}: {
  icon: React.ReactNode;
  titulo: string;
  descricao: string;
}) {
  return (
    <div
      className="card card--pad"
      style={{ display: "flex", gap: "16px", alignItems: "flex-start", padding: "20px 22px" }}
    >
      <div
        style={{
          width: "38px",
          height: "38px",
          borderRadius: "10px",
          background: "color-mix(in srgb, var(--accent) 10%, var(--surface))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--accent-ink)",
          flexShrink: 0,
          marginTop: "2px",
        }}
        aria-hidden="true"
      >
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ fontWeight: 700, fontSize: "14.5px", color: "var(--t-hi)", margin: "0 0 6px" }}>
          {titulo}
        </p>
        <p style={{ fontSize: "13.5px", lineHeight: 1.65, color: "var(--t-mid)", margin: 0 }}>
          {descricao}
        </p>
      </div>
    </div>
  );
}

/* ── Item de bullet com ícone ────────────────────────────────────────────── */
function BulletItem({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "10px",
        fontSize: "14.5px",
        lineHeight: 1.65,
        color: "var(--t-mid)",
      }}
    >
      <CheckCircle
        size={15}
        aria-hidden="true"
        style={{ color: "var(--accent-ink)", flexShrink: 0, marginTop: "3px" }}
      />
      <span>{children}</span>
    </div>
  );
}

/* ── Página principal ─────────────────────────────────────────────────────── */
export function EnterprisePage() {
  const TITLE = "Enterprise — Inteligência de dados públicos com rastreabilidade auditável | Fonte.ia";
  const DESCRIPTION =
    "Plataforma Enterprise de inteligência de dados públicos para compliance, due diligence e gestão de risco. API, SSO, RBAC, trilha de auditoria, DPA e gerente de conta. Cada dado com link, data e hash de origem.";

  useSeo({
    title: TITLE,
    description: DESCRIPTION,
    canonicalPath: "/enterprise",
    jsonLd: [
      breadcrumbJsonLd([
        { name: "Início", url: SITE_URL + "/" },
        { name: "Enterprise", url: SITE_URL + "/enterprise" },
      ]),
    ],
  });

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--t-hi)",
        display: "flex",
        flexDirection: "column",
        overflowX: "hidden",
      }}
    >
      <style>{`
        @media (max-width: 720px) {
          .enterprise-header { padding-left: 20px !important; padding-right: 20px !important; }
          .enterprise-main   { padding-left: 20px !important; padding-right: 20px !important; }
          .enterprise-footer { padding-left: 20px !important; padding-right: 20px !important; }
          .enterprise-audience-grid   { grid-template-columns: 1fr !important; }
          .enterprise-resources-grid  { grid-template-columns: 1fr !important; }
          .enterprise-hero-ctas { flex-direction: column !important; }
          .enterprise-hero-ctas a { width: 100% !important; justify-content: center !important; }
          .enterprise-nav-links { display: none !important; }
        }
        @media (max-width: 460px) {
          .enterprise-audience-grid  { grid-template-columns: 1fr !important; }
          .enterprise-resources-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ── Cabeçalho ───────────────────────────────────────────────────── */}
      <header
        className="enterprise-header"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "18px 48px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <a
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            textDecoration: "none",
            color: "var(--t-hi)",
          }}
          aria-label="Fonte.ia — página inicial"
        >
          <LogoMark size={26} />
          <div>
            <div style={{ fontSize: "18px", fontWeight: 700, letterSpacing: "-0.02em" }}>
              Fonte<span style={{ color: "var(--accent-ink)" }}>.ia</span>
            </div>
            <div
              style={{
                fontSize: "9px",
                fontWeight: 700,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "var(--t-low)",
                marginTop: "2px",
              }}
            >
              by Olli
            </div>
          </div>
        </a>

        <nav
          aria-label="Navegação principal"
          style={{ display: "flex", gap: "10px", alignItems: "center" }}
        >
          <ThemeToggle />
          <a href="/contato" className="btn btn--ghost btn--sm enterprise-nav-links">
            Contato
          </a>
          <a href="/sobre" className="btn btn--ghost btn--sm enterprise-nav-links">
            Sobre
          </a>
          <a
            href="mailto:contato@olli.com.br?subject=Vendas%20Enterprise%20Fonte.ia"
            className="btn btn--accent btn--sm"
          >
            Falar com vendas
          </a>
        </nav>
      </header>

      {/* ── Conteúdo principal ──────────────────────────────────────────── */}
      <main
        className="enterprise-main"
        style={{
          flex: 1,
          maxWidth: "900px",
          width: "100%",
          margin: "0 auto",
          padding: "60px 28px 100px",
        }}
      >
        {/* Breadcrumb */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: "20px",
          }}
        >
          <a href="/" className="link small" style={{ fontSize: "13px" }}>
            Início
          </a>
          <span style={{ color: "var(--t-low)", fontSize: "13px" }} aria-hidden="true">
            ›
          </span>
          <span style={{ color: "var(--t-low)", fontSize: "13px" }}>Enterprise</span>
        </div>

        {/* Herói */}
        <header style={{ marginBottom: "64px" }}>
          <span className="eyebrow" style={{ display: "block", marginBottom: "14px" }}>
            Enterprise
          </span>
          <h1
            style={{
              fontSize: "clamp(26px, 6vw, 44px)",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              lineHeight: 1.08,
              marginBottom: "22px",
              maxWidth: "20ch",
            }}
          >
            Inteligência de dados públicos com rastreabilidade auditável
          </h1>
          <p
            style={{
              fontSize: "clamp(15px, 2vw, 18px)",
              lineHeight: 1.7,
              color: "var(--t-mid)",
              marginBottom: "32px",
              maxWidth: "62ch",
            }}
          >
            O grafo que conecta o dinheiro público ao privado — com cada dado apontando para sua
            fonte oficial (link + data + hash). Para times de compliance, due diligence e gestão
            de risco que precisam de evidências, não de estimativas.
          </p>
          <div
            className="enterprise-hero-ctas"
            style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}
          >
            <a
              href="mailto:contato@olli.com.br?subject=Proposta%20Enterprise%20Fonte.ia"
              className="btn btn--primary btn--lg"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                textDecoration: "none",
                minHeight: "48px",
                minWidth: "200px",
              }}
            >
              Solicitar proposta
            </a>
            <a
              href="mailto:contato@olli.com.br?subject=Vendas%20Enterprise%20Fonte.ia"
              className="btn btn--ghost btn--lg"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                textDecoration: "none",
                minHeight: "48px",
              }}
            >
              Falar com vendas
            </a>
          </div>
        </header>

        {/* Para quem */}
        <section aria-labelledby="para-quem-heading" style={{ marginBottom: "64px" }}>
          <SectionTitle id="para-quem-heading">Para quem</SectionTitle>
          <div
            className="enterprise-audience-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "14px",
            }}
          >
            <AudienceCard
              icon={<Shield size={20} />}
              titulo="Compliance e PLD-FT"
              descricao="Mapeamento de beneficiários finais, cadeia societária via QSA, sanções ativas (Portal da Transparência) e vínculos com pessoas politicamente expostas. Tudo com fonte citável para o dossiê regulatório."
            />
            <AudienceCard
              icon={<Briefcase size={20} />}
              titulo="Due diligence e M&A"
              descricao="Raio-X completo de contraparte: CNPJ, sócios, licitações ganhas, contratos públicos ativos, infrações ambientais e marcas INPI em um único dossiê exportável."
            />
            <AudienceCard
              icon={<AlertTriangle size={20} />}
              titulo="Risco de fornecedor"
              descricao="Monitore a saúde regulatória dos seus fornecedores continuamente: sanções, litígios, infrações IBAMA e variações na cadeia societária. Alertas automáticos por webhook."
            />
            <AudienceCard
              icon={<Scale size={20} />}
              titulo="Jurídico e contencioso"
              descricao="Processos CNJ, votações legislativas relevantes para setores regulados e rastreamento de proposições que impactam contratos públicos em tramitação."
            />
          </div>
        </section>

        {/* Recursos Enterprise */}
        <section aria-labelledby="recursos-heading" style={{ marginBottom: "64px" }}>
          <SectionTitle id="recursos-heading">Recursos Enterprise</SectionTitle>
          <div
            className="enterprise-resources-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
            }}
          >
            <ResourceCard
              icon={<Zap size={18} />}
              titulo="API + Webhooks"
              descricao="Integre os dados diretamente nos seus sistemas internos. API REST com autenticação por chave, webhooks para alertas em tempo real e SDKs documentados."
            />
            <ResourceCard
              icon={<Users size={18} />}
              titulo="SSO e RBAC"
              descricao="Single Sign-On (SAML 2.0 / OIDC) e controle de acesso por papel. Múltiplos usuários na mesma conta com auditoria de quem consultou o quê e quando."
            />
            <ResourceCard
              icon={<Database size={18} />}
              titulo="Cota InfoSimples com overage"
              descricao="Créditos mensais de consulta InfoSimples (dados cadastrais enriquecidos por CNPJ) com overage controlado e cap de gasto configurável."
            />
            <ResourceCard
              icon={<Brain size={18} />}
              titulo="Acesso pleno ao Cérebro"
              descricao="O grafo de conhecimento que liga CNPJ, IBGE, deputados, fornecedores e sócios em uma única tela. 'Siga o dinheiro' de forma visual e auditável."
            />
            <ResourceCard
              icon={<ClipboardList size={18} />}
              titulo="Trilha de auditoria"
              descricao="Cada consulta, cada exportação e cada acesso à API são registrados com timestamp e usuário. Exportável para CSV para fins de auditoria interna ou regulatória."
            />
            <ResourceCard
              icon={<FileText size={18} />}
              titulo="Relatório de due diligence com marca"
              descricao="Dossiê em PDF com a identidade visual do seu escritório ou empresa, gerado sob demanda a partir de qualquer entidade na plataforma."
            />
            <ResourceCard
              icon={<Headphones size={18} />}
              titulo="SLA e gerente de conta"
              descricao="SLA de disponibilidade contratual, onboarding dedicado e gerente de conta com canal prioritário de suporte."
            />
          </div>
        </section>

        {/* Rastreabilidade e LGPD */}
        <section aria-labelledby="rastreabilidade-heading" style={{ marginBottom: "64px" }}>
          <div
            className="panel"
            style={{
              padding: "36px 40px",
              background: "color-mix(in srgb, var(--accent) 5%, var(--surface))",
              borderColor: "color-mix(in srgb, var(--accent) 18%, var(--border))",
            }}
          >
            <SectionTitle id="rastreabilidade-heading">
              Dados com proveniência verificável
            </SectionTitle>
            <p
              style={{
                fontSize: "clamp(14px, 2vw, 16px)",
                lineHeight: 1.75,
                color: "var(--t-mid)",
                marginBottom: "28px",
                maxWidth: "64ch",
              }}
            >
              A Fonte.ia não fabrica dados. Cada registro exibido aponta para o documento de
              origem — link, data de coleta e hash de conteúdo. A IA resume o que o governo
              publicou; quando a evidência é insuficiente, diz "evidência insuficiente", nunca
              inventa.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <BulletItem>
                Separação explícita entre fonte oficial, fonte pública e análise de IA
              </BulletItem>
              <BulletItem>
                Base legal LGPD documentada (legítimo interesse + execução contratual)
              </BulletItem>
              <BulletItem>
                Minimização de dado pessoal: coletamos apenas o necessário para a prestação do
                serviço
              </BulletItem>
              <BulletItem>
                DPA (Data Processing Agreement) disponível mediante solicitação
              </BulletItem>
              <BulletItem>
                Dados públicos coletados ao amparo da Lei de Acesso à Informação (12.527/2011)
              </BulletItem>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section aria-labelledby="pricing-heading" style={{ marginBottom: "64px" }}>
          <SectionTitle id="pricing-heading">Plano Enterprise</SectionTitle>
          <p
            style={{
              fontSize: "clamp(14px, 2vw, 16px)",
              fontWeight: 600,
              color: "var(--t-hi)",
              marginBottom: "10px",
            }}
          >
            Sob consulta — adequado ao volume, SLA e integrações do seu time.
          </p>
          <P>
            O plano Enterprise inclui os recursos acima com configuração personalizada. O preço
            depende do número de usuários, volume de consultas API e integrações necessárias.
          </P>

          <div
            className="panel"
            style={{
              padding: "32px",
              marginTop: "28px",
              textAlign: "center",
              background: "color-mix(in srgb, var(--brand) 5%, var(--surface))",
              borderColor: "color-mix(in srgb, var(--brand) 18%, var(--border))",
            }}
          >
            <p
              style={{
                fontSize: "17px",
                fontWeight: 700,
                color: "var(--t-hi)",
                marginBottom: "8px",
              }}
            >
              Pronto para proteger as decisões do seu time com dados rastreáveis?
            </p>
            <p
              style={{
                fontSize: "14.5px",
                color: "var(--t-mid)",
                marginBottom: "24px",
                lineHeight: 1.65,
              }}
            >
              Fale com nosso time comercial. Respondemos em até 1 dia útil com uma proposta
              adequada ao seu contexto.
            </p>
            <div
              style={{
                display: "flex",
                gap: "12px",
                justifyContent: "center",
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <a
                href="mailto:contato@olli.com.br?subject=Proposta%20Enterprise%20Fonte.ia"
                className="btn btn--primary btn--lg"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textDecoration: "none",
                  minHeight: "48px",
                  minWidth: "200px",
                }}
              >
                Solicitar proposta
              </a>
            </div>
            <p style={{ marginTop: "18px", fontSize: "13.5px", color: "var(--t-low)" }}>
              Ou fale com vendas pelo e-mail{" "}
              <a
                href="mailto:contato@olli.com.br?subject=Vendas%20Enterprise%20Fonte.ia"
                className="link"
                style={{ fontWeight: 600 }}
              >
                contato@olli.com.br
              </a>
            </p>
          </div>
        </section>

        {/* DPA / LGPD */}
        <section aria-labelledby="dpa-heading" style={{ marginBottom: "24px" }}>
          <div className="panel" style={{ padding: "28px 32px" }}>
            <h2
              id="dpa-heading"
              style={{
                fontSize: "clamp(16px, 3vw, 19px)",
                fontWeight: 800,
                letterSpacing: "-0.02em",
                marginBottom: "12px",
                color: "var(--t-hi)",
              }}
            >
              Proteção de dados e DPA
            </h2>
            <p
              style={{
                fontSize: "14px",
                lineHeight: 1.7,
                color: "var(--t-mid)",
                marginBottom: "20px",
                maxWidth: "64ch",
              }}
            >
              Para empresas que precisam de documentação de conformidade, disponibilizamos o DPA
              (Data Processing Agreement) e a documentação da nossa base legal LGPD.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "22px" }}>
              <BulletItem>
                Base legal: legítimo interesse (Art. 7º, IX LGPD) + execução contratual (Art.
                7º, V LGPD)
              </BulletItem>
              <BulletItem>
                Minimização: apenas dados necessários para a prestação do serviço
              </BulletItem>
              <BulletItem>
                Retenção: conforme{" "}
                <a href="/privacidade" className="link">
                  política de privacidade
                </a>
              </BulletItem>
              <BulletItem>
                DPA padrão disponível; aditivos específicos sob negociação
              </BulletItem>
            </div>
            <a
              href="mailto:contato@olli.com.br?subject=Solicitar%20DPA%20Fonte.ia"
              className="btn btn--soft btn--sm"
              style={{
                display: "inline-flex",
                alignItems: "center",
                textDecoration: "none",
              }}
            >
              Solicitar DPA
            </a>
          </div>
        </section>
      </main>

      {/* ── Rodapé institucional ─────────────────────────────────────────── */}
      <footer
        className="enterprise-footer"
        style={{
          borderTop: "1px solid var(--border)",
          padding: "32px 48px",
          background: "var(--surface)",
        }}
      >
        <div
          style={{
            maxWidth: "1100px",
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            gap: "24px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              flexWrap: "wrap",
              gap: "24px",
            }}
          >
            <a
              href="/"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                textDecoration: "none",
                color: "var(--t-hi)",
              }}
              aria-label="Ir para a página inicial"
            >
              <LogoMark size={20} />
              <span style={{ fontSize: "15px", fontWeight: 700 }}>
                Fonte<span style={{ color: "var(--accent-ink)" }}>.ia</span>
              </span>
            </a>

            <nav
              style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}
              aria-label="Links do rodapé"
            >
              <a href="/sobre" className="link small">
                Sobre
              </a>
              <a href="/seguranca" className="link small">
                Segurança
              </a>
              <a href="/para-quem" className="link small">
                Para quem
              </a>
              <a href="/contato" className="link small">
                Contato
              </a>
              <a href="/privacidade" className="link small" style={{ color: "var(--t-low)" }}>
                Privacidade
              </a>
              <a href="/termos" className="link small" style={{ color: "var(--t-low)" }}>
                Termos
              </a>
            </nav>
          </div>

          <div
            style={{
              borderTop: "1px solid var(--border)",
              paddingTop: "16px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "8px",
            }}
          >
            <span className="small" style={{ color: "var(--t-low)", fontSize: "12.5px" }}>
              Olli Inteligência Digital Sistemas LTDA · CNPJ 65.361.266/0001-05
            </span>
            <span className="small" style={{ color: "var(--t-low)", fontSize: "12.5px" }}>
              © {new Date().getFullYear()} Fonte.ia · Dados públicos, decisões rastreáveis.
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
