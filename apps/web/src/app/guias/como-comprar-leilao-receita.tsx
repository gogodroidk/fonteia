import { useState } from "react";
import { ChevronDown, ArrowRight, ShieldCheck, AlertTriangle, BookOpen } from "lucide-react";
import { LogoMark } from "../../components/ui/logo-mark";
import {
  useSeo,
  articleJsonLd,
  faqJsonLd,
  breadcrumbJsonLd,
  SITE_URL,
} from "../../lib/seo";
/* ── Primitivos de texto ─────────────────────────────────────────────────── */
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

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="note"
      style={{
        background: "color-mix(in srgb, var(--warn) 12%, var(--surface))",
        border: "1px solid color-mix(in srgb, var(--warn) 28%, var(--surface))",
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
        background: "color-mix(in srgb, var(--accent) 10%, var(--surface))",
        border: "1px solid color-mix(in srgb, var(--accent) 25%, var(--surface-2))",
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

/* ── Item de passo numerado ──────────────────────────────────────────────── */
function Passo({
  num,
  titulo,
  children,
}: {
  num: number;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: "20px",
        alignItems: "flex-start",
        marginBottom: "36px",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          flexShrink: 0,
          width: "40px",
          height: "40px",
          borderRadius: "12px",
          background: "linear-gradient(135deg, var(--brand), var(--accent))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 800,
          fontSize: "16px",
          color: "#fff",
          marginTop: "2px",
        }}
      >
        {num}
      </div>
      <div style={{ flex: 1 }}>
        <h3
          style={{
            fontSize: "20px",
            fontWeight: 800,
            color: "var(--t-hi)",
            marginBottom: "10px",
            lineHeight: 1.3,
          }}
        >
          {titulo}
        </h3>
        {children}
      </div>
    </div>
  );
}

/* ── FAQ accordion ───────────────────────────────────────────────────────── */
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

