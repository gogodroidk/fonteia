import { useState } from "react";
import { LogoMark } from "../../components/ui/logo-mark";
import {
  ChevronDown,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  BookOpen,
  Package,
  Car,
  Cpu,
  Wrench,
  Bell,
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

/* ── Card de tipo de bem ──────────────────────────────────────────────────── */
function BemCard({
  icon,
  titulo,
  exemplos,
}: {
  icon: React.ReactNode;
  titulo: string;
  exemplos: string;
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
        {exemplos}
      </p>
    </div>
  );
}

/* ── Passo numerado ───────────────────────────────────────────────────────── */
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
export function LeiloesReceitaFederalPage() {
  const TITLE =
    "Leilões da Receita Federal: o que são, como funcionam e como participar (2026) | Fonte.ia";
  const DESCRIPTION =
    "Guia completo sobre leilões de mercadorias apreendidas e abandonadas da Receita Federal (SLE): tipos de bens, quem pode participar, como funciona o processo do edital ao arremate, e por que usar a Fonte.ia para analisar os lotes com IA.";

  useSeo({
    title: TITLE,
    description: DESCRIPTION,
    canonicalPath: "/leiloes-receita-federal",
    jsonLd: [
      articleJsonLd({
        title: TITLE,
        description: DESCRIPTION,
        url: SITE_URL + "/leiloes-receita-federal",
        datePublished: "2026-06-13",
      }),
      faqJsonLd([
        {
          question: "O que é o leilão da Receita Federal?",
          answer:
            "É a venda pública, conduzida por leiloeiros oficiais habilitados pelo governo, de mercadorias apreendidas em alfândegas, portos e aeroportos e de bens abandonados por importadores. Os leilões são realizados pelo Sistema de Leilão Eletrônico (SLE), acessível a qualquer pessoa física ou jurídica com conta gov.br ativa.",
        },
        {
          question: "Precisa de CNPJ para participar?",
          answer:
            "Não obrigatoriamente. Pessoa física com CPF e conta gov.br nível prata ou ouro pode participar da maioria dos lotes. Alguns lotes têm restrições específicas — por exemplo, apenas pessoa jurídica de determinado ramo. Essa informação consta no edital de cada lote. Confirme antes de se habilitar.",
        },
        {
          question: "Como é feito o pagamento após arrematar?",
          answer:
            "O pagamento é feito via DARF (Documento de Arrecadação de Receitas Federais), gerado pelo próprio SLE, dentro do prazo indicado no edital — geralmente entre 5 e 10 dias úteis após o resultado. Parcelamento é raro; não presuma que haverá. Confirme no edital antes de dar o lance.",
        },
        {
          question: "Os bens têm garantia?",
          answer:
            "Não. Os bens são vendidos 'no estado em que se encontra', sem garantia de funcionamento, sem nota fiscal do fabricante e sem direito de devolução. A responsabilidade pela avaliação do risco é do arrematante. Vistoria prévia é permitida em alguns editais — mas não em todos.",
        },
        {
          question: "Onde ficam os bens e como é a retirada?",
          answer:
            "Os bens ficam no local de guarda indicado no edital — alfândega, armazém alfandegado ou pátio. Após confirmação do pagamento, o arrematante deve retirar o bem dentro do prazo do edital. Atraso na retirada pode gerar custos de armazenagem. Confirme o prazo e o local no edital antes de arrematar.",
        },
        {
          question: "O que a Fonte.ia faz diferente de acessar o SLE direto?",
          answer:
            "A Fonte.ia reúne os lotes do SLE em um único painel, organiza os dados (lance mínimo, prazo, elegibilidade PF/PJ), entrega análise com IA dos pontos de atenção do edital em linguagem de leigo e calcula o custo total estimado do arremate. O edital original fica sempre linkado para você conferir na fonte. Não inventamos dados, não prometemos lucro.",
        },
      ]),
      breadcrumbJsonLd([
        { name: "Início", url: SITE_URL + "/" },
        { name: "Leilões da Receita Federal", url: SITE_URL + "/leiloes-receita-federal" },
      ]),
    ],
  });

  const FAQ: FaqItemProps[] = [
    {
      pergunta: "O que é o leilão da Receita Federal?",
      resposta: (
        <>
          É a venda pública, conduzida por leiloeiros oficiais habilitados pelo governo, de
          mercadorias apreendidas em alfândegas, portos e aeroportos e de bens abandonados por
          importadores. Os leilões são realizados pelo{" "}
          <strong style={{ color: "var(--t-hi)" }}>Sistema de Leilão Eletrônico (SLE)</strong>,
          acessível a qualquer pessoa física ou jurídica com conta gov.br ativa.
        </>
      ),
    },
    {
      pergunta: "Precisa de CNPJ para participar?",
      resposta: (
        <>
          Não obrigatoriamente. Pessoa física com CPF e conta gov.br nível prata ou ouro pode
          participar da maioria dos lotes. Alguns lotes têm restrições específicas — por exemplo,
          apenas pessoa jurídica de determinado ramo ou empresa com licença específica. Essa
          informação consta no edital de cada lote.{" "}
          <strong style={{ color: "var(--t-hi)" }}>Confirme sempre no edital antes de se habilitar.</strong>
        </>
      ),
    },
    {
      pergunta: "Como é feito o pagamento após arrematar?",
      resposta: (
        <>
          O pagamento é feito via{" "}
          <strong style={{ color: "var(--t-hi)" }}>
            DARF (Documento de Arrecadação de Receitas Federais)
          </strong>
          , gerado pelo próprio SLE, dentro do prazo indicado no edital — geralmente entre 5 e 10
          dias úteis após o resultado. Parcelamento é raro e, quando existe, está descrito
          explicitamente no edital. Não presuma que haverá parcelamento: confirme antes de dar o
          lance.
        </>
      ),
    },
    {
      pergunta: "Os bens têm garantia?",
      resposta: (
        <>
          Não. Os bens são vendidos{" "}
          <strong style={{ color: "var(--t-hi)" }}>"no estado em que se encontra"</strong>, sem
          garantia de funcionamento, sem nota fiscal do fabricante e sem direito de devolução. A
          responsabilidade pela avaliação do risco é do arrematante. Vistoria prévia é permitida
          em alguns editais — mas não em todos. Confira a cláusula de vistoria no edital de cada
          lote antes de qualquer decisão.
        </>
      ),
    },
    {
      pergunta: "O que acontece se eu ganhar o lance e não pagar?",
      resposta: (
        <>
          O arrematante que não pagar dentro do prazo perde o direito ao lote e pode ser impedido
          de participar de futuros leilões da Receita Federal, além de responder pelas penalidades
          previstas no edital. Só dê o lance se tiver certeza de que pode pagar no prazo. Os
          termos exatos estão no edital — confirme antes de propor qualquer valor.
        </>
      ),
    },
    {
      pergunta: "A Fonte.ia substitui a leitura do edital?",
      resposta: (
        <>
          Não. A Fonte.ia organiza os dados do lote, entrega um resumo em linguagem de leigo e
          aponta pontos de atenção do edital — mas o documento oficial sempre fica linkado e é ele
          que prevalece juridicamente. Use a plataforma para{" "}
          <strong style={{ color: "var(--t-hi)" }}>entender o lote mais rápido</strong>, não para
          substituir a leitura do edital.
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
          .lrf-header { padding-left: 20px !important; padding-right: 20px !important; }
          .lrf-main   { padding-left: 20px !important; padding-right: 20px !important; }
          .lrf-footer { padding-left: 20px !important; padding-right: 20px !important; }
          .lrf-bens-grid { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 460px) {
          .lrf-bens-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ── Cabeçalho ───────────────────────────────────────────────────── */}
      <header
        className="lrf-header"
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
        className="lrf-main"
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
                Leilões da Receita Federal
              </span>
            </div>

            <span className="eyebrow" style={{ display: "block", marginBottom: "14px" }}>
              Guia completo · 2026
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
              Leilões da Receita Federal: o que são e como participar
            </h1>

            <P>
              A Receita Federal realiza, periodicamente, leilões de mercadorias apreendidas em
              alfândegas, portos e aeroportos e de bens abandonados por importadores. Os leilões
              são abertos ao público — qualquer pessoa física com CPF ou empresa com CNPJ pode
              participar, sem precisar de intermediário — e ocorrem de forma eletrônica pelo{" "}
              <strong style={{ color: "var(--t-hi)" }}>Sistema de Leilão Eletrônico (SLE)</strong>.
            </P>

            <P>
              Esta página explica o que é vendido, quem pode arrematar, como o processo funciona
              do edital ao pagamento, e como a Fonte.ia ajuda você a encontrar e analisar os lotes
              sem precisar vasculhar PDFs de dezenas de páginas.{" "}
              <strong style={{ color: "var(--t-hi)" }}>
                Confira sempre os detalhes no edital oficial antes de qualquer ação.
              </strong>
            </P>

            <Info>
              <strong style={{ color: "var(--t-hi)" }}>Quem pode participar:</strong> pessoa física
              com CPF e conta gov.br nível prata ou ouro, ou pessoa jurídica com CNPJ. Alguns lotes
              têm restrições específicas — leia o edital de cada lote antes de se habilitar.
            </Info>
          </header>

          {/* O que é vendido */}
          <section aria-labelledby="bens-heading" style={{ marginBottom: "56px" }}>
            <h2
              id="bens-heading"
              style={{
                fontSize: "clamp(20px, 4vw, 26px)",
                fontWeight: 800,
                letterSpacing: "-0.025em",
                marginBottom: "16px",
                color: "var(--t-hi)",
              }}
            >
              O que é vendido nos leilões
            </h2>

            <P>
              A composição dos lotes varia a cada edital. O que aparece depende do volume de
              apreensões e do estoque em guarda nos armazéns alfandegados. De forma geral, as
              categorias mais comuns são:
            </P>

            <div
              className="lrf-bens-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "12px",
                marginBottom: "20px",
              }}
            >
              <BemCard
                icon={<Cpu size={18} />}
                titulo="Eletrônicos"
                exemplos="Smartphones, notebooks, tablets, câmeras, componentes de informática"
              />
              <BemCard
                icon={<Car size={18} />}
                titulo="Veículos"
                exemplos="Carros, motos, caminhões e peças automotivas apreendidos"
              />
              <BemCard
                icon={<Package size={18} />}
                titulo="Mercadorias gerais"
                exemplos="Roupas, calçados, brinquedos, cosméticos, bebidas importadas"
              />
              <BemCard
                icon={<Wrench size={18} />}
                titulo="Máquinas e equipamentos"
                exemplos="Equipamentos industriais, ferramentas, máquinas agrícolas"
              />
              <BemCard
                icon={<Package size={18} />}
                titulo="Matérias-primas"
                exemplos="Insumos industriais, produtos químicos, tecidos, embalagens"
              />
              <BemCard
                icon={<Package size={18} />}
                titulo="Outros bens"
                exemplos="Instrumentos musicais, obras de arte, artigos de luxo — varia por edital"
              />
            </div>

            <Warn>
              <strong style={{ color: "var(--t-hi)" }}>
                A composição dos lotes é definida em cada edital.
              </strong>{" "}
              Não existe uma lista fixa de bens disponíveis. Consulte os editais publicados no
              SLE para saber o que está disponível no momento. A Fonte.ia reúne os lotes ativos
              com dados organizados e link para o edital original.
            </Warn>
          </section>

          {/* Como funciona */}
          <section aria-labelledby="como-funciona-heading" style={{ marginBottom: "56px" }}>
            <h2
              id="como-funciona-heading"
              style={{
                fontSize: "clamp(20px, 4vw, 26px)",
                fontWeight: 800,
                letterSpacing: "-0.025em",
                marginBottom: "32px",
                color: "var(--t-hi)",
              }}
            >
              Como funciona o processo
            </h2>

            <Passo num={1} titulo="Publicação do edital">
              <P>
                A Receita Federal publica o edital no portal oficial (receita.fazenda.gov.br) e no
                SLE. O edital descreve os lotes, lance mínimo, quem pode participar, prazos,
                condições de pagamento e retirada. O edital é o único documento juridicamente
                válido — leia-o completo antes de qualquer ação.
              </P>
            </Passo>

            <Passo num={2} titulo="Habilitação no SLE com conta gov.br">
              <P>
                Para participar, você precisa de conta gov.br nível prata ou ouro (com identidade
                verificada). Acesse o SLE, faça login e complete o cadastro de habilitação para o
                lote de interesse — geralmente informando dados pessoais e aceitando os termos do
                edital. Atenção ao prazo: a habilitação tem data limite antes do encerramento das
                propostas. Não deixe para o último dia.
              </P>
            </Passo>

            <Passo num={3} titulo="Análise do edital e cálculo do lance">
              <P>
                Antes de dar o lance, leia com atenção: condição do bem (normalmente sem garantia),
                local de guarda, prazo de retirada, comissão do leiloeiro (geralmente 5% sobre o
                valor do arremate) e eventuais custos de armazenagem. Some todos esses custos ao
                valor que você está disposto a pagar pelo bem — não apenas ao lance mínimo.
              </P>
              <P>
                Nossa{" "}
                <a href="/ferramentas/calculadora-lance" className="link">
                  calculadora gratuita de lance
                </a>{" "}
                ajuda a estimar o custo total e o lance máximo que ainda compensa.
              </P>
            </Passo>

            <Passo num={4} titulo="Registrar a proposta dentro do prazo">
              <P>
                Com a habilitação aprovada, registre sua proposta no SLE dentro do prazo indicado
                no edital. O formato varia: pode ser proposta em valor fixo (você informa o lance
                que toparia pagar) ou sessão ao vivo com lances em tempo real. O edital descreve
                qual o critério de desempate e se há fase de lances adicionais.
              </P>
            </Passo>

            <Passo num={5} titulo="Pagar via DARF se ganhar">
              <P>
                O vencedor é notificado pelo SLE. O pagamento é feito por DARF, gerado pelo
                sistema, dentro do prazo do edital (geralmente 5 a 10 dias úteis). Inclua no
                cálculo a comissão do leiloeiro. Não pagar no prazo implica perda do arremate e
                possível impedimento em futuros leilões.
              </P>
              <Warn>
                Só dê o lance se tiver certeza de que pode pagar no prazo. O edital traz as
                penalidades exatas por inadimplemento.
              </Warn>
            </Passo>

            <Passo num={6} titulo="Retirar o bem no local e prazo indicados">
              <P>
                Após confirmação do pagamento, você recebe as instruções de retirada. O bem fica
                no local de guarda (alfândega, armazém, pátio) e deve ser retirado dentro do prazo
                do edital. Custos de armazenagem por atraso podem incidir. Planeje a logística
                com antecedência: transporte e, quando necessário, equipe para manuseio.
              </P>
            </Passo>
          </section>

          {/* Por que Fonte.ia */}
          <section aria-labelledby="fonteia-heading" style={{ marginBottom: "56px" }}>
            <h2
              id="fonteia-heading"
              style={{
                fontSize: "clamp(20px, 4vw, 26px)",
                fontWeight: 800,
                letterSpacing: "-0.025em",
                marginBottom: "16px",
                color: "var(--t-hi)",
              }}
            >
              Por que usar a Fonte.ia
            </h2>

            <P>
              O SLE é funcional, mas exige que você acesse cada lote individualmente, leia editais
              em PDF de dezenas de páginas e monte sozinho a planilha de custos. A Fonte.ia faz esse
              trabalho pesado por você:
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
                "Painel unificado com todos os lotes ativos do SLE, filtrados por categoria, prazo e elegibilidade PF/PJ.",
                "Raio-X com IA: a plataforma lê o edital e resume em linguagem de leigo os pontos críticos — quem pode participar, datas, forma de pagamento, riscos e o que verificar antes do lance.",
                "Cálculo automático do custo total estimado: lance + comissão + frete estimado, para você saber o custo real antes de propor.",
                "Alertas de prazo: notificações antes do encerramento da habilitação e das propostas.",
                "Rastreabilidade: o edital original da Receita Federal fica sempre linkado. Nenhum dado é inventado.",
              ].map((item) => (
                <li key={item} style={{ fontSize: "15px", lineHeight: 1.7, color: "var(--t-mid)" }}>
                  {item}
                </li>
              ))}
            </ul>

            <Info>
              <strong style={{ color: "var(--t-hi)" }}>Honestidade antes de tudo:</strong> a
              Fonte.ia é apoio à análise, não substitui a leitura do edital e não promete lucro.
              Leilão tem risco — o bem é vendido sem garantia. Usamos IA para te ajudar a
              entender o lote mais rápido, não para criar falsas expectativas.
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
              A plataforma lê o edital, resume os pontos críticos em linguagem de leigo e calcula
              o custo total estimado do arremate. O edital original da Receita Federal fica sempre
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
                Como comprar passo a passo
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
                <ArrowRight size={15} aria-hidden="true" />
                Receita vs judicial vs banco
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
                FAQ completo
              </a>
            </div>
          </nav>

        </article>
      </main>

      {/* ── Rodapé ──────────────────────────────────────────────────────── */}
      <footer
        className="lrf-footer"
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
          <a href="/guias/como-comprar-leilao-receita" className="link small">
            Como comprar
          </a>
          <a href="/ferramentas/calculadora-lance" className="link small">
            Calculadora
          </a>
          <a href="/faq" className="link small">
            FAQ
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
