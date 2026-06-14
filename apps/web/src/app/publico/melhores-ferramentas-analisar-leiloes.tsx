import { useState } from "react";
import { LogoMark } from "../../components/ui/logo-mark";
import {
  ChevronDown,
  ShieldCheck,
  AlertTriangle,
  BookOpen,
  Bell,
  ArrowRight,
  Search,
  Calculator,
  FileText,
  BarChart2,
  Check,
  X,
  Minus,
} from "lucide-react";
import {
  useSeo,
  faqJsonLd,
  articleJsonLd,
  breadcrumbJsonLd,
  SITE_URL,
} from "../../lib/seo";
/* ── Primitivos ───────────────────────────────────────────────────────────── */
function P({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: "clamp(15px, 2vw, 17px)",
        lineHeight: 1.75,
        color: "var(--t-mid)",
        marginBottom: "16px",
      }}
    >
      {children}
    </p>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="note"
      style={{
        background: "color-mix(in srgb, var(--warn) 7%, var(--surface-2))",
        border: "1px solid color-mix(in srgb, var(--warn) 22%, transparent)",
        borderRadius: "12px",
        padding: "16px 20px",
        marginBottom: "20px",
        display: "flex",
        gap: "12px",
        alignItems: "flex-start",
      }}
    >
      <AlertTriangle
        size={17}
        aria-hidden="true"
        style={{ color: "var(--warn)", flexShrink: 0, marginTop: "2px" }}
      />
      <div style={{ fontSize: "14.5px", lineHeight: 1.65, color: "var(--t-mid)" }}>
        {children}
      </div>
    </div>
  );
}

function Info({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="note"
      style={{
        background: "color-mix(in srgb, var(--accent) 6%, transparent)",
        border: "1px solid color-mix(in srgb, var(--accent) 20%, transparent)",
        borderRadius: "12px",
        padding: "16px 20px",
        marginBottom: "20px",
        display: "flex",
        gap: "12px",
        alignItems: "flex-start",
      }}
    >
      <ShieldCheck
        size={17}
        aria-hidden="true"
        style={{ color: "var(--accent-ink)", flexShrink: 0, marginTop: "2px" }}
      />
      <div style={{ fontSize: "14.5px", lineHeight: 1.65, color: "var(--t-mid)" }}>
        {children}
      </div>
    </div>
  );
}

/* ── Critério card ────────────────────────────────────────────────────────── */
function CriterioCard({
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
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        padding: "18px 20px",
      }}
    >
      <div
        style={{
          width: "36px",
          height: "36px",
          borderRadius: "10px",
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
      <p style={{ fontWeight: 700, fontSize: "14.5px", color: "var(--t-hi)", margin: 0 }}>
        {titulo}
      </p>
      <p style={{ fontSize: "13px", lineHeight: 1.6, color: "var(--t-low)", margin: 0 }}>
        {descricao}
      </p>
    </div>
  );
}

/* ── FAQ accordion ────────────────────────────────────────────────────────── */
interface FaqItemProps {
  pergunta: string;
  resposta: React.ReactNode;
}