/* ── Página principal ────────────────────────────────────────────────────── */
export function GuiaComoComprarPage() {
  const TITLE =
    "Como comprar em leilão da Receita Federal: passo a passo (2026) | Fonte.ia";
  const DESCRIPTION =
    "Guia completo para iniciantes: o que é o leilão da Receita Federal (SLE), quem pode participar, como habilitar conta gov.br, dar o lance, pagar o DARF e retirar o bem. Com FAQ.";

  useSeo({
    title: TITLE,
    description: DESCRIPTION,
    canonicalPath: "/guias/como-comprar-leilao-receita",
    jsonLd: [
      articleJsonLd({
        title: TITLE,
        description: DESCRIPTION,
        url: SITE_URL + "/guias/como-comprar-leilao-receita",
        datePublished: "2026-06-13",
      }),
      faqJsonLd([
        {
          question: "Precisa de CNPJ para participar do leilão da Receita Federal?",
          answer:
            "Não. Pessoa física com CPF pode participar da maioria dos lotes. Alguns lotes têm restrição de participação — por exemplo, apenas pessoa jurídica de determinado ramo ou apenas empresas com licença específica. Essa informação consta no edital de cada lote. Confirme sempre no edital oficial antes de se habilitar.",
        },
        {
          question: "Dá para parcelar o lance?",
          answer:
            "Na maioria dos leilões da Receita Federal, o pagamento é à vista via DARF, no prazo estabelecido no edital (geralmente de 5 a 10 dias úteis após o arremate). Parcelamento é raro e, quando existe, está descrito explicitamente no edital. Não presuma que haverá parcelamento — confirme no edital oficial antes de dar o lance.",
        },
        {
          question: "Posso visitar ou inspecionar o bem antes de dar o lance?",
          answer:
            "Depende do edital. Alguns leilões permitem vistoria prévia em data e horário marcados (o edital informa onde e quando). Outros não permitem acesso ao bem antes do arremate. Mesmo quando a vistoria é permitida, você vê o bem “no estado em que se encontra” — sem garantia de funcionamento. Confira a cláusula de vistoria no edital antes de qualquer decisão.",
        },
        {
          question: "Quanto é a comissão do leiloeiro?",
          answer:
            "Nos leilões da Receita Federal conduzidos pelo Sistema de Leilão Eletrônico (SLE), a comissão do leiloeiro oficial é geralmente de 5% sobre o valor do arremate, cobrada do arrematante. Esse percentual é uma referência comum; o valor exato consta no edital de cada lote. Confirme no edital antes de calcular seu lance máximo.",
        },
        {
          question: "Leilão da Receita Federal é confiável?",
          answer:
            "O leilão é realizado por leiloeiros oficiais habilitados pela Receita Federal, com editais publicados no site oficial do governo. Os dados são públicos e rastreáveis. O risco não está na idoneidade do órgão, mas nas características do bem: ele é vendido sem garantia, “no estado em que se encontra”. Quem avalia o risco do lote é você — com base no edital, nas fotos disponíveis e, quando permitido, na vistoria.",
        },
        {
          question: "O que acontece se eu ganhar o lance e não pagar?",
          answer:
            "O arrematante que não pagar dentro do prazo do edital perde o direito ao lote e pode ser impedido de participar de futuros leilões da Receita Federal, além de responder pelas penalidades previstas no edital. Só dê o lance se tiver certeza de que pode pagar no prazo. Os termos exatos estão no edital — confirme antes de propor.",
        },
      ]),
      breadcrumbJsonLd([
        { name: "Início", url: SITE_URL + "/" },
        { name: "Guias", url: SITE_URL + "/guias" },
        {
          name: "Como comprar",
          url: SITE_URL + "/guias/como-comprar-leilao-receita",
        },
      ]),
    ],
  });

  const FAQ: FaqItemProps[] = [
    {
      pergunta: "Precisa de CNPJ para participar do leilão da Receita Federal?",
      resposta: (
        <>
          Não. Pessoa física com CPF pode participar da maioria dos lotes. Alguns lotes têm
          restrição de participação — por exemplo, apenas pessoa jurídica de determinado ramo ou
          apenas empresas com licença específica. Essa informação consta no edital de cada lote.
          Confirme sempre no edital oficial antes de se habilitar.
        </>
      ),
    },
    {
      pergunta: "Dá para parcelar o lance?",
      resposta: (
        <>
          Na maioria dos leilões da Receita Federal, o pagamento é à vista via DARF, no prazo
          estabelecido no edital (geralmente de 5 a 10 dias úteis após o arremate). Parcelamento
          é raro e, quando existe, está descrito explicitamente no edital. Não presuma que haverá
          parcelamento — confirme no edital oficial antes de dar o lance.
        </>
      ),
    },
    {
      pergunta: "Posso visitar ou inspecionar o bem antes de dar o lance?",
      resposta: (
        <>
          Depende do edital. Alguns leilões permitem vistoria prévia em data e horário marcados
          (o edital informa onde e quando). Outros não permitem acesso ao bem antes do arremate.
          Mesmo quando a vistoria é permitida, você vê o bem “no estado em que se encontra” — sem
          garantia de funcionamento. Confira a cláusula de vistoria no edital antes de qualquer
          decisão.
        </>
      ),
    },
    {
      pergunta: "Quanto é a comissão do leiloeiro?",
      resposta: (
        <>
          Nos leilões da Receita Federal conduzidos pelo Sistema de Leilão Eletrônico (SLE), a
          comissão do leiloeiro oficial é geralmente de 5% sobre o valor do arremate, cobrada do
          arrematante. Esse percentual é uma referência comum; o valor exato consta no edital de
          cada lote. Confirme no edital antes de calcular seu lance máximo.
        </>
      ),
    },
    {
      pergunta: "Leilão da Receita Federal é confiável?",
      resposta: (
        <>
          O leilão é realizado por leiloeiros oficiais habilitados pela Receita Federal, com
          editais publicados no site oficial do governo. Os dados são públicos e rastreáveis. O
          risco não está na idoneidade do órgão, mas nas características do bem: ele é vendido sem
          garantia, “no estado em que se encontra”. Quem avalia o risco do lote é você — com base
          no edital, nas fotos disponíveis e, quando permitido, na vistoria.
        </>
      ),
    },
    {
      pergunta: "O que acontece se eu ganhar o lance e não pagar?",
      resposta: (
        <>
          O arrematante que não pagar dentro do prazo do edital perde o direito ao lote e pode
          ser impedido de participar de futuros leilões da Receita Federal, além de responder
          pelas penalidades previstas no edital. Só dê o lance se tiver certeza de que pode pagar
          no prazo. Os termos exatos estão no edital — confirme antes de propor.
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
          .guia-comprar-header { padding-left: 20px !important; padding-right: 20px !important; }
          .guia-comprar-main   { padding-left: 20px !important; padding-right: 20px !important; }
          .guia-comprar-footer { padding-left: 20px !important; padding-right: 20px !important; }
        }
      `}</style>

      {/* ── Cabeçalho ────────────────────────────────────────────────────── */}
      <header
        className="guia-comprar-header"
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
            ← Guias
          </a>
          <a href="/entrar" className="btn btn--accent btn--sm">
            Começar grátis
          </a>
        </nav>
      </header>

      {/* ── Conteúdo principal ───────────────────────────────────────────── */}
      <main
        className="guia-comprar-main"
        style={{
          flex: 1,
          maxWidth: "760px",
          width: "100%",
          margin: "0 auto",
          padding: "60px 28px 100px",
        }}
      >
        <article itemScope itemType="https://schema.org/HowTo">

          {/* Herói */}
          <header style={{ marginBottom: "48px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
              <a href="/guias" className="link small" style={{ fontSize: "13px" }}>
                Central de guias
              </a>
              <span style={{ color: "var(--t-low)", fontSize: "13px" }} aria-hidden="true">›</span>
              <span className="small" style={{ color: "var(--t-low)", fontSize: "13px" }}>
                Como comprar
              </span>
            </div>

            <span className="eyebrow" style={{ display: "block", marginBottom: "14px" }}>
              Guia completo · passo a passo · 2026
            </span>

            <h1
              itemProp="name"
              style={{
                fontSize: "clamp(26px, 6vw, 38px)",
                fontWeight: 800,
                letterSpacing: "-0.03em",
                lineHeight: 1.1,
                marginBottom: "20px",
              }}
            >
              Como comprar em leilão da Receita Federal
            </h1>

            <P>
              A Receita Federal leiloa, periodicamente, mercadorias apreendidas em alfândegas e
              portos (como eletrônicos, roupas, bebidas e veículos) e bens abandonados por
              importadores. Os leilões são realizados de forma eletrônica pelo{" "}
              <strong style={{ color: "var(--t-hi)" }}>
                Sistema de Leilão Eletrônico (SLE)
              </strong>
              , acessível a qualquer pessoa física ou jurídica com conta gov.br ativa e
              habilitação no sistema.
            </P>

            <P>
              Este guia explica o processo do zero: onde achar os editais, como se habilitar,
              como dar o lance e o que fazer depois do arremate. Ao final, um FAQ responde as
              dúvidas mais comuns.{" "}
              <strong style={{ color: "var(--t-hi)" }}>
                Confirme sempre os detalhes no edital oficial antes de qualquer ação.
              </strong>
            </P>

            <Info>
              <strong style={{ color: "var(--t-hi)" }}>Quem pode participar:</strong> pessoa
              física com CPF e conta gov.br nível prata ou ouro, ou pessoa jurídica com CNPJ.
              Alguns lotes têm restrições específicas de participação — leia o edital de cada
              lote com atenção.
            </Info>
          </header>

          {/* Seção passo a passo */}
          <section aria-labelledby="passos-heading" style={{ marginBottom: "56px" }}>
            <h2
              id="passos-heading"
              style={{
                fontSize: "clamp(20px, 4vw, 26px)",
                fontWeight: 800,
                letterSpacing: "-0.025em",
                marginBottom: "32px",
                color: "var(--t-hi)",
              }}
              itemProp="step"
            >
              Passo a passo: do edital ao arremate
            </h2>

            <Passo num={1} titulo="Achar o edital no site da Receita Federal">
              <P>
                Os editais de leilão são publicados no portal oficial da Receita Federal
                (receita.fazenda.gov.br) e no Sistema de Leilão Eletrônico (SLE). Cada edital
                contém: descrição dos lotes, lance mínimo, quem pode participar, prazo para
                propostas e condições de pagamento. Leia o edital completo antes de qualquer
                passo seguinte — é o único documento juridicamente válido.
              </P>
              <P>
                A{" "}
                <strong style={{ color: "var(--t-hi)" }}>Fonte.ia</strong> reúne os lotes do SLE
                em um único lugar com dados organizados (lance mínimo, prazo, elegibilidade PF/PJ)
                e score de oportunidade por regra — mas o edital original sempre fica linkado para
                você conferir na fonte.
              </P>
            </Passo>

            <Passo num={2} titulo="Ler o edital e analisar o lote com atenção">
              <P>
                Antes de se habilitar, leia o edital inteiro. Preste atenção em: condição do bem
                (geralmente “no estado em que se encontra”, sem garantia), quem pode arrematar,
                se há restrição de CNPJ ou atividade, prazo de retirada, local de guarda do bem
                e se há custos de armazenagem adicionais.
              </P>
              <Warn>
                <strong style={{ color: "var(--t-hi)" }}>
                  Bem comprado “no estado em que se encontra”:
                </strong>{" "}
                nos leilões da Receita Federal, o arrematante aceita o bem como ele está —
                sem garantia de funcionamento, sem nota fiscal do fabricante e sem direito de
                devolução. Avalie os riscos antes de dar o lance.
              </Warn>
              <P>
                Anote também os custos que virão depois do arremate: comissão do leiloeiro
                (geralmente 5%), possíveis tributos, transporte e eventual conserto. Nossa{" "}
                <a href="/ferramentas/calculadora-lance" className="link">
                  calculadora gratuita de lance
                </a>{" "}
                ajuda a calcular qual o máximo que compensa dar.
              </P>
            </Passo>

            <Passo num={3} titulo="Habilitar-se no SLE com conta gov.br">
              <P>
                Para participar, você precisa de uma conta{" "}
                <strong style={{ color: "var(--t-hi)" }}>gov.br nível prata ou ouro</strong>{" "}
                (identidade verificada). Acesse o Sistema de Leilão Eletrônico, faça login com a
                conta gov.br e complete o cadastro de habilitação — geralmente informando dados
                pessoais e aceitando os termos do edital específico.
              </P>
              <P>
                Atenção ao prazo: a habilitação costuma ter data limite antes do encerramento das
                propostas. Faça isso com antecedência — não deixe para o último dia.
              </P>
            </Passo>

            <Passo num={4} titulo="Dar o lance (proposta) dentro do prazo">
              <P>
                Com a habilitação aprovada, acesse o lote no SLE e registre sua proposta dentro
                do prazo indicado no edital. A maioria dos leilões eletrônicos da Receita aceita
                propostas em valor fixo (você informa o lance que toparia pagar) ou em sessão ao
                vivo — o formato é indicado no edital.
              </P>
              <P>
                Não existe obrigação de ser o lance mais alto para ganhar em todos os formatos:
                leia as regras do edital sobre critério de desempate e eventual fase de lances em
                tempo real.
              </P>
            </Passo>

            <Passo num={5} titulo="Se ganhar: pagar via DARF dentro do prazo">
              <P>
                O vencedor é notificado pelo SLE. O pagamento é feito por{" "}
                <strong style={{ color: "var(--t-hi)" }}>DARF</strong> (Documento de Arrecadação
                de Receitas Federais), gerado pelo próprio sistema, dentro do prazo determinado
                no edital (geralmente entre 5 e 10 dias úteis). Inclua no cálculo a comissão do
                leiloeiro, que normalmente é paga separadamente ou embutida no mesmo documento —
                confira o edital.
              </P>
              <Warn>
                Não pagar no prazo implica perda do arremate e possibilidade de impedimento em
                futuros leilões da Receita. Só dê o lance se tiver certeza de que pode pagar.
              </Warn>
            </Passo>

            <Passo num={6} titulo="Retirar o bem no local e prazo indicados">
              <P>
                Após a confirmação do pagamento, você receberá as instruções para retirada. O
                bem fica no local de guarda (alfândega, armazém, pátio) e deve ser retirado
                dentro do prazo do edital. Custos de armazenagem por atraso na retirada podem
                incidir — verifique no edital.
              </P>
              <P>
                Planeje a logística com antecedência: transporte, equipe para retirada e eventual
                seguro para o trajeto. Bem retirado com atraso pode gerar custos extras que
                corroem a vantagem do lance.
              </P>
            </Passo>
          </section>

          {/* Riscos e cuidados */}
          <section aria-labelledby="riscos-heading" style={{ marginBottom: "56px" }}>
            <h2
              id="riscos-heading"
              style={{
                fontSize: "clamp(18px, 4vw, 24px)",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                marginBottom: "20px",
                color: "var(--t-hi)",
              }}
            >
              Riscos e cuidados antes de dar o lance
            </h2>

            <ul
              style={{
                paddingLeft: "22px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                marginBottom: "20px",
              }}
            >
              {[
                "O bem é vendido sem garantia. Eletrônicos podem não funcionar, veículos podem ter vícios ocultos.",
                "Vistoria prévia nem sempre é permitida — e quando é, você vê o estado externo, não garante funcionamento.",
                "Custos além do lance: comissão do leiloeiro (~5%), possíveis tributos, transporte, armazenagem por atraso e eventual conserto.",
                "Lotes com muitos itens: se apenas parte da quantidade estiver em bom estado, o valor real pode ser menor que o esperado.",
                "Prazo de retirada curto: se você não puder buscar o bem a tempo, pode perder o que pagou ou pagar armazenagem.",
                "Restrições legais: alguns bens têm impedimento de uso ou revenda (ex.: mercadorias sem nota fiscal de origem). Leia o edital.",
              ].map((item) => (
                <li key={item} style={{ fontSize: "15px", lineHeight: 1.7, color: "var(--t-mid)" }}>
                  {item}
                </li>
              ))}
            </ul>

            <Info>
              <strong style={{ color: "var(--t-hi)" }}>Regra de ouro:</strong> nunca dê o lance
              no limite do valor de mercado. Inclua todos os custos extras na conta e preserve uma
              margem de segurança. Use a{" "}
              <a href="/ferramentas/calculadora-lance" className="link">
                calculadora de lance
              </a>{" "}
              para não perder essa conta de vista.
            </Info>
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

          {/* Bloco Fonte.ia */}
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
              Todos os lotes do SLE reunidos, com análise e alertas de prazo
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
              A Fonte.ia organiza cada lote da Receita Federal com dados oficiais — lance
              mínimo, prazo, elegibilidade PF/PJ e score por regra. O edital original fica
              linkado para você conferir na fonte. Sem inventar dado, sem prometer lucro.
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
              Ver os lotes com Raio-X de IA
              <ArrowRight size={16} aria-hidden="true" />
            </a>
            <p className="muted" style={{ fontSize: "12px", marginTop: "12px" }}>
              7 dias grátis · sem contrato · dados rastreáveis à fonte oficial
            </p>
          </div>

          {/* Links relacionados */}
          <nav aria-label="Guias relacionados" style={{ borderTop: "1px solid var(--border)", paddingTop: "28px" }}>
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
                href="/guias/leilao-receita-vs-judicial"
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
                Leilão da Receita vs judicial vs banco
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
            </div>
          </nav>

        </article>
      </main>

      {/* ── Rodapé ───────────────────────────────────────────────────────── */}
      <footer
        className="guia-comprar-footer"
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
          <a href="/guias/leilao-receita-vs-judicial" className="link small">
            Receita vs judicial
          </a>
          <a href="/ferramentas/calculadora-lance" className="link small">
            Calculadora
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
