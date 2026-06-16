/**
 * empresa-page.tsx — Página pública de empresa (SEO/compartilhamento)
 *
 * Versão indexável do Raio-X. Mostra resumo público com fontes verificadas.
 * Recebe CNPJ via ?cnpj= (query string) — o roteador pode também extrair de
 * parâmetro de rota e passar via prop cnpj.
 *
 * Path sugerido: /empresa?cnpj=00000000000000
 *               ou /empresa/:cnpj  (o roteador normaliza e passa via prop)
 */

import { useState, useEffect, useCallback } from "react";
import { LogoMark } from "../../components/ui/logo-mark";
import {
  useSeo,
  breadcrumbJsonLd,
  SITE_URL,
  SITE_NAME,
} from "../../lib/seo";
import {
  lookupCnpj,
  fetchSancoesByCnpj,
  fetchContratosByCnpj,
  sanitizeCnpj,
  formatCnpj,
  formatDate,
  isSituacaoAtiva,
  type EmpresaCnpj,
  type SancaoItem,
  type ContratoPublico,
} from "../../features/raio-x/raio-x-api";
import { AlertTriangle, CheckCircle2, Share2, Copy, ExternalLink, ShieldCheck } from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Valida estrutura básica de CNPJ (14 dígitos, não todos iguais). */
function isValidCnpj(raw: string): boolean {
  const d = raw.replace(/\D/g, "");
  if (d.length !== 14) return false;
  if (/^(\d)\1+$/.test(d)) return false;
  return true;
}

/** Pega CNPJ de ?cnpj= ou da prop. */
function resolveCnpj(propCnpj?: string): string {
  if (propCnpj) return propCnpj.replace(/\D/g, "");
  if (typeof window !== "undefined") {
    const p = new URLSearchParams(window.location.search).get("cnpj");
    return p ? p.replace(/\D/g, "") : "";
  }
  return "";
}

function pluralPt(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural;
}

// ─── Estado da requisição ──────────────────────────────────────────────────────

type Status = "idle" | "loading" | "done" | "error-invalid" | "error-fetch";

interface PageData {
  empresa: EmpresaCnpj;
  sancoes: SancaoItem[];
  contratos: ContratoPublico[];
  sancoesSyncedAt?: string | undefined;
  contratosSyncedAt?: string | undefined;
  fetchedAt: string; // ISO
}

// ─── Primitivos de estilo ──────────────────────────────────────────────────────

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: "11px",
        fontWeight: 700,
        letterSpacing: "0.14em",
        textTransform: "uppercase" as const,
        color: "var(--t-low)",
        display: "block",
        marginBottom: "6px",
      }}
    >
      {children}
    </span>
  );
}

function SeloFonte({ fonte, data }: { fonte: string; data?: string | undefined }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        fontSize: "11.5px",
        color: "var(--t-low)",
        marginTop: "8px",
      }}
    >
      <ShieldCheck size={12} aria-hidden="true" style={{ color: "var(--accent-ink)", flexShrink: 0 }} />
      <span>
        Fonte: <strong style={{ color: "var(--t-mid)" }}>{fonte}</strong>
        {data ? ` · ${data}` : ""}
      </span>
    </div>
  );
}

// ─── Bloco Cadastral ──────────────────────────────────────────────────────────

