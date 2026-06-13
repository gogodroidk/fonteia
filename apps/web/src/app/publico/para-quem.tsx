import { LogoMark } from "../../components/ui/logo-mark";
import {
  useSeo,
  articleJsonLd,
  breadcrumbJsonLd,
  SITE_URL,
} from "../../lib/seo";
import {
  Scale,
  Truck,
  ShoppingCart,
  TrendingUp,
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
      <a
        href="/entrar"
        className="btn btn--ghost btn--sm"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          textDecoration: "none",
          alignSelf: "flex-start",
          marginTop: "4px",
        }}
      >
        Experimentar grátis
        <ArrowRight size={14} aria-hidden="true" />
      </a>
    </div>
  );
}

/* ── Página principal ─────────────────────────────────────────────────────── */
export function ParaQuemPage() {
  const TITLE =
    "Para quem é a Fonte.ia — Advogados, despachantes, revendedores e investidores | Fonte.ia";
  const DESCRIPTION =
    "A Fonte.ia serve advogados, despachantes aduaneiros, revendedores e compradores individuais que participam de leilões da Receita Federal. Entenda como cada perfil se beneficia da plataforma.";

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
      perfil: "Advogado e despachante aduaneiro",
      dor: "Preciso documentar cada decisão que tomo para o cliente. Não posso orientar com base em dados que não consigo rastrear.",
      beneficios: [
        "Cada dado tem URL de origem e data de coleta — rastreabilidade auditável para documentar pareceres.",
        "Resumo do edital em linguagem simples, com os pontos críticos destacados, sem precisar ler 40 páginas de PDF.",
        "Link direto para o documento oficial da Receita Federal em cada lote, para citação precisa.",
      ],
    },
    {
      icon: <Truck size={22} />,
      perfil: "Despachante e importador",
      dor: "Perco horas acompanhando lotes retidos na alfândega espalhados por diferentes editais e sistemas.",
      beneficios: [
        "Painel unificado com todos os lotes ativos do SLE, filtráveis por categoria e localização.",
        "Alertas automáticos quando novos lotes de categorias de interesse aparecem.",
        "Informação de elegibilidade (PF/PJ) e prazo de habilitação consolidada antes de abrir o edital.",
      ],
    },
    {
      icon: <ShoppingCart size={22} />,
      perfil: "Revendedor (veículos, eletrônicos, mercadorias)",
      dor: "Quero comprar lotes em série, mas não tenho tempo de monitorar o SLE toda semana e calcular margem de cada lote manualmente.",
      beneficios: [
        "Alertas configuráveis por categoria de bem, faixa de lance e prazo — você só vê o que interessa.",
        "Calculadora de custo total: lance + comissão do leiloeiro + frete estimado, tudo em um lugar.",
        "Score de oportunidade por regra fixa, baseado nos dados publicados — sem invenção de valor de mercado.",
      ],
    },
    {
      icon: <TrendingUp size={22} />,
      perfil: "Comprador individual curioso",
      dor: "Já ouvi falar em leilão da Receita Federal, mas parece complicado. Tenho medo de entrar sem entender as regras.",
      beneficios: [
        "Resumo do edital em linguagem de leigo — sem jargão jurídico, sem leitura de PDF de 50 páginas.",
        "Calculadora de lance: descubra o custo real (lance + comissão + retirada) antes de propor qualquer valor.",
        "Guia completo sobre como funciona o processo, desde a habilitação no gov.br até a retirada do bem.",
      ],
    },
    {
      icon: <Heart size={22} />,
      perfil: "Entidade sem fins lucrativos",
      dor: "Existem lotes destinados a ONGs e entidades filantrópicas nos editais da Receita Federal, mas é difícil localizá-los.",
      beneficios: [
        "Filtro por tipo de participante elegível — identifique lotes reservados ou acessíveis a entidades.",
        "Alertas específicos para categorias relevantes, como bens de uso social.",
        "Rastreabilidade da origem do dado para comprovar a elegibilidade junto a financiadores ou parceiros.",
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
          <a href="/sobre" className="btn btn--ghost btn--sm">
            Sobre
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
            Quem usa a Fonte.ia
          </h1>
          <P>
            A Fonte.ia foi construída para quem toma decisões em leilões públicos com base em
            dados — não em intuição. Os perfis abaixo representam os casos de uso reais que
            moldaram o produto desde o início.
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
                <strong style={{ color: "var(--t-hi)" }}>Leilões judiciais de imóveis</strong>{" "}
                — ainda não estamos lá, mas está no roteiro do produto.
              </li>
              <li style={{ fontSize: "14px", lineHeight: 1.65, color: "var(--t-mid)" }}>
                <strong style={{ color: "var(--t-hi)" }}>Quem quer dar lances por você</strong>{" "}
                — não somos um leiloeiro e não intermediamos arremates.
              </li>
              <li style={{ fontSize: "14px", lineHeight: 1.65, color: "var(--t-mid)" }}>
                <strong style={{ color: "var(--t-hi)" }}>
                  Quem quer previsão de preço de mercado
                </strong>{" "}
                — não estimamos valor de mercado. Mostramos o que o edital diz; a decisão é sua.
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
          <a
            href="/entrar"
            className="btn btn--accent btn--lg"
            style={{
              minWidth: "200px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              textDecoration: "none",
              minHeight: "48px",
            }}
          >
            Começar grátis
            <ArrowRight size={16} aria-hidden="true" />
          </a>
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
