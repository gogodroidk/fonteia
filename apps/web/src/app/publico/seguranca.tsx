import { LogoMark } from "../../components/ui/logo-mark";
import {
  useSeo,
  articleJsonLd,
  breadcrumbJsonLd,
  SITE_URL,
} from "../../lib/seo";
import {
  ShieldCheck,
  Lock,
  Database,
  Globe,
  CreditCard,
  ArrowRight,
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

/* ── Card de infraestrutura ──────────────────────────────────────────────── */
function InfraCard({
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
      style={{ display: "flex", gap: "16px", padding: "20px 22px", alignItems: "flex-start" }}
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
      <div>
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

/* ── Item de lista LGPD ──────────────────────────────────────────────────── */
function LgpdItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="seg-lgpd-item"
      style={{
        display: "grid",
        gridTemplateColumns: "180px 1fr",
        gap: "12px",
        padding: "14px 0",
        borderBottom: "1px solid var(--border)",
        alignItems: "flex-start",
      }}
    >
      <span
        style={{
          fontSize: "13px",
          fontWeight: 700,
          color: "var(--t-low)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          paddingTop: "2px",
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: "14.5px", lineHeight: 1.65, color: "var(--t-mid)" }}>
        {children}
      </span>
    </div>
  );
}

/* ── Fluxo de rastreabilidade ────────────────────────────────────────────── */
function FluxoStep({
  num,
  label,
  sublabel,
  last,
}: {
  num: number;
  label: string;
  sublabel: string;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        flex: 1,
        position: "relative",
      }}
    >
      <div
        style={{
          width: "44px",
          height: "44px",
          borderRadius: "50%",
          background: "linear-gradient(135deg, var(--brand), var(--accent))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 800,
          fontSize: "16px",
          color: "#fff",
          marginBottom: "10px",
          flexShrink: 0,
        }}
      >
        {num}
      </div>
      <p
        style={{
          fontWeight: 700,
          fontSize: "13.5px",
          color: "var(--t-hi)",
          margin: "0 0 4px",
          textAlign: "center",
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: "12px",
          color: "var(--t-low)",
          margin: 0,
          textAlign: "center",
          lineHeight: 1.5,
        }}
      >
        {sublabel}
      </p>
      {!last && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: "22px",
            right: "-10px",
            color: "var(--t-low)",
          }}
        >
          <ArrowRight size={18} />
        </div>
      )}
    </div>
  );
}

