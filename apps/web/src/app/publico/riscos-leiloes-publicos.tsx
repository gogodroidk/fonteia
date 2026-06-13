import { useState } from "react";
import { AlertTriangle, ShieldCheck, ChevronDown, ArrowRight, BookOpen } from "lucide-react";
import {
  useSeo,
  faqJsonLd,
  articleJsonLd,
  breadcrumbJsonLd,
  SITE_URL,
} from "../../lib/seo";

/* ── LogoMark ────────────────────────────────────────────────────────────── */
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

/* ── Primitivos de texto ─────────────────────────────────────────────────── */
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

/* ── Cartão de risco ─────────────────────────────────────────────────────── */
interface RiscoCardProps {
  titulo: string;
  oque: string;
  protecao: string;
}

function RiscoCard({ titulo, oque, protecao }: RiscoCardProps) {
  return (
    <div
      className="panel"
      style={{ padding: "24px", marginBottom: "16px" }}
    >
      <h3
        style={{
          fontSize: "16px",
          fontWeight: 700,
          color: "var(--t-hi)",
          marginBottom: "12px",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <AlertTriangle
          size={16}
          aria-hidden="true"
          style={{ color: "#d97706", flexShrink: 0 }}
        />
        {titulo}
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <div>
          <span
            style={{
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              color: "var(--t-low)",
              display: "block",
              marginBottom: "4px",
            }}
          >
            O que é
          </span>
          <p style={{ fontSize: "14.5px", lineHeight: 1.65, color: "var(--t-mid)", margin: 0 }}>
            {oque}
          </p>
        </div>
        <div
          style={{
            borderTop: "1px solid var(--border)",
            paddingTop: "10px",
          }}
        >
          <span
            style={{
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              color: "var(--accent-ink)",
              display: "block",
              marginBottom: "4px",
            }}
          >
            Como se proteger
          </span>
          <p style={{ fontSize: "14.5px", lineHeight: 1.65, color: "var(--t-mid)", margin: 0 }}>
            {protecao}
          </p>
        </div>
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

/* ── Dados de FAQ ────────────────────────────────────────────────────────── */
const FAQ_ITEMS: FaqItemProps[] = [
  {
    pergunta: "O leilão da Receita Federal é confiável?",
    resposta: (
      <>
        Sim — os leilões são conduzidos por leiloeiros oficiais habilitados pelo governo e os
        editais são publicados no portal oficial da Receita (receita.fazenda.gov.br). O risco não
        está na idoneidade do órgão, mas no estado do bem: ele é vendido sem garantia, "no estado
        em que se encontra". Quem avalia o risco é você, com base no edital e nas fotos
        disponíveis.
      </>
    ),
  },
  {
    pergunta: "Como identificar um site falso de leilão?",
    resposta: (
      <>
        O site oficial do leilão da Receita Federal usa domínio <strong>.gov.br</strong>. Qualquer
        site fora desse domínio que diz "leilão da Receita" ou "Receita Federal" deve ser tratado
        com desconfiança. Verifique o URL antes de inserir CPF, CNPJ ou dados de pagamento.
        Golpistas criam cópias visuais convincentes — o domínio é a única confirmação válida.
      </>
    ),
  },
  {
    pergunta: "Posso devolver o bem se ele chegar com defeito?",
    resposta: (
      <>
        Não. Nos leilões da Receita Federal, o bem é vendido "no estado em que se encontra", sem
        garantia de funcionamento e sem direito de devolução. Esse é o risco principal da
        modalidade. Avalie o edital, as fotos e, quando permitido, faça a vistoria presencial
        antes de dar qualquer lance.
      </>
    ),
  },
  {
    pergunta: "Quais custos existem além do lance?",
    resposta: (
      <>
        Os principais são: comissão do leiloeiro (geralmente ~5% sobre o valor do arremate),
        eventuais tributos ou taxas de desembaraço, transporte e logística para retirada, e
        possíveis custos de conserto ou reforma. Some tudo antes de calcular seu lance máximo.
      </>
    ),
  },
  {
    pergunta: "O que acontece se eu não retirar o bem no prazo?",
    resposta: (
      <>
        O edital estipula um prazo de retirada. Atrasos podem gerar cobrança de armazenagem
        (custodia do bem no local de guarda) e, em casos extremos, perda do bem sem reembolso.
        Planeje a logística antes de dar o lance.
      </>
    ),
  },
];

/* ── JSON-LD para SEO ────────────────────────────────────────────────────── */
const PAGE_TITLE =
  "Riscos dos leilões públicos e como se proteger | Fonte.ia";
const PAGE_DESC =
  "Guia honesto dos principais riscos de leilões da Receita Federal: bem sem garantia, custos além do lance, restrições legais, prazos curtos e golpes. Saiba como se proteger em cada caso.";
const CANONICAL = "/riscos-leiloes-publicos";

const JSON_LD = [
  articleJsonLd({
    title: PAGE_TITLE,
    description: PAGE_DESC,
    url: `${SITE_URL}${CANONICAL}`,
    datePublished: "2026-06-13",
  }),
  breadcrumbJsonLd([
    { name: "Início", url: SITE_URL },
    { name: "Guias", url: `${SITE_URL}/guias` },
    { name: "Riscos dos leilões públicos", url: `${SITE_URL}${CANONICAL}` },
  ]),
  faqJsonLd(
    FAQ_ITEMS.map((f) => ({
      question: f.pergunta,
      answer:
        typeof f.resposta === "string"
          ? f.resposta
          : "Veja a resposta completa na página.",
    })),
  ),
] as const;

/* ── Página principal ────────────────────────────────────────────────────── */
export function RiscosLeiloesPage() {
  useSeo({
    title: PAGE_TITLE,
    description: PAGE_DESC,
    canonicalPath: CANONICAL,
    jsonLd: JSON_LD,
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
          .riscos-header { padding-left: 20px !important; padding-right: 20px !important; }
          .riscos-main   { padding-left: 20px !important; padding-right: 20px !important; }
          .riscos-footer { padding-left: 20px !important; padding-right: 20px !important; }
        }
      `}</style>

      {/* ── Cabeçalho ───────────────────────────────────────────────────── */}
      <header
        className="riscos-header"
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

      {/* ── Conteúdo principal ──────────────────────────────────────────── */}
      <main
        className="riscos-main"
        style={{
          flex: 1,
          maxWidth: "760px",
          width: "100%",
          margin: "0 auto",
          padding: "60px 28px 100px",
        }}
      >
        <article>

          {/* Cabeçalho do artigo */}
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
              <a href="/guias" className="link small" style={{ fontSize: "13px" }}>
                Central de guias
              </a>
              <span style={{ color: "var(--t-low)", fontSize: "13px" }} aria-hidden="true">›</span>
              <span className="small" style={{ color: "var(--t-low)", fontSize: "13px" }}>
                Riscos e cuidados
              </span>
            </div>

            <span className="eyebrow" style={{ display: "block", marginBottom: "14px" }}>
              Guia honesto · o que pode dar errado
            </span>

            <h1
              style={{
                fontSize: "clamp(24px, 5.5vw, 36px)",
                fontWeight: 800,
                letterSpacing: "-0.03em",
                lineHeight: 1.1,
                marginBottom: "20px",
              }}
            >
              Riscos dos leilões públicos e como se proteger
            </h1>

            <P>
              Leilão público pode ser uma boa oportunidade — mas não é garantia de lucro, nem de
              produto em perfeito estado. Este guia apresenta os riscos reais dos leilões da
              Receita Federal com linguagem direta: o que é cada risco e o que você pode fazer
              para reduzi-lo antes de dar o primeiro lance.
            </P>

            <Warn>
              <strong style={{ color: "var(--t-hi)" }}>Nenhuma plataforma pode garantir lucro.</strong>{" "}
              Leilão envolve incerteza. A Fonte.ia organiza os dados e a rastreabilidade — a decisão
              de dar o lance e o risco são sempre seus.
            </Warn>
          </header>

          {/* Riscos detalhados */}
          <section aria-labelledby="riscos-heading" style={{ marginBottom: "56px" }}>
            <h2
              id="riscos-heading"
              style={{
                fontSize: "clamp(18px, 4vw, 24px)",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                marginBottom: "24px",
                color: "var(--t-hi)",
              }}
            >
              Os 7 principais riscos — e como reduzir cada um
            </h2>

            <RiscoCard
              titulo="Bem vendido sem garantia"
              oque={`O lote é vendido "no estado em que se encontra". Eletrônicos podem não ligar, veículos podem ter vícios ocultos, roupas podem estar com avaria. A Receita Federal não se responsabiliza pelo funcionamento do bem após o arremate.`}
              protecao="Leia a descrição do lote com atenção. Confira as fotos. Quando o edital permitir vistoria presencial, vá. Nunca presuma que o bem está funcionando — presuma o contrário e decida a partir disso."
            />

            <RiscoCard
              titulo="Impossibilidade de visitar o bem antes"
              oque="Nem todos os lotes permitem vistoria prévia. Muitos são vendidos apenas com fotos e a descrição do edital, sem qualquer possibilidade de inspeção física antes do arremate."
              protecao="Verifique no edital se há cláusula de vistoria, com data e local. Se não houver, calcule o preço que faz sentido mesmo no pior cenário possível para o estado do bem."
            />

            <RiscoCard
              titulo="Custos além do lance"
              oque="O valor do lance é apenas o começo. Existem outros custos certos ou prováveis: comissão do leiloeiro (geralmente ~5% sobre o arremate), eventuais tributos ou taxas alfandegárias, transporte e logística para retirada, e eventual conserto ou reforma."
              protecao={`Some todos os custos estimados antes de decidir seu lance máximo. A calculadora de lance da Fonte.ia (/ferramentas/calculadora-lance) foi feita para isso: coloque o valor de mercado estimado do bem, os custos extras e a margem que você quer preservar — ela diz até quanto compensa pagar.`}
            />

            <RiscoCard
              titulo="Restrições e pendências do bem"
              oque="Alguns lotes têm restrições legais. Mercadorias sem nota fiscal de origem podem ter impedimento de revenda. Veículos podem ter débitos de licenciamento ou multa não quitados. Certos bens exigem autorização especial para uso ou comércio (ex.: equipamentos de radiodifusão, remédios)."
              protecao="Leia o edital até o fim — essas restrições aparecem nas cláusulas específicas do lote. Se não estiver claro, não arremate: ambiguidade no edital é risco para o arrematante, não para a Receita."
            />

            <RiscoCard
              titulo="Prazos curtos de pagamento e retirada"
              oque="Depois do arremate, o pagamento via DARF tem prazo fixo no edital (geralmente 5 a 10 dias úteis). A retirada do bem também tem prazo. Perder qualquer um desses prazos pode significar perda do arremate, impedimento em futuros leilões ou cobrança de armazenagem."
              protecao="Verifique o prazo de pagamento e retirada ANTES de dar o lance. Só arremate se tiver certeza de que consegue pagar e buscar o bem dentro do prazo. Planeje o transporte com antecedência."
            />

            <RiscoCard
              titulo="Lotes com quantidade incerta ou fracionada"
              oque="Alguns lotes são vendidos com quantidade aproximada ou estimada. Um lote de '200 caixas de eletrônicos' pode ter parte das unidades com defeito, faltando componentes ou em quantidade diferente da anunciada. O risco da contagem é do arrematante."
              protecao="Considere a quantidade mínima garantida, não a estimada. Se o edital não for claro quanto à quantidade exata, ajuste seu lance para baixo para absorver a incerteza."
            />

            <RiscoCard
              titulo="Golpes e sites falsos"
              oque="Existem sites que imitam o visual do portal da Receita Federal para atrair interessados em leilões falsos. Cobram 'taxa de habilitação', 'caução' ou 'reserva de lote' fora do sistema oficial — e somem com o dinheiro."
              protecao={`O leilão legítimo da Receita Federal usa exclusivamente domínio .gov.br. Qualquer cobrança fora do DARF gerado pelo SLE é golpe. Se receber links por WhatsApp ou e-mail, não clique: acesse diretamente receita.fazenda.gov.br no navegador.`}
            />
          </section>

          {/* Como a Fonte.ia ajuda */}
          <section aria-labelledby="fonteia-heading" style={{ marginBottom: "56px" }}>
            <h2
              id="fonteia-heading"
              style={{
                fontSize: "clamp(18px, 4vw, 24px)",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                marginBottom: "20px",
                color: "var(--t-hi)",
              }}
            >
              Como a Fonte.ia ajuda a reduzir esses riscos
            </h2>

            <P>
              A Fonte.ia não elimina os riscos — nenhuma plataforma pode fazer isso. O que ela
              faz é tornar a informação mais acessível e rastreável para que você tome uma decisão
              mais consciente.
            </P>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                marginBottom: "24px",
              }}
            >
              {[
                {
                  label: "Custo total estimado",
                  desc: "A calculadora de lance embutida soma comissão, tributos e margem — antes de você dar qualquer lance.",
                },
                {
                  label: "Raio-X do lote",
                  desc: "Cada lote exibe a análise extraída do edital oficial: quem pode participar, prazo, restrições e alertas de prazo.",
                },
                {
                  label: "Rastreabilidade da fonte",
                  desc: "Todo dado tem link direto ao edital original no gov.br. Se a Fonte.ia erra, você vê no documento oficial.",
                },
                {
                  label: "Alertas de prazo",
                  desc: "Notificações de vencimento do lance e do pagamento para você não perder nenhum prazo crítico.",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="panel"
                  style={{ padding: "18px 22px", display: "flex", gap: "16px", alignItems: "flex-start" }}
                >
                  <ShieldCheck
                    size={17}
                    aria-hidden="true"
                    style={{ color: "var(--accent-ink)", flexShrink: 0, marginTop: "2px" }}
                  />
                  <div>
                    <span style={{ fontSize: "15px", fontWeight: 700, color: "var(--t-hi)", display: "block", marginBottom: "4px" }}>
                      {item.label}
                    </span>
                    <span style={{ fontSize: "14px", lineHeight: 1.65, color: "var(--t-mid)" }}>
                      {item.desc}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <Info>
              <strong style={{ color: "var(--t-hi)" }}>O que a Fonte.ia não faz:</strong> não
              garante que o bem funcionará, não assume responsabilidade pelo resultado do arremate e
              não promete lucro. A decisão final — e o risco — são sempre do arrematante.
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
              {FAQ_ITEMS.map((item) => (
                <FaqItem key={item.pergunta} pergunta={item.pergunta} resposta={item.resposta} />
              ))}
            </div>
          </section>

          {/* CTA Fonte.ia */}
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
              Analise os lotes com dados rastreáveis — antes de dar qualquer lance
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
              A Fonte.ia organiza cada lote da Receita Federal com prazo, restrições e custo
              estimado — e linka direto ao edital oficial. Sem inventar dado, sem prometer lucro.
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
              Explorar lotes com Raio-X
              <ArrowRight size={16} aria-hidden="true" />
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
                Como comprar na Receita Federal (passo a passo)
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
                Ver lotes disponíveis
              </a>
            </div>
          </nav>

        </article>
      </main>

      {/* ── Rodapé ──────────────────────────────────────────────────────────── */}
      <footer
        className="riscos-footer"
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
          <a href="/guias" className="link small">Guias</a>
          <a href="/guias/como-comprar-leilao-receita" className="link small">Como comprar</a>
          <a href="/ferramentas/calculadora-lance" className="link small">Calculadora</a>
          <a href="/faq" className="link small">FAQ</a>
          <a href="/privacidade" className="link small" style={{ color: "var(--t-low)" }}>Privacidade</a>
          <a href="/termos" className="link small" style={{ color: "var(--t-low)" }}>Termos</a>
        </nav>

        <span className="small" style={{ color: "var(--t-low)" }}>
          © {new Date().getFullYear()} Fonte.ia · by Olli
        </span>
      </footer>
    </div>
  );
}