function BlocoCadastral({ empresa, fetchedAt }: { empresa: EmpresaCnpj; fetchedAt: string }) {
  const ativa = isSituacaoAtiva(empresa.situacao);
  const localizacao = [empresa.municipio, empresa.uf].filter(Boolean).join(" / ");

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "12px",
        padding: "20px 24px",
      }}
    >
      <Eyebrow>Cadastral · Receita Federal</Eyebrow>

      <div
        className="empresa-cadastral-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "12px 24px",
          marginTop: "12px",
        }}
      >
        {[
          ["CNAE Principal", empresa.cnaePrincipal || "—"],
          ["Abertura", empresa.abertura ? formatDate(empresa.abertura) : "—"],
          ["Localização", localizacao || "—"],
          ["Porte", empresa.porte || "—"],
          ["Natureza Jurídica", empresa.naturezaJuridica || "—"],
        ].map(([label, value]) => (
          <div key={label}>
            <div style={{ fontSize: "11px", color: "var(--t-low)", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: "3px" }}>
              {label}
            </div>
            <div style={{ fontSize: "14.5px", color: "var(--t-hi)", fontWeight: 500, lineHeight: 1.4 }}>
              {value}
            </div>
          </div>
        ))}

        <div>
          <div style={{ fontSize: "11px", color: "var(--t-low)", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: "3px" }}>
            Situação
          </div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "14.5px",
              fontWeight: 600,
              color: ativa ? "#16a34a" : "var(--t-mid)",
            }}
          >
            {ativa ? (
              <CheckCircle2 size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
            ) : (
              <AlertTriangle size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
            )}
            {empresa.situacao}
          </div>
        </div>
      </div>

      <SeloFonte fonte="Receita Federal (Minha Receita)" data={new Date(fetchedAt).toLocaleDateString("pt-BR")} />
    </div>
  );
}

// ─── Bloco Sanções ────────────────────────────────────────────────────────────

function BlocoSancoes({ sancoes, syncedAt }: { sancoes: SancaoItem[]; syncedAt?: string | undefined }) {
  const temSancoes = sancoes.length > 0;

  return (
    <div
      style={{
        background: temSancoes
          ? "color-mix(in srgb, #f59e0b 6%, var(--surface))"
          : "color-mix(in srgb, #16a34a 4%, var(--surface))",
        border: `1px solid ${temSancoes ? "color-mix(in srgb, #f59e0b 22%, var(--border))" : "color-mix(in srgb, #16a34a 18%, var(--border))"}`,
        borderRadius: "12px",
        padding: "20px 24px",
      }}
    >
      <Eyebrow>Sanções · CEIS / CNEP</Eyebrow>

      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginTop: "10px" }}>
        <div
          style={{
            width: "40px",
            height: "40px",
            borderRadius: "10px",
            background: temSancoes ? "color-mix(in srgb, #f59e0b 14%, var(--surface))" : "color-mix(in srgb, #16a34a 10%, var(--surface))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
          aria-hidden="true"
        >
          {temSancoes ? (
            <AlertTriangle size={20} style={{ color: "#d97706" }} />
          ) : (
            <CheckCircle2 size={20} style={{ color: "#16a34a" }} />
          )}
        </div>

        <div>
          <div
            style={{
              fontSize: "clamp(22px, 5vw, 28px)",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              color: temSancoes ? "#92400e" : "#15803d",
              lineHeight: 1,
            }}
          >
            {sancoes.length}
          </div>
          <div style={{ fontSize: "14px", color: "var(--t-mid)", marginTop: "4px", lineHeight: 1.4 }}>
            {temSancoes ? (
              <>
                <strong style={{ color: "#92400e" }}>Sinal de atenção:</strong>{" "}
                {sancoes.length} {pluralPt(sancoes.length, "registro de sanção encontrado", "registros de sanção encontrados")} no CEIS/CNEP.
                {" "}Verifique o relatório completo antes de contratar.
              </>
            ) : (
              <>Nenhum registro de sanção encontrado no CEIS/CNEP para este CNPJ.</>
            )}
          </div>
        </div>
      </div>

      <SeloFonte fonte="Portal da Transparência / CGU" data={syncedAt ? new Date(syncedAt).toLocaleDateString("pt-BR") : undefined} />
    </div>
  );
}

// ─── Bloco Contratos ──────────────────────────────────────────────────────────

