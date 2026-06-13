import { ArrowRight, AlertTriangle, ShieldCheck, BookOpen } from "lucide-react";
import { useSeo, articleJsonLd, breadcrumbJsonLd, faqJsonLd, SITE_URL } from "../../../lib/seo";
import { LogoMark } from "../../../components/ui/logo-mark";
/* ── Primitivos ─────────────────────────────────────────────────────────── */
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

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      style={{
        fontSize: "clamp(18px, 4vw, 24px)",
        fontWeight: 700,
        letterSpacing: "-0.02em",
        marginBottom: "20px",
        marginTop: "44px",
        color: "var(--t-hi)",
      }}
    >
      {children}
    </h2>
  );
}

/* ── Bloco de item do edital ─────────────────────────────────────────────── */
function EditalItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        borderLeft: "3px solid color-mix(in srgb, var(--accent) 40%, transparent)",
        paddingLeft: "18px",
        marginBottom: "28px",
      }}
    >
      <p
        style={{
          fontSize: "11px",
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--accent-ink)",
          marginBottom: "6px",
        }}
      >
        {label}
      </p>
      <div style={{ fontSize: "15px", lineHeight: 1.7, color: "var(--t-mid)" }}>{children}</div>
    </div>
  );
}

/* ── Página ──────────────────────────────────────────────────────────────── */
export function PostComoLerEditalPage() {
  const title = "Como ler um edital de leilão sem ser advogado";
  const description =
    "O que você precisa checar antes de qualquer lance: datas, forma de pagamento, condição do bem, restrições e cláusulas que a maioria ignora. Com a IA da Fonte.ia ajudando.";
  const canonicalPath = "/blog/como-ler-edital-leilao";

  const faqItems = [
    {
      question: "Todo edital de leilão da Receita Federal tem o mesmo formato?",
      answer:
        "Não. Cada leiloeiro oficial pode ter um formato próprio, mas as informações obrigatórias estão sempre presentes: descrição dos lotes, lance mínimo, prazos, quem pode participar e condições de pagamento. O local onde cada informação aparece pode variar.",
    },
    {
      question: "Preciso ler o edital inteiro ou posso ir direto na parte que me interessa?",
      answer:
        "Leia o edital inteiro, pelo menos uma vez. As cláusulas mais importantes (condição do bem, penalidades, restrições de uso) frequentemente aparecem no meio do documento ou em anexos. Pular seções é um dos erros mais comuns de iniciantes.",
    },
    {
      question: "A IA da Fonte.ia substitui a leitura do edital?",
      answer:
        "Não. A IA da Fonte.ia extrai e organiza as informações do edital para facilitar a leitura — mas não substitui sua análise. O edital original é o único documento juridicamente válido. A Fonte.ia sempre linka para a fonte oficial.",
    },
  ];

  useSeo({
    title: `${title} | Fonte.ia`,
    description,
    canonicalPath,
    jsonLd: [
      articleJsonLd({
        title,
        description,
        url: `${SITE_URL}${canonicalPath}`,
        datePublished: "2026-06-13",
      }),
      breadcrumbJsonLd([
        { name: "Início", url: SITE_URL },
        { name: "Blog", url: `${SITE_URL}/blog` },
        { name: title, url: `${SITE_URL}${canonicalPath}` },
      ]),
      faqJsonLd(faqItems),
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
          .post-edital-header { padding-left: 20px !important; padding-right: 20px !important; }
          .post-edital-main   { padding-left: 20px !important; padding-right: 20px !important; }
          .post-edital-footer { padding-left: 20px !important; padding-right: 20px !important; }
        }
      `}</style>

      {/* ── Cabeçalho ──────────────────────────────────────────────────── */}
      <header
        className="post-edital-header"
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
          <a href="/blog" className="btn btn--ghost btn--sm">
            ← Blog
          </a>
          <a href="/entrar" className="btn btn--accent btn--sm">
            Começar grátis
          </a>
        </nav>
      </header>

      {/* ── Conteúdo principal ─────────────────────────────────────────── */}
      <main
        className="post-edital-main"
        style={{
          flex: 1,
          maxWidth: "760px",
          width: "100%",
          margin: "0 auto",
          padding: "60px 28px 100px",
        }}
      >
        <article itemScope itemType="https://schema.org/Article">

          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb" style={{ marginBottom: "28px" }}>
            <ol
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                alignItems: "center",
                gap: "6px",
                flexWrap: "wrap",
              }}
            >
              <li>
                <a href="/" className="link small" style={{ fontSize: "13px" }}>
                  Início
                </a>
              </li>
              <li aria-hidden="true" style={{ color: "var(--t-low)", fontSize: "13px" }}>›</li>
              <li>
                <a href="/blog" className="link small" style={{ fontSize: "13px" }}>
                  Blog
                </a>
              </li>
              <li aria-hidden="true" style={{ color: "var(--t-low)", fontSize: "13px" }}>›</li>
              <li>
                <span style={{ color: "var(--t-low)", fontSize: "13px" }}>Como ler um edital</span>
              </li>
            </ol>
          </nav>

          {/* Herói */}
          <header style={{ marginBottom: "44px" }}>
            <span
              style={{
                display: "block",
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--accent-ink)",
                marginBottom: "14px",
              }}
            >
              Passo a passo · 13 jun 2026
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
              {title}
            </h1>

            <P>
              O edital de leilão da Receita Federal parece intimidador. Às vezes tem 30 páginas,
              linguagem técnica e referências a portarias que ninguém ouviu falar. A boa notícia:
              você não precisa entender tudo. Você precisa encontrar oito informações específicas.
              Este artigo mostra onde elas costumam estar e o que fazer com elas.
            </P>
          </header>

          {/* Corpo */}
          <div itemProp="articleBody">
            <H2 id="porque-ler">Por que o edital é inegociável</H2>

            <P>
              O edital é o único documento juridicamente válido do leilão. Qualquer informação
              que você leu em outro lugar — site de notícias, grupo de WhatsApp, vídeo no YouTube
              — é opinião ou interpretação. O que vale é o que está escrito no edital oficial.
            </P>

            <P>
              Se você der um lance baseado em uma informação errada e perder dinheiro, a Receita
              Federal não vai te ressarcir por isso. "Eu não sabia" não é argumento jurídico —
              porque o edital estava disponível publicamente e você se habilitou ao aceitar os
              termos.
            </P>

            <Warn>
              Nunca dê um lance sem ler o edital completo pelo menos uma vez. Mesmo que o lote
              pareça óbvio. Mesmo que seja parecido com um que você já fez antes.
            </Warn>

            <H2 id="oito-pontos">Os oito pontos que você precisa encontrar</H2>

            <P>
              Você não precisa ler o edital como advogado. Precisa encontrar estas oito
              informações e anotar cada uma:
            </P>

            <EditalItem label="1. Datas e prazos">
              Há três datas críticas: prazo para habilitação (quando você precisa se cadastrar
              para poder participar), prazo para envio de propostas (quando encerram os lances) e
              prazo para pagamento após o arremate (geralmente 5 a 10 dias úteis). Anote as três.
              Se não cumprir qualquer uma delas, perde o direito ao lote.
            </EditalItem>

            <EditalItem label="2. Quem pode participar">
              Pessoa física, pessoa jurídica, ou ambas? Há restrição de atividade econômica (por
              exemplo, apenas distribuidores ou empresas com licença específica)? Verifique isso
              antes de qualquer outro passo — de nada adianta analisar o lote se você não pode
              participar.
            </EditalItem>

            <EditalItem label="3. Condição do bem">
              A frase mais importante do edital é esta, em alguma variação: "o bem é vendido no
              estado em que se encontra, sem garantia de funcionamento e sem direito a devolução".
              Isso significa que qualquer defeito descoberto depois do arremate é responsabilidade
              exclusivamente sua. Leia a descrição do lote com esse contexto em mente.
            </EditalItem>

            <EditalItem label="4. Forma e local de pagamento">
              O pagamento é feito via DARF (Documento de Arrecadação de Receitas Federais), gerado
              pelo próprio sistema. Confirme: o DARF precisa ser pago em banco específico? Há
              comissão do leiloeiro cobrada separadamente, também via DARF, ou está embutida?
              Qual o percentual exato? Esses detalhes variam por edital.
            </EditalItem>

            <EditalItem label="5. Local e prazo de retirada do bem">
              Onde o bem está guardado? Em qual cidade, endereço e qual é o prazo para retirada
              depois do pagamento confirmado? Lotes em estados diferentes do seu exigem planejamento
              logístico imediato. Há custo de armazenagem por dia de atraso na retirada? Quanto?
            </EditalItem>

            <EditalItem label="6. Vistoria prévia">
              É permitida? Se sim: em qual data, horário e local? O edital informa isso
              explicitamente. Quando não há previsão de vistoria, o bem é adquirido apenas com
              base na descrição e nas fotos. Isso não é ilegal nem suspeito — é a regra padrão.
            </EditalItem>

            <EditalItem label="7. Restrições de uso ou revenda">
              Alguns bens têm impedimentos: mercadorias sem nota fiscal de origem, produtos com
              restrição de comercialização, veículos com pendências específicas. Essas restrições
              estão descritas no edital — geralmente na seção de observações do lote. Se você
              planeja revender o bem, preste atenção redobrada nesta seção.
            </EditalItem>

            <EditalItem label="8. Penalidades por inadimplência">
              O que acontece se você ganhar o lance e não pagar? O edital descreve as penalidades:
              perda do arremate, possível impedimento em futuros leilões, multas. Leia isso antes
              de dar qualquer lance — especialmente se estiver com liquidez apertada.
            </EditalItem>

            <H2 id="ia-fonte">Como a IA da Fonte.ia ajuda nessa leitura</H2>

            <P>
              A Fonte.ia usa IA para extrair e organizar as informações de cada edital de leilão
              da Receita Federal. Em vez de você vasculhar 30 páginas de PDF, você vê um resumo
              estruturado: datas destacadas, condição do bem, elegibilidade PF/PJ, local de
              retirada e score de oportunidade calculado por regras claras.
            </P>

            <Info>
              A IA da Fonte.ia não substitui o edital — ela facilita a leitura. O edital original
              fica sempre linkado para você conferir na fonte oficial. O dado que importa para sua
              decisão é o do edital, não o do resumo.
            </Info>

            <P>
              Isso é especialmente útil quando há vários lotes ativos ao mesmo tempo e você quer
              identificar rapidamente quais merecem análise mais aprofundada — sem precisar abrir
              PDF por PDF.
            </P>

            <H2 id="checklist">Checklist antes de dar o lance</H2>

            <div
              className="panel"
              style={{
                padding: "24px 28px",
                marginBottom: "24px",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "16px",
              }}
            >
              <p
                style={{
                  fontSize: "13px",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--t-low)",
                  marginBottom: "14px",
                }}
              >
                Marque todos antes de propor
              </p>
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                {[
                  "Li o edital completo pelo menos uma vez",
                  "Anotei os três prazos: habilitação, proposta e pagamento",
                  "Confirmei que posso participar (PF/PJ, sem restrição de atividade)",
                  "Entendi a condição do bem e aceito o risco de 'sem garantia'",
                  "Calculei o custo total: lance + comissão + frete + manutenção estimada",
                  "Defini meu lance máximo e não vou ultrapassá-lo",
                  "Tenho como pagar o DARF dentro do prazo com folga",
                  "Tenho como retirar o bem dentro do prazo no local indicado",
                ].map((item) => (
                  <li
                    key={item}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "10px",
                      fontSize: "15px",
                      lineHeight: 1.65,
                      color: "var(--t-mid)",
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        flexShrink: 0,
                        width: "18px",
                        height: "18px",
                        borderRadius: "4px",
                        border: "2px solid var(--border)",
                        display: "inline-block",
                        marginTop: "2px",
                      }}
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* FAQ */}
            <section
              aria-labelledby="faq-heading"
              style={{ marginTop: "44px", marginBottom: "8px" }}
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
                Perguntas rápidas
              </h2>

              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {faqItems.map((item) => (
                  <div
                    key={item.question}
                    className="card"
                    style={{ padding: "18px 22px" }}
                    itemScope
                    itemType="https://schema.org/Question"
                  >
                    <p
                      itemProp="name"
                      style={{
                        fontSize: "15px",
                        fontWeight: 600,
                        color: "var(--t-hi)",
                        marginBottom: "8px",
                      }}
                    >
                      {item.question}
                    </p>
                    <div
                      itemScope
                      itemType="https://schema.org/Answer"
                    >
                      <p
                        itemProp="text"
                        style={{ fontSize: "14.5px", lineHeight: 1.7, color: "var(--t-mid)" }}
                      >
                        {item.answer}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* CTA Fonte.ia */}
          <div
            className="panel"
            style={{
              padding: "32px",
              textAlign: "center",
              background: "color-mix(in srgb, var(--accent) 6%, var(--surface))",
              borderColor: "color-mix(in srgb, var(--accent) 22%, var(--border))",
              marginTop: "52px",
              marginBottom: "40px",
            }}
          >
            <span
              style={{
                display: "block",
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--accent-ink)",
                marginBottom: "10px",
              }}
            >
              Fonte.ia — leitura de edital com IA
            </span>
            <p
              style={{
                fontSize: "17px",
                fontWeight: 600,
                color: "var(--t-hi)",
                marginBottom: "10px",
              }}
            >
              Editais resumidos, organizados, com link para a fonte oficial
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
              A IA extrai as oito informações que importam de cada edital e organiza em um
              painel claro. Você analisa mais rápido e decide com mais segurança.
            </p>
            <a
              href="/leiloes-receita-federal"
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
              Ver lotes com Raio-X de IA
              <ArrowRight size={16} aria-hidden="true" />
            </a>
            <p style={{ fontSize: "12px", color: "var(--t-low)", marginTop: "12px" }}>
              7 dias grátis · sem contrato · edital original sempre linkado
            </p>
          </div>

          {/* Links relacionados */}
          <nav
            aria-label="Artigos relacionados"
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
              Continue lendo
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
              <a
                href="/blog/leilao-receita-vale-a-pena"
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
                Vale a pena participar?
              </a>
              <a
                href="/blog/erros-iniciantes-leilao"
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
                5 erros de iniciante
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
                Perguntas frequentes (FAQ)
              </a>
            </div>
          </nav>

        </article>
      </main>

      {/* ── Rodapé ─────────────────────────────────────────────────────── */}
      <footer
        className="post-edital-footer"
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
          <a href="/blog" className="link small">
            Blog
          </a>
          <a href="/leiloes-receita-federal" className="link small">
            Leilões
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

        <span style={{ fontSize: "12px", color: "var(--t-low)" }}>
          © {new Date().getFullYear()} Fonte.ia · by Olli
        </span>
      </footer>
    </div>
  );
}
