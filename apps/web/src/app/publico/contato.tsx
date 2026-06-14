import { LogoMark } from "../../components/ui/logo-mark";
import {
  useSeo,
  breadcrumbJsonLd,
  SITE_URL,
} from "../../lib/seo";
import { Mail, HelpCircle, FileText } from "lucide-react";

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

/* ── Card de canal de contato ─────────────────────────────────────────────── */
function CanalCard({
  icon,
  titulo,
  descricao,
  link,
  linkLabel,
}: {
  icon: React.ReactNode;
  titulo: string;
  descricao: string;
  link: string;
  linkLabel: string;
}) {
  return (
    <div
      className="card card--pad"
      style={{ padding: "22px 24px", display: "flex", gap: "16px", alignItems: "flex-start" }}
    >
      <div
        style={{
          width: "40px",
          height: "40px",
          borderRadius: "12px",
          background: "color-mix(in srgb, var(--accent) 10%, var(--surface))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--accent-ink)",
          flexShrink: 0,
          marginTop: "2px",
        }}
        aria-hidden="true"
      >
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ fontWeight: 700, fontSize: "15px", color: "var(--t-hi)", margin: "0 0 6px" }}>
          {titulo}
        </p>
        <p style={{ fontSize: "13.5px", lineHeight: 1.65, color: "var(--t-mid)", margin: "0 0 12px" }}>
          {descricao}
        </p>
        <a href={link} className="link" style={{ fontSize: "14px", fontWeight: 600 }}>
          {linkLabel}
        </a>
      </div>
    </div>
  );
}

/* ── Link rápido ─────────────────────────────────────────────────────────── */
function LinkRapido({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <a
      href={href}
      className="card card--pad"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "12px 16px",
        textDecoration: "none",
        fontSize: "14px",
        fontWeight: 600,
        color: "var(--t-hi)",
      }}
    >
      <span style={{ color: "var(--accent-ink)", flexShrink: 0 }} aria-hidden="true">
        {icon}
      </span>
      {label}
    </a>
  );
}

