import { useState } from "react";
import { ChevronDown, ArrowRight, BookOpen } from "lucide-react";
import { useSeo, faqJsonLd, breadcrumbJsonLd, SITE_URL } from "../../lib/seo";
import { LogoMark } from "../../components/ui/logo-mark";
import { ThemeToggle } from "../../components/ui/ThemeToggle";
/* ── Accordion de pergunta ───────────────────────────────────────────────── */
interface FaqItemProps {
  pergunta: string;
  resposta: React.ReactNode;
  categoria?: string;
}

function FaqItem({ pergunta, resposta }: FaqItemProps) {
  const [aberto, setAberto] = useState(false);
  const id = pergunta.slice(0, 40).replace(/[^a-z0-9]+/gi, "-").toLowerCase();

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
          style={{ padding: "0 22px 20px" }}
          itemScope
          itemType="https://schema.org/Answer"
        >
          <div
            itemProp="text"
            style={{ fontSize: "14.5px", lineHeight: 1.75, color: "var(--t-mid)" }}
          >
            {resposta}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Título de seção ─────────────────────────────────────────────────────── */
function SecaoTitulo({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: "clamp(16px, 3vw, 20px)",
        fontWeight: 700,
        letterSpacing: "-0.02em",
        color: "var(--t-hi)",
        marginTop: "48px",
        marginBottom: "16px",
        paddingBottom: "10px",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {children}
    </h2>
  );
}

/* ── Dados do FAQ ────────────────────────────────────────────────────────── */
interface FaqData {
  secao: string;
  itens: FaqItemProps[];
}

const FAQ_SECOES: FaqData[] = [
  {
    secao: "A plataforma Fonte.ia",
    itens: [
      {
        pergunta: "O que é a Fonte.ia e o que ela faz?",
        resposta: (
          <>
            A Fonte.ia é uma plataforma SaaS brasileira de inteligência de dados públicos. Reunimos
            registros de fontes oficiais do governo — Receita Federal, PNCP, CNJ, IBAMA, Câmara,
            Senado, Portal Transparência, IBGE — em um painel único, organizado e rastreável. São
            ~170 mil registros disponíveis: 1.065 lotes de leilão, 153.945 contratos, 1.051
            licitações, 280 processos, 1.592 sanções e mais. A IA nunca inventa — cada dado tem
            link direto à fonte oficial.
          </>
        ),
      },
      {
        pergunta: "Quanto custa a Fonte.ia? Existe plano gratuito?",
        resposta: (
          <>
            Existem dois planos pagos: (1) Profissional — R$ 197/mês, para indivíduos e pequenas
            equipes; acesso a todos os módulos com análise de IA e alertas. (2) Corporativo —
            R$ 597/mês, para escritórios e equipes maiores; múltiplos usuários, exportação e
            integrações. Ambos incluem 7 dias grátis — você só é cobrado depois e pode cancelar
            antes sem pagar nada. Não há plano gratuito ou consulta sem cadastro.{" "}
            <a href="/entrar" className="link">
              Comece seu teste grátis.
            </a>
          </>
        ),
      },
      {
        pergunta: "A Fonte.ia garante resultados ou lucro?",
        resposta: (
          <>
            Não. Entregamos informação organizada e rastreável — não garantimos resultado financeiro
            em nenhum módulo. A decisão é sempre sua. Qualquer plataforma que "garanta lucro" em
            leilão, licitação ou negócio com dados públicos está mentindo.
          </>
        ),
      },
      {
        pergunta: "A Fonte.ia funciona em celular?",
        resposta: (
          <>
            Sim. A interface é responsiva e mobile-first. Consultas, alertas e análises funcionam
            bem em smartphones. Para dar lances em leilões ou assinar contratos, você precisará
            acessar o site oficial do órgão — não intermediamos isso.
          </>
        ),
      },
    ],
  },
  {
    secao: "Fontes de dados e rastreabilidade",
    itens: [
      {
        pergunta: "De onde vêm os dados da Fonte.ia?",
        resposta: (
          <>
            De fontes oficiais do governo brasileiro, acessadas via APIs públicas e portais de dados
            abertos: Receita Federal (SLE – leilões), PNCP (licitações e contratos), CNJ (processos
            judiciais), IBAMA (autos ambientais), Câmara e Senado Federal (proposições e
            parlamentares), Portal da Transparência (sanções), CNPJ.ws (dados de empresas), IBGE
            (municípios). Todos os dados são públicos por força da Lei de Acesso à Informação
            (12.527/2011).
          </>
        ),
      },
      {
        pergunta: "Como garantem que os dados são corretos e atualizados?",
        resposta: (
          <>
            Cada coleta registra URL de origem e timestamp. A IA não edita os dados — apresenta o
            que o órgão publicou. Se a informação estiver desatualizada na fonte, estará
            desatualizada na Fonte.ia também (e indicamos a data de atualização em cada registro). O
            link para o documento original está sempre disponível para que você confira diretamente.
          </>
        ),
      },
      {
        pergunta: "A IA inventa informações ou complementa dados ausentes?",
        resposta: (
          <>
            Não. A IA resume e organiza o que consta na fonte — nunca preenche campos com
            estimativas ou suposições. Quando a evidência é insuficiente, o sistema diz
            explicitamente "evidência insuficiente". Não estimamos valor de mercado, previsão de
            resultado ou qualquer dado que não esteja na fonte oficial.
          </>
        ),
      },
    ],
  },
  {
    secao: "Módulo Leilões (Receita Federal)",
    itens: [
      {
        pergunta: "Preciso de CNPJ para participar do leilão da Receita Federal?",
        resposta: (
          <>
            Não. Pessoa física com CPF pode participar da maioria dos lotes. Alguns têm restrição
            — por exemplo, apenas empresas com licença específica. Essa informação consta no edital.
            A Fonte.ia exibe a elegibilidade (PF/PJ) de cada lote, mas confirme sempre no edital
            oficial antes de se habilitar.
          </>
        ),
      },
      {
        pergunta: "Quais são todos os custos além do lance?",
        resposta: (
          <>
            Além do valor arrematado (pago via DARF), considere: comissão do leiloeiro (geralmente
            5%), transporte e logística, eventual armazenagem por atraso na retirada e, dependendo
            do bem, conserto ou regularização. Use a{" "}
            <a href="/ferramentas/calculadora-lance" className="link">
              calculadora de lance gratuita
            </a>{" "}
            na plataforma para consolidar esses custos antes de propor.
          </>
        ),
      },
      {
        pergunta: "Leilão da Receita Federal é confiável? Pode ser golpe?",
        resposta: (
          <>
            Os leilões são realizados por leiloeiros oficiais habilitados pela Receita Federal, com
            editais publicados no SLE oficial. O risco está nas características do bem: vendido{" "}
            <strong>"no estado em que se encontra"</strong>, sem garantia de funcionamento e sem
            direito de devolução. Cuidado com sites não oficiais que simulam leilões da Receita —
            acesse sempre pelo SLE oficial. A Fonte.ia só exibe dados do SLE e linka ao edital
            original.
          </>
        ),
      },
    ],
  },
  {
    secao: "Módulos Licitações, Empresas e Jurídico",
    itens: [
      {
        pergunta: "O módulo de licitações cobre quais órgãos?",
        resposta: (
          <>
            Indexamos os dados do PNCP (Portal Nacional de Contratações Públicas), que agrega
            licitações e contratos de órgãos federais, estaduais e municipais. São 153.945 contratos
            e 1.051 licitações disponíveis. Editais de órgãos que não publicam no PNCP ainda não
            são cobertos — verificamos as fontes disponíveis e informamos a cobertura de cada
            pesquisa.
          </>
        ),
      },
      {
        pergunta: "Posso usar a Fonte.ia para fazer due diligence de fornecedores?",
        resposta: (
          <>
            Sim. O módulo Empresas (461 registros, via CNPJ.ws) e o módulo Sanções (1.592 registros
            do Portal Transparência — CEIS, CNEP, CEPIM) permitem verificar se um CNPJ tem sanções
            e seu histórico de contratos públicos. Cada dado tem link à fonte oficial para uso em
            relatórios auditáveis.
          </>
        ),
      },
      {
        pergunta: "O módulo Jurídico cobre todo o Judiciário?",
        resposta: (
          <>
            Indexamos 280 processos do CNJ que são públicos e acessíveis via API. Processos em
            segredo de Justiça ou de sistemas estaduais sem integração com o DataJud do CNJ não são
            cobertos. Indicamos claramente a cobertura e o link ao tribunal original em cada
            processo exibido.
          </>
        ),
      },
    ],
  },
  {
    secao: "Planos, pagamento e privacidade",
    itens: [
      {
        pergunta: "Posso cancelar quando quiser? Tem fidelidade?",
        resposta: (
          <>
            Sim, você cancela a qualquer momento pela plataforma, sem fidelidade, sem multa. Se
            cancelar dentro dos 7 dias de teste dos planos pagos, não é cobrado nada. Após o
            período, a cobrança é mensal — cancelar encerra na próxima data de renovação.
          </>
        ),
      },
      {
        pergunta: "Como a Fonte.ia lida com meus dados pessoais?",
        resposta: (
          <>
            Coletamos apenas os dados necessários para operar a conta (e-mail, nome, dados de
            pagamento via Stripe). Não vendemos dados para terceiros. Seguimos a LGPD (Lei
            13.709/2018). Você pode solicitar exclusão a qualquer momento pelo e-mail
            contato@olli.com.br. Leia a{" "}
            <a href="/privacidade" className="link">
              política de privacidade
            </a>{" "}
            completa.
          </>
        ),
      },
    ],
  },
];

/* ── Texto plano para JSON-LD (sem JSX) ─────────────────────────────────── */
const FAQ_JSON_LD_ITEMS: ReadonlyArray<{ question: string; answer: string }> = [
  {
    question: "O que é a Fonte.ia e o que ela faz?",
    answer:
      "A Fonte.ia é uma plataforma SaaS brasileira de inteligência de dados públicos. Reunimos registros de fontes oficiais do governo — Receita Federal, PNCP, CNJ, IBAMA, Câmara, Senado, Portal Transparência, IBGE — em um painel único, organizado e rastreável. São ~170 mil registros disponíveis: 1.065 lotes de leilão, 153.945 contratos, 1.051 licitações, 280 processos, 1.592 sanções e mais. A IA nunca inventa — cada dado tem link direto à fonte oficial.",
  },
  {
    question: "Quanto custa a Fonte.ia? Existe plano gratuito?",
    answer:
      "Existem dois planos pagos: Profissional — R$ 197/mês, acesso a todos os módulos com análise de IA e alertas; Corporativo — R$ 597/mês, múltiplos usuários, exportação e integrações. Ambos incluem 7 dias grátis — você só é cobrado depois e pode cancelar antes sem pagar nada. Não há plano gratuito ou consulta sem cadastro.",
  },
  {
    question: "A Fonte.ia garante resultados ou lucro?",
    answer:
      "Não. Entregamos informação organizada e rastreável — não garantimos resultado financeiro em nenhum módulo. A decisão é sempre sua. Qualquer plataforma que \"garanta lucro\" em leilão, licitação ou negócio com dados públicos está mentindo.",
  },
  {
    question: "A Fonte.ia funciona em celular?",
    answer:
      "Sim. A interface é responsiva e mobile-first. Consultas, alertas e análises funcionam bem em smartphones. Para dar lances em leilões ou assinar contratos, você precisará acessar o site oficial do órgão — não intermediamos isso.",
  },
  {
    question: "De onde vêm os dados da Fonte.ia?",
    answer:
      "De fontes oficiais do governo brasileiro, acessadas via APIs públicas e portais de dados abertos: Receita Federal (SLE – leilões), PNCP (licitações e contratos), CNJ (processos judiciais), IBAMA (autos ambientais), Câmara e Senado Federal (proposições e parlamentares), Portal da Transparência (sanções), CNPJ.ws (dados de empresas), IBGE (municípios). Todos os dados são públicos por força da Lei de Acesso à Informação (12.527/2011).",
  },
  {
    question: "Como garantem que os dados são corretos e atualizados?",
    answer:
      "Cada coleta registra URL de origem e timestamp. A IA não edita os dados — apresenta o que o órgão publicou. Se a informação estiver desatualizada na fonte, estará desatualizada na Fonte.ia também (e indicamos a data de atualização em cada registro). O link para o documento original está sempre disponível para que você confira diretamente.",
  },
  {
    question: "A IA inventa informações ou complementa dados ausentes?",
    answer:
      "Não. A IA resume e organiza o que consta na fonte — nunca preenche campos com estimativas ou suposições. Quando a evidência é insuficiente, o sistema diz explicitamente \"evidência insuficiente\". Não estimamos valor de mercado, previsão de resultado ou qualquer dado que não esteja na fonte oficial.",
  },
  {
    question: "Preciso de CNPJ para participar do leilão da Receita Federal?",
    answer:
      "Não. Pessoa física com CPF pode participar da maioria dos lotes. Alguns têm restrição — por exemplo, apenas empresas com licença específica. Essa informação consta no edital. A Fonte.ia exibe a elegibilidade (PF/PJ) de cada lote, mas confirme sempre no edital oficial antes de se habilitar.",
  },
  {
    question: "Quais são todos os custos além do lance?",
    answer:
      "Além do valor arrematado (pago via DARF), considere: comissão do leiloeiro (geralmente 5%), transporte e logística, eventual armazenagem por atraso na retirada e, dependendo do bem, conserto ou regularização. Use a calculadora de lance gratuita na plataforma para consolidar esses custos antes de propor.",
  },
  {
    question: "Leilão da Receita Federal é confiável? Pode ser golpe?",
    answer:
      "Os leilões são realizados por leiloeiros oficiais habilitados pela Receita Federal, com editais publicados no SLE oficial. O risco está nas características do bem: vendido \"no estado em que se encontra\", sem garantia de funcionamento e sem direito de devolução. Cuidado com sites não oficiais que simulam leilões da Receita — acesse sempre pelo SLE oficial. A Fonte.ia só exibe dados do SLE e linka ao edital original.",
  },
  {
    question: "O módulo de licitações cobre quais órgãos?",
    answer:
      "Indexamos os dados do PNCP (Portal Nacional de Contratações Públicas), que agrega licitações e contratos de órgãos federais, estaduais e municipais. São 153.945 contratos e 1.051 licitações disponíveis. Editais de órgãos que não publicam no PNCP ainda não são cobertos — verificamos as fontes disponíveis e informamos a cobertura de cada pesquisa.",
  },
  {
    question: "Posso usar a Fonte.ia para fazer due diligence de fornecedores?",
    answer:
      "Sim. O módulo Empresas (461 registros, via CNPJ.ws) e o módulo Sanções (1.592 registros do Portal Transparência — CEIS, CNEP, CEPIM) permitem verificar se um CNPJ tem sanções e seu histórico de contratos públicos. Cada dado tem link à fonte oficial para uso em relatórios auditáveis.",
  },
  {
    question: "O módulo Jurídico cobre todo o Judiciário?",
    answer:
      "Indexamos 280 processos do CNJ que são públicos e acessíveis via API. Processos em segredo de Justiça ou de sistemas estaduais sem integração com o DataJud do CNJ não são cobertos. Indicamos claramente a cobertura e o link ao tribunal original em cada processo exibido.",
  },
  {
    question: "Posso cancelar quando quiser? Tem fidelidade?",
    answer:
      "Sim, você cancela a qualquer momento pela plataforma, sem fidelidade, sem multa. Se cancelar dentro dos 7 dias de teste dos planos pagos, não é cobrado nada. Após o período, a cobrança é mensal — cancelar encerra na próxima data de renovação.",
  },
  {
    question: "Como a Fonte.ia lida com meus dados pessoais?",
    answer:
      "Coletamos apenas os dados necessários para operar a conta (e-mail, nome, dados de pagamento via Stripe). Não vendemos dados para terceiros. Seguimos a LGPD (Lei 13.709/2018). Você pode solicitar exclusão a qualquer momento pelo e-mail contato@olli.com.br. Leia a política de privacidade completa em /privacidade.",
  },
];

/* ── Página ──────────────────────────────────────────────────────────────── */
export function FaqPage() {
  useSeo({
    title:
      "Perguntas frequentes sobre a Fonte.ia — plataforma de dados públicos brasileiros (2026) | Fonte.ia",
    description:
      "Tire suas dúvidas sobre a Fonte.ia: o que é, quanto custa, de onde vêm os dados, como funcionam os módulos de leilões, licitações, empresas, jurídico e ambiental. Respostas diretas e honestas.",
    canonicalPath: "/faq",
    jsonLd: [
      faqJsonLd(FAQ_JSON_LD_ITEMS),
      breadcrumbJsonLd([
        { name: "Fonte.ia", url: SITE_URL },
        { name: "FAQ", url: `${SITE_URL}/faq` },
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
          .faq-header { padding-left: 20px !important; padding-right: 20px !important; }
          .faq-main   { padding-left: 20px !important; padding-right: 20px !important; }
          .faq-footer { padding-left: 20px !important; padding-right: 20px !important; }
          .faq-header .faq-ghost-cta { display: none !important; }
        }
        .faq-footer nav a {
          display: inline-flex;
          align-items: center;
          min-height: 44px;
          padding: 4px 2px;
        }
      `}</style>

      {/* ── Cabeçalho ──────────────────────────────────────────────────── */}
      <header
        className="faq-header"
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
          <ThemeToggle />
          <a href="/sobre" className="btn btn--ghost btn--sm faq-ghost-cta">
            ← Sobre
          </a>
          <a href="/entrar" className="btn btn--accent btn--sm">
            Começar grátis
          </a>
        </nav>
      </header>

      {/* ── Conteúdo principal ─────────────────────────────────────────── */}
      <main
        className="faq-main"
        style={{
          flex: 1,
          maxWidth: "760px",
          width: "100%",
          margin: "0 auto",
          padding: "60px 28px 100px",
        }}
      >
        <article
          itemScope
          itemType="https://schema.org/FAQPage"
        >

          {/* Trilha de navegação */}
          <nav
            aria-label="Trilha de navegação"
            style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}
          >
            <a href="/" className="link small" style={{ fontSize: "13px" }}>
              Fonte.ia
            </a>
            <span style={{ color: "var(--t-low)", fontSize: "13px" }} aria-hidden="true">›</span>
            <span className="small" style={{ color: "var(--t-low)", fontSize: "13px" }}>
              Perguntas frequentes
            </span>
          </nav>

          {/* Herói */}
          <header style={{ marginBottom: "40px" }}>
            <span className="eyebrow" style={{ display: "block", marginBottom: "14px" }}>
              15 perguntas · respostas diretas · 2026
            </span>

            <h1
              style={{
                fontSize: "clamp(26px, 6vw, 38px)",
                fontWeight: 800,
                letterSpacing: "-0.03em",
                lineHeight: 1.1,
                marginBottom: "20px",
              }}
            >
              Perguntas frequentes sobre a Fonte.ia e dados públicos brasileiros
            </h1>

            <p
              style={{
                fontSize: "clamp(15px, 2vw, 17px)",
                lineHeight: 1.75,
                color: "var(--t-mid)",
                marginBottom: "0",
              }}
            >
              Respondemos as dúvidas de quem está conhecendo a plataforma — sobre os módulos, as
              fontes, os planos e como a IA funciona. Respostas diretas, sem enrolação.
            </p>
          </header>

          {/* Seções de FAQ */}
          {FAQ_SECOES.map((secao) => (
            <section
              key={secao.secao}
              aria-labelledby={`secao-${secao.secao.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
            >
              <SecaoTitulo>
                <span
                  id={`secao-${secao.secao.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                >
                  {secao.secao}
                </span>
              </SecaoTitulo>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {secao.itens.map((item) => (
                  <FaqItem
                    key={item.pergunta}
                    pergunta={item.pergunta}
                    resposta={item.resposta}
                  />
                ))}
              </div>
            </section>
          ))}

          {/* CTA Fonte.ia */}
          <div
            className="panel"
            style={{
              padding: "32px",
              textAlign: "center",
              background: "color-mix(in srgb, var(--accent) 6%, var(--surface))",
              borderColor: "color-mix(in srgb, var(--accent) 22%, var(--border))",
              marginTop: "56px",
              marginBottom: "40px",
            }}
          >
            <span className="eyebrow" style={{ display: "block", marginBottom: "10px" }}>
              Fonte.ia — 7 dias grátis
            </span>
            <p
              style={{
                fontSize: "17px",
                fontWeight: 600,
                color: "var(--t-hi)",
                marginBottom: "10px",
              }}
            >
              ~170 mil registros de dados públicos, organizados para você decidir com clareza
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
              Leilões, licitações, sanções, processos, empresas — cada dado rastreável à fonte
              oficial. Sem inventar, sem prometer resultado.
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
              Começar teste grátis
              <ArrowRight size={16} aria-hidden="true" />
            </a>
            <p className="muted" style={{ fontSize: "12px", marginTop: "12px" }}>
              Sem cartão no cadastro · cancele quando quiser
            </p>
          </div>

          {/* Links relacionados */}
          <nav
            aria-label="Páginas relacionadas"
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
                href="/sobre"
                className="card card--pad"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 16px",
                  textDecoration: "none",
                  color: "var(--t-hi)",
                  fontSize: "14px",
                  fontWeight: 600,
                }}
              >
                <BookOpen size={15} aria-hidden="true" />
                Sobre a Fonte.ia
              </a>
              <a
                href="/para-quem"
                className="card card--pad"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 16px",
                  textDecoration: "none",
                  color: "var(--t-hi)",
                  fontSize: "14px",
                  fontWeight: 600,
                }}
              >
                Para quem é a plataforma
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
                  color: "var(--t-hi)",
                  fontSize: "14px",
                  fontWeight: 600,
                }}
              >
                Calculadora de lance (grátis)
              </a>
              <a
                href="/leiloes-receita-federal"
                className="card card--pad"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 16px",
                  textDecoration: "none",
                  color: "var(--t-hi)",
                  fontSize: "14px",
                  fontWeight: 600,
                }}
              >
                Ver leilões disponíveis
              </a>
            </div>
          </nav>

        </article>
      </main>

      {/* ── Rodapé ──────────────────────────────────────────────────────── */}
      <footer
        className="faq-footer"
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
          <a href="/leiloes-receita-federal" className="link small">
            Leilões
          </a>
          <a href="/sobre" className="link small">
            Sobre
          </a>
          <a href="/ferramentas/calculadora-lance" className="link small">
            Calculadora
          </a>
          <a href="/para-quem" className="link small">
            Para quem
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