/* ── Página principal ─────────────────────────────────────────────────────── */
export function SegurancaPage() {
  const TITLE =
    "Segurança, Privacidade e LGPD — Como protegemos seus dados | Fonte.ia";
  const DESCRIPTION =
    "Como a Fonte.ia protege seus dados pessoais, cumpre a LGPD (Lei 13.709/2018), trata dados públicos com rastreabilidade total e usa Stripe para pagamentos seguros. Infraestrutura: Supabase + Cloudflare.";

  useSeo({
    title: TITLE,
    description: DESCRIPTION,
    canonicalPath: "/seguranca",
    jsonLd: [
      articleJsonLd({
        title: TITLE,
        description: DESCRIPTION,
        url: SITE_URL + "/seguranca",
        datePublished: "2026-06-13",
      }),
      breadcrumbJsonLd([
        { name: "Início", url: SITE_URL + "/" },
        { name: "Segurança", url: SITE_URL + "/seguranca" },
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
          .seg-header  { padding-left: 20px !important; padding-right: 20px !important; }
          .seg-main    { padding-left: 20px !important; padding-right: 20px !important; }
          .seg-footer  { padding-left: 20px !important; padding-right: 20px !important; }
          .seg-infra-grid { grid-template-columns: 1fr !important; }
          .seg-fluxo   { flex-direction: column !important; gap: 24px !important; }
          .seg-lgpd-item { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ── Cabeçalho ───────────────────────────────────────────────────── */}
      <header
        className="seg-header"
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
          <a href="/sobre" className="btn btn--ghost btn--sm">
            Sobre
          </a>
          <a href="/contato" className="btn btn--ghost btn--sm">
            Contato
          </a>
          <a href="/entrar" className="btn btn--accent btn--sm">
            Começar grátis
          </a>
        </nav>
      </header>

      {/* ── Conteúdo principal ──────────────────────────────────────────── */}
      <main
        className="seg-main"
        style={{
          flex: 1,
          maxWidth: "760px",
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
          <span style={{ color: "var(--t-low)", fontSize: "13px" }}>Segurança</span>
        </div>

        {/* Herói */}
        <header style={{ marginBottom: "48px" }}>
          <span className="eyebrow" style={{ display: "block", marginBottom: "14px" }}>
            Segurança e privacidade
          </span>
          <h1
            style={{
              fontSize: "clamp(26px, 6vw, 40px)",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              lineHeight: 1.1,
              marginBottom: "20px",
            }}
          >
            Seus dados protegidos.
            <br />
            Os dados públicos, rastreáveis.
          </h1>
          <P>
            Esta página trata de dois assuntos distintos: (1) como protegemos os{" "}
            <strong style={{ color: "var(--t-hi)" }}>dados que você nos confia</strong> ao usar a
            plataforma — nome, e-mail, pagamento — e (2) como tratamos os{" "}
            <strong style={{ color: "var(--t-hi)" }}>dados públicos dos leilões</strong>, que
            coletamos de fontes oficiais do governo. São questões diferentes e merecem respostas
            diferentes.
          </P>
        </header>

        {/* Segurança da plataforma */}
        <section aria-labelledby="plataforma-heading" style={{ marginBottom: "56px" }}>
          <SectionTitle id="plataforma-heading">Segurança da plataforma</SectionTitle>
          <P>
            A Fonte.ia é construída sobre infraestrutura profissional e pratica defesa em
            profundidade. Não prometemos "segurança absoluta" — nenhum serviço honesto faz isso
            — mas tomamos as medidas razoáveis e esperadas para um SaaS responsável.
          </P>
          <div
            className="seg-infra-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
              marginBottom: "20px",
            }}
          >
            <InfraCard
              icon={<Lock size={18} />}
              titulo="Autenticação segura"
              descricao="Supabase Auth com sessão por token JWT. Senhas nunca armazenadas em texto simples — hashing robusto gerenciado pela Supabase."
            />
            <InfraCard
              icon={<Globe size={18} />}
              titulo="Criptografia em trânsito"
              descricao="HTTPS/TLS obrigatório em todas as requisições. Tráfego não criptografado é rejeitado."
            />
            <InfraCard
              icon={<Database size={18} />}
              titulo="Banco de dados"
              descricao="PostgreSQL gerenciado pela Supabase com Row Level Security (RLS) ativo: cada conta acessa somente seus próprios dados."
            />
            <InfraCard
              icon={<ShieldCheck size={18} />}
              titulo="Edge e CDN"
              descricao="Workers e Pages na Cloudflare: rede global com proteção contra DDoS e isolamento de runtime por requisição."
            />
            <InfraCard
              icon={<CreditCard size={18} />}
              titulo="Pagamentos via Stripe"
              descricao="Não armazenamos dados de cartão. Todo o processamento financeiro é feito pela Stripe, certificada PCI DSS Nível 1."
            />
            <InfraCard
              icon={<Lock size={18} />}
              titulo="Acesso isolado"
              descricao="Dados de uma conta nunca são acessíveis por outra. Políticas RLS no banco e validação de sessão em cada requisição."
            />
          </div>
        </section>

        {/* LGPD */}
        <section aria-labelledby="lgpd-heading" style={{ marginBottom: "56px" }}>
          <SectionTitle id="lgpd-heading">Conformidade LGPD — Lei 13.709/2018</SectionTitle>
          <P>
            A Olli Inteligência Digital Sistemas LTDA atua como{" "}
            <strong style={{ color: "var(--t-hi)" }}>Controladora</strong> dos dados pessoais
            dos usuários da plataforma (nome, e-mail, dados de navegação estritamente necessários)
            e como referência aos dados públicos dos leilões, que têm natureza pública por força
            da Lei de Acesso à Informação (12.527/2011).
          </P>

          <div style={{ marginBottom: "24px" }}>
            <LgpdItem label="Dados coletados">
              Nome, e-mail, dados de sessão e histórico de uso da plataforma. Não coletamos dados
              de categorias sensíveis (saúde, biometria, opinião política etc.).
            </LgpdItem>
            <LgpdItem label="Base legal">
              Execução de contrato (art. 7º, V) para a prestação do serviço; legítimo interesse
              para melhorias da plataforma; consentimento para comunicações opcionais.
            </LgpdItem>
            <LgpdItem label="Pagamentos">
              Processados pela Stripe. Não armazenamos número de cartão, CVV ou dados bancários.
              A Stripe é responsável pelo tratamento desses dados conforme seus próprios termos.
            </LgpdItem>
            <LgpdItem label="Direitos do titular">
              Acesso, retificação, portabilidade e exclusão dos seus dados pessoais. Envie solicitação
              para{" "}
              <a href="mailto:contato@fontebrasil.online" className="link">
                contato@fontebrasil.online
              </a>{" "}
              — respondemos em até 15 dias úteis.
            </LgpdItem>
            <LgpdItem label="Encarregado (DPO)">
              Equipe Fonte.ia · contato@fontebrasil.online
            </LgpdItem>
            <LgpdItem label="Política completa">
              <a href="/privacidade" className="link">
                Ver Política de Privacidade completa →
              </a>
            </LgpdItem>
          </div>
        </section>

        {/* Rastreabilidade dos dados públicos */}
        <section aria-labelledby="rastro-heading" style={{ marginBottom: "56px" }}>
          <SectionTitle id="rastro-heading">
            Rastreabilidade dos dados dos leilões
          </SectionTitle>
          <P>
            Os dados dos leilões exibidos na Fonte.ia são públicos — coletados do Sistema de
            Leilão Eletrônico (SLE) da Receita Federal e de outros portais oficiais, nos termos
            da Lei de Acesso à Informação. Esta seção explica como garantimos que os dados
            permanecem íntegros e verificáveis.
          </P>

          <div
            className="seg-fluxo"
            style={{
              display: "flex",
              gap: "8px",
              alignItems: "flex-start",
              marginBottom: "28px",
              padding: "24px",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "12px",
            }}
          >
            <FluxoStep
              num={1}
              label="Fonte Oficial"
              sublabel="SLE · Receita Federal"
            />
            <FluxoStep
              num={2}
              label="Coleta Registrada"
              sublabel="URL + data/hora gravadas"
            />
            <FluxoStep
              num={3}
              label="Score por Regra"
              sublabel="Regras fixas, sem estimativa"
            />
            <FluxoStep
              num={4}
              label="Você"
              sublabel="Com link para a origem"
              last
            />
          </div>

          <P>
            Todo dado exibido na plataforma tem origem documentada: a URL da fonte oficial e o
            timestamp da coleta ficam registrados. A IA não inventa — se a informação não constar
            na fonte, o sistema indica "evidência insuficiente". O link para o edital original
            da Receita Federal está disponível em cada lote para verificação direta.
          </P>
        </section>

        {/* Contato de segurança */}
        <section aria-labelledby="contato-seg-heading" style={{ marginBottom: "40px" }}>
          <SectionTitle id="contato-seg-heading">Contato para questões de privacidade</SectionTitle>
          <P>
            Para dúvidas sobre privacidade, exercício de direitos do titular ou relato de
            vulnerabilidades, entre em contato:
          </P>
          <div
            className="card card--pad"
            style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "8px" }}
          >
            <p style={{ margin: 0, fontSize: "14.5px", color: "var(--t-mid)" }}>
              <strong style={{ color: "var(--t-hi)" }}>E-mail: </strong>
              <a href="mailto:contato@fontebrasil.online" className="link">
                contato@fontebrasil.online
              </a>
            </p>
            <p style={{ margin: 0, fontSize: "14.5px", color: "var(--t-mid)" }}>
              <strong style={{ color: "var(--t-hi)" }}>Prazo de resposta: </strong>
              até 72 horas úteis para questões de segurança; até 15 dias úteis para exercício
              de direitos conforme LGPD.
            </p>
            <p style={{ margin: 0, fontSize: "14.5px", color: "var(--t-mid)" }}>
              <strong style={{ color: "var(--t-hi)" }}>Empresa: </strong>
              Olli Inteligência Digital Sistemas LTDA · CNPJ 65.361.266/0001-05
            </p>
          </div>
        </section>
      </main>

      {/* ── Rodapé institucional ─────────────────────────────────────────── */}
      <footer
        className="seg-footer"
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
