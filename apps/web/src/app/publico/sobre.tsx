import { LogoMark } from "../../components/ui/logo-mark";
import {
  useSeo,
  articleJsonLd,
  breadcrumbJsonLd,
  SITE_URL,
} from "../../lib/seo";
import { Database, Search, Sparkles, ShieldCheck } from "lucide-react";

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

/* ── Box de dados da empresa ─────────────────────────────────────────────── */
function EmpresaBox() {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "12px",
        padding: "24px 28px",
        marginBottom: "40px",
      }}
    >
      <p
        style={{
          fontSize: "11px",
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--t-low)",
          marginBottom: "16px",
        }}
      >
        Dados da Empresa
      </p>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: "13.5px",
        }}
      >
        <tbody>
          {[
            ["Razão Social", "Olli Inteligência Digital Sistemas LTDA"],
            ["CNPJ", "65.361.266/0001-05"],
            ["Natureza Jurídica", "Sociedade Limitada"],
            ["Produto", "Fonte.ia"],
            ["E-mail", "contato@olli.com.br"],
            ["Fundação", "2024"],
          ].map(([label, value]) => (
            <tr key={label}>
              <td
                style={{
                  padding: "7px 16px 7px 0",
                  color: "var(--t-low)",
                  whiteSpace: "nowrap",
                  verticalAlign: "top",
                  minWidth: "140px",
                }}
              >
                {label}
              </td>
              <td
                style={{
                  padding: "7px 0",
                  color: "var(--t-hi)",
                  fontWeight: 600,
                }}
              >
                {value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Card "O que fazemos" ────────────────────────────────────────────────── */
function FazCard({
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
      style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "22px 24px" }}
    >
      <div
        style={{
          width: "40px",
          height: "40px",
          borderRadius: "12px",
          background: "color-mix(in srgb, var(--accent) 10%, var(--surface))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--accent-ink)",
          flexShrink: 0,
        }}
        aria-hidden="true"
      >
        {icon}
      </div>
      <p style={{ fontWeight: 700, fontSize: "15.5px", color: "var(--t-hi)", margin: 0 }}>
        {titulo}
      </p>
      <p style={{ fontSize: "14px", lineHeight: 1.65, color: "var(--t-mid)", margin: 0 }}>
        {descricao}
      </p>
    </div>
  );
}

/* ── Selo de legitimidade ────────────────────────────────────────────────── */
function Selo({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "12px 16px",
        background: "color-mix(in srgb, var(--accent) 6%, var(--surface))",
        border: "1px solid color-mix(in srgb, var(--accent) 20%, var(--border))",
        borderRadius: "10px",
        fontSize: "13.5px",
        color: "var(--t-mid)",
        lineHeight: 1.5,
      }}
    >
      <ShieldCheck
        size={16}
        aria-hidden="true"
        style={{ color: "var(--accent-ink)", flexShrink: 0 }}
      />
      <span>{children}</span>
    </div>
  );
}

