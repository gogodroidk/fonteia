import { ArrowRight, AlertTriangle, ShieldCheck, BookOpen } from "lucide-react";
import { useSeo, articleJsonLd, breadcrumbJsonLd, SITE_URL } from "../../../lib/seo";
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

/* ── Página ──────────────────────────────────────────────────────────────── */
export function PostValeAPenaPage() {
  const title = "Leilão da Receita Federal vale a pena? O que ninguém te conta";
  const description =
    "Prós reais, contras reais e os custos que quase sempre ficam fora da conta. Para quem faz sentido participar de um leilão da Receita Federal — e para quem não faz.";
  const canonicalPath = "/blog/leilao-receita-vale-a-pena";

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
          .post-vap-header { padding-left: 20px !important; padding-right: 20px !important; }
          .post-vap-main   { padding-left: 20px !important; padding-right: 20px !important; }
          .post-vap-footer { padding-left: 20px !important; padding-right: 20px !important; }
        }
      `}</style>

      {/* ── Cabeçalho ──────────────────────────────────────────────────── */}
      <header
        className="post-vap-header"
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
        className="post-vap-main"
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
                <span style={{ color: "var(--t-low)", fontSize: "13px" }}>Vale a pena?</span>
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
              Análise honesta · 13 jun 2026
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
              A resposta curta é: <strong style={{ color: "var(--t-hi)" }}>depende</strong>. E
              qualquer site que responda diferente está te vendendo algo. Leilão da Receita Federal
              pode ser uma boa oportunidade — ou um prejuízo silencioso. A diferença está em
              entender o jogo antes de entrar.
            </P>
          </header>

          {/* Corpo do artigo */}
          <div itemProp="articleBody">

            <H2 id="como-funciona">Primeiro, como funciona (em 30 segundos)</H2>

            <P>
              A Receita Federal leiloa bens apreendidos em alfândegas e portos — eletrônicos,
              roupas, bebidas, veículos e outros itens que foram abandonados por importadores ou
              retidos em fiscalização. Os leilões são eletrônicos, realizados pelo Sistema de
              Leilão Eletrônico (SLE), e abertos a qualquer pessoa física com conta gov.br ou
              empresa com CNPJ.
            </P>

            <P>
              O lance mínimo é definido no edital de cada lote. Quem der o maior lance (dentro do
              prazo) vence e tem alguns dias para pagar via DARF e retirar o bem no local de guarda.
              Simples assim — na teoria.
            </P>

            <H2 id="pros">Os prós reais</H2>

            <P>
              <strong style={{ color: "var(--t-hi)" }}>Preços abaixo do mercado são possíveis.</strong>{" "}
              Em lotes pouco disputados ou com logística difícil, é real conseguir eletrônicos,
              equipamentos ou mercadorias por valores bem menores do que no varejo. Isso acontece —
              mas não é regra.
            </P>

            <P>
              <strong style={{ color: "var(--t-hi)" }}>Processo 100% digital e transparente.</strong>{" "}
              O edital é público, os lances são registrados e o pagamento é via DARF federal. Não
              há intermediário suspeito nem "taxa de sorte". O que está escrito no edital é o
              contrato — sem letra miúda escondida.
            </P>

            <P>
              <strong style={{ color: "var(--t-hi)" }}>Qualquer pessoa física pode participar.</strong>{" "}
              Basta ter conta gov.br nível prata ou ouro e fazer a habilitação para o lote
              específico. Não precisa de CNPJ na maioria dos casos.
            </P>

            <P>
              <strong style={{ color: "var(--t-hi)" }}>Variedade de lotes.</strong> A Receita
              Federal realiza leilões ao longo do ano, com lotes que vão de roupas a equipamentos
              industriais. Quem monitora regularmente encontra oportunidades pontuais no segmento
              que conhece bem.
            </P>

            <H2 id="contras">Os contras que quase ninguém menciona</H2>

            <Warn>
              <strong style={{ color: "var(--t-hi)" }}>Sem garantia. Zero.</strong> O bem é
              vendido “no estado em que se encontra”. Se o eletrônico não ligar, se o veículo
              tiver defeito mecânico, se a mercadoria estiver danificada — é problema seu. A
              Receita Federal não dá garantia, não aceita devolução e não responde por vícios
              ocultos. Você comprou o risco junto com o lote.
            </Warn>

            <P>
              <strong style={{ color: "var(--t-hi)" }}>Vistoria prévia raramente é possível.</strong>{" "}
              Na maioria dos lotes, você analisa o bem pelas fotos e descrição do edital. Quando
              a vistoria é permitida, você vê o estado externo — não há teste de funcionamento.
              Comprar sem ver é o padrão, não a exceção.
            </P>

            <P>
              <strong style={{ color: "var(--t-hi)" }}>Os custos extras corroem a vantagem.</strong>{" "}
              Além do lance, você paga comissão do leiloeiro (geralmente 5%), custos de transporte
              (o bem fica em armazém da Receita, às vezes em outra cidade), eventual armazenagem
              por atraso na retirada e possível manutenção do bem. Uma TV comprada a R$ 400 pode
              custár R$ 650 quando você a colocar em casa.
            </P>

            <P>
              <strong style={{ color: "var(--t-hi)" }}>Prazo de pagamento é inflexível.</strong>{" "}
              Ganhou o lance? Tem entre 5 e 10 dias úteis (conforme o edital) para pagar. Não
              pagou: perde o arremate e pode ser impedido de participar de futuros leilões. Não
              existe prorrogação por "esqueci" ou "tive imprevisto".
            </P>

            <P>
              <strong style={{ color: "var(--t-hi)" }}>Restrições que surgem depois.</strong>{" "}
              Alguns bens têm impedimentos legais de revenda (mercadorias sem nota fiscal de
              origem, por exemplo) ou exigem licença para uso. Essas restrições estão no edital —
              mas são fáceis de ignorar se você ler por cima.
            </P>

            <H2 id="custos-reais">Os custos reais: faça a conta antes do lance</H2>

            <P>
              Para saber se um lote vale a pena, a conta é simples — mas precisa incluir tudo:
            </P>

            <ul
              style={{
                paddingLeft: "22px",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                marginBottom: "20px",
              }}
            >
              {[
                "Lance vencedor (valor que você vai pagar à Receita)",
                "Comissão do leiloeiro: tipicamente 5% sobre o lance — confirme no edital",
                "Transporte até sua cidade ou armazém: cotize antes, não depois",
                "Armazenagem: se não retirar no prazo, o custo diário pode ser alto",
                "Manutenção ou conserto estimado: no caso de eletrônicos ou veículos",
                "Eventuais impostos sobre a operação — depende da natureza do bem",
              ].map((item) => (
                <li key={item} style={{ fontSize: "15px", lineHeight: 1.7, color: "var(--t-mid)" }}>
                  {item}
                </li>
              ))}
            </ul>

            <P>
              A{" "}
              <a href="/ferramentas/calculadora-lance" className="link">
                calculadora de lance da Fonte.ia
              </a>{" "}
              faz exatamente isso: você informa o valor de mercado do bem e os custos estimados,
              e ela devolve o lance máximo que ainda faz sentido financeiramente.
            </P>

            <H2 id="para-quem">Para quem faz sentido — e para quem não faz</H2>

            <Info>
              <strong style={{ color: "var(--t-hi)" }}>Faz sentido se você:</strong> conhece bem
              o segmento do lote (sabe avaliar o estado real pelo edital e fotos), tem liquidez
              para pagar à vista no prazo, consegue resolver a logística de retirada e está
              confortável com a incerteza sobre o estado do bem.
            </Info>

            <Warn>
              <strong style={{ color: "var(--t-hi)" }}>Não faz sentido se você:</strong> está
              contando com o bem para um uso imediato crítico, não tem como pagar à vista dentro
              do prazo, não consegue retirar o bem no local e prazo indicados, ou está entrando
              no leilão apenas porque o preço "pareceu barato".
            </Warn>

            <P>
              Leilão funciona bem para quem tem paciência para estudar o edital, disciplina para
              calcular os custos e clareza sobre o que está comprando. Para quem entra por impulso,
              o leilão custa mais caro que a loja.
            </P>

            <H2 id="conclusao">Conclusão honesta</H2>

            <P>
              Leilão da Receita Federal não é golpe e não é mágica. É uma modalidade de compra
              com regras específicas, custos reais e riscos concretos — que podem valer a pena
              para quem entende o jogo. A Fonte.ia existe justamente para tornar esse processo
              mais transparente: lotes organizados, dados do edital em um lugar só e score de
              oportunidade calculado com critérios claros.
            </P>

            <P>
              Mas a decisão final é sempre sua. Com edital lido, custos calculados e expectativas
              realistas.
            </P>
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
              Fonte.ia
            </span>
            <p
              style={{
                fontSize: "17px",
                fontWeight: 600,
                color: "var(--t-hi)",
                marginBottom: "10px",
              }}
            >
              Veja os lotes ativos com todos os dados do edital em um lugar só
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
              Lance mínimo, prazo, elegibilidade PF/PJ, score de oportunidade e link para o
              edital oficial. Sem inventar dado, sem prometer lucro.
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
              Ver lotes disponíveis
              <ArrowRight size={16} aria-hidden="true" />
            </a>
            <p style={{ fontSize: "12px", color: "var(--t-low)", marginTop: "12px" }}>
              7 dias grátis · sem contrato
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
                href="/blog/erros-iniciantes-leilao"
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
                5 erros de iniciante em leilão
              </a>
              <a
                href="/blog/como-ler-edital-leilao"
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
                Como ler um edital de leilão
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
                Perguntas frequentes (FAQ)
              </a>
            </div>
          </nav>

        </article>
      </main>

      {/* ── Rodapé ─────────────────────────────────────────────────────── */}
      <footer
        className="post-vap-footer"
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
