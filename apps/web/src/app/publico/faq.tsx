import { useState } from "react";
import { ChevronDown, ArrowRight, BookOpen } from "lucide-react";
import { useSeo, faqJsonLd, breadcrumbJsonLd, SITE_URL } from "../../lib/seo";
import { LogoMark } from "../../components/ui/logo-mark";
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
    secao: "Participar do leilão da Receita Federal",
    itens: [
      {
        pergunta: "Preciso de CNPJ para participar do leilão da Receita Federal?",
        resposta: (
          <>
            Não. Pessoa física com CPF pode participar da maioria dos lotes. Alguns lotes têm
            restrição — por exemplo, apenas empresas com licença específica de importação ou de
            determinado setor. Essa informação sempre consta no edital. Confirme no edital oficial
            antes de se habilitar.
          </>
        ),
      },
      {
        pergunta: "Qualquer pessoa pode participar ou precisa de autorização especial?",
        resposta: (
          <>
            Qualquer pessoa física com CPF e conta gov.br nível prata ou ouro pode participar dos
            lotes sem restrição. Não é preciso ser revendedor, importador ou ter autorização
            especial. O único pré-requisito é se habilitar no{" "}
            <strong>Sistema de Leilão Eletrônico (SLE)</strong> antes do prazo indicado no edital.
          </>
        ),
      },
      {
        pergunta: "O que é conta gov.br e como elevar para nível prata?",
        resposta: (
          <>
            A conta gov.br é o login unificado do governo federal. Para participar dos leilões é
            necessário nível prata ou ouro (identidade verificada). Você eleva para prata pelo
            app gov.br, usando reconhecimento facial comparado com a base da sua CNH (SENATRAN) ou
            da Receita Federal. O processo é gratuito e leva alguns minutos. Acesse
            gov.br/contagovbr para começar.
          </>
        ),
      },
      {
        pergunta: "Dá para parcelar o valor do arremate?",
        resposta: (
          <>
            Na maioria dos leilões da Receita Federal o pagamento é à vista via DARF, dentro do
            prazo do edital (geralmente 5 a 10 dias úteis após o arremate). Parcelamento é raro e,
            quando existe, está descrito explicitamente no edital. Não presuma que haverá
            parcelamento — confirme no edital antes de dar o lance.
          </>
        ),
      },
      {
        pergunta: "Posso ver o bem antes de dar o lance?",
        resposta: (
          <>
            Depende do edital. Alguns leilões oferecem vistoria prévia em data e horário marcados
            (o edital informa local e quando). Outros não permitem acesso ao bem antes do arremate.
            Mesmo quando a visitação é permitida, você vê o estado aparente — sem garantia de
            funcionamento. Confira a cláusula de visitação no edital antes de qualquer decisão.
          </>
        ),
      },
      {
        pergunta: "O que acontece se eu ganhar o lance e não pagar?",
        resposta: (
          <>
            O arrematante que não pagar dentro do prazo perde o direito ao lote e pode ser
            impedido de participar de futuros leilões da Receita Federal, além de responder pelas
            penalidades previstas no edital. Só dê o lance se tiver certeza de que pode pagar no
            prazo. Os termos exatos estão no edital — leia antes de propor.
          </>
        ),
      },
    ],
  },
  {
    secao: "Custos, pagamento e riscos",
    itens: [
      {
        pergunta: "Quais são todos os custos além do lance?",
        resposta: (
          <>
            Além do valor arrematado (pago via DARF), considere: comissão do leiloeiro (geralmente
            5% sobre o arremate), custos de transporte e logística para retirar o bem, eventual
            armazenagem por atraso na retirada e, dependendo do bem, conserto ou regularização.
            Use a{" "}
            <a href="/ferramentas/calculadora-lance" className="link">
              calculadora de lance grátis
            </a>{" "}
            para não perder esses custos de vista.
          </>
        ),
      },
      {
        pergunta: "Leilão da Receita Federal é confiável? Pode ser golpe?",
        resposta: (
          <>
            Os leilões são realizados por leiloeiros oficiais habilitados pela Receita Federal, com
            editais publicados no site oficial do governo. Os dados são públicos e rastreáveis. O
            risco não está na idoneidade do órgão — está nas características do bem: vendido{" "}
            <strong>“no estado em que se encontra”</strong>, sem garantia de funcionamento e sem
            direito de devolução. Cuidado com sites não oficiais que simulam leilões da Receita —
            acesse sempre pelo SLE oficial.
          </>
        ),
      },
      {
        pergunta: "O que significa comprar um bem “no estado em que se encontra”?",
        resposta: (
          <>
            Significa que você compra o risco. O bem não tem garantia de funcionamento, não vem
            com nota fiscal do fabricante e não pode ser devolvido. Eletrônicos podem não ligar,
            veículos podem ter vícios ocultos e mercadorias podem estar incompletas. Avalie as
            fotos disponíveis no edital, leia a descrição do lote com atenção e, quando
            permitido, faça a vistoria presencial antes de dar o lance.
          </>
        ),
      },
    ],
  },
  {
    secao: "Sobre a Fonte.ia",
    itens: [
      {
        pergunta: "O que é a Fonte.ia e o que ela faz?",
        resposta: (
          <>
            A Fonte.ia é uma plataforma SaaS brasileira que reúne os lotes dos leilões da Receita
            Federal em um único lugar organizado. Para cada lote, exibimos: lance mínimo, prazo,
            elegibilidade PF/PJ, score de oportunidade por regra e link direto para o edital
            oficial. Não inventamos dados, não prometemos lucro — entregamos informação rastreável
            para você tomar a decisão com mais clareza.
          </>
        ),
      },
      {
        pergunta: "Quanto custa a Fonte.ia?",
        resposta: (
          <>
            A Fonte.ia tem dois planos: Profissional (R$ 197/mês) e Corporativo (R$ 597/mês),
            ambos com 7 dias grátis — você só é cobrado depois e pode cancelar antes sem pagar
            nada. Sem contrato de fidelidade.{" "}
            <a href="/entrar" className="link">
              Comece seu teste grátis.
            </a>
          </>
        ),
      },
      {
        pergunta: "A Fonte.ia garante que vou lucrar com os leilões?",
        resposta: (
          <>
            Não. A Fonte.ia entrega informação organizada e rastreável — não garante resultado
            financeiro. A decisão de dar o lance e o risco associado são inteiramente seus. O que
            fazemos é ajudar você a encontrar lotes relevantes mais rápido, entender as condições
            do edital e calcular os custos antes de propor. Qualquer plataforma que “garanta lucro”
            em leilão está mentindo.
          </>
        ),
      },
      {
        pergunta: "Os dados da Fonte.ia são oficiais? De onde vêm?",
        resposta: (
          <>
            Sim. Os dados de lotes, editais, lances mínimos e prazos vêm do{" "}
            <strong>Sistema de Leilão Eletrônico (SLE)</strong> da Receita Federal — a mesma
            fonte que o governo disponibiliza publicamente. Cada lote na Fonte.ia tem link direto
            para o edital original, para você conferir na fonte quando quiser. Atualizamos os dados
            regularmente e indicamos a data de atualização em cada lote.
          </>
        ),
      },
      {
        pergunta: "Preciso ter experiência com leilões para usar a Fonte.ia?",
        resposta: (
          <>
            Não. A Fonte.ia foi desenhada para quem está participando do primeiro leilão da vida.
            A interface mostra o que importa em linguagem simples, o glossário explica os termos
            do edital e a calculadora ajuda a definir o lance máximo sem susto. Se você já tem
            experiência, vai economizar tempo com alertas automáticos e busca filtrada por
            categoria de bem.
          </>
        ),
      },
      {
        pergunta: "A Fonte.ia funciona em celular?",
        resposta: (
          <>
            Sim. A interface da Fonte.ia é mobile-first — projetada para funcionar bem em
            smartphones. Você pode consultar lotes, ver editais e configurar alertas direto pelo
            celular. O próprio SLE da Receita Federal (onde o lance é dado) também funciona em
            navegador mobile, embora recomendemos confirmar a proposta final em tela maior para
            não errar um dígito.
          </>
        ),
      },
      {
        pergunta: "Como a Fonte.ia lida com meus dados pessoais?",
        resposta: (
          <>
            A Fonte.ia coleta apenas os dados necessários para operar a conta (e-mail, nome e
            dados de pagamento). Não vendemos dados para terceiros, não compartilhamos com
            anunciantes. Seguimos a LGPD (Lei 13.709/2018). Você pode solicitar exclusão da conta
            a qualquer momento pelo e-mail de suporte. Leia nossa{" "}
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
    question: "Preciso de CNPJ para participar do leilão da Receita Federal?",
    answer:
      "Não. Pessoa física com CPF pode participar da maioria dos lotes. Alguns lotes têm restrição de participação — essa informação consta no edital. Confirme no edital oficial antes de se habilitar.",
  },
  {
    question: "Qualquer pessoa pode participar ou precisa de autorização especial?",
    answer:
      "Qualquer pessoa física com CPF e conta gov.br nível prata ou ouro pode participar dos lotes sem restrição. O único pré-requisito é se habilitar no Sistema de Leilão Eletrônico (SLE) antes do prazo do edital.",
  },
  {
    question: "O que é conta gov.br e como elevar para nível prata?",
    answer:
      "A conta gov.br é o login unificado do governo federal. Você eleva para prata pelo app gov.br, usando reconhecimento facial comparado com a base da sua CNH (SENATRAN) ou da Receita Federal. O processo é gratuito e leva alguns minutos.",
  },
  {
    question: "Dá para parcelar o valor do arremate?",
    answer:
      "Na maioria dos leilões da Receita Federal o pagamento é à vista via DARF, dentro do prazo do edital (geralmente 5 a 10 dias úteis). Parcelamento é raro e, quando existe, está descrito explicitamente no edital.",
  },
  {
    question: "Posso ver o bem antes de dar o lance?",
    answer:
      "Depende do edital. Alguns leilões oferecem vistoria prévia em data e horário marcados. Outros não permitem acesso ao bem antes do arremate. Mesmo quando permitida, você vê o estado aparente — sem garantia de funcionamento.",
  },
  {
    question: "O que acontece se eu ganhar o lance e não pagar?",
    answer:
      "O arrematante que não pagar dentro do prazo perde o direito ao lote e pode ser impedido de participar de futuros leilões da Receita Federal, além de responder pelas penalidades previstas no edital.",
  },
  {
    question: "Quais são todos os custos além do lance?",
    answer:
      "Além do valor arrematado (pago via DARF), considere: comissão do leiloeiro (geralmente 5%), custos de transporte, eventual armazenagem por atraso na retirada e, dependendo do bem, conserto ou regularização.",
  },
  {
    question: "Leilão da Receita Federal é confiável? Pode ser golpe?",
    answer:
      "Os leilões são realizados por leiloeiros oficiais habilitados pela Receita Federal, com editais publicados no site oficial do governo. O risco está nas características do bem, vendido “no estado em que se encontra”, sem garantia. Cuidado com sites não oficiais — acesse sempre pelo SLE oficial.",
  },
  {
    question: "O que significa comprar um bem “no estado em que se encontra”?",
    answer:
      "Significa que você compra o risco. O bem não tem garantia de funcionamento, não vem com nota fiscal do fabricante e não pode ser devolvido. Avalie as fotos, leia a descrição do lote e, quando permitido, faça a vistoria antes de dar o lance.",
  },
  {
    question: "O que é a Fonte.ia e o que ela faz?",
    answer:
      "A Fonte.ia é uma plataforma SaaS brasileira que reúne os lotes dos leilões da Receita Federal com informações organizadas: lance mínimo, prazo, elegibilidade PF/PJ, score de oportunidade e link para o edital oficial. Não inventamos dados, não prometemos lucro.",
  },
  {
    question: "Quanto custa a Fonte.ia?",
    answer:
      "A Fonte.ia tem dois planos: Profissional (R$ 197/mês) e Corporativo (R$ 597/mês), ambos com 7 dias grátis — você só é cobrado depois e pode cancelar antes sem pagar nada.",
  },
  {
    question: "A Fonte.ia garante que vou lucrar com os leilões?",
    answer:
      "Não. A Fonte.ia entrega informação organizada e rastreável — não garante resultado financeiro. A decisão de dar o lance e o risco associado são inteiramente seus. Qualquer plataforma que “garanta lucro” em leilão está mentindo.",
  },
  {
    question: "Os dados da Fonte.ia são oficiais? De onde vêm?",
    answer:
      "Sim. Os dados de lotes, editais, lances mínimos e prazos vêm do Sistema de Leilão Eletrônico (SLE) da Receita Federal. Cada lote tem link direto para o edital original. Atualizamos os dados regularmente e indicamos a data de atualização em cada lote.",
  },
  {
    question: "Preciso ter experiência com leilões para usar a Fonte.ia?",
    answer:
      "Não. A Fonte.ia foi desenhada para quem está participando do primeiro leilão da vida. A interface mostra o que importa em linguagem simples, com glossário de termos e calculadora de lance.",
  },
  {
    question: "A Fonte.ia funciona em celular?",
    answer:
      "Sim. A interface da Fonte.ia é mobile-first — projetada para funcionar bem em smartphones. Você pode consultar lotes, ver editais e configurar alertas direto pelo celular.",
  },
];

/* ── Página ──────────────────────────────────────────────────────────────── */
export function FaqPage() {
  useSeo({
    title:
      "Perguntas frequentes sobre leilões da Receita Federal e Fonte.ia (2026) | Fonte.ia",
    description:
      "Tire suas dúvidas sobre leilões da Receita Federal: precisa de CNPJ? Dá para parcelar? Posso ver o bem antes? Quanto custa a Fonte.ia? Respostas diretas e honestas.",
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
          <a href="/guias/como-comprar-leilao-receita" className="btn btn--ghost btn--sm faq-ghost-cta">
            ← Guia de compra
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
              Perguntas frequentes sobre leilões da Receita Federal
            </h1>

            <p
              style={{
                fontSize: "clamp(15px, 2vw, 17px)",
                lineHeight: 1.75,
                color: "var(--t-mid)",
                marginBottom: "0",
              }}
            >
              Respondemos as dúvidas mais comuns de quem está chegando nos leilões da Receita
              Federal pela primeira vez — e as perguntas sobre como a Fonte.ia funciona. Respostas
              diretas, sem enrolação. Se não achou o que procura, consulte o{" "}
              <a href="/glossario-leiloes" className="link">
                glossário de termos
              </a>{" "}
              ou o{" "}
              <a href="/guias/como-comprar-leilao-receita" className="link">
                guia passo a passo
              </a>
              .
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
              Todos os lotes da Receita Federal, organizados para você decidir com clareza
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
              Lance mínimo, prazo, elegibilidade PF/PJ, score por regra e link direto para o
              edital oficial. Sem inventar dado, sem prometer lucro — só informação rastreável.
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
                href="/guias/como-comprar-leilao-receita"
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
                Como comprar: guia passo a passo
              </a>
              <a
                href="/glossario-leiloes"
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
                Glossário de termos
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
          <a href="/guias/como-comprar-leilao-receita" className="link small">
            Guia de compra
          </a>
          <a href="/ferramentas/calculadora-lance" className="link small">
            Calculadora
          </a>
          <a href="/glossario-leiloes" className="link small">
            Glossário
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
