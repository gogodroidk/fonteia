/**
 * CertidoesSection.tsx — Seção "Certidões & Idoneidade" do Dossiê Empresarial.
 *
 * Consulta os 9 kinds do infosimples-proxy em paralelo e exibe:
 *  - Semáforo geral (verde / âmbar / vermelho) com contagem por status
 *  - Um card por certidão com título, selo, resumo, itens chave/valor e link de fonte
 *  - QSA extraído do kind receita-federal-cnpj
 *  - Estados graciosos: dormant, login, plano, loading (skeleton por card), erro isolado
 *
 * Design system: CSS custom properties (var(--token)); mobile-first 375px; dark/light.
 * Acessibilidade: aria-live, aria-busy, aria-label em controles interativos.
 */

import { useState, useEffect, useId } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Lock,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  XCircle,
  Info,
  Users,
  Loader2,
} from "lucide-react";
import {
  consultarTodasCertidoes,
  computarSemaforo,
  CERTIDAO_KINDS,
  type CertidaoCardState,
  type SemaforoGeral,
} from "../../features/dossie/certidoes-helper";
import type { CertidaoPayload } from "../../features/infosimples/infosimples-client";

// ─── Helpers de cor/ícone por status ─────────────────────────────────────────

type CertidaoStatus = CertidaoPayload["status"];

function statusColor(status: CertidaoStatus | SemaforoGeral): string {
  switch (status) {
    case "regular":
      return "var(--ok)";
    case "irregular":
      return "var(--danger)";
    case "atencao":
      return "var(--warn)";
    default:
      return "var(--t-low)";
  }
}

function statusBgColor(status: CertidaoStatus | SemaforoGeral): string {
  switch (status) {
    case "regular":
      return "color-mix(in srgb,var(--ok) 10%,var(--surface))";
    case "irregular":
      return "color-mix(in srgb,var(--danger) 8%,var(--surface))";
    case "atencao":
      return "color-mix(in srgb,var(--warn) 8%,var(--surface))";
    default:
      return "var(--surface-2)";
  }
}

function statusBorderColor(status: CertidaoStatus | SemaforoGeral): string {
  switch (status) {
    case "regular":
      return "color-mix(in srgb,var(--ok) 25%,transparent)";
    case "irregular":
      return "color-mix(in srgb,var(--danger) 28%,transparent)";
    case "atencao":
      return "color-mix(in srgb,var(--warn) 28%,transparent)";
    default:
      return "var(--border)";
  }
}

function statusLabel(status: CertidaoStatus | SemaforoGeral): string {
  switch (status) {
    case "regular":
      return "Regular";
    case "irregular":
      return "Irregular";
    case "atencao":
      return "Atenção";
    case "indisponivel":
      return "Indisponível";
  }
}

// ─── Skeleton de card ─────────────────────────────────────────────────────────

