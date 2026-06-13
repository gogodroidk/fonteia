import { useEffect } from "react";
import { BookOpen, ArrowRight, Calculator, ChevronRight } from "lucide-react";
import { LogoMark } from "../../components/ui/logo-mark";
/* ── Shared primitives ───────────────────────────────────────────────────── */
function P({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: "16px", lineHeight: 1.7, color: "var(--t-mid)", marginBottom: "14px" }}>
      {children}
    </p>
  );
}

/* ── Guide card ─────────────────────────────────────────────────────────── */
interface GuideCardProps {
  href: string;
  eyebrow: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}

function GuideCard({ href, eyebrow, title, description, icon }: GuideCardProps) {
  return (
    <a
      href={href}
      style={{ textDecoration: "none", display: "block" }}
      aria-label={title}
    >
      <div
        className="card card--pad"
        style={{
          padding: "28px",
          transition: "box-shadow .2s, border-color .2s",
          cursor: "pointer",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.borderColor = "var(--accent)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.borderColor = "";
        }}
      >
        <div
          style={{
            width: "48px",
            height: "48px",
            borderRadius: "14px",
            background: "linear-gradient(135deg,var(--brand),var(--accent))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "18px",
            color: "#fff",
          }}
        >
          {icon}
        </div>
        <span
          className="eyebrow"
          style={{ display: "block", marginBottom: "8px", fontSize: "11px" }}
        >
          {eyebrow}
        </span>
        <h2
          className="h2"
          style={{
            fontSize: "18px",
            fontWeight: 700,
            color: "var(--t-hi)",
            marginBottom: "10px",
            lineHeight: 1.3,
          }}
        >
          {title}
        </h2>
        <p
          style={{
            fontSize: "14.5px",
            lineHeight: 1.65,
            color: "var(--t-mid)",
            marginBottom: "18px",
          }}
        >
          {description}
        </p>
        <span
          className="link"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "14px",
            fontWeight: 600,
          }}
        >
          Ler guia <ChevronRight size={15} aria-hidden="true" />
        </span>
      </div>
    </a>
  );
}

