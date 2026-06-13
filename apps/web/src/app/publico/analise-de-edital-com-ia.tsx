import { useState } from "react";
import {
  ChevronDown,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  FileText,
  Clock,
  DollarSign,
  Users,
  BookOpen,
  Zap,
} from "lucide-react";
import {
  useSeo,
  faqJsonLd,
  articleJsonLd,
  breadcrumbJsonLd,
  SITE_URL,
} from "../../lib/seo";

/* ── LogoMark ─────────────────────────────────────────────────────────────── */
function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect x="16" y="15" width="7.6" height="34" rx="3.8" fill="currentColor" />
      <rect x="16" y="15" width="25" height="7.6" rx="3.8" fill="currentColor" />
      <rect x="16" y="28.6" width="17.5" height="7.6" rx="3.8" fill="currentColor" />
      <circle cx="47" cy="18.8" r="5" style={{ fill: "var(--accent-ink)" }} />
    </svg>
  );
}

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

/* ── Card de o que a IA extrai ────────────────────────────────────────────── */
function ExtracaoCard({
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
        gap: "10px",
        padding: "20px",
      }}
    >
      <div
        style={{
          width: "38px",
          height: "38px",
          borderRadius: "10px",
          background: "linear-gradient(135deg, var(--brand), var(--accent))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          flexShrink: 0,
        }}
        aria-hidden="true"
      >
        {icon}
      </div>
      <p style={{ fontWeight: 700, fontSize: "15px", color: "var(--t-hi)", margin: 0 }}>
        {titulo}
      </p>
      <p style={{ fontSize: "13.5px", lineHeight: 1.65, color: "var(--t-low)", margin: 0 }}>
        {descricao}
      </p>
    </div>
  );
}

