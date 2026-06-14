import { BookOpen, ArrowRight } from "lucide-react";
import { useSeo, faqJsonLd, breadcrumbJsonLd, SITE_URL } from "../../lib/seo";
import { LogoMark } from "../../components/ui/logo-mark";
/* ── Dados do glossário ──────────────────────────────────────────────────── */
interface TermoGlossario {
  termo: string;
  sigla?: string;
  definicao: string;
}

const TERMOS: TermoGlossario[] = [
  {
    termo: "Edital",
    definicao:
      "Documento oficial publicado pela Receita Federal que descreve as regras de cada leilão. Contém: lista de lotes, lance mínimo, quem pode participar, prazo para proposta, forma de pagamento e condições de retirada. É o único documento juridicamente válido — leia antes de qualquer passo.",
  },
  {
    termo: "EDLE",
    sigla: "Edital de Leilão Eletrônico",
    definicao:
      "É o edital que rege um leilão eletrônico específico da Receita Federal. Reúne, num único documento, as regras daquele certame: lotes disponíveis, lance mínimo, prazos, quem pode participar e condições de pagamento e retirada. É o documento que você deve ler antes de se habilitar.",
  },
  {
    termo: "SLE",
    sigla: "Sistema de Leilão Eletrônico",
    definicao:
      "Plataforma online da Receita Federal onde ocorrem os leilões eletrônicos. É no SLE que você se habilita, consulta editais e registra seus lances, com login via conta gov.br.",
  },
  {
    termo: "gov.br (níveis prata e ouro)",
    definicao:
      "Sistema de login unificado do governo federal. Para participar de leilões da Receita é necessário ter conta gov.br com nível prata (verificação básica de identidade) ou ouro (verificação presencial). Conta prata já é suficiente para a maioria dos lotes; o edital informa quando é exigido nível ouro.",
  },
  {
    termo: "Habilitação",
    definicao:
      "Cadastro obrigatório no SLE para poder dar lances em um leilão específico. A habilitação envolve aceitar os termos do edital e confirmar seus dados pessoais. Há um prazo para se habilitar antes do encerramento das propostas — não deixe para o último dia.",
  },
  {
    termo: "Lance mínimo",
    definicao:
      "Valor de partida abaixo do qual nenhuma proposta é aceita. Não confunda com valor justo: lotes podem ser arrematados pelo lance mínimo (se só houver um interessado) ou muito acima dele (se houver disputa). Inclua custos extras no cálculo para saber o lance máximo que compensa dar.",
  },
  {
    termo: "Arrematação / Arrematante",
    definicao:
      "Arrematação é o ato de vencer o leilão, ou seja, ter o lance mais alto aceito. Arrematante é quem venceu. Ao arrematar, você assume a obrigação de pagar dentro do prazo do edital e retirar o bem nas condições descritas.",
  },
  {
    termo: "Lote",
    definicao:
      "Unidade de venda em um leilão. Um lote pode conter um único bem (ex.: um veículo) ou vários itens agrupados (ex.: 200 pares de tênis). Você compra o lote inteiro pelo preço arrematado — não é possível comprar apenas parte dos itens de um lote.",
  },
  {
    termo: "DARF",
    sigla: "Documento de Arrecadação de Receitas Federais",
    definicao:
      "Guia de pagamento emitida pelo SLE após o arremate. É pelo DARF que você paga o valor arrematado ao governo. O vencedor tem um prazo (geralmente 5 a 10 dias úteis) para efetuar o pagamento; atrasos implicam perda do lote.",
  },
  {
    termo: "Comissão do leiloeiro",
    definicao:
      "Taxa cobrada do arrematante pelo serviço do leiloeiro oficial. Nos leilões da Receita Federal, a referência mais comum é 5% sobre o valor do arremate, paga separadamente do DARF do bem. O percentual exato consta no edital. Sempre some essa comissão ao calcular o custo total.",
  },
  {
    termo: '"No estado em que se encontra"',
    definicao:
      'Cláusula padrão dos leilões da Receita Federal que significa: o bem é vendido sem garantia de funcionamento, sem nota fiscal de origem e sem direito de devolução. Você compra o risco. Eletrônicos podem não ligar, veículos podem ter vícios ocultos. Avalie as fotos e, quando permitido, faça a vistoria antes de dar o lance.',
  },
  {
    termo: "Pessoa Física (PF) e Pessoa Jurídica (PJ)",
    definicao:
      "PF é o indivíduo (CPF). PJ é a empresa (CNPJ). A maioria dos lotes da Receita Federal aceita PF e PJ. Alguns têm restrição — por exemplo, apenas empresas com licença de importação ou de determinado setor. O edital informa quem pode participar de cada lote.",
  },
  {
    termo: "Proposta",
    definicao:
      "O valor que você declara querer pagar por um lote. Em leilões eletrônicos de proposta fechada, cada participante envia uma proposta uma única vez, sem ver as dos outros. O maior valor vence. Em leilões ao vivo (sessão pública), as propostas são dadas em tempo real, como em um leilão presencial.",
  },
  {
    termo: "Visitação / Vistoria",
    definicao:
      "Período em que o edital permite inspecionar fisicamente o bem antes do arremate. Nem todo leilão oferece visitação. Quando existe, o local, data e horário são indicados no edital. A vistoria não garante funcionamento — você vê o estado aparente do bem.",
  },
  {
    termo: "Retirada",
    definicao:
      "Processo de retirar o bem após o pagamento confirmado. O edital informa o local de guarda (alfândega, armazém, pátio), o prazo para retirada e se há custos de armazenagem por dia de atraso. Planeje a logística antes de dar o lance — atraso na retirada pode gerar custos que corroem a vantagem do arremate.",
  },
  {
    termo: "Leilão de mercadorias vs. leilão de veículos",
    definicao:
      "A Receita Federal leiloa principalmente dois tipos de bens: mercadorias apreendidas em alfândegas e portos (eletrônicos, roupas, bebidas, alimentos) e veículos (carros, motos, caminhões apreendidos ou abandonados). As regras de pagamento, retirada e restrições de participação podem variar entre esses tipos — sempre leia o edital específico do lote.",
  },
];

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function termoSlug(termo: string): string {
  return `termo-${termo.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

/* ── Página ──────────────────────────────────────────────────────────────── */
export function GlossarioLeiloesPage() {
  const faqItems = TERMOS.map((t) => ({
    question: t.sigla !== undefined ? `O que é ${t.termo} (${t.sigla})?` : `O que é ${t.termo}?`,
    answer: t.definicao,
  }));

  useSeo({
    title:
      "Glossário de leilões da Receita Federal: termos explicados para leigos (2026) | Fonte.ia",
    description:
      "Edital, EDLE, SLE, DARF, habilitação, lance mínimo, arrematação — todos os termos que assustam em leilão da Receita Federal explicados em linguagem simples. Glossário completo atualizado.",
    canonicalPath: "/glossario-leiloes",
    jsonLd: [
      faqJsonLd(faqItems),
      breadcrumbJsonLd([
        { name: "Fonte.ia", url: SITE_URL },
        { name: "Glossário de leilões", url: `${SITE_URL}/glossario-leiloes` },
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
          .gloss-header { padding-left: 20px !important; padding-right: 20px !important; }
          .gloss-main   { padding-left: 20px !important; padding-right: 20px !important; }
          .gloss-footer { padding-left: 20px !important; padding-right: 20px !important; }
          .gloss-header .gloss-ghost-cta { display: none !important; }
        }
        .gloss-jump-nav {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .gloss-jump-link {
          display: inline-flex;
          align-items: center;
          min-height: 44px;
          padding: 10px 14px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          color: var(--t-mid);
          text-decoration: none;
          line-height: 1.3;
          transition: background 0.12s, color 0.12s;
        }
        .gloss-jump-link:hover,
        .gloss-jump-link:focus-visible {
          background: color-mix(in srgb, var(--accent) 10%, transparent);
          color: var(--accent-ink);
          outline: 2px solid var(--accent);
          outline-offset: 0px;
        }
        .gloss-term-card {
          padding: 24px 24px 24px 20px;
          border-radius: 10px;
          border: 1px solid var(--border);
          background: var(--surface);
          border-left: 4px solid var(--border);
          scroll-margin-top: 80px;
          transition: border-left-color 0.15s;
        }
        .gloss-term-card:target,
        .gloss-term-card:focus-within {
          border-left-color: var(--accent);
          outline: none;
        }
        .gloss-footer nav a {
          display: inline-flex;
          align-items: center;
          min-height: 44px;
          padding: 4px 2px;
        }
      `}</style>

      {/* ── Cabeçalho ──────────────────────────────────────────────────── */}
      <header
        className="gloss-header"
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
          <a href="/guias/como-comprar-leilao-receita" className="btn btn--ghost btn--sm gloss-ghost-cta">
            ← Guia de compra
          </a>
          <a href="/entrar" className="btn btn--accent btn--sm">
            Começar grátis
          </a>
        </nav>
      </header>

      {/* ── Conteúdo principal ─────────────────────────────────────────── */}
      <main
        className="gloss-main"
        style={{
          flex: 1,
          maxWidth: "760px",
          width: "100%",
          margin: "0 auto",
          padding: "60px 28px 100px",
        }}
      >
        <article>

          {/* Trilha de navegação */}
          <nav
            aria-label="Trilha de navegação"
            style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}
          >
            <a href="/" className="link small" style={{ fontSize: "13px" }}>
              Fonte.ia
            </a>
            <span style={{ color: "var(--t-low)", fontSize: "13px" }} aria-hidden="true">›</span>
            <span className="small" style={{ color: "var(--t-low)", fontSize: "13px" }}>
              Glossário de leilões
            </span>
          </nav>

          {/* Herói */}
          <header style={{ marginBottom: "48px" }}>
            <span className="eyebrow" style={{ display: "block", marginBottom: "14px" }}>
              Referência · linguagem simples · 2026
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
              Glossário de leilões da Receita Federal
            </h1>

            <p
              style={{
                fontSize: "clamp(15px, 2vw, 17px)",
                lineHeight: 1.75,
                color: "var(--t-mid)",
                marginBottom: "16px",
              }}
            >
              Os leilões da Receita Federal têm um vocabulário próprio que assusta quem está
              chegando. Este glossário explica cada termo em linguagem simples — sem juridiquês,
              sem enrolação. Antes de dar qualquer lance, entenda o que cada palavra do edital
              significa.
            </p>

            <p
              style={{
                fontSize: "clamp(15px, 2vw, 17px)",
                lineHeight: 1.75,
                color: "var(--t-mid)",
                marginBottom: "0",
              }}
            >
              Precisa do passo a passo completo?{" "}
              <a href="/guias/como-comprar-leilao-receita" className="link">
                Leia o guia de como comprar em leilão da Receita Federal.
              </a>
            </p>
          </header>

          {/* ── Atalhos rápidos ────────────────────────────────────────── */}
          <nav
            aria-label="Pular para o termo"
            style={{
              marginBottom: "48px",
              padding: "20px 20px 16px",
              borderRadius: "10px",
              border: "1px solid var(--border)",
              background: "var(--surface)",
            }}
          >
            <p
              style={{
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                color: "var(--t-low)",
                marginBottom: "12px",
              }}
            >
              Pular para o termo
            </p>
            <div className="gloss-jump-nav">
              {TERMOS.map((t) => (
                <a
                  key={t.termo}
                  href={`#${termoSlug(t.termo)}`}
                  className="gloss-jump-link"
                >
                  {t.termo}
                </a>
              ))}
            </div>
          </nav>

          {/* Glossário — lista de definições */}
          <section aria-label="Termos do glossário">
            <dl
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                margin: 0,
                padding: 0,
              }}
            >
              {TERMOS.map((t) => (
                <div
                  key={t.termo}
                  className="gloss-term-card"
                  id={termoSlug(t.termo)}
                  tabIndex={-1}
                  itemScope
                  itemType="https://schema.org/DefinedTerm"
                >
                  <dt
                    style={{
                      fontSize: "16px",
                      fontWeight: 700,
                      color: "var(--t-hi)",
                      marginBottom: t.sigla !== undefined ? "4px" : "10px",
                      lineHeight: 1.35,
                    }}
                    itemProp="name"
                  >
                    {t.termo}
                  </dt>

                  {t.sigla !== undefined && (
                    <p
                      style={{
                        fontSize: "12px",
                        fontWeight: 600,
                        letterSpacing: "0.04em",
                        color: "var(--accent-ink)",
                        marginBottom: "10px",
                        marginTop: 0,
                      }}
                    >
                      {t.sigla}
                    </p>
                  )}

                  <dd
                    style={{
                      margin: 0,
                      fontSize: "15px",
                      lineHeight: 1.75,
                      color: "var(--t-mid)",
                    }}
                    itemProp="description"
                  >
                    {t.definicao}
                  </dd>
                </div>
              ))}
            </dl>
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
              marginBottom: "40px",
            }}
          >
            <span className="eyebrow" style={{ display: "block", marginBottom: "10px" }}>
              Fonte.ia — Inteligência de leilões
            </span>
            <p
              style={{
                fontSize: "17px",
                fontWeight: 600,
                color: "var(--t-hi)",
                marginBottom: "10px",
              }}
            >
              Veja os lotes disponíveis agora com análise de IA
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
              A Fonte.ia organiza todos os lotes da Receita Federal com dados oficiais — lance
              mínimo, prazo, elegibilidade PF/PJ e score por regra. Dados rastreáveis à fonte,
              sem inventar nada.
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
              Ver leilões disponíveis
              <ArrowRight size={16} aria-hidden="true" />
            </a>
            <p className="muted" style={{ fontSize: "12px", marginTop: "12px" }}>
              7 dias grátis · sem contrato · dados da Receita Federal
            </p>
          </div>

          {/* Links relacionados */}
          <nav
            aria-label="Páginas relacionadas"
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
                className="card card--pad"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 16px",
                  textDecoration: "none",
                  color: "var(--t-hi)",
                  fontSize: "14px",
                  fontWeight: 600,
                }}
              >
                <BookOpen size={15} aria-hidden="true" />
                Como comprar: guia passo a passo
              </a>
              <a
                href="/ferramentas/calculadora-lance"
                className="card card--pad"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 16px",
                  textDecoration: "none",
                  color: "var(--t-hi)",
                  fontSize: "14px",
                  fontWeight: 600,
                }}
              >
                Calculadora de lance (grátis)
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
                  color: "var(--t-hi)",
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

      {/* ── Rodapé ──────────────────────────────────────────────────────── */}
      <footer
        className="gloss-footer"
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
          <a href="/guias/como-comprar-leilao-receita" className="link small">
            Guia de compra
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

        <span className="small" style={{ color: "var(--t-low)" }}>
          © {new Date().getFullYear()} Fonte.ia · by Olli
        </span>
      </footer>
    </div>
  );
}
