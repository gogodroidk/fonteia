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

/* ── Cabeçalho de coluna da tabela ───────────────────────────────────────── */
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
        color: accent ? "var(--accent-ink)" : "var(--t-low)",
        background: accent
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
  planilha: React.ReactNode;
  planilhaNeg?: boolean;
  planilhaPos?: boolean;
  fonteia: React.ReactNode;
  fonteiaPos?: boolean;
  fonteiaNeg?: boolean;
}

const ROWS: CompRow[] = [
  {
    criterio: "Custo",
    planilha: "Grátis (Google Sheets ou Excel)",
    planilhaPos: true,
    fonteia: "A partir de R$ 299/mês — teste grátis por 7 dias",
    fonteiaNeg: true,
  },
  {
    criterio: "Coleta dos lotes",
    planilha: "Manual: você visita o site da Receita, copia dado a dado",
    planilhaNeg: true,
    fonteia: "Automática: todos os lotes do SLE reunidos e atualizados",
    fonteiaPos: true,
  },
  {
    criterio: "Atualização dos dados",
    planilha: "Você atualiza quando lembrar — risco de dado desatualizado",
    planilhaNeg: true,
    fonteia: "Automática, com rastreabilidade até o edital original",
    fonteiaPos: true,
  },
  {
    criterio: "Cálculo do custo total",
    planilha: "Você monta a fórmula manualmente (comissão, tributos, frete…)",
    planilhaNeg: true,
    fonteia: "Calculadora embutida por lote — soma comissão, margem e extras",
    fonteiaPos: true,
  },
  {
    criterio: "Leitura do edital",
    planilha: "Você abre o PDF, lê e anota o que importa à mão",
    planilhaNeg: true,
    fonteia: "Pontos-chave extraídos pelo Raio-X — link ao PDF original sempre visível",
    fonteiaPos: true,
  },
  {
    criterio: "Alertas de prazo",
    planilha: "Nenhum nativo — você precisa criar lembretes manualmente",
    planilhaNeg: true,
    fonteia: "Notificações automáticas de vencimento de lance e pagamento",
    fonteiaPos: true,
  },
  {
    criterio: "Rastreabilidade da fonte",
    planilha: "Depende da sua disciplina — fácil perder de onde veio cada dado",
    planilhaNeg: true,
    fonteia: "Todo dado tem link direto ao edital oficial no gov.br",
    fonteiaPos: true,
  },
  {
    criterio: "Tempo gasto por lote",
    planilha: "15–40 min por lote (pesquisa, leitura, planilha)",
    planilhaNeg: true,
    fonteia: "2–5 min por lote (dados já organizados, análise rápida)",
    fonteiaPos: true,
  },
  {
    criterio: "Risco de erro humano",
    planilha: "Alto: fórmula errada, dado copiado errado, linha apagada",
    planilhaNeg: true,
    fonteia: "Reduzido no processo — mas você ainda toma a decisão final",
    fonteiaPos: true,
  },
  {
    criterio: "Flexibilidade",
    planilha: "Total: coluna do jeito que você quiser, filtros personalizados",
    planilhaPos: true,
    fonteia: "Filtros padrão do sistema — menos personalização livre",
    fonteiaNeg: true,
  },
];

/* ── SEO ─────────────────────────────────────────────────────────────────── */
const PAGE_TITLE = "Fonte.ia vs planilha manual: comparação honesta | Fonte.ia";
const PAGE_DESC =
  "Comparação direta entre usar a Fonte.ia e controlar leilões da Receita Federal em planilha: tempo, custo, rastreabilidade e erro humano. Honesto sobre o que cada um faz melhor.";
const CANONICAL = "/fonteia-vs-planilha";

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
    { name: "Fonte.ia vs Planilha", url: `${SITE_URL}${CANONICAL}` },
  ]),
] as const;

