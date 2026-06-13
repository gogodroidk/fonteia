import { useEffect } from "react";
import { ArrowRight, BookOpen, ShieldCheck } from "lucide-react";
import { LogoMark } from "../../components/ui/logo-mark";
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

/* ── Célula da tabela ────────────────────────────────────────────────────── */
function Td({
  children,
  header,
  accent,
}: {
  children: React.ReactNode;
  header?: boolean;
  accent?: boolean;
}) {
  if (header) {
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

  return (
    <td
      style={{
        padding: "12px 16px",
        fontSize: "14px",
        lineHeight: 1.6,
        color: accent ? "var(--t-hi)" : "var(--t-mid)",
        fontWeight: accent ? 500 : 400,
        borderBottom: "1px solid var(--border)",
        background: accent
          ? "color-mix(in srgb, var(--accent) 4%, transparent)"
          : "transparent",
        verticalAlign: "top",
      }}
    >
      {children}
    </td>
  );
}

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

/* ── Página principal ────────────────────────────────────────────────────── */
export function GuiaComparacaoPage() {
  useEffect(() => {
    document.title =
      "Leilão da Receita Federal vs leilão judicial vs leilão de banco | Fonte.ia";

    const META_DESC =
      "Tabela comparativa: diferenças entre leilão da Receita Federal, leilão judicial e leilão de banco — o que é vendido, quem organiza, como participar, riscos e onde achar cada um.";

    const existing = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (existing) {
      existing.content = META_DESC;
    } else {
      const meta = document.createElement("meta");
      meta.name = "description";
      meta.content = META_DESC;
      document.head.appendChild(meta);
    }
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
          .guia-comp-header { padding-left: 20px !important; padding-right: 20px !important; }
          .guia-comp-main   { padding-left: 20px !important; padding-right: 20px !important; }
          .guia-comp-footer { padding-left: 20px !important; padding-right: 20px !important; }
          .comp-table-wrap  { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        }
      `}</style>

      {/* ── Cabeçalho ────────────────────────────────────────────────────── */}
      <header
        className="guia-comp-header"
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

      {/* ── Conteúdo principal ───────────────────────────────────────────── */}
      <main
        className="guia-comp-main"
        style={{
          flex: 1,
          maxWidth: "800px",
          width: "100%",
          margin: "0 auto",
          padding: "60px 28px 100px",
        }}
      >
        <article>

          {/* Breadcrumb + título */}
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
                Comparação de modalidades
              </span>
            </div>

            <span className="eyebrow" style={{ display: "block", marginBottom: "14px" }}>
              Comparação · qual escolher
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
              Leilão da Receita Federal vs judicial vs banco: diferenças e riscos
            </h1>

            <P>
              "Leilão" é um guarda-chuva que cobre modalidades bem diferentes — com regras,
              riscos e processos próprios. Este guia explica cada uma em linguagem direta e as
              compara numa tabela, para você saber com o que está lidando antes de dar o
              primeiro lance.
            </P>
          </header>

          {/* Três modalidades em texto */}
          <section aria-labelledby="tipos-heading" style={{ marginBottom: "48px" }}>
            <h2
              id="tipos-heading"
              style={{
                fontSize: "clamp(18px, 4vw, 24px)",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                marginBottom: "28px",
                color: "var(--t-hi)",
              }}
            >
              As três principais modalidades
            </h2>

            {/* Receita Federal */}
            <div
              className="panel"
              style={{
                padding: "24px",
                marginBottom: "16px",
                borderColor: "color-mix(in srgb, var(--accent) 28%, var(--border))",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                <span
                  className="badge badge--accent"
                  style={{ fontSize: "11px", padding: "3px 9px" }}
                >
                  Receita Federal
                </span>
                <span
                  className="badge"
                  style={{
                    fontSize: "10px",
                    padding: "2px 8px",
                    background: "color-mix(in srgb, var(--ok, #22c55e) 10%, transparent)",
                    color: "var(--ok, #16a34a)",
                    border: "1px solid color-mix(in srgb, var(--ok, #22c55e) 25%, transparent)",
                  }}
                >
                  Foco atual da Fonte.ia
                </span>
              </div>
              <P>
                O <strong style={{ color: "var(--t-hi)" }}>leilão da Receita Federal</strong> vende
                mercadorias apreendidas em alfândegas, portos e aeroportos (eletrônicos, roupas,
                veículos, bebidas, equipamentos) e bens abandonados por importadores. Os leilões
                são realizados pelo{" "}
                <strong style={{ color: "var(--t-hi)" }}>
                  Sistema de Leilão Eletrônico (SLE)
                </strong>{" "}
                com leiloeiros oficiais habilitados pelo governo. Pessoa física com conta gov.br
                prata ou ouro pode participar da maioria dos lotes, sem necessidade de CNPJ.
                Os editais e dados são públicos. O pagamento é via DARF. Os bens são vendidos sem
                garantia e podem ter restrições de revenda dependendo da origem.
              </P>
            </div>

            {/* Judicial */}
            <div className="panel" style={{ padding: "24px", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                <span
                  className="badge"
                  style={{
                    fontSize: "11px",
                    padding: "3px 9px",
                    background: "color-mix(in srgb, var(--brand) 10%, transparent)",
                    color: "var(--brand-ink)",
                    border: "1px solid color-mix(in srgb, var(--brand) 22%, transparent)",
                  }}
                >
                  Leilão Judicial
                </span>
              </div>
              <P>
                O <strong style={{ color: "var(--t-hi)" }}>leilão judicial</strong> ocorre por
                determinação de um juiz, geralmente para satisfazer dívidas em processos de
                execução ou falência. Podem ser vendidos imóveis, veículos, equipamentos
                industriais, estoque de empresas, participações societárias, entre outros. O leilão
                é conduzido por um leiloeiro oficial indicado pelo juízo — não pela Receita — e
                publicado no Diário de Justiça. A arrematação transfere o bem livre de dívidas
                de IPTU e condomínio anteriores ao arremate (em regra, para imóveis), mas o
                processo é mais complexo: exige atenção a prazos processuais, possibilidade de
                embargos do devedor e, no caso de imóveis, vistoria e análise da matrícula.
                Recomenda-se acompanhamento de advogado ou especialista para iniciantes.
              </P>
            </div>

            {/* Banco */}
            <div className="panel" style={{ padding: "24px", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                <span
                  className="badge badge--neutral"
                  style={{ fontSize: "11px", padding: "3px 9px" }}
                >
                  Leilão de Banco / Extrajudicial
                </span>
              </div>
              <P>
                Os <strong style={{ color: "var(--t-hi)" }}>leilões de banco</strong> (ou
                extrajudiciais) vendem bens retomados por inadimplência em financiamentos —
                principalmente imóveis e veículos. O processo não passa pelo judiciário: o banco
                executa a alienação fiduciária ou hipoteca diretamente, por meio de leiloeiros
                credenciados ou plataformas próprias (como portais de bancos). O bem costuma ser
                vendido em bom estado relativo (foi de propriedade de pessoa física ou jurídica
                que financiou algo), mas pode ainda estar ocupado pelo ex-proprietário, o que
                exige processo de imissão na posse. Verifique se o imóvel está desocupado e
                livre de dívidas (como IPTU e condomínio) antes de arrematar.
              </P>
            </div>
          </section>

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
              Tabela comparativa
            </h2>

            <div className="comp-table-wrap" style={{ borderRadius: "14px", overflow: "hidden", border: "1px solid var(--border)" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  minWidth: "580px",
                }}
                aria-label="Comparação entre modalidades de leilão"
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
                        width: "26%",
                      }}
                    >
                      Critério
                    </th>
                    <Td header accent>Receita Federal (SLE)</Td>
                    <Td header>Leilão Judicial</Td>
                    <Td header>Banco / Extrajudicial</Td>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <RowLabel>O que é vendido</RowLabel>
                    <Td accent>
                      Mercadorias apreendidas em alfândegas, portos e aeroportos; bens
                      abandonados por importadores (eletrônicos, roupas, veículos, bebidas,
                      equipamentos)
                    </Td>
                    <Td>
                      Bens penhorados em execuções ou arrecadados em falência: imóveis,
                      veículos, maquinário, estoque, cotas societárias
                    </Td>
                    <Td>
                      Bens retomados por inadimplência: imóveis financiados (alienação
                      fiduciária / hipoteca) e veículos financiados
                    </Td>
                  </tr>
                  <tr>
                    <RowLabel>Quem organiza</RowLabel>
                    <Td accent>
                      Receita Federal (RFB), com leiloeiros oficiais habilitados pelo governo
                    </Td>
                    <Td>
                      Juízo (Vara de Execuções ou Falência), com leiloeiro oficial nomeado pelo
                      juiz
                    </Td>
                    <Td>
                      Banco ou instituição financeira credora, com leiloeiro credenciado ou
                      plataforma própria
                    </Td>
                  </tr>
                  <tr>
                    <RowLabel>Como se habilitar</RowLabel>
                    <Td accent>
                      Conta gov.br nível prata ou ouro + cadastro no SLE. PF ou PJ. Habilitação
                      pelo sistema antes do prazo do edital.
                    </Td>
                    <Td>
                      Varia por processo: alguns aceitam PF/PJ sem restrição; outros exigem
                      petição no processo. Confira o edital judicial publicado no Diário de
                      Justiça.
                    </Td>
                    <Td>
                      Geralmente cadastro na plataforma do banco ou leiloeiro. PF ou PJ. Depósito
                      de garantia pode ser exigido.
                    </Td>
                  </tr>
                  <tr>
                    <RowLabel>Formas de pagamento</RowLabel>
                    <Td accent>
                      DARF (Documento de Arrecadação de Receitas Federais), à vista, dentro do
                      prazo do edital (geralmente 5–10 dias úteis)
                    </Td>
                    <Td>
                      Depósito judicial ou transferência determinada pelo juízo; parcelamento
                      possível em alguns casos, com autorização judicial
                    </Td>
                    <Td>
                      TED, boleto ou financiamento (alguns bancos permitem financiar o próprio
                      bem retomado); depende do banco e do edital
                    </Td>
                  </tr>
                  <tr>
                    <RowLabel>Riscos típicos</RowLabel>
                    <Td accent>
                      Bem sem garantia ("no estado em que se encontra"); impossibilidade de vistoria
                      em alguns lotes; custos de retirada; restrições de revenda em certas
                      mercadorias
                    </Td>
                    <Td>
                      Complexidade jurídica (embargos, recursos do devedor); imóveis podem estar
                      ocupados; dívidas de condomínio ou IPTU anteriores ao arremate (verifique);
                      processo longo
                    </Td>
                    <Td>
                      Imóvel pode estar ocupado pelo ex-proprietário (processo de imissão na
                      posse); dívidas de IPTU ou condomínio; veículos com débitos de multa ou
                      licenciamento
                    </Td>
                  </tr>
                  <tr>
                    <RowLabel>Onde achar os editais</RowLabel>
                    <Td accent>
                      Portal da Receita Federal (receita.fazenda.gov.br) e SLE; a Fonte.ia reúne
                      os lotes com dados organizados e link para o edital original
                    </Td>
                    <Td>
                      Diário de Justiça do tribunal competente; sites de leiloeiros judiciais;
                      plataformas como leilãojudicial.com.br (verifique idoneidade)
                    </Td>
                    <Td>
                      Portais dos próprios bancos (ex.: Caixa Econômica Federal, Itaú, Bradesco
                      etc.); leiloeiros credenciados pela instituição
                    </Td>
                  </tr>
                  <tr>
                    <RowLabel>Nível de complexidade</RowLabel>
                    <Td accent>
                      Baixo a médio — processo digital, unificado no SLE, bem documentado pelo
                      órgão
                    </Td>
                    <Td>
                      Alto — envolve processo judicial; recomenda-se acompanhamento de advogado
                    </Td>
                    <Td>
                      Médio — mais simples que o judicial, mas exige atenção à situação do imóvel
                      e à dívida
                    </Td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p
              className="muted"
              style={{ fontSize: "12px", marginTop: "10px", color: "var(--t-low)" }}
            >
              Dados de referência. Confira sempre o edital de cada lote — as condições variam.
            </p>
          </section>

          {/* Qual escolher */}
          <section aria-labelledby="qual-escolher-heading" style={{ marginBottom: "56px" }}>
            <h2
              id="qual-escolher-heading"
              style={{
                fontSize: "clamp(18px, 4vw, 24px)",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                marginBottom: "20px",
                color: "var(--t-hi)",
              }}
            >
              Qual escolher?
            </h2>

            <P>
              Para quem está começando ou quer um processo mais acessível,{" "}
              <strong style={{ color: "var(--t-hi)" }}>
                o leilão da Receita Federal tende a ser o mais direto
              </strong>
              : processo digital unificado no SLE, editais padronizados, participação aberta a
              PF e PJ sem burocracia excessiva. O risco principal é o bem ser vendido sem
              garantia — mas isso vale para todas as modalidades.
            </P>

            <P>
              O <strong style={{ color: "var(--t-hi)" }}>leilão judicial</strong> oferece
              oportunidades em imóveis e equipamentos de maior valor, frequentemente com deságio
              relevante — mas o processo tem mais camadas jurídicas. Quem não tem experiência
              ou apoio de um advogado pode se perder em prazos e recursos do devedor.
            </P>

            <P>
              O <strong style={{ color: "var(--t-hi)" }}>leilão de banco</strong> tem a
              vantagem de processos mais rápidos e, em alguns casos, a possibilidade de financiar
              o próprio bem. O risco de imóvel ocupado, no entanto, é real e merece atenção antes
              de qualquer lance.
            </P>

            <P>
              Em todas as modalidades, a regra é a mesma: leia o edital completo antes de
              qualquer passo, calcule todos os custos além do lance e nunca presuma que o bem
              está em perfeito estado.
            </P>

            <Info>
              <strong style={{ color: "var(--t-hi)" }}>Onde a Fonte.ia atua hoje:</strong> a
              plataforma cobre exclusivamente os leilões da Receita Federal (SLE), reunindo os
              lotes com dados organizados, score por regra e link para o edital original. Outras
              modalidades — judicial, PGFN, SPU, bancos — estão no roteiro e serão adicionadas
              conforme a demanda.
            </Info>
          </section>

          {/* Bloco Fonte.ia */}
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
              Todos os lotes do SLE reunidos, com análise do edital e alertas de prazo
            </p>
            <p
              style={{
                fontSize: "14.5px",
                lineHeight: 1.65,
                color: "var(--t-mid)",
                marginBottom: "22px",
                maxWidth: "480px",
                marginLeft: "auto",
                marginRight: "auto",
              }}
            >
              A Fonte.ia organiza cada lote da Receita Federal com dados da fonte oficial —
              lance mínimo, prazo, quem pode participar — e entrega score por regra e
              rastreabilidade até o edital original. Sem inventar dado, sem prometer lucro.
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
              Explorar lotes da Receita Federal
              <ArrowRight size={16} aria-hidden="true" />
            </a>
            <p className="muted" style={{ fontSize: "12px", marginTop: "12px" }}>
              7 dias grátis · sem contrato · cancele quando quiser
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
            </div>
          </nav>

        </article>
      </main>

      {/* ── Rodapé ───────────────────────────────────────────────────────── */}
      <footer
        className="guia-comp-footer"
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