/* ── Página principal ─────────────────────────────────────────────────────── */
export function SobrePage() {
  const TITLE = "Sobre a Fonte.ia — Olli Inteligência Digital Sistemas LTDA | Fonte.ia";
  const DESCRIPTION =
    "Conheça a empresa por trás da Fonte.ia: Olli Inteligência Digital Sistemas LTDA, CNPJ 65.361.266/0001-05. Missão, princípios e como transformamos dados públicos em decisões rastreáveis.";

  useSeo({
    title: TITLE,
    description: DESCRIPTION,
    canonicalPath: "/sobre",
    jsonLd: [
      articleJsonLd({
        title: TITLE,
        description: DESCRIPTION,
        url: SITE_URL + "/sobre",
        datePublished: "2026-06-13",
      }),
      breadcrumbJsonLd([
        { name: "Início", url: SITE_URL + "/" },
        { name: "Sobre", url: SITE_URL + "/sobre" },
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
          .sobre-header { padding-left: 20px !important; padding-right: 20px !important; }
          .sobre-main   { padding-left: 20px !important; padding-right: 20px !important; }
          .sobre-footer { padding-left: 20px !important; padding-right: 20px !important; }
          .sobre-faz-grid { grid-template-columns: 1fr !important; }
          .sobre-selos-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 460px) {
          .sobre-faz-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ── Cabeçalho ───────────────────────────────────────────────────── */}
      <header
        className="sobre-header"
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
          <a href="/para-quem" className="btn btn--ghost btn--sm">
            Para quem
          </a>
          <a href="/seguranca" className="btn btn--ghost btn--sm">
            Segurança
          </a>
          <a href="/entrar" className="btn btn--accent btn--sm">
            Começar grátis
          </a>
        </nav>
      </header>

      {/* ── Conteúdo principal ──────────────────────────────────────────── */}
      <main
        className="sobre-main"
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
          <span style={{ color: "var(--t-low)", fontSize: "13px" }}>Sobre</span>
        </div>

        {/* Herói */}
        <header style={{ marginBottom: "48px" }}>
          <span className="eyebrow" style={{ display: "block", marginBottom: "14px" }}>
            Institucional
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
            Quem está por trás da Fonte.ia
          </h1>
          <P>
            A Fonte.ia é desenvolvida e operada pela{" "}
            <strong style={{ color: "var(--t-hi)" }}>
              Olli Inteligência Digital Sistemas LTDA
            </strong>
            , empresa brasileira dedicada a transformar dados públicos em decisões rastreáveis.
            Não somos um leiloeiro e não compramos nem vendemos bens — somos uma plataforma de
            inteligência que lê fontes oficiais do governo e as entrega organizadas, com análise
            de IA, para quem precisa tomar decisões melhores e mais rápidas.
          </P>
        </header>

        {/* Box de dados da empresa */}
        <section aria-labelledby="empresa-heading" style={{ marginBottom: "56px" }}>
          <SectionTitle id="empresa-heading">Dados da empresa</SectionTitle>
          <EmpresaBox />
        </section>

        {/* Missão */}
        <section aria-labelledby="missao-heading" style={{ marginBottom: "56px" }}>
          <SectionTitle id="missao-heading">Missão</SectionTitle>
          <p
            style={{
              fontSize: "clamp(17px, 3vw, 20px)",
              fontWeight: 600,
              color: "var(--t-hi)",
              lineHeight: 1.5,
              marginBottom: "20px",
              maxWidth: "60ch",
            }}
          >
            Tornar os leilões públicos brasileiros acessíveis a quem pesquisa com método, não
            com sorte.
          </p>
          <P>
            Os dados dos leilões da Receita Federal existem — estão publicados no Sistema de
            Leilão Eletrônico (SLE), em editais PDF de dezenas de páginas, espalhados por órgão
            e por data. Quem não tem tempo ou ferramentas para consolidar essas informações fica
            em desvantagem. A Fonte.ia resolve esse problema: coleta as fontes, organiza os
            dados e entrega análise em linguagem de leigo, com rastreabilidade total à origem.
          </P>
          <P>
            A empresa nasceu da constatação de que os dados já são públicos — o que falta é
            organização, contexto e acesso. A IA não inventa informação; ela lê o que o governo
            publicou e ajuda você a entender mais rápido.
          </P>
        </section>

        {/* O que fazemos */}
        <section aria-labelledby="o-que-fazemos-heading" style={{ marginBottom: "56px" }}>
          <SectionTitle id="o-que-fazemos-heading">O que fazemos</SectionTitle>
          <P>
            A plataforma opera em três camadas complementares. Cada dado exibido percorre esse
            fluxo antes de chegar até você.
          </P>
          <div
            className="sobre-faz-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: "14px",
              marginBottom: "24px",
            }}
          >
            <FazCard
              icon={<Database size={20} />}
              titulo="Agregamos"
              descricao="Coletamos dados de fontes oficiais — Receita Federal (SLE) e, em breve, PGFN, SPU, DETRAN e Compras.gov.br — e os reunimos em um único painel."
            />
            <FazCard
              icon={<Search size={20} />}
              titulo="Rastreamos"
              descricao="Cada dado exibido tem URL de origem e data/hora de coleta registradas. Você pode verificar na fonte oficial a qualquer momento — o link está sempre disponível."
            />
            <FazCard
              icon={<Sparkles size={20} />}
              titulo="Analisamos"
              descricao="A IA lê o edital e resume os pontos críticos em linguagem de leigo: elegibilidade, prazos, riscos e custo total estimado. Sem invenção, sem estimativas de mercado."
            />
          </div>
        </section>

        {/* Selos de legitimidade */}
        <section aria-labelledby="legitimidade-heading" style={{ marginBottom: "56px" }}>
          <SectionTitle id="legitimidade-heading">Por que confiar</SectionTitle>
          <div
            className="sobre-selos-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
            }}
          >
            <Selo>
              <strong style={{ color: "var(--t-hi)" }}>Dados direto da fonte oficial</strong>
              {" — "}coletados do Sistema de Leilão Eletrônico da Receita Federal e de portais
              do governo.
            </Selo>
            <Selo>
              <strong style={{ color: "var(--t-hi)" }}>
                Lei de Acesso à Informação (12.527/2011)
              </strong>
              {" — "}os dados dos leilões são públicos por lei. Não acessamos informações
              restritas.
            </Selo>
            <Selo>
              <strong style={{ color: "var(--t-hi)" }}>LGPD — Lei 13.709/2018</strong>
              {" — "}tratamos apenas os dados estritamente necessários para a prestação do
              serviço, com base legal adequada.
            </Selo>
            <Selo>
              <strong style={{ color: "var(--t-hi)" }}>Empresa registrada</strong>
              {" — "}CNPJ 65.361.266/0001-05 · Olli Inteligência Digital Sistemas LTDA · ativa
              na Receita Federal.
            </Selo>
          </div>
        </section>

        {/* CTA */}
        <div
          className="panel"
          style={{
            padding: "32px",
            textAlign: "center",
            background: "color-mix(in srgb, var(--accent) 6%, var(--surface))",
            borderColor: "color-mix(in srgb, var(--accent) 22%, var(--border))",
          }}
        >
          <p
            style={{
              fontSize: "17px",
              fontWeight: 600,
              color: "var(--t-hi)",
              marginBottom: "8px",
            }}
          >
            Pronto para pesquisar com método?
          </p>
          <p
            style={{
              fontSize: "14.5px",
              color: "var(--t-mid)",
              marginBottom: "22px",
              lineHeight: 1.65,
            }}
          >
            Experimente a plataforma gratuitamente. Sem cartão, sem compromisso.
          </p>
          <a
            href="/entrar"
            className="btn btn--accent btn--lg"
            style={{
              minWidth: "200px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              textDecoration: "none",
              minHeight: "48px",
            }}
          >
            Começar 7 dias grátis
          </a>
        </div>
      </main>

      {/* ── Rodapé institucional ─────────────────────────────────────────── */}
      <footer
        className="sobre-footer"
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