function BlocoContratos({ contratos, syncedAt }: { contratos: ContratoPublico[]; syncedAt?: string | undefined }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "12px",
        padding: "20px 24px",
      }}
    >
      <Eyebrow>Contratos Públicos · PNCP</Eyebrow>

      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginTop: "10px" }}>
        <div
          style={{
            width: "40px",
            height: "40px",
            borderRadius: "10px",
            background: "color-mix(in srgb, var(--accent) 8%, var(--surface))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
          aria-hidden="true"
        >
          <ShieldCheck size={20} style={{ color: "var(--accent-ink)" }} />
        </div>

        <div>
          <div
            style={{
              fontSize: "clamp(22px, 5vw, 28px)",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              color: "var(--t-hi)",
              lineHeight: 1,
            }}
          >
            {contratos.length}
          </div>
          <div style={{ fontSize: "14px", color: "var(--t-mid)", marginTop: "4px", lineHeight: 1.4 }}>
            {contratos.length > 0
              ? `${contratos.length} ${pluralPt(contratos.length, "contrato público registrado", "contratos públicos registrados")} no PNCP.`
              : "Nenhum contrato público encontrado no PNCP para este CNPJ."}
          </div>
        </div>
      </div>

      <SeloFonte fonte="Portal Nacional de Contratações Públicas (PNCP)" data={syncedAt ? new Date(syncedAt).toLocaleDateString("pt-BR") : undefined} />
    </div>
  );
}

// ─── Card Compartilhável ──────────────────────────────────────────────────────

function CardCompartilhavel({ empresa, sancoes, contratos, cnpj }: {
  empresa: EmpresaCnpj;
  sancoes: SancaoItem[];
  contratos: ContratoPublico[];
  cnpj: string;
}) {
  const [copied, setCopied] = useState(false);

  const shareUrl = `${SITE_URL}/empresa?cnpj=${cnpj}`;
  const shareTitle = `${empresa.razaoSocial} (${formatCnpj(cnpj)}) — Raio-X público no ${SITE_NAME}`;
  const shareText = `Sanções CEIS/CNEP: ${sancoes.length} · Contratos públicos: ${contratos.length} · Fontes verificadas: 3`;

  const handleShare = useCallback(async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: shareTitle, text: shareText, url: shareUrl });
      } catch {
        // usuário cancelou — ignora
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // fallback: seleciona texto
      }
    }
  }, [shareTitle, shareText, shareUrl]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignora
    }
  }, [shareUrl]);

  return (
    <div
      style={{
        background: "color-mix(in srgb, var(--accent) 5%, var(--surface))",
        border: "1.5px solid color-mix(in srgb, var(--accent) 20%, var(--border))",
        borderRadius: "14px",
        padding: "24px",
        marginTop: "32px",
      }}
    >
      <Eyebrow>Resumo verificado · {SITE_NAME}</Eyebrow>

      {/* Números-chave */}
      <div
        className="empresa-share-nums"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "16px",
          margin: "16px 0",
        }}
      >
        {[
          { label: "Sanções CEIS/CNEP", value: sancoes.length, alert: sancoes.length > 0 },
          { label: "Contratos Públicos", value: contratos.length, alert: false },
          { label: "Fontes verificadas", value: 3, alert: false },
        ].map(({ label, value, alert }) => (
          <div
            key={label}
            style={{
              textAlign: "center" as const,
              padding: "14px 8px",
              background: "var(--surface)",
              borderRadius: "10px",
              border: alert ? "1px solid color-mix(in srgb, #f59e0b 30%, var(--border))" : "1px solid var(--border)",
            }}
          >
            <div
              style={{
                fontSize: "clamp(24px, 6vw, 32px)",
                fontWeight: 800,
                letterSpacing: "-0.04em",
                color: alert ? "#d97706" : "var(--t-hi)",
                lineHeight: 1,
              }}
            >
              {value}
            </div>
            <div style={{ fontSize: "11px", color: "var(--t-low)", marginTop: "5px", lineHeight: 1.3 }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: "12px", color: "var(--t-low)", textAlign: "center" as const, marginBottom: "18px" }}>
        Veja no <strong style={{ color: "var(--accent-ink)" }}>{SITE_NAME}</strong> — dados públicos, rastreáveis.
      </div>

      {/* Botões */}
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" as const }}>
        <button
          onClick={handleShare}
          className="btn btn--accent btn--sm"
          style={{ display: "flex", alignItems: "center", gap: "7px", flex: 1, justifyContent: "center", minHeight: "40px" }}
        >
          <Share2 size={15} aria-hidden="true" />
          Compartilhar
        </button>
        <button
          onClick={handleCopy}
          className="btn btn--ghost btn--sm"
          style={{ display: "flex", alignItems: "center", gap: "7px", minHeight: "40px" }}
          title="Copiar link"
          aria-label="Copiar link da página"
        >
          <Copy size={15} aria-hidden="true" />
          {copied ? "Copiado!" : "Copiar link"}
        </button>
      </div>
    </div>
  );
}

