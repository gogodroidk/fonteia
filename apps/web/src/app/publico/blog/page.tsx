import { ArrowRight, BookOpen } from "lucide-react";
import { useSeo, breadcrumbJsonLd, SITE_URL } from "../../../lib/seo";
import { LogoMark } from "../../../components/ui/logo-mark";
/* ── Dados dos posts ─────────────────────────────────────────────────────── */
interface PostCard {
  href: string;
  eyebrow: string;
  title: string;
  excerpt: string;
  readTime: string;
}

const POSTS: PostCard[] = [
  {
    href: "/blog/leilao-receita-vale-a-pena",
    eyebrow: "Análise honesta",
    title: "Leilão da Receita Federal vale a pena? O que ninguém te conta",
    excerpt:
      "Prós reais, contras reais e os custos que quase sempre ficam fora da conta. Para quem faz sentido participar — e para quem não faz.",
    readTime: "7 min",
  },
  {
    href: "/blog/erros-iniciantes-leilao",
    eyebrow: "Guia prático",
    title: "5 erros de iniciante em leilão (e como evitar)",
    excerpt:
      "Não ler o edital, esquecer os custos extras, lance emocional… Os tropeços mais comuns de quem está começando e como não cometê-los.",
    readTime: "6 min",
  },
  {
    href: "/blog/como-ler-edital-leilao",
    eyebrow: "Passo a passo",
    title: "Como ler um edital de leilão sem ser advogado",
    excerpt:
      "O que você precisa checar antes de qualquer lance: datas, forma de pagamento, condição do bem e cláusulas que a maioria ignora.",
    readTime: "8 min",
  },
];

/* ── Componente de card ──────────────────────────────────────────────────── */
function PostCard({ post }: { post: PostCard }) {
  return (
    <a
      href={post.href}
      className="card--hover"
      style={{
        display: "block",
        textDecoration: "none",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "16px",
        padding: "28px 28px 24px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "12px",
          flexWrap: "wrap",
          gap: "8px",
        }}
      >
        <span className="eyebrow">
          {post.eyebrow}
        </span>
        <span style={{ fontSize: "12px", color: "var(--t-low)" }}>{post.readTime} de leitura</span>
      </div>

      <h2
        style={{
          fontSize: "clamp(16px, 3vw, 19px)",
          fontWeight: 700,
          letterSpacing: "-0.02em",
          lineHeight: 1.3,
          color: "var(--t-hi)",
          marginBottom: "12px",
        }}
      >
        {post.title}
      </h2>

      <p
        style={{
          fontSize: "14.5px",
          lineHeight: 1.7,
          color: "var(--t-mid)",
          marginBottom: "20px",
        }}
      >
        {post.excerpt}
      </p>

      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "13.5px",
          fontWeight: 600,
          color: "var(--accent-ink)",
        }}
      >
        Ler artigo
        <ArrowRight size={14} aria-hidden="true" />
      </span>
    </a>
  );
}

/* ── Página ──────────────────────────────────────────────────────────────── */
export function BlogIndexPage() {
  useSeo({
    title: "Blog — Leilões da Receita Federal sem enrolação | Fonte.ia",
    description:
      "Artigos honestos sobre leilões da Receita Federal: como funciona, o que custa, erros comuns e como ler um edital. Conteúdo para iniciantes e interessados.",
    canonicalPath: "/blog",
    jsonLd: [
      breadcrumbJsonLd([
        { name: "Início", url: SITE_URL },
        { name: "Blog", url: `${SITE_URL}/blog` },
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
          .blog-index-header { padding-left: 20px !important; padding-right: 20px !important; }
          .blog-index-main   { padding-left: 20px !important; padding-right: 20px !important; }
          .blog-index-footer { padding-left: 20px !important; padding-right: 20px !important; }
        }
      `}</style>

      {/* ── Cabeçalho ──────────────────────────────────────────────────── */}
      <header
        className="blog-index-header"
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
          <a href="/leiloes-receita-federal" className="btn btn--ghost btn--sm">
            Ver leilões
          </a>
          <a href="/entrar" className="btn btn--accent btn--sm">
            Começar grátis
          </a>
        </nav>
      </header>

      {/* ── Conteúdo principal ─────────────────────────────────────────── */}
      <main
        className="blog-index-main"
        style={{
          flex: 1,
          maxWidth: "760px",
          width: "100%",
          margin: "0 auto",
          padding: "60px 28px 100px",
        }}
      >
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" style={{ marginBottom: "32px" }}>
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
            <li aria-hidden="true" style={{ color: "var(--t-low)", fontSize: "13px" }}>
              ›
            </li>
            <li>
              <span style={{ color: "var(--t-low)", fontSize: "13px" }}>Blog</span>
            </li>
          </ol>
        </nav>

        {/* Herói */}
        <header style={{ marginBottom: "52px" }}>
          <span className="eyebrow" style={{ display: "block", marginBottom: "14px" }}>
            Blog · Leilões da Receita Federal
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
            Sem enrolação, sem promessa de lucro fácil
          </h1>

          <p
            style={{
              fontSize: "clamp(15px, 2vw, 17px)",
              lineHeight: 1.75,
              color: "var(--t-mid)",
              maxWidth: "600px",
            }}
          >
            Artigos honestos sobre leilões da Receita Federal: como funciona o processo, o que
            realmente custa, os erros mais comuns de quem está começando e como interpretar um
            edital sem precisar de advogado.
          </p>
        </header>

        {/* Cards dos posts */}
        <section aria-labelledby="posts-heading">
          <h2
            id="posts-heading"
            className="eyebrow"
            style={{ marginBottom: "20px" }}
          >
            Todos os artigos
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {POSTS.map((post) => (
              <PostCard key={post.href} post={post} />
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
            marginTop: "56px",
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
            Veja os lotes ativos com análise em tempo real
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
            Os artigos explicam o processo. A Fonte.ia coloca em prática: lotes organizados, score
            de oportunidade e alertas de prazo — tudo rastreável à fonte oficial.
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
            Experimentar 7 dias grátis
            <ArrowRight size={16} aria-hidden="true" />
          </a>
          <p style={{ fontSize: "12px", color: "var(--t-low)", marginTop: "12px" }}>
            sem contrato · dados rastreáveis à fonte oficial
          </p>
        </div>
      </main>

      {/* ── Rodapé ─────────────────────────────────────────────────────── */}
      <footer
        className="blog-index-footer"
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
          <a href="/guias" className="link small">
            Guias
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