/* ── Página principal ─────────────────────────────────────────────────────── */
export function ContatoPage() {
  const TITLE = "Contato — Fale com a Fonte.ia | Fonte.ia";
  const DESCRIPTION =
    "Entre em contato com a Fonte.ia por e-mail. Olli Inteligência Digital Sistemas LTDA · CNPJ 65.361.266/0001-05 · contato@fontebrasil.online.";

  useSeo({
    title: TITLE,
    description: DESCRIPTION,
    canonicalPath: "/contato",
    jsonLd: [
      breadcrumbJsonLd([
        { name: "Início", url: SITE_URL + "/" },
        { name: "Contato", url: SITE_URL + "/contato" },
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
          .contato-header { padding-left: 20px !important; padding-right: 20px !important; }
          .contato-main   { padding-left: 20px !important; padding-right: 20px !important; }
          .contato-footer { padding-left: 20px !important; padding-right: 20px !important; }
          .contato-links  { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ── Cabeçalho ───────────────────────────────────────────────────── */}
      <header
        className="contato-header"
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
          aria-label="Navegação principal"
          style={{ display: "flex", gap: "10px", alignItems: "center" }}
        >
          <a href="/sobre" className="btn btn--ghost btn--sm">
            Sobre
          </a>
          <a href="/para-quem" className="btn btn--ghost btn--sm">
            Para quem
          </a>
          <a href="/entrar" className="btn btn--accent btn--sm">
            Começar grátis
          </a>
        </nav>
      </header>

      {/* ── Conteúdo principal ──────────────────────────────────────────── */}
      <main
        className="contato-main"
        style={{
          flex: 1,
          maxWidth: "680px",
          width: "100%",
          margin: "0 auto",
          padding: "60px 28px 100px",
        }}
      >
        {/* Breadcrumb */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: "20px",
          }}
        >
          <a href="/" className="link small" style={{ fontSize: "13px" }}>
            Início
          </a>
          <span style={{ color: "var(--t-low)", fontSize: "13px" }} aria-hidden="true">
            ›
          </span>
          <span style={{ color: "var(--t-low)", fontSize: "13px" }}>Contato</span>
        </div>

        {/* Herói */}
        <header style={{ marginBottom: "48px" }}>
          <span className="eyebrow" style={{ display: "block", marginBottom: "14px" }}>
            Fale conosco
          </span>
          <h1
            style={{
              fontSize: "clamp(26px, 6vw, 40px)",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              lineHeight: 1.1,
              marginBottom: "20px",
            }}
          >
            Vamos conversar
          </h1>
          <P>
            Seja para entender melhor a plataforma antes de assinar, tirar uma dúvida técnica,
            propor uma parceria ou falar com a imprensa — estamos disponíveis. Respondemos com
            atenção, sem script de atendimento.
          </P>
        </header>

        {/* Canais de contato */}
        <section aria-labelledby="canais-heading" style={{ marginBottom: "48px" }}>
          <h2
            id="canais-heading"
            style={{
              fontSize: "clamp(18px, 3vw, 22px)",
              fontWeight: 800,
              letterSpacing: "-0.02em",
              marginBottom: "16px",
              color: "var(--t-hi)",
            }}
          >
            Canais disponíveis
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <CanalCard
              icon={<Mail size={20} />}
              titulo="E-mail"
              descricao="Para dúvidas comerciais, suporte técnico, imprensa e parcerias. Respondemos em até 1 dia útil."
              link="mailto:contato@fontebrasil.online"
              linkLabel="contato@fontebrasil.online"
            />
          </div>
        </section>

        {/* Dados da empresa */}
        <section aria-labelledby="empresa-heading" style={{ marginBottom: "48px" }}>
          <h2
            id="empresa-heading"
            style={{
              fontSize: "clamp(18px, 3vw, 22px)",
              fontWeight: 800,
              letterSpacing: "-0.02em",
              marginBottom: "16px",
              color: "var(--t-hi)",
            }}
          >
            Dados da empresa
          </h2>

          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              padding: "22px 26px",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: "13.5px",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {[
                  ["Razão Social", "Olli Inteligência Digital Sistemas LTDA"],
                  ["CNPJ", "65.361.266/0001-05"],
                  ["Natureza", "Sociedade Limitada"],
                  ["E-mail", "contato@fontebrasil.online"],
                ].map(([label, value]) => (
                  <tr key={label}>
                    <td
                      style={{
                        padding: "7px 14px 7px 0",
                        color: "var(--t-low)",
                        whiteSpace: "nowrap",
                        verticalAlign: "top",
                        minWidth: "120px",
                      }}
                    >
                      {label}
                    </td>
                    <td
                      style={{
                        padding: "7px 0",
                        color: "var(--t-hi)",
                        fontWeight: 600,
                      }}
                    >
                      {label === "E-mail" ? (
                        <a href="mailto:contato@fontebrasil.online" className="link">
                          {value}
                        </a>
                      ) : (
                        value
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Links rápidos */}
        <section aria-labelledby="links-heading" style={{ marginBottom: "40px" }}>
          <h2
            id="links-heading"
            style={{
              fontSize: "clamp(18px, 3vw, 22px)",
              fontWeight: 800,
              letterSpacing: "-0.02em",
              marginBottom: "16px",
              color: "var(--t-hi)",
            }}
          >
            Antes de entrar em contato
          </h2>
          <P>
            Muitas dúvidas comuns já estão respondidas aqui:
          </P>
          <div
            className="contato-links"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "10px",
            }}
          >
            <LinkRapido
              href="/faq"
              icon={<HelpCircle size={16} />}
              label="Perguntas frequentes (FAQ)"
            />
            <LinkRapido
              href="/guias"
              icon={<FileText size={16} />}
              label="Guias sobre leilões"
            />
            <LinkRapido
              href="/seguranca"
              icon={<FileText size={16} />}
              label="Segurança e privacidade"
            />
            <LinkRapido
              href="/sobre"
              icon={<FileText size={16} />}
              label="Sobre a empresa"
            />
          </div>
        </section>
      </main>

      {/* ── Rodapé institucional ─────────────────────────────────────────── */}
      <footer
        className="contato-footer"
        style={{
          borderTop: "1px solid var(--border)",
          padding: "32px 48px",
          background: "var(--surface)",
        }}
      >
        <div
          style={{
            maxWidth: "1100px",
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            gap: "24px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              flexWrap: "wrap",
              gap: "24px",
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
              <a href="/sobre" className="link small">
                Sobre
              </a>
              <a href="/seguranca" className="link small">
                Segurança
              </a>
              <a href="/para-quem" className="link small">
                Para quem
              </a>
              <a href="/contato" className="link small">
                Contato
              </a>
              <a href="/privacidade" className="link small" style={{ color: "var(--t-low)" }}>
                Privacidade
              </a>
              <a href="/termos" className="link small" style={{ color: "var(--t-low)" }}>
                Termos
              </a>
            </nav>
          </div>

          <div
            style={{
              borderTop: "1px solid var(--border)",
              paddingTop: "16px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "8px",
            }}
          >
            <span className="small" style={{ color: "var(--t-low)", fontSize: "12.5px" }}>
              Olli Inteligência Digital Sistemas LTDA · CNPJ 65.361.266/0001-05
            </span>
            <span className="small" style={{ color: "var(--t-low)", fontSize: "12.5px" }}>
              © {new Date().getFullYear()} Fonte.ia · Dados públicos, decisões rastreáveis.
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