/* ── Main export ─────────────────────────────────────────────────────────── */
export function GuiasPage() {
  useEffect(() => {
    document.title =
      "Guias de leilão da Receita Federal — como comprar, passo a passo | Fonte.ia";

    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }
    meta.content =
      "Guias práticos sobre leilões da Receita Federal: como comprar passo a passo, diferenças entre leilão da Receita, judicial e de banco, e calculadora gratuita de lance.";
  }, []);

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
          .guias-header { padding-left: 20px !important; padding-right: 20px !important; }
          .guias-main   { padding-left: 20px !important; padding-right: 20px !important; }
          .guias-footer { padding-left: 20px !important; padding-right: 20px !important; }
          .guias-grid   { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header
        className="guias-header"
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
            <div
              style={{
                fontSize: "18px",
                fontWeight: 700,
                letterSpacing: "-0.02em",
              }}
            >
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
          aria-label="Ações"
          style={{ display: "flex", gap: "10px", alignItems: "center" }}
        >
          <a href="/entrar" className="btn btn--ghost btn--sm">
            Entrar
          </a>
          <a href="/entrar" className="btn btn--accent btn--sm">
            Começar grátis
          </a>
        </nav>
      </header>

      {/* ── Main ───────────────────────────────────────────────────────── */}
      <main
        className="guias-main"
        style={{
          flex: 1,
          maxWidth: "800px",
          width: "100%",
          margin: "0 auto",
          padding: "60px 28px 100px",
        }}
      >
        {/* Hero do hub */}
        <div style={{ marginBottom: "56px" }}>
          <span
            className="eyebrow"
            style={{ display: "block", marginBottom: "14px" }}
          >
            Central de guias
          </span>
          <h1
            className="h1"
            style={{
              fontSize: "clamp(28px, 6vw, 40px)",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              marginBottom: "18px",
              lineHeight: 1.1,
            }}
          >
            Leilão da Receita Federal:<br />entenda antes de dar o lance
          </h1>
          <P>
            Guias escritos para quem está começando e para quem já participa mas
            quer mais segurança. Cada artigo parte dos dados oficiais e termina com
            o que você precisa conferir no edital antes de dar uma proposta.
          </P>
          <P>
            A Fonte.ia organiza os lotes do{" "}
            <strong style={{ color: "var(--t-hi)" }}>
              Sistema de Leilão Eletrônico (SLE) da Receita Federal
            </strong>{" "}
            com rastreabilidade até a fonte e score por regra — para você decidir
            com fundamento, não com intuição.
          </P>
        </div>

        {/* Cards de guias */}
        <section aria-labelledby="guias-heading">
          <h2
            id="guias-heading"
            className="h2"
            style={{ fontSize: "13px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t-low)", marginBottom: "20px" }}
          >
            Guias disponíveis
          </h2>

          <div
            className="guias-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: "18px",
              marginBottom: "28px",
            }}
          >
            <GuideCard
              href="/guias/como-comprar-leilao-receita"
              eyebrow="Guia completo · passo a passo"
              title="Como comprar em leilão da Receita Federal (2026)"
              description="Do zero ao arremate: como habilitar conta gov.br, onde achar o edital, como dar o lance no SLE e o que fazer se ganhar. Com FAQ de dúvidas frequentes."
              icon={<BookOpen size={22} aria-hidden="true" />}
            />

            <GuideCard
              href="/guias/leilao-receita-vs-judicial"
              eyebrow="Comparação · qual escolher"
              title="Leilão da Receita vs judicial vs banco: diferenças e riscos"
              description="Tabela comparativa com o que cada tipo vende, quem organiza, como participar, formas de pagamento e os riscos mais comuns de cada modalidade."
              icon={<ArrowRight size={22} aria-hidden="true" />}
            />
          </div>
        </section>

        {/* Card da calculadora */}
        <section aria-labelledby="ferramentas-heading" style={{ marginBottom: "56px" }}>
          <h2
            id="ferramentas-heading"
            className="h2"
            style={{ fontSize: "13px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t-low)", marginBottom: "20px" }}
          >
            Ferramenta gratuita
          </h2>

          <a
            href="/ferramentas/calculadora-lance"
            style={{ textDecoration: "none", display: "block" }}
            aria-label="Calculadora de lance — ferramenta gratuita"
          >
            <div
              className="panel"
              style={{
                padding: "28px",
                borderColor: "color-mix(in srgb, var(--brand) 30%, var(--border))",
                transition: "border-color .2s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = "var(--brand)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = "";
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: "18px", flexWrap: "wrap" }}>
                <div
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "14px",
                    background: "color-mix(in srgb, var(--brand) 15%, var(--surface))",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    color: "var(--brand-ink)",
                  }}
                >
                  <Calculator size={22} aria-hidden="true" />
                </div>
                <div style={{ flex: 1, minWidth: "200px" }}>
                  <span
                    className="badge badge--accent"
                    style={{ fontSize: "10px", padding: "3px 8px", marginBottom: "8px", display: "inline-flex" }}
                  >
                    Grátis · sem cadastro
                  </span>
                  <h2
                    className="h2"
                    style={{
                      fontSize: "17px",
                      fontWeight: 700,
                      color: "var(--t-hi)",
                      marginBottom: "8px",
                    }}
                  >
                    Calculadora de lance
                  </h2>
                  <p
                    style={{
                      fontSize: "14.5px",
                      lineHeight: 1.65,
                      color: "var(--t-mid)",
                      marginBottom: "14px",
                    }}
                  >
                    Informe o lance mínimo e o valor que você toparia pagar. A
                    calculadora estima o impacto da comissão do leiloeiro (~5%) e
                    do ICMS sobre o total. Dados de referência — confirme valores
                    exatos no edital.
                  </p>
                  <span
                    className="link"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "14px",
                      fontWeight: 600,
                    }}
                  >
                    Abrir calculadora <ChevronRight size={15} aria-hidden="true" />
                  </span>
                </div>
              </div>
            </div>
          </a>
        </section>

        {/* CTA para a plataforma */}
        <div
          className="panel"
          style={{
            padding: "32px",
            textAlign: "center",
            background: "color-mix(in srgb, var(--accent) 6%, var(--surface))",
            borderColor: "color-mix(in srgb, var(--accent) 22%, var(--border))",
          }}
        >
          <span className="eyebrow" style={{ display: "block", marginBottom: "10px" }}>
            Fonte.ia
          </span>
          <p
            style={{
              fontSize: "17px",
              fontWeight: 600,
              color: "var(--t-hi)",
              marginBottom: "8px",
            }}
          >
            Raio-X com IA nos lotes da Receita Federal
          </p>
          <p
            style={{
              fontSize: "14.5px",
              lineHeight: 1.65,
              color: "var(--t-mid)",
              marginBottom: "22px",
              maxWidth: "500px",
              marginLeft: "auto",
              marginRight: "auto",
            }}
          >
            Reunimos todos os lotes do SLE com score por regra, análise do edital e
            alertas de prazo. Você decide — com rastreabilidade até a fonte oficial.
            Sem inventar dado, sem prometer lucro.
          </p>
          <a
            href="/entrar"
            className="btn btn--accent btn--lg"
            style={{ minWidth: "200px" }}
          >
            Explorar lotes grátis
          </a>
          <p
            className="muted"
            style={{ fontSize: "12px", marginTop: "12px" }}
          >
            7 dias grátis · sem contrato · cancele quando quiser
          </p>
        </div>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer
        className="guias-footer"
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
          <a href="/guias/como-comprar-leilao-receita" className="link small">
            Como comprar
          </a>
          <a href="/guias/leilao-receita-vs-judicial" className="link small">
            Comparação
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