// ─── CTA ─────────────────────────────────────────────────────────────────────

function CtaRaioX({ cnpj }: { cnpj: string }) {
  return (
    <div
      className="panel"
      style={{
        padding: "28px 24px",
        marginTop: "32px",
        background: "color-mix(in srgb, var(--accent) 7%, var(--surface))",
        borderColor: "color-mix(in srgb, var(--accent) 22%, var(--border))",
        borderRadius: "12px",
        border: "1px solid",
        textAlign: "center" as const,
      }}
    >
      <p style={{ fontWeight: 700, fontSize: "16px", color: "var(--t-hi)", marginBottom: "6px" }}>
        Relatório completo disponível no app
      </p>
      <p style={{ fontSize: "14px", color: "var(--t-mid)", marginBottom: "20px", lineHeight: 1.6 }}>
        Veja sócios, endereço, histórico de sanções detalhado, lista de contratos com valores
        e exporte tudo em CSV — no Raio-X completo.
      </p>
      <a
        href={`/app/raio-x?cnpj=${cnpj}`}
        className="btn btn--accent btn--lg"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          textDecoration: "none",
          minHeight: "48px",
          minWidth: "220px",
          justifyContent: "center",
        }}
      >
        <ExternalLink size={17} aria-hidden="true" />
        Ver Raio-X completo no app
      </a>
    </div>
  );
}

// ─── Estados de loading / erro / vazio ────────────────────────────────────────

function StateLoading({ cnpjFormatted }: { cnpjFormatted: string }) {
  return (
    <div style={{ textAlign: "center" as const, padding: "60px 0" }}>
      <div
        style={{
          width: "48px",
          height: "48px",
          borderRadius: "50%",
          border: "3px solid var(--border)",
          borderTopColor: "var(--accent-ink)",
          animation: "spin 0.9s linear infinite",
          margin: "0 auto 20px",
        }}
        role="status"
        aria-label="Carregando dados da empresa"
      />
      <p style={{ fontSize: "15px", color: "var(--t-mid)" }}>
        Consultando dados para{" "}
        <strong style={{ color: "var(--t-hi)", fontFamily: "ui-monospace, monospace" }}>
          {cnpjFormatted}
        </strong>
        …
      </p>
    </div>
  );
}

function StateError({ kind, cnpj }: { kind: "invalid" | "fetch"; cnpj: string }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "12px",
        padding: "36px 28px",
        textAlign: "center" as const,
        maxWidth: "480px",
        margin: "40px auto",
      }}
    >
      <AlertTriangle
        size={36}
        style={{ color: "#d97706", marginBottom: "16px" }}
        aria-hidden="true"
      />
      {kind === "invalid" ? (
        <>
          <p style={{ fontWeight: 700, fontSize: "17px", color: "var(--t-hi)", marginBottom: "8px" }}>
            CNPJ inválido
          </p>
          <p style={{ fontSize: "14px", color: "var(--t-mid)", lineHeight: 1.6, marginBottom: "20px" }}>
            O CNPJ{" "}
            <strong style={{ fontFamily: "ui-monospace, monospace" }}>
              {cnpj || "(não informado)"}
            </strong>{" "}
            não é válido. Confira o número e tente novamente.
          </p>
        </>
      ) : (
        <>
          <p style={{ fontWeight: 700, fontSize: "17px", color: "var(--t-hi)", marginBottom: "8px" }}>
            Não foi possível consultar este CNPJ
          </p>
          <p style={{ fontSize: "14px", color: "var(--t-mid)", lineHeight: 1.6, marginBottom: "20px" }}>
            Os dados podem estar temporariamente indisponíveis ou este CNPJ não consta nas fontes
            consultadas. Tente novamente mais tarde.
          </p>
        </>
      )}
      <a href="/" className="btn btn--ghost btn--sm" style={{ textDecoration: "none" }}>
        Voltar ao início
      </a>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export interface EmpresaPageProps {
  /** CNPJ puro (só dígitos) ou formatado — opcional, lido de ?cnpj= se ausente. */
  cnpj?: string;
}