/* ── Bloco "antes vs depois" ──────────────────────────────────────────────── */
function Comparacao({
  titulo,
  antes,
  depois,
}: {
  titulo: string;
  antes: string;
  depois: string;
}) {
  return (
    <div
      style={{
        marginBottom: "16px",
        borderRadius: "12px",
        overflow: "hidden",
        border: "1px solid var(--border)",
      }}
    >
      <div
        style={{
          padding: "10px 16px",
          background: "var(--surface)",
          fontSize: "12px",
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--t-low)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        {titulo}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
        <div
          style={{
            padding: "14px 16px",
            fontSize: "14px",
            lineHeight: 1.65,
            color: "var(--t-mid)",
            borderRight: "1px solid var(--border)",
            background: "color-mix(in srgb, #ef4444 4%, transparent)",
          }}
        >
          <div
            style={{
              fontSize: "10px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#ef4444",
              marginBottom: "6px",
            }}
          >
            Sem a Fonte.ia
          </div>
          {antes}
        </div>
        <div
          style={{
            padding: "14px 16px",
            fontSize: "14px",
            lineHeight: 1.65,
            color: "var(--t-mid)",
            background: "color-mix(in srgb, var(--accent) 4%, transparent)",
          }}
        >
          <div
            style={{
              fontSize: "10px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--accent-ink)",
              marginBottom: "6px",
            }}
          >
            Com a Fonte.ia
          </div>
          {depois}
        </div>
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
export function AnaliseEditalIAPage() {
  const TITLE =
    "Análise de Edital com IA: entenda as letras miúdas do leilão em linguagem simples | Fonte.ia";
  const DESCRIPTION =
    "A Fonte.ia lê o PDF do edital de leilão da Receita Federal com IA e resume em linguagem de leigo: quem pode participar, datas, como pagar, riscos e o que conferir antes do lance. Apoio à leitura — confirme sempre no edital oficial.";

  useSeo({
    title: TITLE,
    description: DESCRIPTION,
    canonicalPath: "/analise-de-edital-com-ia",
    jsonLd: [
      articleJsonLd({
        title: TITLE,
        description: DESCRIPTION,
        url: SITE_URL + "/analise-de-edital-com-ia",
        datePublished: "2026-06-13",
      }),
      faqJsonLd([
        {
          question: "A análise de IA substitui a leitura do edital?",
          answer:
            "Não. A análise é um apoio à leitura: ela resume os pontos principais em linguagem de leigo e aponta o que verificar, mas o edital original é o documento juridicamente válido. A Fonte.ia sempre linka o edital da Receita Federal para você conferir na fonte.",
        },
        {
          question: "A IA pode errar na interpretação do edital?",
          answer:
            "Sim. Tecnologia de linguagem natural não é infalível, especialmente em documentos técnicos com linguagem jurídico-administrativa. Por isso, a plataforma sempre apresenta o trecho original do edital junto com o resumo, para você comparar e decidir com base na fonte. Não use o resumo como única referência para uma decisão financeira.",
        },
        {
          question: "Isso é um parecer jurídico?",
          answer:
            "Não. A análise de edital da Fonte.ia é uma ferramenta de leitura assistida por IA — não é consultoria jurídica, não substitui advogado e não tem valor legal. Se o lote envolver valores altos ou situação jurídica complexa, consulte um profissional.",
        },
        {
          question: "A Fonte.ia acessa todos os editais do SLE?",
          answer:
            "A plataforma monitora os editais publicados no Sistema de Leilão Eletrônico (SLE) da Receita Federal. O processamento com IA é feito após a publicação oficial. Novos editais são indexados automaticamente quando disponíveis no SLE.",
        },
        {
          question: "Qual o custo da análise de edital?",
          answer:
            "A análise de edital com IA está incluída nos planos pagos da Fonte.ia. Há um período de 7 dias grátis para testar a plataforma sem compromisso. Consulte a página de planos para os valores atuais.",
        },
      ]),
      breadcrumbJsonLd([
        { name: "Início", url: SITE_URL + "/" },
        { name: "Análise de Edital com IA", url: SITE_URL + "/analise-de-edital-com-ia" },
      ]),
    ],
  });

  const FAQ: FaqItemProps[] = [
    {
      pergunta: "A análise de IA substitui a leitura do edital?",
      resposta: (
        <>
          Não. A análise é um{" "}
          <strong style={{ color: "var(--t-hi)" }}>apoio à leitura</strong>, não um substituto.
          Ela resume os pontos principais em linguagem de leigo e destaca o que verificar, mas o
          edital original da Receita Federal é o único documento juridicamente válido. A
          Fonte.ia sempre linka o edital para você conferir na fonte antes de qualquer decisão.
        </>
      ),
    },
    {
      pergunta: "A IA pode errar na interpretação do edital?",
      resposta: (
        <>
          Sim. Modelos de linguagem não são infalíveis, especialmente em documentos com linguagem
          jurídico-administrativa densa. Por isso, a plataforma sempre apresenta o trecho original
          do edital junto com o resumo gerado, para você comparar e decidir com base na fonte.{" "}
          <strong style={{ color: "var(--t-hi)" }}>
            Não use o resumo como única referência para uma decisão financeira.
          </strong>
        </>
      ),
    },
    {
      pergunta: "Isso é um parecer jurídico?",
      resposta: (
        <>
          Não. A análise de edital da Fonte.ia é uma ferramenta de leitura assistida por IA —
          não é consultoria jurídica, não substitui advogado e não tem valor legal. Se o lote
          envolver valores altos ou situação jurídica complexa (restrições de importação,
          situação fiscal do bem, etc.), consulte um profissional habilitado.
        </>
      ),
    },
    {
      pergunta: "A Fonte.ia acessa todos os editais do SLE?",
      resposta: (
        <>
          A plataforma monitora os editais publicados no Sistema de Leilão Eletrônico (SLE) da
          Receita Federal. O processamento com IA é feito após a publicação oficial. Novos editais
          são indexados automaticamente quando disponíveis no SLE. O edital original sempre fica
          linkado para conferência.
        </>
      ),
    },
    {
      pergunta: "Qual o custo da análise de edital?",
      resposta: (
        <>
          A análise de edital com IA está incluída nos planos pagos da Fonte.ia. Há um período de
          7 dias grátis para testar a plataforma sem compromisso e sem precisar de cartão de
          crédito no cadastro. Consulte a página de planos para os valores atuais — a precificação
          pode ter sido atualizada desde que você leu esta página.
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
          .aeia-header      { padding-left: 20px !important; padding-right: 20px !important; }
          .aeia-main        { padding-left: 20px !important; padding-right: 20px !important; }
          .aeia-footer      { padding-left: 20px !important; padding-right: 20px !important; }
          .aeia-grid-3      { grid-template-columns: 1fr 1fr !important; }
          .aeia-comparacao  { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 460px) {
          .aeia-grid-3 { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ── Cabeçalho ───────────────────────────────────────────────────── */}
      <header
        className="aeia-header"
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
        className="aeia-main"
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
              <span className="small" style={{ color: "var(--t-low)", fontSize: "13px" }}>
                Análise de Edital com IA
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px", flexWrap: "wrap" }}>
              <span className="eyebrow">Funcionalidade da Fonte.ia</span>
              <span
                className="badge badge--accent"
                style={{ fontSize: "11px", padding: "3px 9px" }}
              >
                Raio-X com IA
              </span>
            </div>

            <h1
              itemProp="headline"
              style={{
                fontSize: "clamp(24px, 5.5vw, 36px)",
                fontWeight: 800,
                letterSpacing: "-0.03em",
                lineHeight: 1.1,
                marginBottom: "20px",
              }}
            >
              Análise de edital com IA: entenda as letras miúdas em linguagem de leigo
            </h1>

            <P>
              Editais de leilão da Receita Federal podem ter 20, 40 ou mais páginas. Estão escritos
              em linguagem jurídico-administrativa densa — com remissões a normas, cláusulas cruzadas
              e termos técnicos que intimidam quem não tem experiência. O resultado: muita gente
              desiste de participar ou arremata sem entender o que assinou.
            </P>

            <P>
              A Fonte.ia lê o PDF do edital com IA e entrega um resumo em linguagem simples —
              os pontos que você precisava saber antes de dar o lance, sem precisar virar advogado.{" "}
              <strong style={{ color: "var(--t-hi)" }}>
                O edital original sempre fica linkado: a palavra final é sempre a fonte oficial.
              </strong>
            </P>

            <Info>
              <strong style={{ color: "var(--t-hi)" }}>Limite honesto:</strong> a análise é um
              apoio à leitura, não um parecer jurídico. A IA pode errar em documentos complexos.
              Confira sempre o edital original antes de qualquer decisão financeira.
            </Info>
          </header>

          {/* O que a IA extrai */}
          <section aria-labelledby="extrai-heading" style={{ marginBottom: "56px" }}>
            <h2
              id="extrai-heading"
              style={{
                fontSize: "clamp(20px, 4vw, 26px)",
                fontWeight: 800,
                letterSpacing: "-0.025em",
                marginBottom: "16px",
                color: "var(--t-hi)",
              }}
            >
              O que o Raio-X de IA extrai do edital
            </h2>

            <P>
              A plataforma processa o PDF do edital publicado no SLE e organiza as informações em
              blocos separados, cada um com o trecho original do edital para você comparar:
            </P>

            <div
              className="aeia-grid-3"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "12px",
                marginBottom: "24px",
              }}
            >
              <ExtracaoCard
                icon={<Users size={17} />}
                titulo="Quem pode participar"
                descricao="PF, PJ, restrições por ramo de atividade, exigências de habilitação e prazo de cadastro no SLE."
              />
              <ExtracaoCard
                icon={<Clock size={17} />}
                titulo="Datas e prazos"
                descricao="Prazo para habilitação, prazo para proposta, data do resultado e prazo de retirada — tudo em uma linha do tempo."
              />
              <ExtracaoCard
                icon={<DollarSign size={17} />}
                titulo="Como pagar"
                descricao="Forma de pagamento (DARF), prazo após arremate, se há comissão do leiloeiro e quanto é."
              />
              <ExtracaoCard
                icon={<AlertTriangle size={17} />}
                titulo="Riscos do lote"
                descricao="Estado do bem, se há vistoria permitida, restrições de revenda, penalidades por inadimplemento."
              />
              <ExtracaoCard
                icon={<FileText size={17} />}
                titulo="O que conferir"
                descricao="Lista dos pontos que merecem atenção extra antes de dar o lance, com o trecho do edital para verificação."
              />
              <ExtracaoCard
                icon={<Zap size={17} />}
                titulo="Custo total estimado"
                descricao="Lance mínimo + comissão do leiloeiro estimada + frete estimado = custo real aproximado do arremate."
              />
            </div>

            <Warn>
              O custo total estimado é uma referência baseada nos dados do edital — o valor real
              pode variar dependendo do lance vencedor, do frete efetivo e de custos operacionais
              que o edital não detalha. Calcule com folga.
            </Warn>
          </section>

          {/* Antes vs depois */}
          <section aria-labelledby="comparacao-heading" style={{ marginBottom: "56px" }}>
            <h2
              id="comparacao-heading"
              style={{
                fontSize: "clamp(20px, 4vw, 26px)",
                fontWeight: 800,
                letterSpacing: "-0.025em",
                marginBottom: "16px",
                color: "var(--t-hi)",
              }}
            >
              A diferença na prática
            </h2>

            <P>
              Veja como a mesma informação chega sem e com o Raio-X de IA:
            </P>

            <Comparacao
              titulo="Quem pode participar"
              antes="Cláusula 4.1: 'Poderão participar do certame as pessoas físicas e jurídicas que cumprirem as condições estabelecidas neste edital, ressalvadas as restrições constantes do Anexo I, em consonância com o disposto na IN RFB n.º 1.712/2017 e legislação correlata.'"
              depois="Pessoa física com CPF e conta gov.br nível prata ou ouro pode participar. Exceção: veja o Anexo I do edital — alguns lotes têm restrição por tipo de empresa ou ramo de atividade."
            />

            <Comparacao
              titulo="Prazo para pagar"
              antes="Cláusula 9.3: 'O pagamento deverá ser efetuado mediante DARF, com o código de receita correspondente, no prazo de até 10 (dez) dias úteis contados da data da publicação do resultado do certame no sítio eletrônico da Receita Federal do Brasil.'"
              depois="Você tem 10 dias úteis após o resultado para pagar via DARF. O código de receita é gerado pelo próprio SLE."
            />

            <Comparacao
              titulo="O bem tem garantia?"
              antes="Cláusula 6.1: 'Os bens são alienados no estado em que se encontram, não havendo qualquer responsabilidade da União Federal, da Secretaria da Receita Federal do Brasil ou do leiloeiro por vícios redibitórios, aparentes ou ocultos, que os bens possam apresentar.'"
              depois="Sem garantia. O bem é vendido como está. Se não funcionar, não tem devolução. Avalie o risco antes de dar o lance."
            />
          </section>

          {/* Por que ajuda quem tem medo de letras miúdas */}
          <section aria-labelledby="medo-heading" style={{ marginBottom: "56px" }}>
            <h2
              id="medo-heading"
              style={{
                fontSize: "clamp(20px, 4vw, 26px)",
                fontWeight: 800,
                letterSpacing: "-0.025em",
                marginBottom: "16px",
                color: "var(--t-hi)",
              }}
            >
              Por que isso ajuda quem tem medo das "letras miúdas"
            </h2>

            <P>
              A barreira real para a maioria das pessoas não é falta de dinheiro ou de interesse
              em leilões — é a sensação de que o edital "parece armadilha". Dezenas de cláusulas,
              remissões a normas que você nunca viu, linguagem que soa como foi escrita para
              confundir.
            </P>

            <P>
              O Raio-X de IA não remove os riscos reais do leilão — eles existem e são genuínos.
              Mas remove a barreira de linguagem: você entende o que o edital diz, vê os pontos
              de atenção em destaque e chega à decisão de participar (ou não) com informação, não
              com ansiedade de quem não leu nada.
            </P>

            <P>
              Quem lê o resumo da IA e depois confere o edital original toma uma decisão melhor
              do que quem não leu nenhum dos dois — e também melhor do que quem leu só o resumo
              sem verificar a fonte. Por isso a plataforma apresenta sempre o trecho original junto.
            </P>

            <Info>
              <strong style={{ color: "var(--t-hi)" }}>O que a IA não faz:</strong> não avalia
              o estado físico do bem, não substitui vistoria presencial, não é advogado, não
              garante que o resumo está 100% correto. Se o valor em jogo for alto, leia o edital
              completo — o resumo é o ponto de partida, não o ponto de chegada.
            </Info>
          </section>

          {/* Limites honestos */}
          <section aria-labelledby="limites-heading" style={{ marginBottom: "56px" }}>
            <h2
              id="limites-heading"
              style={{
                fontSize: "clamp(18px, 4vw, 24px)",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                marginBottom: "16px",
                color: "var(--t-hi)",
              }}
            >
              O que a análise não cobre — e por que isso importa
            </h2>

            <P>
              Prefiro te dizer isso antes de você começar:
            </P>

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
                "A IA pode interpretar mal cláusulas ambíguas ou com referências cruzadas complexas. O trecho original está sempre junto para você verificar.",
                "O resumo não substitui a leitura do edital completo, especialmente para lotes de alto valor.",
                "A análise não é parecer jurídico e não tem valor legal. Para situações complexas (importação com restrições, bem com histórico fiscal duvidoso), consulte um advogado.",
                "O custo total estimado é uma aproximação — o custo real depende do lance vencedor, do frete efetivo e de variáveis que o edital não detalha.",
                "A plataforma não tem acesso a informações além do edital: não sabe o estado real do bem, não tem fotos adicionais além das que a Receita disponibiliza, não conhece o histórico do lote.",
              ].map((item) => (
                <li key={item} style={{ fontSize: "15px", lineHeight: 1.7, color: "var(--t-mid)" }}>
                  {item}
                </li>
              ))}
            </ul>

            <Warn>
              <strong style={{ color: "var(--t-hi)" }}>
                Sempre confirme no edital oficial da Receita Federal.
              </strong>{" "}
              O link para o documento original está em destaque em cada lote na plataforma.
              Nenhuma análise de IA — nossa ou de qualquer outro serviço — substitui a leitura da
              fonte primária.
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
              Perguntas sobre a análise de edital com IA
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
              Entenda o edital antes de dar o lance
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
              O Raio-X lê o edital, resume em linguagem de leigo e aponta o que verificar — com o
              trecho original sempre linkado. Sem prometer o que não pode cumprir, sem substituir
              a sua leitura.
            </p>
            <a
              href="/entrar"
              className="btn btn--accent btn--lg"
              style={{
                minWidth: "220px",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                textDecoration: "none",
                minHeight: "48px",
              }}
            >
              Testar grátis por 7 dias
              <ArrowRight size={16} aria-hidden="true" />
            </a>
            <p className="muted" style={{ fontSize: "12px", marginTop: "12px" }}>
              Sem cartão de crédito no cadastro · cancele quando quiser
            </p>
          </div>

          {/* Links relacionados */}
          <nav
            aria-label="Conteúdo relacionado"
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
                O que são os leilões da Receita Federal
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
                Como comprar passo a passo
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
                href="/glossario-leiloes"
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
                Glossário de termos
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
                FAQ
              </a>
              <a
                href="/guias/leilao-receita-vs-judicial"
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
                Receita vs judicial vs banco
              </a>
            </div>
          </nav>

        </article>
      </main>

      {/* ── Rodapé ──────────────────────────────────────────────────────── */}
      <footer
        className="aeia-footer"
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