function FaqItem({ pergunta, resposta }: FaqItemProps) {
  const [aberto, setAberto] = useState(false);
  const id = pergunta.slice(0, 30).replace(/\s+/g, "-").toLowerCase();

  return (
    <div
      className="card"
      style={{ overflow: "hidden" }}
      itemScope
      itemType="https://schema.org/Question"
    >
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls={`faq-resp-${id}`}
        onClick={() => setAberto((v) => !v)}
        style={{
          width: "100%",
          background: "none",
          border: "none",
          padding: "18px 22px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
          cursor: "pointer",
          textAlign: "left",
          color: "var(--t-hi)",
          fontFamily: "var(--font)",
          fontWeight: 600,
          fontSize: "15px",
          lineHeight: 1.4,
          minHeight: "44px",
        }}
      >
        <span itemProp="name">{pergunta}</span>
        <ChevronDown
          size={18}
          aria-hidden="true"
          style={{
            flexShrink: 0,
            color: "var(--t-low)",
            transform: aberto ? "rotate(180deg)" : "none",
            transition: "transform .22s",
          }}
        />
      </button>

      {aberto && (
        <div
          id={`faq-resp-${id}`}
          style={{ padding: "0 22px 18px" }}
          itemScope
          itemType="https://schema.org/Answer"
        >
          <div
            itemProp="text"
            style={{ fontSize: "14.5px", lineHeight: 1.7, color: "var(--t-mid)" }}
          >
            {resposta}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Tabela comparativa ───────────────────────────────────────────────────── */
type NivelSuporte = "sim" | "parcial" | "manual" | "nao";

interface LinhaTabela {
  criterio: string;
  sle: NivelSuporte;
  planilha: NivelSuporte;
  fonteia: NivelSuporte;
}

const TABELA: LinhaTabela[] = [
  { criterio: "Achar lotes ativos",               sle: "sim",     planilha: "manual", fonteia: "sim" },
  { criterio: "Filtrar por categoria / prazo",     sle: "parcial", planilha: "manual", fonteia: "sim" },
  { criterio: "Ler e resumir o edital",            sle: "sim",     planilha: "nao",    fonteia: "sim" },
  { criterio: "Calcular custo total do arremate",  sle: "nao",     planilha: "manual", fonteia: "sim" },
  { criterio: "Alertas de prazo de habilitação",   sle: "nao",     planilha: "manual", fonteia: "sim" },
  { criterio: "Rastreabilidade ao edital oficial", sle: "sim",     planilha: "manual", fonteia: "sim" },
  { criterio: "Histórico de lotes arrematados",    sle: "nao",     planilha: "manual", fonteia: "parcial" },
];

const ROTULOS: Record<NivelSuporte, { texto: string; cor: string; icone: React.ReactNode }> = {
  sim:     { texto: "Sim",     cor: "var(--ok)",     icone: <Check  size={13} aria-hidden="true" style={{ color: "var(--ok)",     flexShrink: 0 }} /> },
  parcial: { texto: "Parcial", cor: "var(--warn)",   icone: <Minus  size={13} aria-hidden="true" style={{ color: "var(--warn)",   flexShrink: 0 }} /> },
  manual:  { texto: "Manual",  cor: "var(--t-mid)",  icone: <Minus  size={13} aria-hidden="true" style={{ color: "var(--t-mid)",  flexShrink: 0 }} /> },
  nao:     { texto: "Não",     cor: "var(--danger)", icone: <X      size={13} aria-hidden="true" style={{ color: "var(--danger)", flexShrink: 0 }} /> },
};

function TabelaComparativa() {
  return (
    <div style={{ marginBottom: "20px" }}>
      <span
        className="mfa-table-hint"
        style={{
          display: "none",
          fontSize: "12px",
          color: "var(--t-low)",
          marginBottom: "6px",
        }}
        aria-hidden="true"
      >
        → deslize para ver
      </span>
      <div className="mfa-table-scroll" style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "14px",
          lineHeight: 1.5,
          minWidth: "560px",
        }}
      >
        <thead>
          <tr>
            {(["Critério", "Site oficial (SLE)", "Planilha própria", "Fonte.ia"] as const).map(
              (col) => (
                <th
                  key={col}
                  style={{
                    textAlign: col === "Critério" ? "left" : "center",
                    padding: "10px 14px",
                    fontWeight: 700,
                    fontSize: "12.5px",
                    color: "var(--t-low)",
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    borderBottom: "2px solid var(--border)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {col}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {TABELA.map((linha, i) => (
            <tr
              key={linha.criterio}
              style={{
                background:
                  i % 2 === 0
                    ? "transparent"
                    : "var(--surface-2)",
              }}
            >
              <td
                style={{
                  padding: "10px 14px",
                  color: "var(--t-mid)",
                  fontWeight: 500,
                }}
              >
                {linha.criterio}
              </td>
              {(["sle", "planilha", "fonteia"] as const).map((col) => {
                const nivel = linha[col];
                const { texto, cor, icone } = ROTULOS[nivel];
                return (
                  <td
                    key={col}
                    style={{
                      padding: "10px 14px",
                      textAlign: "center",
                      fontWeight: 600,
                      color: cor,
                      fontSize: "13px",
                    }}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                      {icone}
                      {texto}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

/* ── Página principal ─────────────────────────────────────────────────────── */
export function MelhoresFerramentasPage() {
  const TITLE =
    "Melhores ferramentas para analisar leilões da Receita Federal (2026) | Fonte.ia";
  const DESCRIPTION =
    "Comparativo honesto entre as formas de analisar lotes de leilões da Receita Federal: site oficial do SLE, planilha própria e plataformas especializadas. Critérios práticos, tabela e FAQ.";

  useSeo({
    title: TITLE,
    description: DESCRIPTION,
    canonicalPath: "/melhores-ferramentas-analisar-leiloes",
    jsonLd: [
      articleJsonLd({
        title: TITLE,
        description: DESCRIPTION,
        url: SITE_URL + "/melhores-ferramentas-analisar-leiloes",
        datePublished: "2026-06-13",
      }),
      faqJsonLd([
        {
          question: "Preciso de alguma ferramenta além do site oficial da Receita?",
          answer:
            "Não necessariamente — o SLE tem todas as informações oficiais. A questão é eficiência: o SLE exige que você acesse cada lote individualmente, leia PDFs longos e monte sozinho a conta de custos. Ferramentas auxiliares existem para organizar esse processo, não para substituir os dados oficiais.",
        },
        {
          question: "Planilha própria serve para analisar leilões da Receita?",
          answer:
            "Serve, especialmente para quem participa com frequência e conhece bem os critérios que quer acompanhar. O limite é que você precisa alimentar os dados manualmente — copiar do SLE, atualizar os editais, calcular custos na mão. Para quem analisa poucos lotes por mês, é viável. Para quem acompanha dezenas de lotes, o esforço cresce rápido.",
        },
        {
          question: "Qual é o critério mais importante para escolher uma ferramenta de análise?",
          answer:
            "Rastreabilidade. Toda informação sobre um lote — lance mínimo, prazo, condições — precisa ter origem rastreável no edital oficial. Ferramenta que apresenta dados sem linkar o edital original cria risco: se a informação estiver errada ou desatualizada, você pode dar o lance com base em dados falhos. Exija sempre o link para o documento oficial.",
        },
        {
          question: "A Fonte.ia substitui a leitura do edital?",
          answer:
            "Não. A Fonte.ia organiza os dados do lote, entrega um resumo dos pontos críticos do edital em linguagem de leigo e calcula o custo total estimado — mas o edital original da Receita Federal fica sempre linkado e é ele que prevalece juridicamente. Use a plataforma para entender o lote mais rápido, não para substituir a leitura do documento oficial.",
        },
        {
          question: "Como saber se uma ferramenta de análise de leilão é confiável?",
          answer:
            "Verifique três coisas: os dados são rastreáveis ao edital oficial (e há um link para ele)? A ferramenta deixa claro quando os dados foram atualizados? A plataforma é honesta sobre o que não faz — não promete lucro, não garante resultado? Desconfie de ferramentas que vendem 'oportunidades' sem mostrar de onde vêm os dados.",
        },
        {
          question: "Existe versão gratuita de ferramentas para analisar leilões da Receita?",
          answer:
            "O próprio SLE é gratuito e oficial — é sempre o ponto de partida. A Fonte.ia oferece um período de teste gratuito de 7 dias com acesso ao painel de lotes e ao Raio-X com IA. A calculadora de lance é gratuita sem cadastro. Para uso contínuo, a plataforma cobra uma assinatura mensal — os planos estão em /entrar.",
        },
      ]),
      breadcrumbJsonLd([
        { name: "Início", url: SITE_URL + "/" },
        { name: "Melhores ferramentas para analisar leilões", url: SITE_URL + "/melhores-ferramentas-analisar-leiloes" },
      ]),
    ],
  });

  const FAQ: FaqItemProps[] = [
    {
      pergunta: "Preciso de alguma ferramenta além do site oficial da Receita?",
      resposta: (
        <>
          Não necessariamente — o SLE tem todas as informações oficiais. A questão é eficiência:
          o SLE exige que você acesse cada lote individualmente, leia PDFs longos e monte sozinho
          a conta de custos. Ferramentas auxiliares existem para organizar esse processo, não para
          substituir os dados oficiais.
        </>
      ),
    },
    {
      pergunta: "Planilha própria serve para analisar leilões da Receita?",
      resposta: (
        <>
          Serve, especialmente para quem participa com frequência e conhece os critérios que quer
          acompanhar. O limite é que você precisa alimentar os dados manualmente — copiar do SLE,
          atualizar os editais, calcular custos na mão. Para quem analisa poucos lotes por mês, é
          viável. Para quem acompanha dezenas de lotes,{" "}
          <strong style={{ color: "var(--t-hi)" }}>o esforço cresce rápido</strong>.
        </>
      ),
    },
    {
      pergunta: "Qual é o critério mais importante para escolher uma ferramenta de análise?",
      resposta: (
        <>
          <strong style={{ color: "var(--t-hi)" }}>Rastreabilidade.</strong> Toda informação sobre
          um lote precisa ter origem rastreável no edital oficial. Ferramenta que apresenta dados
          sem linkar o edital cria risco: se a informação estiver errada ou desatualizada, você
          pode dar o lance com base em dados falhos. Exija sempre o link para o documento oficial.
        </>
      ),
    },
    {
      pergunta: "A Fonte.ia substitui a leitura do edital?",
      resposta: (
        <>
          Não. A Fonte.ia resume os pontos críticos do edital em linguagem de leigo e calcula o
          custo total estimado — mas o edital original da Receita Federal fica sempre linkado e é
          ele que prevalece juridicamente. Use a plataforma para{" "}
          <strong style={{ color: "var(--t-hi)" }}>entender o lote mais rápido</strong>, não para
          substituir a leitura do documento oficial.
        </>
      ),
    },
    {
      pergunta: "Como saber se uma ferramenta de análise de leilão é confiável?",
      resposta: (
        <>
          Verifique três coisas: os dados são rastreáveis ao edital oficial (com link para ele)?
          A ferramenta deixa claro quando os dados foram atualizados? A plataforma é honesta sobre
          o que não faz — não promete lucro, não garante resultado? Desconfie de plataformas que
          vendem “oportunidades” sem mostrar de onde vêm os dados.
        </>
      ),
    },
    {
      pergunta: "Existe versão gratuita de ferramentas para analisar leilões da Receita?",
      resposta: (
        <>
          O próprio SLE é gratuito e oficial — é sempre o ponto de partida. A Fonte.ia oferece{" "}
          <strong style={{ color: "var(--t-hi)" }}>7 dias de teste gratuito</strong> com acesso
          ao painel de lotes e ao Raio-X com IA. A{" "}
          <a href="/ferramentas/calculadora-lance" className="link">
            calculadora de lance
          </a>{" "}
          é gratuita sem cadastro. Para uso contínuo, a plataforma cobra assinatura mensal — os
          planos estão em{" "}
          <a href="/entrar" className="link">
            /entrar
          </a>
          .
        </>
      ),
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
          .mfa-header   { padding-left: 20px !important; padding-right: 20px !important; }
          .mfa-main     { padding-left: 20px !important; padding-right: 20px !important; }
          .mfa-footer   { padding-left: 20px !important; padding-right: 20px !important; }
          .mfa-criterios-grid { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 460px) {
          .mfa-criterios-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 720px) {
          .mfa-table-scroll { overflow-x: auto !important; -webkit-overflow-scrolling: touch !important; }
          .mfa-table-hint   { display: block !important; }
        }
      `}</style>

      {/* ── Cabeçalho ───────────────────────────────────────────────────── */}
      <header
        className="mfa-header"
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
          aria-label="Ações rápidas"
          style={{ display: "flex", gap: "10px", alignItems: "center" }}
        >
          <a href="/guias" className="btn btn--ghost btn--sm">
            Guias
          </a>
          <a href="/entrar" className="btn btn--accent btn--sm">
            Começar grátis
          </a>
        </nav>
      </header>

      {/* ── Conteúdo principal ──────────────────────────────────────────── */}
      <main
        className="mfa-main"
        style={{
          flex: 1,
          maxWidth: "760px",
          width: "100%",
          margin: "0 auto",
          padding: "60px 28px 100px",
        }}
      >
        <article itemScope itemType="https://schema.org/Article">

          {/* Breadcrumb + herói */}
          <header style={{ marginBottom: "48px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "16px",
                flexWrap: "wrap",
              }}
            >
              <a href="/" className="link small" style={{ fontSize: "13px" }}>
                Início
              </a>
              <span style={{ color: "var(--t-low)", fontSize: "13px" }} aria-hidden="true">›</span>
              <a
                href="/leiloes-receita-federal"
                className="link small"
                style={{ fontSize: "13px" }}
              >
                Leilões da Receita Federal
              </a>
              <span style={{ color: "var(--t-low)", fontSize: "13px" }} aria-hidden="true">›</span>
              <span className="small" style={{ color: "var(--t-low)", fontSize: "13px" }}>
                Ferramentas de análise
              </span>
            </div>

            <span className="eyebrow" style={{ display: "block", marginBottom: "14px" }}>
              Comparativo honesto · 2026
            </span>

            <h1
              itemProp="headline"
              style={{
                fontSize: "clamp(26px, 6vw, 38px)",
                fontWeight: 800,
                letterSpacing: "-0.03em",
                lineHeight: 1.1,
                marginBottom: "20px",
              }}
            >
              Melhores ferramentas para analisar leilões da Receita Federal
            </h1>

            <P>
              Participar de um leilão da Receita Federal exige analisar o lote com cuidado antes
              de dar o lance: entender o que está sendo vendido, calcular o custo total do
              arremate, identificar restrições do edital e não perder os prazos de habilitação.
              Esse trabalho pode ser feito de formas diferentes — e cada uma tem vantagens e
              limites reais.
            </P>

            <P>
              Esta página compara as três abordagens principais: o{" "}
              <strong style={{ color: "var(--t-hi)" }}>site oficial da Receita (SLE)</strong>,
              a <strong style={{ color: "var(--t-hi)" }}>planilha própria</strong> e a{" "}
              <strong style={{ color: "var(--t-hi)" }}>Fonte.ia</strong>. Sem inventar
              concorrentes, sem promessas de lucro — só critérios práticos para você decidir o que
              faz sentido para o seu caso.
            </P>

            <Info>
              <strong style={{ color: "var(--t-hi)" }}>Ponto de partida inegociável:</strong> o
              site oficial da Receita Federal (SLE) é a única fonte de dados juridicamente válida.
              Qualquer ferramenta auxiliar existe para organizar e acelerar a análise — nunca para
              substituir o edital oficial.
            </Info>
          </header>

          {/* Critérios de análise */}
          <section aria-labelledby="criterios-heading" style={{ marginBottom: "56px" }}>
            <h2
              id="criterios-heading"
              style={{
                fontSize: "clamp(20px, 4vw, 26px)",
                fontWeight: 800,
                letterSpacing: "-0.025em",
                marginBottom: "16px",
                color: "var(--t-hi)",
              }}
            >
              O que você precisa fazer para analisar um lote bem
            </h2>

            <P>
              Antes de comparar as ferramentas, vale entender o que a análise de um lote exige.
              Há cinco tarefas principais — e cada abordagem resolve algumas delas com mais ou
              menos esforço:
            </P>

            <div
              className="mfa-criterios-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "12px",
                marginBottom: "28px",
              }}
            >
              <CriterioCard
                icon={<Search size={18} />}
                titulo="Achar os lotes"
                descricao="Saber quais editais estão ativos e quais lotes têm o tipo de bem ou categoria que você procura."
              />
              <CriterioCard
                icon={<FileText size={18} />}
                titulo="Ler e entender o edital"
                descricao="Compreender condição do bem, quem pode participar, prazo de habilitação, local de retirada e penalidades."
              />
              <CriterioCard
                icon={<Calculator size={18} />}
                titulo="Calcular o custo total"
                descricao="Somar lance + comissão do leiloeiro (~5%) + transporte + possível conserto para saber o custo real."
              />
              <CriterioCard
                icon={<Bell size={18} />}
                titulo="Controlar os prazos"
                descricao="Não perder os prazos de habilitação e de envio de proposta — são independentes e ambos têm consequências."
              />
              <CriterioCard
                icon={<BarChart2 size={18} />}
                titulo="Rastrear o histórico"
                descricao="Consultar lotes anteriores para entender padrões de lance e frequência de categorias específicas."
              />
            </div>
          </section>

          {/* Abordagem 1: SLE */}
          <section aria-labelledby="sle-heading" style={{ marginBottom: "48px" }}>
            <h2
              id="sle-heading"
              style={{
                fontSize: "clamp(18px, 4vw, 22px)",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                marginBottom: "14px",
                color: "var(--t-hi)",
              }}
            >
              1. Site oficial da Receita Federal (SLE)
            </h2>

            <P>
              O Sistema de Leilão Eletrônico é a fonte primária e obrigatória. Tudo está lá: os
              editais completos em PDF, os lotes, o lance mínimo, os prazos e o próprio formulário
              de habilitação e lance. É gratuito e acessível a qualquer pessoa com conta gov.br.
            </P>

            <P>
              O limite do SLE não é a qualidade das informações — é a ergonomia. Para comparar
              vários lotes de um mesmo edital, você precisa abrir PDF por PDF. Não há cálculo
              automático de custo total, não há alertas de prazo e a busca por categoria é
              limitada. Para quem participa de um ou dois lotes por ano, é perfeitamente suficiente.
              Para quem acompanha o mercado de forma contínua, o trabalho manual acumula.
            </P>

            <Info>
              <strong style={{ color: "var(--t-hi)" }}>Quando usar exclusivamente o SLE:</strong>{" "}
              se você é iniciante e está analisando seu primeiro lote, comece pelo SLE. Leia o
              edital inteiro sem intermediários. Isso ajuda a entender o processo do zero sem
              depender de interpretações de terceiros.
            </Info>
          </section>

          {/* Abordagem 2: Planilha */}
          <section aria-labelledby="planilha-heading" style={{ marginBottom: "48px" }}>
            <h2
              id="planilha-heading"
              style={{
                fontSize: "clamp(18px, 4vw, 22px)",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                marginBottom: "14px",
                color: "var(--t-hi)",
              }}
            >
              2. Planilha própria (Excel, Google Sheets)
            </h2>

            <P>
              A abordagem de montar uma planilha própria é comum entre participantes frequentes.
              A ideia é criar colunas para os dados de cada lote — lance mínimo, prazo, categoria,
              local de retirada, custo estimado — e alimentar manualmente à medida que os editais
              são publicados. Com fórmulas simples, dá para calcular o lance máximo que faz sentido
              para cada lote.
            </P>

            <P>
              O ponto forte é a flexibilidade total: você controla os critérios, as fórmulas e o
              que analisar. O custo de manutenção, por outro lado, é real: cada edital exige que
              você acesse o SLE, extraia os dados manualmente e atualize a planilha. À medida que
              o volume de lotes cresce, esse trabalho se torna a principal atividade — em vez da
              análise em si.
            </P>

            <Warn>
              Planilha manual tem risco de desatualização. Se você esquecer de atualizar um prazo
              ou copiar o lance mínimo errado, pode se habilitar em um lote fora do prazo ou
              calcular o custo com dados errados. Use sempre o edital original como referência
              final antes de qualquer decisão.
            </Warn>
          </section>

          {/* Abordagem 3: Fonte.ia */}
          <section aria-labelledby="fonteia-heading" style={{ marginBottom: "56px" }}>
            <h2
              id="fonteia-heading"
              style={{
                fontSize: "clamp(18px, 4vw, 22px)",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                marginBottom: "14px",
                color: "var(--t-hi)",
              }}
            >
              3. Fonte.ia — plataforma especializada em leilões da Receita
            </h2>

            <P>
              A Fonte.ia reúne os lotes do SLE em um painel único, organiza os dados (lance
              mínimo, prazo, elegibilidade PF/PJ, local) e entrega um{" "}
              <strong style={{ color: "var(--t-hi)" }}>Raio-X com IA</strong> de cada lote: um
              resumo dos pontos críticos do edital em linguagem de leigo, com destaque para as
              cláusulas que mais causam problema para iniciantes.
            </P>

            <P>
              O cálculo do custo total é automático — você informa o frete estimado e a plataforma
              soma lance mínimo, comissão do leiloeiro e os demais custos conhecidos do edital.
              Alertas de prazo chegam antes do encerramento da habilitação e das propostas.
            </P>

            <P>
              O que a Fonte.ia não faz: não participa do leilão por você, não decide qual lance
              dar, não garante que o bem estará em bom estado. O edital original da Receita Federal
              fica sempre linkado em cada lote — é ele que prevalece juridicamente. A plataforma
              existe para você chegar à decisão de lance mais informado, não para tomar a decisão
              por você.
            </P>

            <Info>
              <strong style={{ color: "var(--t-hi)" }}>Honestidade sobre limitações:</strong> a
              Fonte.ia é uma ferramenta nova, com cobertura focada em leilões da Receita Federal
              (SLE). Leilões judiciais, de bancos ou de outros órgãos não estão no escopo atual.
              O histórico de lotes arrematados ainda está em desenvolvimento. Se você precisa de
              análise de leilões fora do SLE, a plataforma ainda não é a solução completa.
            </Info>
          </section>

          {/* Tabela comparativa */}
          <section aria-labelledby="tabela-heading" style={{ marginBottom: "56px" }}>
            <h2
              id="tabela-heading"
              style={{
                fontSize: "clamp(18px, 4vw, 24px)",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                marginBottom: "16px",
                color: "var(--t-hi)",
              }}
            >
              Tabela comparativa por critério
            </h2>

            <P>
              A tabela abaixo resume o que cada abordagem entrega, sem exageros. "Manual" significa
              que a funcionalidade existe, mas exige trabalho manual do usuário a cada uso.
              "Parcial" significa que existe com limitações relevantes.
            </P>

            <TabelaComparativa />

            <p
              style={{
                fontSize: "12.5px",
                color: "var(--t-low)",
                lineHeight: 1.6,
                marginTop: "8px",
              }}
            >
              Dados de referência em junho de 2026. Funcionalidades da Fonte.ia em desenvolvimento
              ativo — confirme a disponibilidade em{" "}
              <a href="/entrar" className="link" style={{ fontSize: "12.5px" }}>
                /entrar
              </a>
              .
            </p>
          </section>

          {/* Como escolher */}
          <section aria-labelledby="como-escolher-heading" style={{ marginBottom: "56px" }}>
            <h2
              id="como-escolher-heading"
              style={{
                fontSize: "clamp(18px, 4vw, 24px)",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                marginBottom: "16px",
                color: "var(--t-hi)",
              }}
            >
              O que usar, dependendo do seu caso
            </h2>

            <P>
              Não existe a ferramenta certa para todo mundo — depende de com que frequência você
              participa e de quanto tempo você tem para analisar cada lote.
            </P>

            <ul
              style={{
                paddingLeft: "22px",
                display: "flex",
                flexDirection: "column",
                gap: "14px",
                marginBottom: "20px",
              }}
            >
              <li style={{ fontSize: "15px", lineHeight: 1.7, color: "var(--t-mid)" }}>
                <strong style={{ color: "var(--t-hi)" }}>Primeiro leilão ou participação esporádica:</strong>{" "}
                use o SLE diretamente. Leia o edital completo. Não há motivo para introduzir outra
                ferramenta antes de entender o processo pelo caminho oficial.
              </li>
              <li style={{ fontSize: "15px", lineHeight: 1.7, color: "var(--t-mid)" }}>
                <strong style={{ color: "var(--t-hi)" }}>Participação frequente com critérios fixos:</strong>{" "}
                planilha própria funciona bem se você já conhece o que procura e não se importa
                com o trabalho de atualização manual. É gratuita e totalmente customizável.
              </li>
              <li style={{ fontSize: "15px", lineHeight: 1.7, color: "var(--t-mid)" }}>
                <strong style={{ color: "var(--t-hi)" }}>Participação frequente com volume alto ou pouco tempo:</strong>{" "}
                plataforma especializada faz sentido quando o custo do tempo gasto em pesquisa e
                atualização manual ultrapassa o custo da assinatura. Use a Fonte.ia para achar e
                triagem inicial dos lotes — e confirme no edital original antes do lance.
              </li>
            </ul>

            <Warn>
              Independentemente da ferramenta, a regra de ouro não muda: leia o edital completo
              antes de qualquer lance. Ferramenta que te poupa tempo é boa; ferramenta que te dá
              preguiça de ler o edital é perigosa.
            </Warn>
          </section>

          {/* FAQ */}
          <section
            aria-labelledby="faq-heading"
            style={{ marginBottom: "56px" }}
            itemScope
            itemType="https://schema.org/FAQPage"
          >
            <h2
              id="faq-heading"
              style={{
                fontSize: "clamp(18px, 4vw, 24px)",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                marginBottom: "20px",
                color: "var(--t-hi)",
              }}
            >
              Perguntas frequentes
            </h2>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {FAQ.map((item) => (
                <FaqItem key={item.pergunta} pergunta={item.pergunta} resposta={item.resposta} />
              ))}
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
              marginBottom: "40px",
            }}
          >
            <span className="eyebrow" style={{ display: "block", marginBottom: "10px" }}>
              Fonte.ia — Raio-X com IA
            </span>
            <p
              style={{
                fontSize: "17px",
                fontWeight: 600,
                color: "var(--t-hi)",
                marginBottom: "10px",
              }}
            >
              Painel de lotes + análise de edital + calculadora de custo
            </p>
            <p
              style={{
                fontSize: "14.5px",
                lineHeight: 1.65,
                color: "var(--t-mid)",
                marginBottom: "22px",
                maxWidth: "460px",
                marginLeft: "auto",
                marginRight: "auto",
              }}
            >
              Todos os lotes do SLE reunidos, com Raio-X com IA dos pontos críticos do edital e
              cálculo automático do custo total estimado. O edital original fica sempre linkado.
              Sem inventar dado, sem prometer lucro.
            </p>
            <a
              href="/entrar"
              className="btn btn--accent btn--lg"
              style={{
                minWidth: "200px",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                textDecoration: "none",
                minHeight: "48px",
              }}
            >
              <Bell size={16} aria-hidden="true" />
              Experimentar 7 dias grátis
            </a>
            <p className="muted" style={{ fontSize: "12px", marginTop: "12px" }}>
              7 dias grátis · sem contrato · dados rastreáveis à fonte oficial
            </p>
          </div>

          {/* Links relacionados */}
          <nav
            aria-label="Guias relacionados"
            style={{ borderTop: "1px solid var(--border)", paddingTop: "28px" }}
          >
            <p
              style={{
                fontSize: "12px",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--t-low)",
                marginBottom: "14px",
              }}
            >
              Veja também
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
              <a
                href="/leiloes-receita-federal"
                className="card card--pad"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 16px",
                  textDecoration: "none",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "var(--t-hi)",
                }}
              >
                <BookOpen size={15} aria-hidden="true" />
                O que são os leilões da Receita
              </a>
              <a
                href="/como-participar-leilao-receita-federal"
                className="card card--pad"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 16px",
                  textDecoration: "none",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "var(--t-hi)",
                }}
              >
                <ArrowRight size={15} aria-hidden="true" />
                Como participar passo a passo
              </a>
              <a
                href="/guias/como-comprar-leilao-receita"
                className="card card--pad"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 16px",
                  textDecoration: "none",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "var(--t-hi)",
                }}
              >
                <BookOpen size={15} aria-hidden="true" />
                Guia completo de como comprar
              </a>
              <a
                href="/ferramentas/calculadora-lance"
                className="card card--pad"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 16px",
                  textDecoration: "none",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "var(--t-hi)",
                }}
              >
                Calculadora de lance (grátis)
              </a>
              <a
                href="/faq"
                className="card card--pad"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 16px",
                  textDecoration: "none",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "var(--t-hi)",
                }}
              >
                FAQ completo
              </a>
            </div>
          </nav>

        </article>
      </main>

      {/* ── Rodapé ──────────────────────────────────────────────────────── */}
      <footer
        className="mfa-footer"
        style={{
          borderTop: "1px solid var(--border)",
          padding: "24px 48px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "14px",
          background: "var(--surface)",
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
          <a href="/guias" className="link small">
            Guias
          </a>
          <a href="/leiloes-receita-federal" className="link small">
            Leilões da Receita
          </a>
          <a href="/guias/como-comprar-leilao-receita" className="link small">
            Como comprar
          </a>
          <a href="/ferramentas/calculadora-lance" className="link small">
            Calculadora
          </a>
          <a href="/faq" className="link small">
            FAQ
          </a>
          <a href="/privacidade" className="link small" style={{ color: "var(--t-low)" }}>
            Privacidade
          </a>
          <a href="/termos" className="link small" style={{ color: "var(--t-low)" }}>
            Termos
          </a>
        </nav>

        <span className="small" style={{ color: "var(--t-low)" }}>
          © {new Date().getFullYear()} Fonte.ia · by Olli
        </span>
      </footer>
    </div>
  );
}
