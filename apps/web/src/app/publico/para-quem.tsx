import { LogoMark } from "../../components/ui/logo-mark";
import { ThemeToggle } from "../../components/ui/ThemeToggle";
import { navigateSpa } from "../_nav";
import {
  useSeo,
  articleJsonLd,
  breadcrumbJsonLd,
  SITE_URL,
} from "../../lib/seo";
import {
  Scale,
  Briefcase,
  Search,
  FileText,
  Newspaper,
  Truck,
  Heart,
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

/* ── Card de segmento ────────────────────────────────────────────────────── */
interface SegmentoCardProps {
  icon: React.ReactNode;
  perfil: string;
  dor: string;
  beneficios: string[];
}

function SegmentoCard({ icon, perfil, dor, beneficios }: SegmentoCardProps) {
  return (
    <div
      className="card card--pad"
      style={{
        padding: "26px 28px",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}
    >
      {/* Cabeçalho do card */}
      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
        <div
          style={{
            width: "44px",
            height: "44px",
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
        <h2
          style={{
            fontSize: "17px",
            fontWeight: 800,
            color: "var(--t-hi)",
            margin: 0,
            letterSpacing: "-0.01em",
          }}
        >
          {perfil}
        </h2>
      </div>

      {/* Dor */}
      <div>
        <p
          style={{
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            color: "var(--t-low)",
            margin: "0 0 6px",
          }}
        >
          O problema
        </p>
        <p
          style={{
            fontSize: "14.5px",
            lineHeight: 1.65,
            color: "var(--t-mid)",
            margin: 0,
            fontStyle: "italic",
          }}
        >
          "{dor}"
        </p>
      </div>

      {/* Benefícios */}
      <div>
        <p
          style={{
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            color: "var(--t-low)",
            margin: "0 0 10px",
          }}
        >
          Como a Fonte.ia ajuda
        </p>
        <ul style={{ paddingLeft: "18px", margin: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
          {beneficios.map((b) => (
            <li key={b} style={{ fontSize: "14px", lineHeight: 1.65, color: "var(--t-mid)" }}>
              {b}
            </li>
          ))}
        </ul>
      </div>

      {/* CTA */}
      <button
        type="button"
        onClick={() => navigateSpa("/entrar")}
        className="btn btn--ghost btn--sm"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          alignSelf: "flex-start",
          marginTop: "4px",
        }}
      >
        Experimentar grátis
        <ArrowRight size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

/* ── Página principal ─────────────────────────────────────────────────────── */
export function ParaQuemPage() {
  const TITLE =
    "Para quem é a Fonte.ia — Advogados, compliance, jornalistas, revendedores e pesquisadores de dados públicos | Fonte.ia";
  const DESCRIPTION =
    "A Fonte.ia transforma dados públicos brasileiros em decisões rastreáveis. Serve advogados, consultores, jornalistas, gestores públicos e compradores de leilões que precisam de informação oficial consolidada — de licitações e CNJ a IBAMA e Câmara Federal.";

  useSeo({
    title: TITLE,
    description: DESCRIPTION,
    canonicalPath: "/para-quem",
    jsonLd: [
      articleJsonLd({
        title: TITLE,
        description: DESCRIPTION,
        url: SITE_URL + "/para-quem",
        datePublished: "2026-06-13",
      }),
      breadcrumbJsonLd([
        { name: "Início", url: SITE_URL + "/" },
        { name: "Para quem", url: SITE_URL + "/para-quem" },
      ]),
    ],
  });

  const segmentos: SegmentoCardProps[] = [
    {
      icon: <Scale size={22} />,
      perfil: "Advogados e escritórios jurídicos",
      dor: "Preciso acompanhar licitações, processos CNJ e sanções de fornecedores, tudo rastreável para documentar pareceres. Não posso orientar com base em dados que não consigo provar.",
      beneficios: [
        "Módulo Licitações: 153.945 contratos e 1.051 editais do PNCP em painel único, filtráveis por órgão, valor e prazo.",
        "Módulo Jurídico: 280 processos indexados do CNJ com link direto para a movimentação oficial.",
        "Cada dado tem URL de origem e timestamp de coleta — rastreabilidade auditável para documentar pareceres e contestações.",
      ],
    },
    {
      icon: <Search size={22} />,
      perfil: "Revendedores e compradores de leilões",
      dor: "Quero monitorar lotes da Receita Federal, mas perco horas abrindo editais de dezenas de páginas sem saber se o lote vale a pena.",
      beneficios: [
        "1.065 lotes ativos do SLE/Receita Federal com resumo de pontos críticos — elegibilidade, prazo, custo total estimado.",
        "Alertas configuráveis por categoria e faixa de lance — você vê só o que interessa.",
        "Score de oportunidade por regra fixa, baseado nos dados publicados — sem invenção de valor de mercado.",
      ],
    },
    {
      icon: <Briefcase size={22} />,
      perfil: "Consultores e analistas de fornecedores",
      dor: "Preciso verificar rapidamente se uma empresa tem sanções, quais contratos já ganhou e se está regular — sem gastar horas em vários portais.",
      beneficios: [
        "Módulo Empresas: 461 empresas indexadas (CNPJ.ws) com histórico de contratos e sanções cruzadas.",
        "Módulo Sanções: 1.592 registros do Portal Transparência — CEIS, CNEP e CEPIM em um lugar.",
        "Exportação rastreável para relatórios de due diligence, com link à fonte oficial em cada campo.",
      ],
    },
    {
      icon: <FileText size={22} />,
      perfil: "Profissionais de compliance e gestores públicos",
      dor: "Preciso auditar contratações, identificar padrões suspeitos e comprovar que a análise veio de dados oficiais — não de achismos.",
      beneficios: [
        "Cruzamento de contratos (PNCP) com sanções (Portal Transparência) e processos (CNJ) em um único ambiente.",
        "Dados de 5.571 municípios brasileiros (IBGE) para análises de cobertura e comparação regional.",
        "Toda evidência linkada à fonte original — auditável por terceiros sem depender da plataforma.",
      ],
    },
    {
      icon: <Newspaper size={22} />,
      perfil: "Jornalistas e pesquisadores de dados",
      dor: "Monto pautas com dados públicos, mas gastar semanas consolidando portais diferentes me impede de cobrir mais histórias.",
      beneficios: [
        "~170 mil registros de fontes diversas (Receita, PNCP, CNJ, IBAMA, Câmara, Portal Transparência) prontos para cruzamento.",
        "Módulo Política: 4.000 proposições e 594 parlamentares (Câmara/Senado) com votações rastreáveis.",
        "Módulo Ambiental: 1.500 autos do IBAMA indexados — base para pautas de fiscalização e meio ambiente.",
      ],
    },
    {
      icon: <Truck size={22} />,
      perfil: "Despachantes aduaneiros e importadores",
      dor: "Perco tempo acompanhando lotes retidos na alfândega espalhados por editais e sistemas diferentes.",
      beneficios: [
        "Painel unificado do SLE/Receita com filtros por categoria de bem, UF e prazo — sem abrir edital por edital.",
        "Informação de elegibilidade PF/PJ e prazo de habilitação consolidada antes de qualquer clique.",
        "Calculadora de custo total: lance + comissão + frete estimado, tudo em um lugar.",
      ],
    },
    {
      icon: <Heart size={22} />,
      perfil: "Entidades sem fins lucrativos",
      dor: "Existem lotes destinados a ONGs e entidades filantrópicas, mas é difícil localizá-los entre dezenas de editais.",
      beneficios: [
        "Filtro por tipo de participante elegível — identifique lotes acessíveis a entidades nos 1.065 lotes ativos.",
        "Rastreabilidade da origem do dado para comprovar elegibilidade junto a financiadores e parceiros.",
        "Alertas por categoria de bem de uso social — sem precisar monitorar o SLE manualmente.",
      ],
    },
  ];

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
          .pq-header { padding-left: 20px !important; padding-right: 20px !important; }
          .pq-main   { padding-left: 20px !important; padding-right: 20px !important; }
          .pq-footer { padding-left: 20px !important; padding-right: 20px !important; }
        }
      `}</style>

      {/* ── Cabeçalho ───────────────────────────────────────────────────── */}
      <header
        className="pq-header"
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
          <a href="/sobre" className="btn btn--ghost btn--sm">
            Sobre
          </a>
          <a href="/seguranca" className="btn btn--ghost btn--sm">
            Segurança
          </a>
          <button
            type="button"
            onClick={() => navigateSpa("/entrar")}
            className="btn btn--accent btn--sm"
          >
            Começar grátis
          </button>
        </nav>
      </header>

      {/* ── Conteúdo principal ──────────────────────────────────────────── */}
      <main
        className="pq-main"
        style={{
          flex: 1,
          maxWidth: "820px",
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
          <span style={{ color: "var(--t-low)", fontSize: "13px" }}>Para quem</span>
        </div>

        {/* Herói */}
        <header style={{ marginBottom: "56px" }}>
          <span className="eyebrow" style={{ display: "block", marginBottom: "14px" }}>
            Casos de uso
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
            Quem usa a Fonte.ia — e para quê
          </h1>
          <P>
            A Fonte.ia é uma plataforma de inteligência de dados públicos brasileiros. Ela agrega
            fontes oficiais — Receita Federal, PNCP, CNJ, IBAMA, Câmara, Senado, Portal da
            Transparência e IBGE — e entrega informação consolidada, rastreável e pesquisável em um
            único lugar. O módulo de leilões judiciais da Receita Federal é o mais maduro; os
            demais estão em expansão contínua.
          </P>
          <P>
            Os perfis abaixo representam os casos de uso reais que moldaram o produto desde o
            início. Se você toma decisões com base em dados públicos, a Fonte.ia foi construída para
            reduzir o tempo que você gasta coletando e verificando essas informações.
          </P>
        </header>

        {/* Cards de segmento */}
        <section aria-label="Perfis de usuário" style={{ marginBottom: "64px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {segmentos.map((s) => (
              <SegmentoCard key={s.perfil} {...s} />
            ))}
          </div>
        </section>

        {/* Quem não é o público */}
        <section
          aria-labelledby="nao-publico-heading"
          style={{ marginBottom: "56px" }}
        >
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              padding: "26px 28px",
            }}
          >
            <h2
              id="nao-publico-heading"
              style={{
                fontSize: "16px",
                fontWeight: 700,
                color: "var(--t-hi)",
                marginBottom: "12px",
                letterSpacing: "-0.01em",
              }}
            >
              Quem ainda não é o público da Fonte.ia
            </h2>
            <p
              style={{
                fontSize: "14.5px",
                lineHeight: 1.7,
                color: "var(--t-mid)",
                margin: "0 0 12px",
              }}
            >
              Honestidade desarma objeções. Por isso, listamos o que a plataforma ainda{" "}
              <em>não</em> faz:
            </p>
            <ul
              style={{
                paddingLeft: "20px",
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              <li style={{ fontSize: "14px", lineHeight: 1.65, color: "var(--t-mid)" }}>
                <strong style={{ color: "var(--t-hi)" }}>Leilões judiciais de imóveis (TJ/TRF)</strong>{" "}
                — em desenvolvimento no roteiro; ainda não cobrimos leilões de vara cível e execução fiscal de bens imóveis.
              </li>
              <li style={{ fontSize: "14px", lineHeight: 1.65, color: "var(--t-mid)" }}>
                <strong style={{ color: "var(--t-hi)" }}>Quem quer dar lances por você</strong>{" "}
                — não somos um leiloeiro e não intermediamos arremates.
              </li>
              <li style={{ fontSize: "14px", lineHeight: 1.65, color: "var(--t-mid)" }}>
                <strong style={{ color: "var(--t-hi)" }}>
                  Estimativas de preço de mercado
                </strong>{" "}
                — não estimamos valor de mercado. Mostramos o que a fonte oficial publicou; a decisão é sua.
              </li>
              <li style={{ fontSize: "14px", lineHeight: 1.65, color: "var(--t-mid)" }}>
                <strong style={{ color: "var(--t-hi)" }}>
                  Módulos ainda em fase beta (ambiental, política, INPI)
                </strong>{" "}
                — os dados já estão indexados, mas a análise assistida por IA nesses módulos ainda é limitada e está em evolução.
              </li>
            </ul>
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
            Você se reconheceu em algum perfil?
          </p>
          <p
            style={{
              fontSize: "14.5px",
              color: "var(--t-mid)",
              marginBottom: "22px",
              lineHeight: 1.65,
            }}
          >
            Experimente 7 dias grátis. Sem cartão, sem compromisso.
          </p>
          <button
            type="button"
            onClick={() => navigateSpa("/entrar")}
            className="btn btn--accent btn--lg"
            style={{
              minWidth: "200px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              minHeight: "48px",
            }}
          >
            Começar grátis
            <ArrowRight size={16} aria-hidden="true" />
          </button>
          <p className="muted" style={{ fontSize: "12px", marginTop: "12px" }}>
            7 dias grátis · sem contrato · dados rastreáveis à fonte oficial
          </p>
        </div>
      </main>

      {/* ── Rodapé institucional ─────────────────────────────────────────── */}
      <footer
        className="pq-footer"
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
