import { useState } from "react";
import { LogoMark } from "../../components/ui/logo-mark";
import {
  ChevronDown,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  BookOpen,
  Bell,
  LogIn,
  FileText,
  Gavel,
  CreditCard,
  Truck,
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
        background: "color-mix(in srgb, var(--warn, #f59e0b) 7%, transparent)",
        border: "1px solid color-mix(in srgb, var(--warn, #f59e0b) 22%, transparent)",
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
        style={{ color: "#d97706", flexShrink: 0, marginTop: "2px" }}
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

/* ── Passo numerado ───────────────────────────────────────────────────────── */
function Passo({
  num,
  titulo,
  icon,
  children,
}: {
  num: number;
  titulo: string;
  icon?: React.ReactNode;
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
        {icon ?? num}
      </div>
      <div style={{ flex: 1 }}>
        <h3
          style={{
            fontSize: "17px",
            fontWeight: 700,
            color: "var(--t-hi)",
            marginBottom: "10px",
            lineHeight: 1.35,
          }}
        >
          {titulo}
        </h3>
        {children}
      </div>
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

/* ── Página principal ─────────────────────────────────────────────────────── */
export function ComoParticiparPage() {
  const TITLE =
    "Como participar do leilão da Receita Federal: passo a passo completo (2026) | Fonte.ia";
  const DESCRIPTION =
    "Guia prático para quem nunca participou: como criar ou elevar sua conta gov.br, habilitar-se no SLE, ler o edital, dar o lance, pagar o DARF e retirar o bem. Com cuidados em cada etapa e FAQ com 6 perguntas.";

  useSeo({
    title: TITLE,
    description: DESCRIPTION,
    canonicalPath: "/como-participar-leilao-receita-federal",
    jsonLd: [
      articleJsonLd({
        title: TITLE,
        description: DESCRIPTION,
        url: SITE_URL + "/como-participar-leilao-receita-federal",
        datePublished: "2026-06-13",
      }),
      faqJsonLd([
        {
          question: "Preciso de conta gov.br para participar do leilão da Receita?",
          answer:
            "Sim. O Sistema de Leilão Eletrônico (SLE) exige login com conta gov.br nível prata ou ouro — ou seja, com identidade verificada. Conta bronze (sem verificação) não é aceita. Você consegue elevar o nível pela Central gov.br usando seu CPF e documentos de identidade.",
        },
        {
          question: "Qual a diferença entre conta gov.br prata e ouro para o leilão?",
          answer:
            "Ambas os níveis permitem acesso ao SLE. A diferença está no método de verificação: prata é obtida com biometria facial ou validação bancária; ouro exige reconhecimento presencial em cartório ou por Certificado Digital. Para a maioria dos lotes da Receita Federal, o nível prata é suficiente — verifique no edital se há exigência diferente.",
        },
        {
          question: "Quanto custa participar do leilão da Receita Federal?",
          answer:
            "Não há taxa para se habilitar ou dar o lance. O custo surge apenas se você arrematar: você paga o valor do lance mais a comissão do leiloeiro (geralmente 5% sobre o arremate). Além disso, há custos de retirada (transporte, eventual armazenagem por atraso) que o edital detalha. Calcule tudo antes de dar o lance.",
        },
        {
          question: "Posso participar de vários lotes ao mesmo tempo?",
          answer:
            "Em geral sim — o SLE permite se habilitar em mais de um lote no mesmo edital ou em editais diferentes. A restrição prática é financeira: se você ganhar todos os lotes em que deu lance, terá que pagar todos dentro do prazo. Só participe de lotes para os quais você tem capital disponível.",
        },
        {
          question: "O que acontece se eu ganhar o lance e não retirar o bem no prazo?",
          answer:
            "O edital define o prazo de retirada após a confirmação do pagamento. Se você atrasar, pode incidir cobrança de armazenagem que reduz ou elimina o ganho do negócio. Em casos extremos, o bem pode ser devolvido ao órgão. Leia o prazo e o local de retirada no edital antes de arrematar e planeje a logística com antecedência.",
        },
        {
          question: "A Fonte.ia ajuda em qual parte do processo?",
          answer:
            "A Fonte.ia atua na etapa de busca e análise: reúne os lotes do SLE em um painel, organiza lance mínimo, prazo, elegibilidade PF/PJ e entrega um Raio-X com IA que resume os pontos críticos do edital em linguagem de leigo. A habilitação e o lance são feitos por você diretamente no SLE — a plataforma não intervém no processo oficial, apenas ajuda você a chegar preparado.",
        },
      ]),
      breadcrumbJsonLd([
        { name: "Início", url: SITE_URL + "/" },
        { name: "Como participar do leilão da Receita Federal", url: SITE_URL + "/como-participar-leilao-receita-federal" },
      ]),
    ],
  });

  const FAQ: FaqItemProps[] = [
    {
      pergunta: "Preciso de conta gov.br para participar do leilão da Receita?",
      resposta: (
        <>
          Sim. O Sistema de Leilão Eletrônico (SLE) exige login com conta gov.br{" "}
          <strong style={{ color: "var(--t-hi)" }}>nível prata ou ouro</strong> — com identidade
          verificada. Conta bronze não é aceita. Você eleva o nível pela Central gov.br usando CPF
          e documentos de identidade. O processo é online e, na maioria dos casos, leva menos de
          10 minutos.
        </>
      ),
    },
    {
      pergunta: "Qual a diferença entre conta gov.br prata e ouro para o leilão?",
      resposta: (
        <>
          Ambos os níveis dão acesso ao SLE. A diferença está no método de verificação: prata é
          obtida com biometria facial ou validação bancária; ouro exige reconhecimento presencial
          em cartório ou Certificado Digital ICP-Brasil. Para a maioria dos lotes da Receita
          Federal, o nível prata é suficiente — mas confirme no edital se há exigência diferente.
        </>
      ),
    },
    {
      pergunta: "Quanto custa participar do leilão da Receita Federal?",
      resposta: (
        <>
          Não há taxa para se habilitar ou dar o lance. O custo surge apenas se você arrematar:
          você paga o valor do lance mais a{" "}
          <strong style={{ color: "var(--t-hi)" }}>comissão do leiloeiro</strong> (geralmente 5%
          sobre o arremate). Além disso, há custos de retirada — transporte, eventual armazenagem
          por atraso — que o edital detalha. Calcule tudo antes de dar o lance com nossa{" "}
          <a href="/ferramentas/calculadora-lance" className="link">
            calculadora gratuita
          </a>
          .
        </>
      ),
    },
    {
      pergunta: "Posso participar de vários lotes ao mesmo tempo?",
      resposta: (
        <>
          Em geral sim — o SLE permite se habilitar em mais de um lote no mesmo edital ou em
          editais diferentes. A restrição é prática e financeira: se você ganhar todos os lotes em
          que deu lance, precisará pagar todos dentro do prazo. Só participe de lotes para os
          quais você tem capital disponível e logística de retirada resolvida.
        </>
      ),
    },
    {
      pergunta: "O que acontece se eu ganhar o lance e não retirar o bem no prazo?",
      resposta: (
        <>
          O edital define o prazo de retirada após a confirmação do pagamento. Atrasos podem gerar
          cobrança de armazenagem que reduz ou elimina o ganho do negócio. Em casos extremos, o
          bem pode ser devolvido ao órgão. Leia o prazo e o local de retirada no edital antes de
          arrematar e{" "}
          <strong style={{ color: "var(--t-hi)" }}>planeje a logística com antecedência</strong>.
        </>
      ),
    },
    {
      pergunta: "A Fonte.ia ajuda em qual parte do processo?",
      resposta: (
        <>
          A Fonte.ia atua na etapa de busca e análise: reúne os lotes do SLE em um painel,
          organiza lance mínimo, prazo e elegibilidade PF/PJ, e entrega um Raio-X com IA que
          resume os pontos críticos do edital em linguagem de leigo. A habilitação e o lance são
          feitos por você diretamente no SLE — a plataforma não intervém no processo oficial,
          apenas ajuda você a chegar preparado.
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
          .cpp-header { padding-left: 20px !important; padding-right: 20px !important; }
          .cpp-main   { padding-left: 20px !important; padding-right: 20px !important; }
          .cpp-footer { padding-left: 20px !important; padding-right: 20px !important; }
        }
      `}</style>

      {/* ── Cabeçalho ───────────────────────────────────────────────────── */}
      <header
        className="cpp-header"
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
        className="cpp-main"
        style={{
          flex: 1,
          maxWidth: "760px",
          width: "100%",
          margin: "0 auto",
          padding: "60px 28px 100px",
        }}
      >
        <article itemScope itemType="https://schema.org/HowTo">

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
                Como participar
              </span>
            </div>

            <span className="eyebrow" style={{ display: "block", marginBottom: "14px" }}>
              Guia prático · passo a passo · 2026
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
              Como participar do leilão da Receita Federal
            </h1>

            <P>
              Os leilões da Receita Federal são realizados de forma eletrônica pelo{" "}
              <strong style={{ color: "var(--t-hi)" }}>
                Sistema de Leilão Eletrônico (SLE)
              </strong>{" "}
              — qualquer pessoa física com CPF ou empresa com CNPJ pode participar, sem precisar
              de corretor ou intermediário. Mas o processo exige alguns passos específicos antes de
              você dar o primeiro lance.
            </P>

            <P>
              Este guia mostra cada etapa do processo, do cadastro na conta gov.br até a retirada
              do bem, com os cuidados reais que você precisa ter em cada passo.{" "}
              <strong style={{ color: "var(--t-hi)" }}>
                Confirme sempre os detalhes no edital oficial antes de qualquer ação.
              </strong>
            </P>

            <Info>
              <strong style={{ color: "var(--t-hi)" }}>Pré-requisito:</strong> conta gov.br
              nível prata ou ouro (com identidade verificada). Se você ainda não tem, o Passo 1
              abaixo explica como criar ou elevar o nível. Conta bronze não é aceita pelo SLE.
            </Info>
          </header>

          {/* Passo a passo */}
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
            >
              Passo a passo: do cadastro ao arremate
            </h2>

            <Passo num={1} titulo="Criar ou elevar sua conta gov.br para prata ou ouro" icon={<LogIn size={18} />}>
              <P>
                Acesse{" "}
                <strong style={{ color: "var(--t-hi)" }}>gov.br/conta-gov-br</strong> e crie sua
                conta com CPF. Se você já tem conta bronze, eleve para prata com um destes
                métodos: biometria facial pelo aplicativo gov.br, validação via internet banking de
                banco conveniado (Banco do Brasil, Caixa, Itaú, Bradesco, Santander e outros), ou
                validação com Certificado Digital.
              </P>
              <P>
                O nível ouro exige reconhecimento presencial em cartório ou uso de Certificado
                Digital ICP-Brasil. Para a maioria dos lotes, o nível prata já é suficiente.
              </P>
              <Warn>
                Não tente participar do leilão com conta bronze — o SLE simplesmente não permite
                a habilitação. Faça a elevação de nível antes de procurar os lotes, para não
                perder o prazo de habilitação de um edital de interesse.
              </Warn>
            </Passo>

            <Passo num={2} titulo="Habilitar-se no Sistema de Leilão Eletrônico (SLE)" icon={<FileText size={18} />}>
              <P>
                Acesse o SLE (leiloes.receita.fazenda.gov.br) e faça login com sua conta gov.br.
                No primeiro acesso, complete o cadastro de arrematante: dados pessoais, endereço e
                aceite dos termos gerais de uso. Esse cadastro é feito uma vez e vale para todos
                os leilões futuros.
              </P>
              <P>
                Para cada lote específico que você queira disputar, ainda será necessário aceitar
                os termos do edital daquele lote — o SLE chama essa etapa de "habilitação no
                lote". Ela tem prazo próprio, indicado no edital.
              </P>
              <Info>
                A habilitação no lote tem prazo de encerramento antes do prazo de propostas. Não
                deixe para o último dia — faça a habilitação com pelo menos 24 horas de
                antecedência para evitar problemas de sistema.
              </Info>
            </Passo>

            <Passo num={3} titulo="Achar e ler o edital do lote com atenção" icon={<BookOpen size={18} />}>
              <P>
                No SLE, os editais ficam disponíveis na seção de leilões ativos. Cada edital é um
                documento PDF que descreve os lotes, o lance mínimo, quem pode participar, o
                formato da proposta (valor fixo ou sessão ao vivo), prazo de habilitação, prazo de
                propostas, condições de pagamento e local de retirada.
              </P>
              <P>
                Antes de dar o lance, leia o edital completo. Verifique especificamente: há
                restrição de participação (apenas PJ, apenas determinado setor)? O bem pode ser
                vistoriado antes? Qual o prazo de retirada? Existem custos de armazenagem por
                atraso?
              </P>
              <Warn>
                Os bens são vendidos{" "}
                <strong style={{ color: "var(--t-hi)" }}>"no estado em que se encontram"</strong>{" "}
                — sem garantia de funcionamento, sem nota fiscal de origem e sem direito de
                devolução. Essa cláusula está em praticamente todos os editais da Receita Federal.
                Avalie o risco antes de decidir o lance.
              </Warn>
              <P>
                A{" "}
                <a href="/leiloes-receita-federal" className="link">
                  Fonte.ia
                </a>{" "}
                reúne os lotes do SLE em um painel com dados organizados (lance mínimo, prazo,
                elegibilidade PF/PJ) e entrega um resumo dos pontos críticos do edital em
                linguagem de leigo — mas o edital original fica sempre linkado para você conferir
                na fonte.
              </P>
            </Passo>

            <Passo num={4} titulo="Calcular o lance máximo que faz sentido" icon={<Gavel size={18} />}>
              <P>
                O lance mínimo é o piso — não o preço justo. Antes de definir o valor da sua
                proposta, some todos os custos reais do arremate:{" "}
                <strong style={{ color: "var(--t-hi)" }}>
                  lance + comissão do leiloeiro (~5%) + frete ou transporte + eventual conserto
                </strong>
                . Compare esse total com o valor de mercado do bem em bom estado — e preserve uma
                margem de segurança, porque o bem pode não estar em bom estado.
              </P>
              <P>
                Nossa{" "}
                <a href="/ferramentas/calculadora-lance" className="link">
                  calculadora gratuita de lance
                </a>{" "}
                ajuda a fazer essa conta sem errar nenhum item.
              </P>
              <Info>
                Nunca dê o lance no limite do valor de mercado. Você está comprando um bem sem
                garantia, em local que pode estar a centenas de quilômetros, com prazo de retirada
                curto. Preserve margem suficiente para imprevistos.
              </Info>
            </Passo>

            <Passo num={5} titulo="Registrar a proposta dentro do prazo" icon={<Gavel size={18} />}>
              <P>
                Com a habilitação aprovada no lote, acesse o SLE e registre sua proposta dentro do
                prazo indicado no edital. O formato varia: pode ser proposta em valor fixo (você
                informa o máximo que toparia pagar e o sistema distribui o lance) ou sessão ao
                vivo com lances em tempo real, com etapa de lances adicionais para desempate.
              </P>
              <P>
                O edital descreve qual o critério de desempate — geralmente o lance mais alto
                vence; em caso de empate, o SLE pode abrir uma fase de lances adicionais. Leia
                essas regras no edital do lote específico.
              </P>
            </Passo>

            <Passo num={6} titulo="Se vencer: pagar via DARF dentro do prazo" icon={<CreditCard size={18} />}>
              <P>
                O vencedor é notificado pelo SLE. O pagamento é feito por{" "}
                <strong style={{ color: "var(--t-hi)" }}>DARF</strong> (Documento de Arrecadação
                de Receitas Federais), gerado pelo próprio sistema, dentro do prazo determinado no
                edital — geralmente entre 5 e 10 dias úteis após o resultado. A comissão do
                leiloeiro pode ser cobrada em documento separado ou embutida no mesmo DARF — o
                edital esclarece.
              </P>
              <Warn>
                Parcelamento é raro nos leilões da Receita Federal. Quando existe, está descrito
                explicitamente no edital. Não presuma que haverá parcelamento. Só dê o lance se
                tiver o valor disponível para pagar à vista dentro do prazo.
              </Warn>
              <P>
                Não pagar no prazo implica perda do arremate e possibilidade de impedimento em
                futuros leilões da Receita Federal, além de penalidades previstas no edital.
              </P>
            </Passo>

            <Passo num={7} titulo="Retirar o bem no local e prazo indicados" icon={<Truck size={18} />}>
              <P>
                Após a confirmação do pagamento, você receberá as instruções de retirada. O bem
                fica no local de guarda indicado no edital — alfândega, armazém alfandegado ou
                pátio — e deve ser retirado dentro do prazo estabelecido. Custos de armazenagem
                por atraso podem incidir e corroer o ganho do negócio.
              </P>
              <P>
                Planeje a logística com antecedência: verifique o endereço exato, o horário de
                funcionamento do depósito, o tipo de transporte necessário (caminhão, carro de
                passeio, carreta) e se é necessário pessoal para manuseio. Para bens pesados ou
                volumosos, organize o transporte antes de dar o lance.
              </P>
            </Passo>
          </section>

          {/* Resumo de cuidados */}
          <section aria-labelledby="cuidados-heading" style={{ marginBottom: "56px" }}>
            <h2
              id="cuidados-heading"
              style={{
                fontSize: "clamp(18px, 4vw, 24px)",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                marginBottom: "20px",
                color: "var(--t-hi)",
              }}
            >
              Os cuidados mais importantes antes de dar o lance
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
                "Leia o edital inteiro — não apenas o resumo do lote. As restrições e penalidades estão no corpo do documento.",
                "Verifique se o edital permite vistoria prévia. Se sim, use essa oportunidade antes de decidir o lance.",
                "Calcule o custo total real: lance + comissão do leiloeiro + transporte + conserto estimado. Compare com o preço de mercado em bom estado.",
                "Confirme a elegibilidade: alguns lotes aceitam apenas PJ de determinado ramo. Habilitar-se em um lote para o qual você não é elegível desperdiça tempo e pode gerar impedimentos.",
                "Planeje a logística de retirada antes de dar o lance, especialmente para bens em outras estados.",
                "Só lance o que você pode pagar à vista. O prazo de pagamento via DARF não perdoa.",
              ].map((item) => (
                <li key={item} style={{ fontSize: "15px", lineHeight: 1.7, color: "var(--t-mid)" }}>
                  {item}
                </li>
              ))}
            </ul>

            <Info>
              <strong style={{ color: "var(--t-hi)" }}>Leilão tem risco:</strong> o bem é
              vendido sem garantia. A Fonte.ia existe para ajudar você a entender o lote mais
              rápido — não para prometer que o negócio vai ser bom. A decisão e a responsabilidade
              são sempre suas.
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
              Chegue preparado para cada lote da Receita Federal
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
              A Fonte.ia reúne os lotes do SLE, organiza os dados e entrega um Raio-X com IA dos
              pontos críticos do edital — em linguagem de leigo, com o documento original sempre
              linkado. Sem inventar dado, sem prometer lucro.
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
              Ver lotes com Raio-X de IA
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
                className="card card--pad link"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 16px",
                  textDecoration: "none",
                  fontSize: "14px",
                  fontWeight: 600,
                }}
              >
                <BookOpen size={15} aria-hidden="true" />
                O que são os leilões da Receita
              </a>
              <a
                href="/guias/como-comprar-leilao-receita"
                className="card card--pad link"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 16px",
                  textDecoration: "none",
                  fontSize: "14px",
                  fontWeight: 600,
                }}
              >
                <BookOpen size={15} aria-hidden="true" />
                Guia completo de como comprar
              </a>
              <a
                href="/ferramentas/calculadora-lance"
                className="card card--pad link"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 16px",
                  textDecoration: "none",
                  fontSize: "14px",
                  fontWeight: 600,
                }}
              >
                Calculadora de lance (grátis)
              </a>
              <a
                href="/melhores-ferramentas-analisar-leiloes"
                className="card card--pad link"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 16px",
                  textDecoration: "none",
                  fontSize: "14px",
                  fontWeight: 600,
                }}
              >
                <ArrowRight size={15} aria-hidden="true" />
                Ferramentas para analisar lotes
              </a>
              <a
                href="/faq"
                className="card card--pad link"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 16px",
                  textDecoration: "none",
                  fontSize: "14px",
                  fontWeight: 600,
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
        className="cpp-footer"
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
