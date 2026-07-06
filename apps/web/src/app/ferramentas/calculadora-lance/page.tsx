import { useState } from "react";
import { Calculator, Gavel, Info, ArrowRight, Mail, CheckCircle } from "lucide-react";
import { LogoMark } from "../../../components/ui/logo-mark";
import {
  useSeo,
  articleJsonLd,
  breadcrumbJsonLd,
  SITE_URL,
} from "../../../lib/seo";
import { getSupabasePublicConfig, trimTrailingSlash } from "../../../lib/api-client";

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parsePct(raw: string): number {
  // Aceita decimal pt-BR ("5,5") e teclado numérico ("5.5"). Limita a 0–100:
  // percentuais acima de 100% não fazem sentido aqui e geram detalhamento
  // enganoso (folga = valor de mercado inteiro).
  const cleaned = raw.replace(",", ".");
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

function parseBRL(raw: string): number {
  // Aceita "1.500,50" (pt-BR) e "1500.50" (teclado numérico)
  const cleaned = raw.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

/**
 * Lê o valor de mercado sugerido a partir da URL (deep-link vindo do lote).
 *
 * Aceita `?vm=` ou `?avaliacao=` — ambos representam o valor de mercado/avaliação
 * do bem. NÃO usamos `?lanceMinimo=` para pré-preencher este campo: o lance mínimo
 * do edital não é o valor de mercado do bem, e confundi-los levaria a um cálculo
 * enganoso. O número pode vir "cru" (414000) ou já formatado; parseBRL normaliza.
 *
 * SSG-safe: durante o prerender não há `window`, então retorna "" (campo vazio).
 */
function readValorMercadoFromUrl(): string {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("vm") ?? params.get("avaliacao") ?? "";
  if (raw.trim() === "") return "";
  // Só pré-preenche se resultar num número > 0; caso contrário deixa vazio para
  // não plantar um "0" que confunde o usuário.
  return parseBRL(raw) > 0 ? raw.trim() : "";
}

/* ─── Linha de detalhamento ─────────────────────────────────────────────── */
function DetalheRow({
  label,
  value,
  emphasis,
  muted,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "10px 0",
        borderBottom: "1px solid var(--border)",
        gap: 12,
      }}
    >
      <span
        className={muted ? "muted small" : "small"}
        style={{ color: emphasis ? "var(--t-hi)" : undefined, fontWeight: emphasis ? 600 : undefined }}
      >
        {label}
      </span>
      <span
        className="num small"
        style={{
          fontWeight: emphasis ? 700 : 500,
          color: emphasis ? "var(--accent-ink)" : "var(--t-mid)",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </span>
    </div>
  );
}

/* ─── Campo de entrada ───────────────────────────────────────────────────── */
function Campo({
  id,
  label,
  ajuda,
  value,
  onChange,
  prefix,
  suffix,
  placeholder,
}: {
  id: string;
  label: string;
  ajuda: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label
        htmlFor={id}
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "var(--t-hi)",
          lineHeight: 1.4,
        }}
      >
        {label}
      </label>
      <p
        className="muted"
        style={{ fontSize: 12.5, margin: 0, lineHeight: 1.5 }}
      >
        {ajuda}
      </p>
      <div
        className="calc-field"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 0,
          border: "1px solid var(--border)",
          borderRadius: 10,
          background: "var(--surface)",
          overflow: "hidden",
        }}
      >
        {prefix && (
          <span
            style={{
              padding: "0 12px",
              fontSize: 15,
              color: "var(--t-mid)",
              fontWeight: 600,
              background: "color-mix(in srgb, var(--border) 30%, transparent)",
              height: "100%",
              display: "flex",
              alignItems: "center",
              borderRight: "1px solid var(--border)",
              minHeight: 48,
              userSelect: "none",
            }}
          >
            {prefix}
          </span>
        )}
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={value}
          placeholder={placeholder ?? "0"}
          onChange={(e) => onChange(e.target.value)}
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            background: "transparent",
            padding: "0 14px",
            fontSize: 16,
            color: "var(--t-hi)",
            fontFamily: "var(--font)",
            minHeight: 48,
            lineHeight: "48px",
          }}
        />
        {suffix && (
          <span
            style={{
              padding: "0 12px",
              fontSize: 14,
              color: "var(--t-mid)",
              fontWeight: 600,
              background: "color-mix(in srgb, var(--border) 30%, transparent)",
              borderLeft: "1px solid var(--border)",
              minHeight: 48,
              display: "flex",
              alignItems: "center",
              userSelect: "none",
            }}
          >
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

/* ─── Captura de e-mail ──────────────────────────────────────────────────── */
type LeadStatus = "idle" | "sending" | "ok" | "error";

function CapturaEmail({
  valorMercado,
  lanceMaximo,
  comissao,
  margem,
}: {
  valorMercado: number;
  lanceMaximo: number;
  comissao: number;
  margem: number;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<LeadStatus>("idle");
  const [emailError, setEmailError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEmailError("");

    const trimmed = email.trim();
    if (!isValidEmail(trimmed)) {
      setEmailError("Digite um e-mail válido.");
      return;
    }

    setStatus("sending");

    try {
      const { url, key } = getSupabasePublicConfig();
      const endpoint = `${trimTrailingSlash(url)}/rest/v1/rpc/capture_lead`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: key,
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          p_email: trimmed,
          p_source: "calculadora",
          p_payload: {
            valorMercado,
            lanceMaximo,
            comissao,
            margem,
          },
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      setStatus("ok");
    } catch {
      setStatus("error");
    }
  }

  if (status === "ok") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "18px 20px",
          borderRadius: 12,
          background: "color-mix(in srgb, var(--ok) 8%, transparent)",
          border: "1px solid color-mix(in srgb, var(--ok) 25%, transparent)",
        }}
      >
        <CheckCircle size={20} style={{ color: "var(--ok)", flexShrink: 0 }} aria-hidden="true" />
        <p style={{ margin: 0, fontSize: 14, color: "var(--t-hi)", fontWeight: 500 }}>
          Pronto! Você vai receber por e-mail.
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "22px 20px",
        borderRadius: 14,
        background: "color-mix(in srgb, var(--border) 20%, transparent)",
        border: "1px solid var(--border)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <Mail size={16} style={{ color: "var(--accent-ink)", flexShrink: 0 }} aria-hidden="true" />
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--t-hi)" }}>
          Receber este cálculo e alertas de lotes na minha faixa
        </p>
      </div>
      <p className="muted" style={{ fontSize: 12.5, margin: "0 0 14px", lineHeight: 1.5 }}>
        Opcional · sem spam · cancele quando quiser
      </p>

      <form
        onSubmit={(e) => { void handleSubmit(e); }}
        noValidate
        style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
      >
        <div style={{ flex: "1 1 220px", display: "flex", flexDirection: "column", gap: 4 }}>
          <input
            type="email"
            name="email"
            autoComplete="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (emailError) setEmailError("");
              if (status === "error") setStatus("idle");
            }}
            disabled={status === "sending"}
            aria-label="Seu e-mail"
            aria-describedby={emailError ? "email-captura-erro" : undefined}
            className="calc-email"
            style={{
              border: emailError ? "1px solid var(--danger)" : "1px solid var(--border)",
              borderRadius: 10,
              background: "var(--surface)",
              padding: "0 14px",
              fontSize: 15,
              color: "var(--t-hi)",
              fontFamily: "var(--font)",
              minHeight: 46,
              outline: "none",
              width: "100%",
            }}
          />
          {emailError && (
            <span
              id="email-captura-erro"
              role="alert"
              style={{ fontSize: 12, color: "var(--danger)", paddingLeft: 2 }}
            >
              {emailError}
            </span>
          )}
          {status === "error" && (
            <span
              role="alert"
              style={{ fontSize: 12, color: "var(--danger)", paddingLeft: 2 }}
            >
              Não consegui agora, tente novamente.
            </span>
          )}
        </div>

        <button
          type="submit"
          disabled={status === "sending"}
          className="btn btn--accent"
          style={{
            minHeight: 46,
            paddingLeft: 18,
            paddingRight: 18,
            fontSize: 14,
            fontWeight: 700,
            flexShrink: 0,
            opacity: status === "sending" ? 0.65 : 1,
            cursor: status === "sending" ? "wait" : "pointer",
          }}
        >
          {status === "sending" ? "Enviando…" : "Receber alertas"}
        </button>
      </form>
    </div>
  );
}