function CardSkeleton({ label }: { label: string }) {
  return (
    <div
      className="panel"
      style={{
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        opacity: 0.7,
      }}
      aria-busy="true"
      aria-label={`Consultando ${label}…`}
    >
      <div className="row between" style={{ gap: 8 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
          <div className="skeleton" style={{ height: 12, width: "60%", borderRadius: 5 }} />
          <div className="skeleton" style={{ height: 11, width: "35%", borderRadius: 5 }} />
        </div>
        <div className="skeleton" style={{ height: 22, width: 70, borderRadius: 6 }} />
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <Loader2 size={13} aria-hidden="true" style={{ color: "var(--t-low)" }} className="spin" />
        <span style={{ fontSize: 12, color: "var(--t-low)" }}>Consultando…</span>
      </div>
    </div>
  );
}

// ─── Card individual de certidão ──────────────────────────────────────────────

/** Kinds de sanção que merecem destaque vermelho nos itens. */
const SANCAO_KINDS = new Set([
  "transparencia-ceis",
  "transparencia-cnep",
  "tcu-inidoneo",
  "mte-trabalho-escravo",
]);

interface CertidaoCardProps {
  card: CertidaoCardState;
}

function CertidaoCard({ card }: CertidaoCardProps) {
  const [open, setOpen] = useState(false);
  const headingId = useId();
  const { kind, label, result } = card;

  // ── Dormant: InfoSimples não configurado ──────────────────────────────────
  if (result.state === "dormant") {
    return (
      <div
        className="panel"
        style={{
          padding: "14px 18px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          opacity: 0.6,
        }}
        role="status"
        aria-label={`${label}: consulta premium indisponível`}
      >
        <Info size={14} aria-hidden="true" style={{ color: "var(--t-low)", flexShrink: 0 }} />
        <span style={{ fontSize: 12.5, color: "var(--t-low)" }}>{label} — consulta premium indisponível</span>
      </div>
    );
  }

  // ── Login necessário ──────────────────────────────────────────────────────
  if (result.state === "login") {
    return (
      <div
        className="panel"
        style={{
          padding: "14px 18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
        }}
        role="status"
      >
        <div className="row" style={{ gap: 8 }}>
          <Lock size={14} aria-hidden="true" style={{ color: "var(--t-low)", flexShrink: 0 }} />
          <span style={{ fontSize: 12.5, color: "var(--t-mid)" }}>{label}</span>
        </div>
        <a href="/auth/login" className="btn btn--ghost btn--sm" style={{ fontSize: 11.5 }}>
          Entrar para consultar
        </a>
      </div>
    );
  }

  // ── Plano insuficiente ────────────────────────────────────────────────────
  if (result.state === "plan") {
    return (
      <div
        className="panel"
        style={{
          padding: "14px 18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
        }}
        role="status"
      >
        <div className="row" style={{ gap: 8 }}>
          <Lock size={14} aria-hidden="true" style={{ color: "var(--brand-ink)", flexShrink: 0 }} />
          <span style={{ fontSize: 12.5, color: "var(--t-mid)" }}>{label}</span>
        </div>
        <span
          style={{
            fontSize: 11.5,
            color: "var(--t-low)",
            fontStyle: "italic",
          }}
        >
          Recurso do plano pago
        </span>
      </div>
    );
  }

  // ── Vazio ou erro isolado ─────────────────────────────────────────────────
  if (result.state === "empty" || result.state === "error") {
    return (
      <div
        className="panel"
        style={{
          padding: "14px 18px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
        role="status"
        aria-label={`${label}: indisponível`}
      >
        <AlertTriangle
          size={13}
          aria-hidden="true"
          style={{ color: "var(--warn)", flexShrink: 0 }}
        />
        <span style={{ fontSize: 12.5, color: "var(--t-mid)" }}>{label}</span>
        <span style={{ fontSize: 11.5, color: "var(--t-low)", fontStyle: "italic", flex: 1 }}>
          {result.message}
        </span>
      </div>
    );
  }

  // ── OK: certidão com dados ────────────────────────────────────────────────
  const { data } = result;
  const { status, titulo, resumo, itens, validade, numeroCertidao, fonteUrl } = data;
  const color = statusColor(status);
  const isSancao = SANCAO_KINDS.has(kind);
  const hasItens = itens.length > 0;

  const StatusIcon =
    status === "regular"
      ? CheckCircle2
      : status === "irregular"
        ? XCircle
        : status === "atencao"
          ? ShieldAlert
          : Info;

  return (
    <div
      className="panel"
      style={{
        overflow: "hidden",
        border: `1px solid ${statusBorderColor(status)}`,
        background: statusBgColor(status),
      }}
      role="region"
      aria-labelledby={headingId}
    >
      {/* Cabeçalho do card */}
      <div style={{ padding: "14px 18px" }}>
        <div
          className="row between"
          style={{ gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              id={headingId}
              className="row"
              style={{ gap: 6, marginBottom: 4, flexWrap: "wrap" }}
            >
              <StatusIcon
                size={14}
                aria-hidden="true"
                style={{ color, flexShrink: 0, marginTop: 1 }}
              />
              <span
                style={{
                  fontSize: 13.5,
                  fontWeight: 700,
                  color: "var(--t-hi)",
                  lineHeight: 1.3,
                }}
              >
                {titulo || label}
              </span>
            </div>

            {/* Subtítulo (label quando titulo difere) */}
            {titulo !== "" && titulo !== label && (
              <div
                style={{
                  fontSize: 11,
                  color: "var(--t-low)",
                  marginBottom: 4,
                  letterSpacing: ".02em",
                }}
              >
                {label}
              </div>
            )}

            {/* Resumo */}
            {resumo !== "" && (
              <p
                style={{
                  margin: 0,
                  fontSize: 12.5,
                  color: "var(--t-mid)",
                  lineHeight: 1.5,
                }}
              >
                {resumo}
              </p>
            )}
          </div>

          {/* Selo de status */}
          <div
            style={{
              padding: "3px 9px",
              borderRadius: "var(--r-pill)",
              background: color,
              color: "#fff",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: ".04em",
              textTransform: "uppercase",
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
            aria-label={`Status: ${statusLabel(status)}`}
          >
            {statusLabel(status)}
          </div>
        </div>

        {/* Metadados: validade e número */}
        {(validade !== undefined || numeroCertidao !== undefined) && (
          <div
            className="row"
            style={{ gap: 12, marginTop: 10, flexWrap: "wrap" }}
          >
            {numeroCertidao !== undefined && (
              <span style={{ fontSize: 11.5, color: "var(--t-low)" }}>
                N° <strong style={{ color: "var(--t-mid)", fontWeight: 600 }}>{numeroCertidao}</strong>
              </span>
            )}
            {validade !== undefined && (
              <span style={{ fontSize: 11.5, color: "var(--t-low)" }}>
                Válida até <strong style={{ color: "var(--t-mid)", fontWeight: 600 }}>{validade}</strong>
              </span>
            )}
          </div>
        )}

        {/* Ações: expandir itens + link fonte */}
        <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          {hasItens && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-controls={`certidao-itens-${kind}`}
              style={{ fontSize: 11.5 }}
            >
              {open ? (
                <ChevronDown size={12} aria-hidden="true" />
              ) : (
                <ChevronRight size={12} aria-hidden="true" />
              )}
              {open ? "Ocultar detalhes" : `Ver ${itens.length} detalhe${itens.length > 1 ? "s" : ""}`}
            </button>
          )}
          {fonteUrl !== undefined && (
            <a
              href={fonteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn--ghost btn--sm"
              aria-label={`Ver fonte oficial de ${titulo || label}`}
              style={{ fontSize: 11.5 }}
            >
              <ExternalLink size={11} aria-hidden="true" />
              Fonte oficial
            </a>
          )}
        </div>
      </div>

      {/* Itens (expandível) */}
      {open && hasItens && (
        <div
          id={`certidao-itens-${kind}`}
          className="fade-in"
          style={{
            padding: "12px 18px 14px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
          role="list"
          aria-label={`Detalhes de ${titulo || label}`}
        >
          {itens.map((item, idx) => (
            <div
              key={`${item.rotulo}-${idx}`}
              role="listitem"
              style={{
                display: "flex",
                gap: 10,
                fontSize: 12.5,
                lineHeight: 1.45,
                padding: "5px 0",
                borderTop: idx > 0 ? "1px solid var(--border)" : undefined,
                ...(isSancao && status !== "regular"
                  ? {
                      background: "color-mix(in srgb,var(--danger) 5%,transparent)",
                      borderRadius: "var(--r-sm)",
                      padding: "6px 8px",
                    }
                  : {}),
              }}
            >
              <span
                style={{
                  fontWeight: 700,
                  color: isSancao && status !== "regular" ? "var(--danger)" : "var(--t-low)",
                  fontSize: 11,
                  letterSpacing: ".04em",
                  textTransform: "uppercase",
                  minWidth: 120,
                  flexShrink: 0,
                  paddingTop: 1,
                }}
              >
                {item.rotulo}
              </span>
              <span
                style={{
                  color: "var(--t-hi)",
                  wordBreak: "break-word",
                  fontWeight: isSancao && status !== "regular" ? 600 : 400,
                }}
              >
                {item.valor || "—"}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Rastreabilidade */}
      <div
        style={{
          padding: "8px 18px",
          borderTop: "1px solid var(--border)",
          fontSize: 10.5,
          color: "var(--t-low)",
          background: "var(--surface-2)",
        }}
      >
        Consultado via InfoSimples
        {fonteUrl !== undefined && (
          <>
            {" · "}
            <a
              href={fonteUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "var(--brand-ink)",
                textDecoration: "none",
                wordBreak: "break-all",
              }}
            >
              {fonteUrl}
            </a>
          </>
        )}
      </div>
    </div>
  );
}

// ─── QSA via receita-federal-cnpj ────────────────────────────────────────────

interface QsaCardProps {
  cards: CertidaoCardState[];
}

function QsaCard({ cards }: QsaCardProps) {
  const rfCard = cards.find((c) => c.kind === "receita-federal-cnpj");
  if (!rfCard || rfCard.result.state !== "ok") return null;

  const { data } = rfCard.result;
  // data.kind === "receita-federal-cnpj" garante ReceitaFederalCnpjPayload
  const socios = data.kind === "receita-federal-cnpj" ? (data.socios ?? []) : [];
  if (socios.length === 0) return null;

  return (
    <div className="panel" style={{ padding: "18px 20px" }}>
      <div className="row" style={{ gap: 8, marginBottom: 14 }}>
        <Users
          size={15}
          aria-hidden="true"
          style={{ color: "var(--brand-ink)", flexShrink: 0 }}
        />
        <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--t-hi)" }}>
          Sócios / QSA via Receita Federal
        </span>
        <span className="badge badge--neutral" style={{ fontSize: 11 }}>
          {socios.length}
        </span>
      </div>

      <div
        style={{ display: "flex", flexDirection: "column", gap: 0 }}
        role="list"
        aria-label="Quadro Societário e de Administração"
      >
        {socios.map((s, i) => (
          <div
            key={`${s.nome}-${i}`}
            role="listitem"
            style={{
              padding: "9px 0",
              borderTop: i > 0 ? "1px solid var(--border)" : undefined,
              display: "flex",
              flexDirection: "column",
              gap: 3,
            }}
          >
            <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--t-hi)" }}>
              {s.nome}
            </span>
            {s.qualificacao !== "" && (
              <span className="badge badge--neutral" style={{ fontSize: 10.5, alignSelf: "flex-start" }}>
                {s.qualificacao}
              </span>
            )}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 10, fontSize: 10.5, color: "var(--t-low)", lineHeight: 1.5 }}>
        Fonte: Receita Federal — via InfoSimples
      </div>
    </div>
  );
}

// ─── Semáforo geral ───────────────────────────────────────────────────────────

interface SemaforoHeaderProps {
  semaforo: SemaforoGeral;
  cards: CertidaoCardState[];
}

function SemaforoHeader({ semaforo, cards }: SemaforoHeaderProps) {
  const okCards = cards.filter(
    (c) => c.result.state === "ok",
  ) as Array<CertidaoCardState & { result: Extract<CertidaoCardState["result"], { state: "ok" }> }>;

  const regulares = okCards.filter((c) => c.result.data.status === "regular").length;
  const irregulares = okCards.filter((c) => c.result.data.status === "irregular").length;
  const atencao = okCards.filter((c) => c.result.data.status === "atencao").length;

  const SemaforoIcon =
    semaforo === "regular"
      ? ShieldCheck
      : semaforo === "irregular"
        ? ShieldOff
        : semaforo === "atencao"
          ? ShieldAlert
          : Info;

  const color = statusColor(semaforo);

  function buildSummary(): string {
    const parts: string[] = [];
    if (regulares > 0) parts.push(`${regulares} regular${regulares > 1 ? "es" : ""}`);
    if (atencao > 0) parts.push(`${atencao} pendência${atencao > 1 ? "s" : ""}`);
    if (irregulares > 0) parts.push(`${irregulares} irregular${irregulares > 1 ? "es" : ""}`);
    const unavailable = CERTIDAO_KINDS.length - okCards.length;
    if (unavailable > 0) parts.push(`${unavailable} indisponível${unavailable > 1 ? "is" : ""}`);
    return parts.join(", ");
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "16px 20px",
        borderRadius: "var(--r-lg)",
        border: `1px solid ${statusBorderColor(semaforo)}`,
        background: statusBgColor(semaforo),
        flexWrap: "wrap",
      }}
      aria-label={`Semáforo geral: ${statusLabel(semaforo)}`}
    >
      <div
        aria-hidden="true"
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          background: color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <SemaforoIcon size={22} style={{ color: "#fff" }} />
      </div>

      <div style={{ flex: 1, minWidth: 160 }}>
        <div
          style={{
            fontSize: 16,
            fontWeight: 800,
            color,
            letterSpacing: "-.02em",
            lineHeight: 1.2,
            marginBottom: 3,
          }}
        >
          {statusLabel(semaforo)}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--t-mid)", lineHeight: 1.4 }}>
          {buildSummary()}
        </div>
      </div>

      {/* Pílulas de contagem rápida */}
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        {regulares > 0 && (
          <span
            style={{
              padding: "2px 9px",
              borderRadius: "var(--r-pill)",
              background: "color-mix(in srgb,var(--ok) 15%,transparent)",
              color: "var(--ok)",
              fontSize: 11,
              fontWeight: 700,
              border: "1px solid color-mix(in srgb,var(--ok) 30%,transparent)",
            }}
          >
            {regulares} regular{regulares > 1 ? "es" : ""}
          </span>
        )}
        {atencao > 0 && (
          <span
            style={{
              padding: "2px 9px",
              borderRadius: "var(--r-pill)",
              background: "color-mix(in srgb,var(--warn) 15%,transparent)",
              color: "var(--warn)",
              fontSize: 11,
              fontWeight: 700,
              border: "1px solid color-mix(in srgb,var(--warn) 30%,transparent)",
            }}
          >
            {atencao} pendência{atencao > 1 ? "s" : ""}
          </span>
        )}
        {irregulares > 0 && (
          <span
            style={{
              padding: "2px 9px",
              borderRadius: "var(--r-pill)",
              background: "color-mix(in srgb,var(--danger) 15%,transparent)",
              color: "var(--danger)",
              fontSize: 11,
              fontWeight: 700,
              border: "1px solid color-mix(in srgb,var(--danger) 30%,transparent)",
            }}
          >
            {irregulares} irregular{irregulares > 1 ? "es" : ""}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

/** Estado de carregamento por card: string = kind em loading, ou o array de cards pronto. */
type LoadingState = "idle" | "loading" | CertidaoCardState[];

interface CertidoesSectionProps {
  /** CNPJ sanitizado (14 dígitos, sem pontuação). */
  cnpj: string;
}

export function CertidoesSection({ cnpj }: CertidoesSectionProps) {
  const [loadingState, setLoadingState] = useState<LoadingState>("idle");
  const sectionId = useId();

  useEffect(() => {
    if (cnpj === "") {
      setLoadingState("idle");
      return;
    }

    let cancelled = false;
    setLoadingState("loading");

    void consultarTodasCertidoes(cnpj).then((cards) => {
      if (!cancelled) setLoadingState(cards);
    });

    return () => {
      cancelled = true;
    };
  }, [cnpj]);

  const cards = Array.isArray(loadingState) ? loadingState : null;
  const isLoading = loadingState === "loading";

  // Detecta se TODOS os cards são dormant, login ou plan — estado global prioritário
  const globalState = (() => {
    if (!cards) return null;
    if (cards.every((c) => c.result.state === "dormant")) return "dormant" as const;
    if (cards.every((c) => c.result.state === "login")) return "login" as const;
    if (cards.every((c) => c.result.state === "plan")) return "plan" as const;
    return null;
  })();

  const semaforo = cards && !globalState ? computarSemaforo(cards) : null;

  return (
    <section
      aria-labelledby={sectionId}
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
    >
      {/* ── Cabeçalho da seção ────────────────────────────────────────────── */}
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: ".1em",
          textTransform: "uppercase",
          color: "var(--t-low)",
          padding: "4px 0",
        }}
      >
        <h3
          id={sectionId}
          style={{
            margin: 0,
            fontSize: "inherit",
            fontWeight: "inherit",
            letterSpacing: "inherit",
            textTransform: "inherit",
            color: "inherit",
          }}
        >
          Certidoes &amp; Idoneidade
        </h3>
      </div>

      {/* ── Loading: skeletons individuais por kind ────────────────────────── */}
      {isLoading && (
        <div
          style={{ display: "flex", flexDirection: "column", gap: 8 }}
          aria-live="polite"
          aria-busy="true"
        >
          {CERTIDAO_KINDS.map(({ kind, label }) => (
            <CardSkeleton key={kind} label={label} />
          ))}
        </div>
      )}

      {/* ── Estado global: dormant ────────────────────────────────────────── */}
      {globalState === "dormant" && (
        <div
          className="panel"
          style={{
            padding: "16px 20px",
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
          }}
          role="status"
        >
          <Info
            size={15}
            aria-hidden="true"
            style={{ color: "var(--t-low)", flexShrink: 0, marginTop: 1 }}
          />
          <p style={{ margin: 0, fontSize: 13, color: "var(--t-low)", lineHeight: 1.55 }}>
            Consultas premium indisponíveis. A integração com InfoSimples não está
            configurada neste ambiente.
          </p>
        </div>
      )}

      {/* ── Estado global: login ──────────────────────────────────────────── */}
      {globalState === "login" && (
        <div
          className="panel"
          style={{
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            alignItems: "flex-start",
          }}
          role="status"
        >
          <div className="row" style={{ gap: 8 }}>
            <Lock
              size={15}
              aria-hidden="true"
              style={{ color: "var(--brand-ink)", flexShrink: 0 }}
            />
            <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--t-hi)" }}>
              Acesso restrito
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "var(--t-mid)", lineHeight: 1.55 }}>
            Certidões e consultas de idoneidade exigem login.
          </p>
          <a href="/auth/login" className="btn btn--primary btn--sm">
            Entrar
          </a>
        </div>
      )}

      {/* ── Estado global: plano ──────────────────────────────────────────── */}
      {globalState === "plan" && (
        <div
          className="panel"
          style={{
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            alignItems: "flex-start",
          }}
          role="status"
        >
          <div className="row" style={{ gap: 8 }}>
            <Lock
              size={15}
              aria-hidden="true"
              style={{ color: "var(--brand-ink)", flexShrink: 0 }}
            />
            <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--t-hi)" }}>
              Recurso do plano pago
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "var(--t-mid)", lineHeight: 1.55 }}>
            Certidões automatizadas estao disponíveis nos planos Escritório e Corporativo.
          </p>
          <a href="/billing" className="btn btn--primary btn--sm">
            Ver planos
          </a>
        </div>
      )}

      {/* ── Dados carregados ──────────────────────────────────────────────── */}
      {cards && !globalState && semaforo && (
        <div
          className="fade-in"
          style={{ display: "flex", flexDirection: "column", gap: 10 }}
          aria-live="polite"
        >
          {/* Semáforo geral */}
          <SemaforoHeader semaforo={semaforo} cards={cards} />

          {/* QSA via receita-federal-cnpj */}
          <QsaCard cards={cards} />

          {/* Cards por certidão */}
          <div
            style={{ display: "flex", flexDirection: "column", gap: 8 }}
            role="list"
            aria-label="Certidoes por orgao"
          >
            {cards.map((card) => (
              <div key={card.kind} role="listitem">
                <CertidaoCard card={card} />
              </div>
            ))}
          </div>

          {/* Aviso de rastreabilidade */}
          <div
            style={{
              fontSize: 11,
              color: "var(--t-low)",
              lineHeight: 1.5,
              padding: "8px 12px",
              background: "var(--surface-2)",
              borderRadius: "var(--r-md)",
              border: "1px solid var(--border)",
            }}
          >
            Certidoes obtidas automaticamente via InfoSimples. Sempre verifique nas
            fontes oficiais antes de tomar decisões. Os links "Fonte oficial" em cada
            card apontam para o orgao emissor.
          </div>
        </div>
      )}
    </section>
  );
}

export default CertidoesSection;
