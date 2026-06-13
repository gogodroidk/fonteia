import { ArrowRight, BookOpen, CheckCircle2, XCircle } from "lucide-react";
import { LogoMark } from "../../components/ui/logo-mark";
import {
  useSeo,
  articleJsonLd,
  breadcrumbJsonLd,
  SITE_URL,
} from "../../lib/seo";
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

/* ── Cabeçalho de coluna ─────────────────────────────────────────────────── */
function ColHead({
  children,
  accent,
}: {
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <th
      scope="col"
      style={{
        padding: "12px 16px",
        fontWeight: 700,
        fontSize: "13px",
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        color: accent === true ? "var(--accent-ink)" : "var(--t-low)",
        background:
          accent === true
            ? "color-mix(in srgb, var(--accent) 8%, var(--surface))"
            : "var(--surface-2)",
        borderBottom: "1px solid var(--border)",
        textAlign: "left",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}

/* ── Rótulo de linha ─────────────────────────────────────────────────────── */
function RowLabel({ children }: { children: React.ReactNode }) {
  return (
    <th
      scope="row"
      style={{
        padding: "12px 16px",
        fontWeight: 600,
        fontSize: "13.5px",
        color: "var(--t-hi)",
        background: "var(--surface-2)",
        borderBottom: "1px solid var(--border)",
        textAlign: "left",
        verticalAlign: "top",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}

/* ── Célula de dado ──────────────────────────────────────────────────────── */
function Td({
  children,
  accent,
  positive,
  negative,
}: {
  children: React.ReactNode;
  accent?: boolean | undefined;
  positive?: boolean | undefined;
  negative?: boolean | undefined;
}) {
  let iconEl: React.ReactNode = null;
  if (positive === true) {
    iconEl = (
      <CheckCircle2
        size={14}
        aria-hidden="true"
        style={{ color: "var(--ok, #16a34a)", flexShrink: 0, marginTop: "2px" }}
      />
    );
  } else if (negative === true) {
    iconEl = (
      <XCircle
        size={14}
        aria-hidden="true"
        style={{ color: "#dc2626", flexShrink: 0, marginTop: "2px" }}
      />
    );
  }

  return (
    <td
      style={{
        padding: "12px 16px",
        fontSize: "14px",
        lineHeight: 1.6,
        color: accent === true ? "var(--t-hi)" : "var(--t-mid)",
        fontWeight: accent === true ? 500 : 400,
        borderBottom: "1px solid var(--border)",
        background:
          accent === true
            ? "color-mix(in srgb, var(--accent) 4%, transparent)"
            : "transparent",
        verticalAlign: "top",
      }}
    >
      {iconEl !== null ? (
        <span style={{ display: "flex", gap: "7px", alignItems: "flex-start" }}>
          {iconEl}
          <span>{children}</span>
        </span>
      ) : (
        children
      )}
    </td>
  );
}

/* ── Dados da tabela ─────────────────────────────────────────────────────── */
interface CompRow {
  criterio: string;
  manual: React.ReactNode;
  manualNeg?: boolean;
  manualPos?: boolean;
  fonteia: React.ReactNode;
  fonteiaPos?: boolean;
  fonteiaNeg?: boolean;
}

const ROWS: CompRow[] = [
  {
    criterio: "Custo",
    manual: "Grátis — o site da Receita é público",
    manualPos: true,
    fonteia: "A partir de R$ 299/mês — 7 dias grátis para testar",
    fonteiaNeg: true,
  },
  {
    criterio: "Achar os lotes",
    manual: "Você navega pelo SLE edital por edital, sem filtros avançados",
    manualNeg: true,
    fonteia: "Todos os lotes reunidos, com busca por categoria, valor e prazo",
    fonteiaPos: true,
  },
  {
    criterio: "Ler o edital PDF",
    manual: "Você abre cada PDF, rola até achar o que importa — 10 a 30 min por lote",
    manualNeg: true,
    fonteia: "Raio-X extrai pontos-chave (prazo, restrições, valor mínimo) — PDF original sempre linkado",
    fonteiaPos: true,
  },
  {
    criterio: "Estimar valor e custo",
    manual: "Você pesquisa preço de mercado e calcula comissão + frete manualmente",
    manualNeg: true,
    fonteia: "Calculadora embutida por lote — insira o valor de mercado estimado e veja o lance sugerido",
    fonteiaPos: true,
  },
  {
    criterio: "Acompanhar prazos",
    manual: "Você memoriza ou anota manualmente — fácil perder a data",
    manualNeg: true,
    fonteia: "Alertas automáticos por e-mail de vencimento de lance e de pagamento",
    fonteiaPos: true,
  },
  {
    criterio: "Comparar lotes",
    manual: "Você alterna entre abas, copia dados, compara na cabeça ou na planilha",
    manualNeg: true,
    fonteia: "Lista padronizada com os mesmos campos em todos os lotes para comparar lado a lado",
    fonteiaPos: true,
  },
  {
    criterio: "Rastreabilidade dos dados",
    manual: "O site da Receita é a fonte — mas você mesmo organiza (ou não) o que anotou",
    manualPos: true,
    fonteia: "Todo dado tem link direto ao edital original no gov.br — rastreável mesmo meses depois",
    fonteiaPos: true,
  },
  {
    criterio: "Histórico de análises",
    manual: "Sem histórico nativo — você salva o que quiser, do jeito que quiser",
    manualNeg: true,
    fonteia: "Lotes salvos com análise preservada para revisitar depois",
    fonteiaPos: true,
  },
  {
    criterio: "Acesso mobile",
    manual: "Site da Receita é funcional no celular, mas PDF é difícil de ler",
    manualNeg: true,
    fonteia: "Interface mobile-first — análise e alertas funcionam bem no celular",
    fonteiaPos: true,
  },
  {
    criterio: "Controle total",
    manual: "Você decide o que ver, como anotar e como organizar — sem limitação",
    manualPos: true,
    fonteia: "Dentro do sistema — filtros e campos definidos pela plataforma",
    fonteiaNeg: true,
  },
];

/* ── SEO ─────────────────────────────────────────────────────────────────── */
const PAGE_TITLE =
  "Fonte.ia vs análise manual no site da Receita Federal | Fonte.ia";
const PAGE_DESC =
  "Comparação direta entre usar a Fonte.ia e fazer tudo manualmente no site da Receita Federal: tempo gasto, rastreabilidade, alertas de prazo e custo. Honesto sobre o que cada abordagem faz melhor.";
const CANONICAL = "/fonteia-vs-analise-manual";

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
    { name: "Fonte.ia vs Análise Manual", url: `${SITE_URL}${CANONICAL}` },
  ]),
] as const;

/* ── Página principal ────────────────────────────────────────────────────── */
export function FonteiaVsManualPage() {
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
          .vsm-header { padding-left: 20px !important; padding-right: 20px !important; }
          .vsm-main   { padding-left: 20px !important; padding-right: 20px !important; }
          .vsm-footer { padding-left: 20px !important; padding-right: 20px !important; }
          .vsm-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        }
      `}</style>

      {/* ── Cabeçalho ───────────────────────────────────────────────────── */}
      <header
        className="vsm-header"
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
        className="vsm-main"
        style={{
          flex: 1,
          maxWidth: "800px",
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
                Comparações
              </a>
              <span style={{ color: "var(--t-low)", fontSize: "13px" }} aria-hidden="true">›</span>
              <span className="small" style={{ color: "var(--t-low)", fontSize: "13px" }}>
                Fonte.ia vs análise manual
              </span>
            </div>

            <span className="eyebrow" style={{ display: "block", marginBottom: "14px" }}>
              Comparação honesta · sem exagero
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
              Fonte.ia vs análise manual no site da Receita
            </h1>

            <P>
              O site da Receita Federal tem tudo que você precisa — de graça. Os editais são
              públicos, os dados são oficiais e qualquer um com conta gov.br pode participar.
              O problema não é o acesso: é o tempo e a organização. Analisar lotes manualmente
              funciona para quem acompanha pouco. Para quem quer acompanhar mais, o processo fica
              lento e sujeito a erro. Abaixo, a comparação sem eufemismos.
            </P>
          </header>

          {/* Tabela comparativa */}
          <section aria-labelledby="tabela-heading" style={{ marginBottom: "56px" }}>
            <h2
              id="tabela-heading"
              style={{
                fontSize: "clamp(18px, 4vw, 24px)",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                marginBottom: "16px",
                color: "var(--t-hi)",
              }}
            >
              Comparativo
            </h2>

            <div
              className="vsm-table-wrap"
              style={{
                borderRadius: "14px",
                overflow: "hidden",
                border: "1px solid var(--border)",
              }}
            >
              <table
                style={{ width: "100%", borderCollapse: "collapse", minWidth: "560px" }}
                aria-label="Comparação entre Fonte.ia e análise manual no site da Receita"
              >
                <thead>
                  <tr>
                    <th
                      scope="col"
                      style={{
                        padding: "12px 16px",
                        fontSize: "12px",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        color: "var(--t-low)",
                        background: "var(--surface-2)",
                        borderBottom: "1px solid var(--border)",
                        textAlign: "left",
                        width: "22%",
                      }}
                    >
                      Critério
                    </th>
                    <ColHead>Análise manual (site da Receita)</ColHead>
                    <ColHead accent>Fonte.ia</ColHead>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((row) => (
                    <tr key={row.criterio}>
                      <RowLabel>{row.criterio}</RowLabel>
                      <Td positive={row.manualPos} negative={row.manualNeg}>
                        {row.manual}
                      </Td>
                      <Td accent positive={row.fonteiaPos} negative={row.fonteiaNeg}>
                        {row.fonteia}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p
              className="muted"
              style={{ fontSize: "12px", marginTop: "10px", color: "var(--t-low)" }}
            >
              Avaliação honesta baseada no uso real. O site da Receita Federal é sempre a fonte
              primária — a Fonte.ia organiza, não substitui.
            </p>
          </section>

          {/* Quando a análise manual ainda faz sentido */}
          <section aria-labelledby="manual-ok-heading" style={{ marginBottom: "56px" }}>
            <h2
              id="manual-ok-heading"
              style={{
                fontSize: "clamp(18px, 4vw, 24px)",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                marginBottom: "20px",
                color: "var(--t-hi)",
              }}
            >
              Quando vale fazer tudo no site da Receita
            </h2>

            <P>
              Se você está começando, quer entender o processo do zero ou vai participar de um
              único leilão, fazer tudo no site da Receita é a escolha certa. É grátis, você
              vai direto à fonte e aprende exatamente como funciona cada parte do edital.
            </P>

            <P>
              Saber navegar no site da Receita e ler um edital são habilidades que fazem diferença
              independente de qual ferramenta você use depois. Quem não sabe o que está em um
              edital não deveria delegar essa leitura para uma plataforma — deveria aprender
              primeiro.
            </P>

            <div
              style={{
                background: "color-mix(in srgb, var(--brand) 5%, transparent)",
                border: "1px solid color-mix(in srgb, var(--brand) 18%, transparent)",
                borderRadius: "12px",
                padding: "16px 20px",
                marginBottom: "20px",
                fontSize: "14.5px",
                lineHeight: 1.65,
                color: "var(--t-mid)",
              }}
              role="note"
            >
              <strong style={{ color: "var(--t-hi)" }}>Ponto importante:</strong> a Fonte.ia
              sempre linka o edital original. Se a análise automática e o documento original
              divergirem, o edital prevalece — e é o único documento juridicamente válido.
            </div>
          </section>

          {/* Quando a Fonte.ia vale */}
          <section aria-labelledby="fonteia-ok-heading" style={{ marginBottom: "56px" }}>
            <h2
              id="fonteia-ok-heading"
              style={{
                fontSize: "clamp(18px, 4vw, 24px)",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                marginBottom: "20px",
                color: "var(--t-hi)",
              }}
            >
              Quando a Fonte.ia começa a valer o custo
            </h2>

            <P>
              A Fonte.ia vale quando o custo do tempo começa a superar o custo da assinatura. Se
              você passa 2 horas por semana navegando em edital atrás de edital, fazendo contas
              soltas e tentando lembrar de qual lote vence quando — o tempo já custa mais do que
              R$ 299/mês para a maioria das pessoas que trabalha.
            </P>

            <P>
              Ela também vale quando a rastreabilidade importa: saber que dado veio de qual versão
              do edital, quando você analisou e por quê decidiu não arrematar. Essa memória de
              análise não existe no processo manual, a não ser que você mesmo a construa.
            </P>

            <div
              role="note"
              style={{
                background: "color-mix(in srgb, var(--accent) 6%, transparent)",
                border: "1px solid color-mix(in srgb, var(--accent) 20%, transparent)",
                borderRadius: "12px",
                padding: "16px 20px",
                marginBottom: "20px",
                fontSize: "14.5px",
                lineHeight: 1.65,
                color: "var(--t-mid)",
              }}
            >
              <strong style={{ color: "var(--t-hi)" }}>Honestidade:</strong> a Fonte.ia não
              garante resultado, não promete lucro e não elimina o risco do leilão. Ela reduz o
              tempo de pesquisa e melhora a organização — o julgamento sobre cada lote é sempre
              seu.
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
              Fonte.ia — 7 dias grátis
            </span>
            <p
              style={{
                fontSize: "17px",
                fontWeight: 600,
                color: "var(--t-hi)",
                marginBottom: "10px",
              }}
            >
              Teste ao lado do site da Receita e veja se faz diferença para você
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
              Lotes organizados, Raio-X do edital, calculadora de lance e alertas de prazo.
              O edital original sempre linkado. Sem inventar dado, sem prometer lucro.
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
            <p className="muted" style={{ fontSize: "12px", marginTop: "12px" }}>
              Sem contrato · cancele quando quiser
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
                href="/fonteia-vs-planilha"
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
                Fonte.ia vs planilha manual
              </a>
              <a
                href="/riscos-leiloes-publicos"
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
                Riscos dos leilões públicos
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
                Como comprar na Receita Federal
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
        className="vsm-footer"
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
          <a href="/leiloes-receita-federal" className="link small">Lotes</a>
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