export function EmpresaPage({ cnpj: cnpjProp }: EmpresaPageProps = {}) {
  const cnpj = resolveCnpj(cnpjProp);
  const cnpjFormatted = cnpj ? formatCnpj(cnpj) : "";

  const [status, setStatus] = useState<Status>("idle");
  const [data, setData] = useState<PageData | null>(null);

  // ── SEO dinâmico (atualizado após dados carregados) ───────────────────────
  const seoTitle = data
    ? `${data.empresa.razaoSocial} (${cnpjFormatted}) — Consulta pública | ${SITE_NAME}`
    : cnpj
      ? `Consulta empresa ${cnpjFormatted} | ${SITE_NAME}`
      : `Consulta pública de empresa | ${SITE_NAME}`;

  const seoDescription = data
    ? `Situação cadastral, sanções CEIS/CNEP e contratos públicos de ${data.empresa.razaoSocial} · CNPJ ${cnpjFormatted}. Dados de fontes oficiais no ${SITE_NAME}.`
    : `Consulte situação cadastral, sanções e contratos públicos de qualquer empresa por CNPJ. Fontes oficiais verificadas. ${SITE_NAME}.`;

  useSeo({
    title: seoTitle,
    description: seoDescription,
    canonicalPath: cnpj ? `/empresa?cnpj=${cnpj}` : "/empresa",
    jsonLd: data
      ? [
          {
            "@context": "https://schema.org",
            "@type": "Organization",
            name: data.empresa.razaoSocial,
            identifier: cnpjFormatted,
            url: `${SITE_URL}/empresa?cnpj=${cnpj}`,
            description: seoDescription,
            areaServed: "BR",
          },
          breadcrumbJsonLd([
            { name: "Início", url: SITE_URL + "/" },
            { name: "Empresa", url: SITE_URL + "/empresa" },
            { name: data.empresa.razaoSocial, url: `${SITE_URL}/empresa?cnpj=${cnpj}` },
          ]),
        ]
      : [
          breadcrumbJsonLd([
            { name: "Início", url: SITE_URL + "/" },
            { name: "Empresa", url: SITE_URL + "/empresa" },
          ]),
        ],
  });

  // ── Fetch ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!cnpj) {
      setStatus("error-invalid");
      return;
    }
    if (!isValidCnpj(cnpj)) {
      setStatus("error-invalid");
      return;
    }

    let cancelled = false;
    setStatus("loading");
    setData(null);

    const rawCnpj = sanitizeCnpj(cnpj);
    const fetchedAt = new Date().toISOString();

    Promise.all([
      lookupCnpj(rawCnpj),
      fetchSancoesByCnpj(rawCnpj),
      fetchContratosByCnpj(rawCnpj),
    ])
      .then(([empresa, { sancoes, lastSyncedAt: sancoesSyncedAt }, { contratos, lastSyncedAt: contratosSyncedAt }]) => {
        if (cancelled) return;
        const pageData: PageData = {
          empresa,
          sancoes,
          contratos,
          fetchedAt,
          ...(sancoesSyncedAt !== undefined ? { sancoesSyncedAt } : {}),
          ...(contratosSyncedAt !== undefined ? { contratosSyncedAt } : {}),
        };
        setData(pageData);
        setStatus("done");
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("error-fetch");
      });

    return () => {
      cancelled = true;
    };
  }, [cnpj]);

  // ── Situação ativa para o cabeçalho ──────────────────────────────────────
  const ativa = data ? isSituacaoAtiva(data.empresa.situacao) : false;

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
        @keyframes spin { to { transform: rotate(360deg); } }

        @media (max-width: 720px) {
          .empresa-header  { padding-left: 20px !important; padding-right: 20px !important; }
          .empresa-main    { padding: 32px 20px 80px !important; }
          .empresa-footer  { padding-left: 20px !important; padding-right: 20px !important; }
          .empresa-header nav { gap: 6px !important; }
          .empresa-header nav .btn--ghost { display: none; }
          .empresa-cadastral-grid { grid-template-columns: 1fr !important; }
          .empresa-share-nums { grid-template-columns: repeat(3, 1fr) !important; }
        }

        @media (max-width: 420px) {
          .empresa-share-nums { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header
        className="empresa-header"
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
          style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none", color: "var(--t-hi)" }}
          aria-label="Fonte.ia — página inicial"
        >
          <LogoMark size={26} />
          <div>
            <div style={{ fontSize: "18px", fontWeight: 700, letterSpacing: "-0.02em" }}>
              Fonte<span style={{ color: "var(--accent-ink)" }}>.ia</span>
            </div>
            <div style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--t-low)", marginTop: "2px" }}>
              by Olli
            </div>
          </div>
        </a>

        <nav aria-label="Navegação principal" style={{ display: "flex", gap: "10px", alignItems: "center" }} className="empresa-header">
          <a href="/para-quem" className="btn btn--ghost btn--sm">Para quem</a>
          <a href="/seguranca" className="btn btn--ghost btn--sm">Segurança</a>
          <a href="/entrar" className="btn btn--accent btn--sm">Começar grátis</a>
        </nav>
      </header>

      {/* ── Main ───────────────────────────────────────────────────────── */}
      <main
        className="empresa-main"
        style={{
          flex: 1,
          maxWidth: "720px",
          width: "100%",
          margin: "0 auto",
          padding: "48px 28px 96px",
        }}
      >
        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "24px" }}>
          <a href="/" className="link small" style={{ fontSize: "13px" }}>Início</a>
          <span style={{ color: "var(--t-low)", fontSize: "13px" }} aria-hidden="true">›</span>
          <span style={{ color: "var(--t-low)", fontSize: "13px" }}>Empresa</span>
          {cnpjFormatted && (
            <>
              <span style={{ color: "var(--t-low)", fontSize: "13px" }} aria-hidden="true">›</span>
              <span style={{ color: "var(--t-low)", fontSize: "13px", fontFamily: "ui-monospace, monospace" }}>
                {cnpjFormatted}
              </span>
            </>
          )}
        </div>

        {/* ── Estados ──────────────────────────────────────────────────── */}

        {status === "loading" && <StateLoading cnpjFormatted={cnpjFormatted} />}

        {(status === "error-invalid" || status === "error-fetch") && (
          <StateError kind={status === "error-invalid" ? "invalid" : "fetch"} cnpj={cnpjFormatted} />
        )}

        {status === "done" && data && (
          <>
            {/* ── Cabeçalho da empresa ─────────────────────────────────── */}
            <header style={{ marginBottom: "32px" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "11.5px",
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: ativa ? "#16a34a" : "var(--t-low)",
                  background: ativa ? "color-mix(in srgb, #16a34a 8%, var(--surface))" : "var(--surface)",
                  border: `1px solid ${ativa ? "color-mix(in srgb, #16a34a 22%, var(--border))" : "var(--border)"}`,
                  borderRadius: "99px",
                  padding: "4px 12px",
                  marginBottom: "14px",
                }}
              >
                {ativa ? <CheckCircle2 size={12} aria-hidden="true" /> : <AlertTriangle size={12} aria-hidden="true" />}
                {data.empresa.situacao}
              </span>

              <h1
                style={{
                  fontSize: "clamp(22px, 5vw, 32px)",
                  fontWeight: 800,
                  letterSpacing: "-0.03em",
                  lineHeight: 1.15,
                  marginBottom: "8px",
                  color: "var(--t-hi)",
                }}
              >
                {data.empresa.razaoSocial}
              </h1>

              {data.empresa.nomeFantasia && data.empresa.nomeFantasia !== data.empresa.razaoSocial && (
                <p style={{ fontSize: "15px", color: "var(--t-mid)", marginBottom: "6px" }}>
                  Nome fantasia: <strong>{data.empresa.nomeFantasia}</strong>
                </p>
              )}

              <p
                style={{
                  fontSize: "14px",
                  color: "var(--t-low)",
                  fontFamily: "ui-monospace, SFMono-Regular, monospace",
                  letterSpacing: "0.04em",
                }}
              >
                CNPJ {cnpjFormatted}
              </p>
            </header>

            {/* ── Blocos de dados ──────────────────────────────────────── */}
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <BlocoCadastral empresa={data.empresa} fetchedAt={data.fetchedAt} />
              <BlocoSancoes sancoes={data.sancoes} syncedAt={data.sancoesSyncedAt} />
              <BlocoContratos contratos={data.contratos} syncedAt={data.contratosSyncedAt} />
            </div>

            {/* ── Card compartilhável ──────────────────────────────────── */}
            <CardCompartilhavel
              empresa={data.empresa}
              sancoes={data.sancoes}
              contratos={data.contratos}
              cnpj={cnpj}
            />

            {/* ── CTA app ──────────────────────────────────────────────── */}
            <CtaRaioX cnpj={cnpj} />

            {/* ── Disclaimer ──────────────────────────────────────────── */}
            <p
              style={{
                fontSize: "12px",
                color: "var(--t-low)",
                lineHeight: 1.65,
                marginTop: "32px",
                padding: "16px",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                background: "var(--surface)",
              }}
            >
              <strong>Aviso:</strong> As informações exibidas são obtidas de fontes públicas oficiais
              (Receita Federal, Portal da Transparência/CGU, PNCP) e reproduzidas sem modificação.
              O {SITE_NAME} não emite juízos de valor sobre as empresas consultadas. A presença de
              registros em cadastros de sanções não implica condenação definitiva — consulte sempre
              o órgão competente para decisões contratuais.
            </p>
          </>
        )}
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer
        className="empresa-footer"
        style={{
          borderTop: "1px solid var(--border)",
          padding: "32px 48px",
          background: "var(--surface)",
        }}
      >
        <div style={{ maxWidth: "1100px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "24px" }}>
            <a
              href="/"
              style={{ display: "flex", alignItems: "center", gap: "8px", textDecoration: "none", color: "var(--t-hi)" }}
              aria-label="Ir para a página inicial"
            >
              <LogoMark size={20} />
              <span style={{ fontSize: "15px", fontWeight: 700 }}>
                Fonte<span style={{ color: "var(--accent-ink)" }}>.ia</span>
              </span>
            </a>

            <nav style={{ display: "flex", gap: "20px", flexWrap: "wrap" }} aria-label="Links do rodapé">
              <a href="/sobre" className="link small">Sobre</a>
              <a href="/seguranca" className="link small">Segurança</a>
              <a href="/para-quem" className="link small">Para quem</a>
              <a href="/contato" className="link small">Contato</a>
              <a href="/privacidade" className="link small" style={{ color: "var(--t-low)" }}>Privacidade</a>
              <a href="/termos" className="link small" style={{ color: "var(--t-low)" }}>Termos</a>
            </nav>
          </div>

          <div style={{ borderTop: "1px solid var(--border)", paddingTop: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
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