/* ─── CTA imediato colado ao resultado ──────────────────────────────────── */
function CtaImediato({ lanceMaximo }: { lanceMaximo: number }) {
  const lanceFmt = brl(lanceMaximo);
  return (
    <a
      href="/entrar"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        padding: "20px 22px",
        borderRadius: 14,
        background: "var(--brand)",
        color: "#fff",
        textDecoration: "none",
        boxShadow: "0 4px 20px color-mix(in srgb, var(--brand) 30%, transparent)",
        transition: "filter .15s, transform .15s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.filter = "brightness(1.08)";
        (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.filter = "";
        (e.currentTarget as HTMLAnchorElement).style.transform = "";
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3 }}>
          Veja lotes reais da Receita abaixo de {lanceFmt} →
        </span>
        <span style={{ fontSize: 13, opacity: 0.88, fontWeight: 500 }}>
          Criar conta grátis · 7 dias sem cartão
        </span>
      </div>
      <ArrowRight size={20} aria-hidden="true" style={{ flexShrink: 0, opacity: 0.9 }} />
    </a>
  );
}

/* ─── Página principal ───────────────────────────────────────────────────── */
export function CalculadoraLancePage() {
  const TITLE = "Calculadora de lance máximo para leilão — grátis | Fonte.ia";
  const DESCRIPTION =
    "Calcule grátis o lance máximo que vale a pena dar em um leilão da Receita Federal, já considerando comissão do leiloeiro, tributos e custos. Sem cadastro.";

  useSeo({
    title: TITLE,
    description: DESCRIPTION,
    canonicalPath: "/ferramentas/calculadora-lance",
    jsonLd: [
      articleJsonLd({
        title: TITLE,
        description: DESCRIPTION,
        url: SITE_URL + "/ferramentas/calculadora-lance",
        datePublished: "2026-06-13",
      }),
      breadcrumbJsonLd([
        { name: "Início", url: SITE_URL + "/" },
        { name: "Ferramentas", url: SITE_URL + "/ferramentas" },
        {
          name: "Calculadora de lance",
          url: SITE_URL + "/ferramentas/calculadora-lance",
        },
      ]),
    ],
  });

  /* ── State dos campos ── */
  // Pré-preenche o valor de mercado quando o usuário chega via deep-link do lote
  // (ex.: /ferramentas/calculadora-lance?vm=414000). Inicializador lazy: roda uma
  // vez, no mount, e é SSG-safe (readValorMercadoFromUrl guarda `window`).
  const [valorMercado, setValorMercado] = useState(readValorMercadoFromUrl);
  const [comissaoPct, setComissaoPct] = useState("5");
  const [tributosPct, setTributosPct] = useState("0");
  const [retirada, setRetirada] = useState("");
  const [reforma, setReforma] = useState("");
  const [margemPct, setMargemPct] = useState("20");

  /* ── Cálculo em tempo real ── */
  const vm = parseBRL(valorMercado);
  const comissao = parsePct(comissaoPct);
  const tributos = parsePct(tributosPct);
  const custosFixos = parseBRL(retirada) + parseBRL(reforma);
  const margem = parsePct(margemPct);

  const tetoCustoTotal = vm * (1 - margem / 100);
  const divisor = 1 + comissao / 100 + tributos / 100;
  const lanceCalculado = (tetoCustoTotal - custosFixos) / divisor;
  const lanceMaximo = Math.max(0, lanceCalculado);
  const lanceNegativo = vm > 0 && lanceCalculado < 0;

  const comissaoEstimada = lanceMaximo * (comissao / 100);
  const tributosEstimados = lanceMaximo * (tributos / 100);
  const custoTotalFinal = lanceMaximo + comissaoEstimada + tributosEstimados + custosFixos;
  const folga = vm > 0 ? vm - custoTotalFinal : 0;

  const temEntrada = vm > 0;

  return (
    <div
      className="calc-root"
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--t-hi)",
        display: "flex",
        flexDirection: "column",
        overflowX: "hidden",
      }}
    >
      {/* ── Estilos escopados ── */}
      <style>{`
        .calc-root *,
        .calc-root *::before,
        .calc-root *::after { box-sizing: border-box; }

        .calc-root .calc-header,
        .calc-root .calc-footer {
          padding-left: 24px !important;
          padding-right: 24px !important;
        }

        .calc-root .calc-main {
          padding-left: 24px;
          padding-right: 24px;
        }

        @media (min-width: 540px) {
          .calc-root .calc-header,
          .calc-root .calc-footer {
            padding-left: 48px !important;
            padding-right: 48px !important;
          }
          .calc-root .calc-main {
            padding-left: 48px;
            padding-right: 48px;
          }
        }

        /* Foco visível nos campos: o <input> tem outline:none, então o anel
           aparece no wrapper (WCAG 2.4.7). */
        .calc-root .calc-field:focus-within {
          border-color: var(--brand-ink);
          box-shadow: 0 0 0 4px var(--ring);
        }
        .calc-root .calc-email:focus {
          border-color: var(--brand-ink) !important;
          box-shadow: 0 0 0 4px var(--ring);
        }

        .calc-root .result-pulse {
          animation: pulse-accent .35s ease;
        }
        @keyframes pulse-accent {
          0%   { transform: scale(1); }
          45%  { transform: scale(1.03); }
          100% { transform: scale(1); }
        }

        .calc-root .aviso-negativo {
          background: color-mix(in srgb, var(--warn) 8%, transparent);
          border: 1px solid color-mix(in srgb, var(--warn) 25%, transparent);
          border-radius: 10px;
          padding: 14px 18px;
        }

        .calc-root .disclaimer-box {
          background: color-mix(in srgb, var(--brand) 5%, transparent);
          border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
          border-radius: 12px;
          padding: 16px 20px;
        }

        .calc-root .cta-block {
          background: color-mix(in srgb, var(--accent) 7%, transparent);
          border: 1px solid color-mix(in srgb, var(--accent) 22%, transparent);
          border-radius: 16px;
          padding: 32px 28px;
          text-align: center;
        }
      `}</style>

      {/* ══════════════════════════════ CABEÇALHO ══════════════════════════ */}
      <header
        className="calc-header"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 48px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <a
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            color: "var(--t-hi)",
            textDecoration: "none",
          }}
          aria-label="Fonte.ia — página inicial"
        >
          <LogoMark size={26} />
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em" }}>
              Fonte<span style={{ color: "var(--accent-ink)" }}>.ia</span>
            </div>
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "var(--t-low)",
                marginTop: 2,
              }}
            >
              by Olli
            </div>
          </div>
        </a>

        <a
          href="/entrar"
          className="btn btn--ghost btn--sm"
          style={{ minHeight: 44, display: "flex", alignItems: "center", gap: 6 }}
        >
          Entrar
          <ArrowRight size={14} aria-hidden="true" />
        </a>
      </header>

      {/* ══════════════════════════════ CONTEÚDO PRINCIPAL ═════════════════ */}
      <main
        className="calc-main"
        style={{
          flex: 1,
          maxWidth: 720,
          width: "100%",
          margin: "0 auto",
          padding: "52px 48px 80px",
        }}
      >
        {/* ── Herói ── */}
        <div style={{ marginBottom: 40 }}>
          <span className="eyebrow" style={{ display: "block", marginBottom: 12 }}>
            Ferramentas gratuitas · Fonte.ia
          </span>

          <h1
            className="h1"
            style={{
              fontWeight: 800,
              letterSpacing: "-0.03em",
              fontSize: "clamp(26px, 6vw, 38px)",
              marginBottom: 16,
              lineHeight: 1.15,
            }}
          >
            Calculadora de lance máximo{" "}
            <span style={{ color: "var(--accent-ink)" }}>para leilão</span>
          </h1>

          <p
            className="muted"
            style={{ fontSize: "clamp(15px, 2.5vw, 17px)", lineHeight: 1.65, maxWidth: 580 }}
          >
            Descubra o valor máximo que compensa dar de lance em um leilão da Receita Federal
            — já incluindo comissão do leiloeiro, impostos e todos os seus custos.
            Sem cadastro, sem promessa de lucro.
          </p>
        </div>

        {/* ── Formulário + Resultado ── */}
        <article style={{ display: "flex", flexDirection: "column", gap: 24 }}>

          {/* Bloco de entradas */}
          <section
            className="panel elevated"
            aria-labelledby="entradas-heading"
            style={{ padding: "28px 24px", display: "flex", flexDirection: "column", gap: 22 }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 4,
              }}
            >
              <Calculator
                size={20}
                style={{ color: "var(--accent-ink)", flexShrink: 0 }}
                aria-hidden="true"
              />
              <h2
                id="entradas-heading"
                className="h2"
                style={{ margin: 0, fontSize: 17, fontWeight: 700 }}
              >
                Preencha os dados do lote
              </h2>
            </div>

            <Campo
              id="valorMercado"
              label="Valor de mercado do bem (R$)"
              ajuda="Quanto esse bem vale para você revender ou usar (preço realista, à vista). Para carros, use a tabela FIPE. Para outros itens, pesquise o preço atual."
              value={valorMercado}
              onChange={setValorMercado}
              prefix="R$"
              placeholder="Ex.: 25000"
            />

            <Campo
              id="comissaoPct"
              label="Comissão do leiloeiro (%)"
              ajuda="Normalmente 5%. Confira no edital oficial — pode variar."
              value={comissaoPct}
              onChange={setComissaoPct}
              suffix="%"
              placeholder="5"
            />

            <Campo
              id="tributosPct"
              label="Impostos / tributos estimados (%)"
              ajuda="Varia por tipo de bem e estado (ICMS, IOF etc.). Se não souber, deixe em 0 e confira o edital."
              value={tributosPct}
              onChange={setTributosPct}
              suffix="%"
              placeholder="0"
            />

            <Campo
              id="retirada"
              label="Custo de retirada e transporte (R$)"
              ajuda="Quanto você vai gastar para buscar e transportar o bem até o destino."
              value={retirada}
              onChange={setRetirada}
              prefix="R$"
              placeholder="Ex.: 500"
            />

            <Campo
              id="reforma"
              label="Conserto / reforma estimada (R$)"
              ajuda="Quanto precisará gastar para o bem ficar em condição de uso ou revenda."
              value={reforma}
              onChange={setReforma}
              prefix="R$"
              placeholder="Ex.: 2000"
            />

            <Campo
              id="margemPct"
              label="Margem de segurança / lucro desejado (%)"
              ajuda="A folga que você quer ter sobre o valor de mercado (20% é um ponto de partida razoável). Quanto maior, mais conservador o lance."
              value={margemPct}
              onChange={setMargemPct}
              suffix="%"
              placeholder="20"
            />
          </section>

          {/* Resultado */}
          <section
            className="panel elevated"
            aria-labelledby="resultado-heading"
            aria-live="polite"
            aria-atomic="true"
            style={{ padding: "28px 24px", display: "flex", flexDirection: "column", gap: 0 }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 20,
              }}
            >
              <Gavel
                size={20}
                style={{ color: "var(--accent-ink)", flexShrink: 0 }}
                aria-hidden="true"
              />
              <h2
                id="resultado-heading"
                className="h2"
                style={{ margin: 0, fontSize: 17, fontWeight: 700 }}
              >
                Lance máximo recomendado
              </h2>
            </div>

            {/* Número principal */}
            <div
              style={{
                textAlign: "center",
                padding: "24px 16px 28px",
                borderRadius: 14,
                background: temEntrada
                  ? "color-mix(in srgb, var(--accent) 8%, transparent)"
                  : "color-mix(in srgb, var(--border) 30%, transparent)",
                border: `1px solid ${temEntrada ? "color-mix(in srgb, var(--accent) 25%, transparent)" : "var(--border)"}`,
                marginBottom: 20,
                transition: "background .25s, border-color .25s",
              }}
            >
              <div
                className="display num"
                style={{
                  fontSize: "clamp(32px, 8vw, 48px)",
                  fontWeight: 800,
                  color: temEntrada ? "var(--accent-ink)" : "var(--t-low)",
                  letterSpacing: "-0.03em",
                  lineHeight: 1,
                }}
              >
                {temEntrada ? brl(lanceMaximo) : "R$ —"}
              </div>
              {temEntrada ? (
                <p
                  className="muted small"
                  style={{ marginTop: 8, marginBottom: 0, fontSize: 13 }}
                >
                  valor máximo de lance para manter sua margem de {brl(folga > 0 ? folga : 0)}
                </p>
              ) : (
                <p
                  className="muted small"
                  style={{ marginTop: 8, marginBottom: 0, fontSize: 13 }}
                >
                  Preencha o valor de mercado do bem acima para ver o lance máximo recomendado.
                </p>
              )}
            </div>

            {/* Aviso lance negativo */}
            {lanceNegativo && (
              <div className="aviso-negativo" style={{ marginBottom: 20 }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: 14,
                    lineHeight: 1.55,
                    color: "var(--warn)",
                    fontWeight: 600,
                  }}
                >
                  Com esses custos e margem, não compensa dar lance neste bem. Reveja os valores
                  ou reduza a margem de segurança.
                </p>
              </div>
            )}

            {/* Detalhamento */}
            {temEntrada && (
              <div>
                <DetalheRow
                  label="Valor de mercado (referência)"
                  value={brl(vm)}
                  emphasis
                />
                <DetalheRow
                  label="Lance máximo recomendado"
                  value={brl(lanceMaximo)}
                />
                <DetalheRow
                  label={`Comissão do leiloeiro (${comissao}% sobre o lance)`}
                  value={brl(comissaoEstimada)}
                  muted
                />
                <DetalheRow
                  label={`Tributos estimados (${tributos}% sobre o lance)`}
                  value={brl(tributosEstimados)}
                  muted
                />
                <DetalheRow
                  label="Custos fixos (retirada + conserto)"
                  value={brl(custosFixos)}
                  muted
                />
                <DetalheRow
                  label="Custo total no teto"
                  value={brl(custoTotalFinal)}
                />
                <DetalheRow
                  label={`Folga / lucro embutido (${margem}% do valor de mercado)`}
                  value={brl(folga > 0 ? folga : 0)}
                  emphasis
                />
              </div>
            )}

            {/* ── CTA imediato colado ao resultado ── */}
            {temEntrada && !lanceNegativo && (
              <div style={{ marginTop: 24 }}>
                <CtaImediato lanceMaximo={lanceMaximo} />
              </div>
            )}

            {/* ── Captura de e-mail ── */}
            {temEntrada && (
              <div style={{ marginTop: 16 }}>
                <CapturaEmail
                  valorMercado={vm}
                  lanceMaximo={lanceMaximo}
                  comissao={comissao}
                  margem={margem}
                />
              </div>
            )}
          </section>

          {/* Disclaimer */}
          <div className="disclaimer-box" role="note" aria-label="Aviso importante">
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <Info
                size={16}
                style={{ color: "var(--t-mid)", flexShrink: 0, marginTop: 2 }}
                aria-hidden="true"
              />
              <p
                className="muted small"
                style={{ margin: 0, lineHeight: 1.6, fontSize: 13 }}
              >
                <strong style={{ color: "var(--t-hi)" }}>Isso é uma estimativa, não uma garantia de lucro.</strong>{" "}
                Comissão do leiloeiro, tributos e condições do bem variam por edital —{" "}
                <strong style={{ color: "var(--t-hi)" }}>confira sempre o edital oficial</strong>{" "}
                antes de dar qualquer lance. A verificação do valor de mercado é de sua responsabilidade.
                Nunca arremate sem ler o edital completo.
              </p>
            </div>
          </div>
        </article>

        {/* ══ Conteúdo editorial (bom p/ SEO e citações de IA) ══ */}
        <section
          aria-labelledby="como-funciona-heading"
          style={{ marginTop: 64, borderTop: "1px solid var(--border)", paddingTop: 48 }}
        >
          <h2
            id="como-funciona-heading"
            className="h2"
            style={{
              fontWeight: 800,
              letterSpacing: "-0.025em",
              fontSize: "clamp(20px, 4.5vw, 28px)",
              marginBottom: 24,
              color: "var(--t-hi)",
            }}
          >
            Como funciona o lance máximo em leilão da Receita Federal
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <p
              className="muted"
              style={{ fontSize: "clamp(14.5px, 2vw, 16px)", lineHeight: 1.7, margin: 0 }}
            >
              Em um leilão da Receita Federal (Sistema de Leilão Eletrônico — SLE), o lance que
              você dá não é o único custo. Sobre ele incide a comissão do leiloeiro oficial
              (geralmente 5%), podem incidir tributos dependendo do tipo de bem e do estado, e
              ainda existem custos práticos como transporte e eventual conserto. Quem ignora esses
              custos e dá um lance "no limite do mercado" frequentemente paga mais do que o bem
              vale de fato.
            </p>

            <p
              className="muted"
              style={{ fontSize: "clamp(14.5px, 2vw, 16px)", lineHeight: 1.7, margin: 0 }}
            >
              A lógica da calculadora é simples: você decide qual folga (margem de segurança) quer
              ter sobre o valor de mercado — por exemplo, 20% — e a ferramenta descobre qual é o
              lance máximo que, depois de todos os custos somados, ainda respeita essa margem.
              Isso evita que você pague caro demais e fique sem nenhuma vantagem financeira em
              relação a comprar o mesmo bem no mercado convencional.
            </p>

            <p
              className="muted"
              style={{ fontSize: "clamp(14.5px, 2vw, 16px)", lineHeight: 1.7, margin: 0 }}
            >
              O cálculo é uma heurística — um ponto de partida racional. Na prática, o valor de
              mercado de um bem leiloado (muitas vezes usado, sem garantia e sem nota fiscal)
              costuma ser inferior ao de um bem novo ou seminovo em loja. Pesquise, visite o lote
              quando possível, e leia o edital oficial até o final antes de dar qualquer lance.
              O edital é o único documento que vale juridicamente.
            </p>
          </div>

          {/* CTA para a plataforma */}
          <div className="cta-block" style={{ marginTop: 48 }}>
            <Gavel
              size={32}
              style={{ color: "var(--accent-ink)", marginBottom: 16 }}
              aria-hidden="true"
            />
            <h2
              style={{
                fontSize: "clamp(18px, 4vw, 22px)",
                fontWeight: 700,
                marginBottom: 12,
                color: "var(--t-hi)",
                letterSpacing: "-0.02em",
              }}
            >
              Quer ver os lotes reais com análise de IA?
            </h2>
            <p
              className="muted"
              style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 24, maxWidth: 440, margin: "0 auto 24px" }}
            >
              Na Fonte.ia, cada lote da Receita Federal vem com Raio-X de IA: valor de mercado
              estimado, riscos do edital, custos calculados automaticamente e histórico do leilão.
              Tudo rastreável até a fonte oficial.
            </p>
            <a
              href="/entrar"
              className="btn btn--accent"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                minHeight: 48,
                paddingLeft: 24,
                paddingRight: 24,
                fontSize: 15,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Ver os lotes reais da Receita com Raio-X de IA
              <ArrowRight size={16} aria-hidden="true" />
            </a>
            <p
              className="muted"
              style={{ fontSize: 12, marginTop: 12, marginBottom: 0, color: "var(--t-low)" }}
            >
              Sem promessa de lucro · Dados rastreáveis · Cancele quando quiser
            </p>
          </div>
        </section>
      </main>

      {/* ══════════════════════════════ RODAPÉ ═════════════════════════════ */}
      <footer
        className="calc-footer"
        style={{
          borderTop: "1px solid var(--border)",
          padding: "22px 48px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 14,
        }}
      >
        <a
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "var(--t-hi)",
            textDecoration: "none",
          }}
          aria-label="Fonte.ia — página inicial"
        >
          <LogoMark size={20} />
          <span style={{ fontSize: 15, fontWeight: 700 }}>
            Fonte<span style={{ color: "var(--accent-ink)" }}>.ia</span>
          </span>
        </a>

        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
          <a
            href="/ferramentas/calculadora-lance"
            className="link small"
            style={{ fontSize: 13 }}
          >
            Calculadora de lance
          </a>
          <a href="/entrar" className="link small" style={{ fontSize: 13 }}>
            Acessar plataforma
          </a>
        </div>

        <span className="small" style={{ color: "var(--t-low)", fontSize: 12 }}>
          © {new Date().getFullYear()} Fonte.ia · by Olli · Dados públicos da Receita Federal
        </span>
      </footer>
    </div>
  );
}
