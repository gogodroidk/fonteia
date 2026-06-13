import { ArrowRight, AlertTriangle, ShieldCheck, BookOpen } from "lucide-react";
import { useSeo, articleJsonLd, breadcrumbJsonLd, SITE_URL } from "../../../lib/seo";

/* ── Logo mark ──────────────────────────────────────────────────────────── */
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

/* ── Bloco de erro numerado ─────────────────────────────────────────────── */
function ErroItem({
  num,
  titulo,
  children,
}: {
  num: number;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", gap: "20px", alignItems: "flex-start", marginBottom: "44px" }}>
      <div
        aria-hidden="true"
        style={{
          flexShrink: 0,
          width: "40px",
          height: "40px",
          borderRadius: "12px",
          background: "linear-gradient(135deg, #ef4444, #dc2626)",
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
        <h2
          style={{
            fontSize: "clamp(16px, 3.5vw, 20px)",
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: "var(--t-hi)",
            marginBottom: "14px",
            lineHeight: 1.3,
          }}
        >
          {titulo}
        </h2>
        {children}
      </div>
    </div>
  );
}

/* ── Página ──────────────────────────────────────────────────────────────── */
export function PostErrosIniciantesPage() {
  const title = "5 erros de iniciante em leilão (e como evitar)";
  const description =
    "Não ler o edital, esquecer os custos extras, dar lance emocional, não conferir o bem e perder o prazo de pagamento. Os cinco tropeços mais comuns de quem está começando nos leilões da Receita Federal.";
  const canonicalPath = "/blog/erros-iniciantes-leilao";

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
          .post-erros-header { padding-left: 20px !important; padding-right: 20px !important; }
          .post-erros-main   { padding-left: 20px !important; padding-right: 20px !important; }
          .post-erros-footer { padding-left: 20px !important; padding-right: 20px !important; }
        }
      `}</style>

      {/* ── Cabeçalho ──────────────────────────────────────────────────── */}
      <header
        className="post-erros-header"
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
        className="post-erros-main"
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
                <span style={{ color: "var(--t-low)", fontSize: "13px" }}>Erros de iniciante</span>
              </li>
            </ol>
          </nav>

          {/* Herói */}
          <header style={{ marginBottom: "52px" }}>
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
              Guia prático · 13 jun 2026
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
              Todo mundo que participou de um leilão da Receita Federal pela primeira vez cometeu
              pelo menos um desses erros. Não é falta de inteligência — é falta de informação.
              Este artigo vai direto ao ponto: os cinco tropeços mais comuns e o que fazer
              diferente.
            </P>
          </header>

          {/* Erros */}
          <div itemProp="articleBody">
            <ErroItem num={1} titulo="Erro 1: não ler o edital — ou ler por cima">
              <P>
                O edital não é burocracia. É o único documento que define o que você está
                comprando, quanto custa (incluindo comissão do leiloeiro), quando precisa pagar,
                onde retirar o bem e o que acontece se você não cumprir o prazo. Ignorar o edital
                é como assinar um contrato sem ler.
              </P>
              <P>
                O erro mais frequente: a pessoa lê o título do lote e o lance mínimo, vê que o
                preço está atrativo e já decide que vale a pena. Aí descobre que o bem fica
                guardado a 300 km de distância, que a retirada precisa ser feita em 3 dias úteis
                e que havia uma restrição de uso que tornava o arremate inútil para ela.
              </P>
              <Warn>
                <strong style={{ color: "var(--t-hi)" }}>Como evitar:</strong> leia o edital
                completo antes de qualquer lance. Sem exceção. Preste atenção em: condição do bem,
                quem pode participar, prazo de habilitação, prazo de pagamento, local de retirada,
                forma de pagamento e penalidades por inadimplência.
              </Warn>
            </ErroItem>

            <ErroItem num={2} titulo="Erro 2: esquecer os custos que vêm depois do lance">
              <P>
                O valor do lance é só o começo. Depois dele vêm: comissão do leiloeiro (tipicamente
                5% sobre o lance), transporte do bem até onde você precisa, possível armazenagem
                extra se atrasar a retirada, e eventual manutenção ou conserto do bem.
              </P>
              <P>
                Exemplo real: uma geladeira com lance vencedor de R$ 350. Comissão do leiloeiro:
                R$ 17,50. Frete de outro estado: R$ 280. Total real pago: R$ 647,50 — por um
                eletrodoméstico sem garantia. Em alguns casos, ficou mais caro do que comprar na
                loja com garantia de um ano.
              </P>
              <Info>
                <strong style={{ color: "var(--t-hi)" }}>Como evitar:</strong> use a{" "}
                <a href="/ferramentas/calculadora-lance" className="link">
                  calculadora de lance da Fonte.ia
                </a>{" "}
                antes de dar qualquer proposta. Informe o valor de mercado do bem e todos os custos
                estimados — ela devolve o lance máximo que ainda faz sentido financeiramente.
              </Info>
            </ErroItem>

            <ErroItem num={3} titulo="Erro 3: dar lance emocional (ir além do que foi calculado)">
              <P>
                Leilão tem uma dinâmica que puxa emoção. Quando a sessão está ao vivo e você está
                quase ganhando, é fácil dar mais um lance, e mais um, além do que tinha planejado.
                O resultado é pagar mais do que o bem vale ou mais do que sua margem segura
                permitia.
              </P>
              <P>
                Isso acontece tanto em sessões ao vivo quanto nas propostas em valor fixo — a
                diferença é que, no lance fixo, o impulso aparece na hora de digitar o número.
                "Boto mais R$ 50, que não vai fazer diferença" — e aí a diferença aparece na
                conta final.
              </P>
              <Warn>
                <strong style={{ color: "var(--t-hi)" }}>Como evitar:</strong> defina seu lance
                máximo antes de entrar na sessão ou de abrir o formulário de proposta. Escreva
                esse número. Não ultrapasse ele, nem que pareça que vai perder por pouco. Perder
                um lance dentro do limite é melhor do que ganhar fora dele.
              </Warn>
            </ErroItem>

            <ErroItem num={4} titulo="Erro 4: não conferir o bem com atenção antes de dar o lance">
              <P>
                Quando a vistoria prévia é permitida (o edital informa se e quando), muitos
                iniciantes aparecem rapidamente, olham o bem de longe e consideram que "parece
                ok". Quando não há vistoria, confiam apenas na foto do edital — que pode mostrar
                ângulo favorável ou estado diferente do real.
              </P>
              <P>
                O bem é vendido "no estado em que se encontra", sem garantia. Qualquer defeito
                descoberto depois do arremate é problema do comprador. Isso não significa que todo
                lote é ruim — significa que a análise prévia é parte do trabalho.
              </P>
              <Info>
                <strong style={{ color: "var(--t-hi)" }}>Como evitar:</strong> use todas as
                informações disponíveis: leia a descrição do lote no edital com atenção, observe
                todas as fotos, e — quando a vistoria for permitida — vá presencialmente e examine
                o bem com cuidado. Se tiver dúvida sobre o estado, precifique o risco no seu
                lance máximo.
              </Info>
            </ErroItem>

            <ErroItem num={5} titulo="Erro 5: perder o prazo de pagamento (ou de habilitação)">
              <P>
                Há dois prazos críticos em todo leilão da Receita Federal: o prazo para se
                habilitar antes do encerramento das propostas e o prazo para pagar após vencer o
                lance. Iniciantes frequentemente deixam a habilitação para o último dia e perdem
                por minutos — ou ganham o lance e descobrem que não conseguem pagar no prazo por
                falta de planejamento financeiro.
              </P>
              <P>
                As consequências são sérias: quem não paga no prazo perde o arremate e pode ser
                impedido de participar de futuros leilões da Receita Federal. Não há negociação
                de prazo depois do fato.
              </P>
              <Warn>
                <strong style={{ color: "var(--t-hi)" }}>Como evitar:</strong> anote os dois
                prazos assim que abrir o edital: habilitação e pagamento. Configure alertas no
                celular. Só dê o lance se tiver certeza de que pode pagar dentro do prazo — com
                folga para imprevistos bancários. Se usar a Fonte.ia, os alertas de prazo chegam
                automaticamente.
              </Warn>
            </ErroItem>

            {/* Resumo */}
            <div
              className="panel"
              style={{
                padding: "28px 32px",
                marginBottom: "40px",
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
                  marginBottom: "16px",
                }}
              >
                Resumo rápido — os 5 erros
              </p>
              <ol
                style={{
                  paddingLeft: "20px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                {[
                  "Não ler o edital completo antes de qualquer ação",
                  "Ignorar custos extras: comissão, frete, armazenagem, conserto",
                  "Dar lance emocional além do limite calculado",
                  "Não examinar o bem com atenção (fotos, descrição ou vistoria)",
                  "Perder o prazo de habilitação ou de pagamento",
                ].map((item) => (
                  <li
                    key={item}
                    style={{ fontSize: "15px", lineHeight: 1.65, color: "var(--t-mid)" }}
                  >
                    {item}
                  </li>
                ))}
              </ol>
            </div>
          </div>

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
              Alertas de prazo automáticos, dados do edital organizados e calculadora de lance
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
              Exatamente as ferramentas para não cometer nenhum dos cinco erros acima. Tudo
              rastreável à fonte oficial.
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
              Começar grátis por 7 dias
              <ArrowRight size={16} aria-hidden="true" />
            </a>
            <p style={{ fontSize: "12px", color: "var(--t-low)", marginTop: "12px" }}>
              sem contrato · dados rastreáveis à fonte oficial
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
                href="/blog/como-ler-edital-leilao"
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
                Como ler um edital de leilão
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
        className="post-erros-footer"
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