/* ── Página principal ────────────────────────────────────────────────────── */
export function FonteiaVsPlanilhaPage() {
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
          .vspl-header { padding-left: 20px !important; padding-right: 20px !important; }
          .vspl-main   { padding-left: 20px !important; padding-right: 20px !important; }
          .vspl-footer { padding-left: 20px !important; padding-right: 20px !important; }
          .vspl-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        }
      `}</style>

      {/* ── Cabeçalho ───────────────────────────────────────────────────── */}
      <header
        className="vspl-header"
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
        className="vspl-main"
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
                Fonte.ia vs Planilha
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
              Fonte.ia vs planilha manual: o que muda na prática
            </h1>

            <P>
              Planilha é uma solução real para organizar leilões. Custa zero, é flexível e
              funciona para quem acompanha poucos lotes por mês. A Fonte.ia automatiza o que a
              planilha exige de você manualmente — e reduz o risco de erro humano num processo
              onde errar o custo total sai caro. Abaixo, a comparação sem rodeios.
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
              className="vspl-table-wrap"
              style={{
                borderRadius: "14px",
                overflow: "hidden",
                border: "1px solid var(--border)",
              }}
            >
              <table
                style={{ width: "100%", borderCollapse: "collapse", minWidth: "560px" }}
                aria-label="Comparação entre Fonte.ia e planilha manual"
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
                    <ColHead>Planilha manual</ColHead>
                    <ColHead accent>Fonte.ia</ColHead>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((row) => (
                    <tr key={row.criterio}>
                      <RowLabel>{row.criterio}</RowLabel>
                      <Td positive={row.planilhaPos} negative={row.planilhaNeg}>
                        {row.planilha}
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
              Avaliação honesta baseada no uso real. Condições variam — confirme o que importa
              para o seu caso.
            </p>
          </section>

          {/* Quando a planilha ainda faz sentido */}
          <section aria-labelledby="planilha-ok-heading" style={{ marginBottom: "56px" }}>
            <h2
              id="planilha-ok-heading"
              style={{
                fontSize: "clamp(18px, 4vw, 24px)",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                marginBottom: "20px",
                color: "var(--t-hi)",
              }}
            >
              Quando a planilha ainda faz sentido
            </h2>

            <P>
              Se você participa de um leilão por mês ou menos, tem tempo sobrando para coletar
              os dados manualmente e não precisa de alertas automáticos, a planilha cumpre o
              papel. É grátis, você controla tudo e não depende de nenhuma plataforma.
            </P>

            <P>
              O problema começa quando o volume aumenta. Acompanhar cinco, dez lotes
              simultaneamente com datas diferentes, editais em PDF e cálculos de custo distintos
              por lote é uma tarefa que cresce rápido — e o erro humano cresce junto. Uma fórmula
              errada na planilha pode fazer você pagar mais do que deveria em um arremate.
            </P>
          </section>

          {/* Quando a Fonte.ia faz sentido */}
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
              Quando a Fonte.ia vale o custo
            </h2>

            <P>
              A Fonte.ia faz sentido quando você quer gastar menos tempo coletando dados e mais
              tempo analisando se o lote vale a pena — e quando rastrear a fonte de cada
              informação importa para você. O custo mensal se justifica quando você evita
              um único erro de cálculo ou perde um único lote bom por não ter recebido o alerta
              de prazo a tempo.
            </P>

            <P>
              Também faz sentido para quem acompanha leilões como atividade recorrente (não só
              esporádica) e quer ter um histórico organizado das análises, sem precisar montar
              e manter planilhas do zero.
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
              garante que você vai arrematar bem nem que vai lucrar. Ela melhora o processo de
              pesquisa e análise — mas a decisão final, com todos os riscos, continua sendo sua.
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
              Experimente antes de decidir se vale substituir a planilha
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
              Acesse os lotes da Receita Federal com dados organizados, custo estimado e alertas
              de prazo. Sem compromisso nos primeiros 7 dias.
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
                href="/fonteia-vs-analise-manual"
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
                Fonte.ia vs análise manual no site da Receita
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
            </div>
          </nav>

        </article>
      </main>

      {/* ── Rodapé ──────────────────────────────────────────────────────────── */}
      <footer
        className="vspl-footer"
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
