/**
 * MaisConsultasSection.tsx — Painel "Mais consultas — todas as fontes" do Dossiê Empresarial.
 *
 * Carrega o catálogo InfoSimples ao montar e exibe, por categoria, todos os kinds
 * que NÃO pertencem ao bloco CertidoesSection (os 9 kinds de compliance).
 * Consultas são sempre sob demanda — nunca auto-disparadas.
 *
 * Props:
 *  - cnpj       : 14 dígitos, sem máscara
 *  - ufEmpresa  : UF da sede (ex: "SP"), opcional — marca a categoria correspondente
 *                 como "recomendado" e a mantém aberta por padrão
 *
 * Design: CSS custom properties; mobile-first 375px; sem Tailwind, sem shadcn.
 */

import { useState, useEffect, useId, useRef } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Code,
  ExternalLink,
  Info,
  Loader2,
  Lock,
  Search,
  XCircle,
  Zap,
} from "lucide-react";
import type { CatalogKind } from "../../features/infosimples/catalog-api";
import { fetchCatalog, groupByCategoria } from "../../features/infosimples/catalog-api";
import type { CertidaoResult } from "../../features/infosimples/infosimples-client";
import { consultarCertidao } from "../../features/infosimples/infosimples-client";
import { EmptyState } from "../../components/ui";

// ─── Kinds excluídos (já cobertos por CertidoesSection) ──────────────────────

const COMPLIANCE_KINDS = new Set([
  "receita-federal-cnpj",
  "receita-federal-simples",
  "receita-federal-pgfn",
  "tst-cndt",
  "caixa-fgts",
  "transparencia-ceis",
  "transparencia-cnep",
  "tcu-inidoneo",
  "mte-trabalho-escravo",
]);

// ─── Props ────────────────────────────────────────────────────────────────────

interface MaisConsultasSectionProps {
  cnpj: string;
  ufEmpresa?: string;
}

// ─── Estado de catálogo ───────────────────────────────────────────────────────

type CatalogState =
  | { phase: "loading" }
  | { phase: "dormant" }
  | { phase: "error"; message: string }
  | { phase: "ok"; grouped: Map<string, CatalogKind[]> };

// ─── Estado por kind individual ───────────────────────────────────────────────

type KindState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "done"; result: CertidaoResult };

// ─── Helpers de cor por status ────────────────────────────────────────────────

function statusBadgeStyle(status: string): { background: string; color: string } {
  switch (status) {
    case "regular":
      return { background: "var(--ok)", color: "var(--surface)" };
    case "irregular":
      return { background: "var(--danger)", color: "var(--surface)" };
    case "atencao":
      return { background: "var(--warn)", color: "var(--surface)" };
    default:
      return { background: "var(--surface-2)", color: "var(--t-low)" };
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "regular":
      return "Regular";
    case "irregular":
      return "Irregular";
    case "atencao":
      return "Atenção";
    default:
      return "Indisponível";
  }
}

// ─── Detecta se uma categoria "casa" com a UF da empresa ─────────────────────

const UF_TO_STATE_NAME: Record<string, string[]> = {
  AC: ["Acre", "AC"],
  AL: ["Alagoas", "AL"],
  AP: ["Amapá", "AP"],
  AM: ["Amazonas", "AM"],
  BA: ["Bahia", "BA"],
  CE: ["Ceará", "CE"],
  DF: ["Distrito Federal", "DF"],
  ES: ["Espírito Santo", "ES"],
  GO: ["Goiás", "GO"],
  MA: ["Maranhão", "MA"],
  MT: ["Mato Grosso", "MT"],
  MS: ["Mato Grosso do Sul", "MS"],
  MG: ["Minas Gerais", "MG"],
  PA: ["Pará", "PA"],
  PB: ["Paraíba", "PB"],
  PR: ["Paraná", "PR"],
  PE: ["Pernambuco", "PE"],
  PI: ["Piauí", "PI"],
  RJ: ["Rio de Janeiro", "RJ"],
  RN: ["Rio Grande do Norte", "RN"],
  RS: ["Rio Grande do Sul", "RS"],
  RO: ["Rondônia", "RO"],
  RR: ["Roraima", "RR"],
  SC: ["Santa Catarina", "SC"],
  SP: ["São Paulo", "SP"],
  SE: ["Sergipe", "SE"],
  TO: ["Tocantins", "TO"],
};

function categoriaMatchesUf(categoria: string, uf: string): boolean {
  const upperUf = uf.toUpperCase();
  const terms = UF_TO_STATE_NAME[upperUf];
  if (!terms) {
    // fallback: checa se a própria sigla aparece como palavra no nome da categoria
    const regex = new RegExp(`\\b${upperUf}\\b`, "i");
    return regex.test(categoria);
  }
  return terms.some((term) =>
    categoria.toLowerCase().includes(term.toLowerCase())
  );
}

// ─── Skeleton do catálogo ─────────────────────────────────────────────────────

function CatalogSkeleton() {
  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 20 }}
      aria-busy="true"
      aria-label="Carregando catálogo de consultas…"
    >
      {([0, 1, 2] as const).map((i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* linha de título do grupo */}
          <div
            className="skeleton"
            style={{
              height: 14,
              width: `${30 + i * 8}%`,
              borderRadius: "var(--r-sm)",
            }}
          />
          {/* dois card-skeletons */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(min(260px, 100%), 1fr))",
              gap: 10,
            }}
          >
            {([0, 1] as const).map((j) => (
              <div
                key={j}
                className="skeleton"
                style={{
                  height: 88,
                  borderRadius: "var(--r-md)",
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Visualizador de resultado de uma certidão ────────────────────────────────

function CertidaoResultView({ result }: { result: CertidaoResult }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [rawOpen, setRawOpen] = useState(false);
  const uid = useId();
  const detailsId = `${uid}-details`;
  const rawId = `${uid}-raw`;

  if (result.state === "dormant") {
    return (
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "flex-start",
          marginTop: 12,
          padding: "10px 12px",
          background: "var(--surface-2)",
          borderRadius: "var(--r-sm)",
          border: "1px solid var(--border)",
        }}
      >
        <Info
          size={14}
          aria-hidden="true"
          style={{ color: "var(--t-low)", flexShrink: 0, marginTop: 1 }}
        />
        <span style={{ fontSize: 12.5, color: "var(--t-low)" }}>
          Consultas premium indisponíveis neste ambiente.
        </span>
      </div>
    );
  }

  if (result.state === "login") {
    return (
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "flex-start",
          marginTop: 12,
          padding: "10px 12px",
          background: "var(--surface-2)",
          borderRadius: "var(--r-sm)",
          border: "1px solid var(--border)",
        }}
      >
        <Lock
          size={14}
          aria-hidden="true"
          style={{ color: "var(--t-low)", flexShrink: 0, marginTop: 1 }}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12.5, color: "var(--t-mid)" }}>
            Faça login para consultar.
          </span>
          <a
            href="/auth/login"
            className="btn btn--ghost btn--sm"
            style={{ alignSelf: "flex-start", fontSize: 11.5 }}
          >
            Entrar
          </a>
        </div>
      </div>
    );
  }

  if (result.state === "plan") {
    return (
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "flex-start",
          marginTop: 12,
          padding: "10px 12px",
          background: "var(--surface-2)",
          borderRadius: "var(--r-sm)",
          border: "1px solid var(--border)",
        }}
      >
        <Lock
          size={14}
          aria-hidden="true"
          style={{ color: "var(--brand-ink)", flexShrink: 0, marginTop: 1 }}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12.5, color: "var(--t-mid)" }}>
            Recurso do plano pago.
          </span>
          <a
            href="/billing"
            className="btn btn--ghost btn--sm"
            style={{ alignSelf: "flex-start", fontSize: 11.5 }}
          >
            Ver planos
          </a>
        </div>
      </div>
    );
  }

  if (result.state === "empty" || result.state === "error") {
    return (
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "flex-start",
          marginTop: 12,
          padding: "10px 12px",
          background: "var(--surface-2)",
          borderRadius: "var(--r-sm)",
          border: "1px solid var(--border)",
        }}
      >
        <AlertTriangle
          size={14}
          aria-hidden="true"
          style={{
            color: result.state === "error" ? "var(--danger)" : "var(--warn)",
            flexShrink: 0,
            marginTop: 1,
          }}
        />
        <span
          style={{
            fontSize: 12.5,
            color: result.state === "error" ? "var(--danger)" : "var(--t-mid)",
          }}
        >
          {result.message}
        </span>
      </div>
    );
  }

  // state === "ok"
  const payload = result.data;
  const badgeStyle = statusBadgeStyle(payload.status);
  const hasItens = payload.itens.length > 0;

  return (
    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Status + título */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
        }}
      >
        <span
          style={{
            padding: "2px 8px",
            borderRadius: "var(--r-pill)",
            background: badgeStyle.background,
            color: badgeStyle.color,
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: ".04em",
            textTransform: "uppercase",
            flexShrink: 0,
          }}
        >
          {statusLabel(payload.status)}
        </span>
        <span style={{ fontWeight: 600, fontSize: 13, color: "var(--t-hi)" }}>
          {payload.titulo}
        </span>
      </div>

      {/* Resumo */}
      {payload.resumo !== "" && (
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--t-mid)", lineHeight: 1.5 }}>
          {payload.resumo}
        </p>
      )}

      {/* Metadados opcionais */}
      {(payload.validade !== undefined || payload.numeroCertidao !== undefined) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {payload.validade !== undefined && (
            <span style={{ fontSize: 11.5, color: "var(--t-low)" }}>
              Validade:{" "}
              <strong style={{ color: "var(--t-mid)", fontWeight: 600 }}>
                {payload.validade}
              </strong>
            </span>
          )}
          {payload.numeroCertidao !== undefined && (
            <span style={{ fontSize: 11.5, color: "var(--t-low)" }}>
              N°{" "}
              <strong style={{ color: "var(--t-mid)", fontWeight: 600 }}>
                {payload.numeroCertidao}
              </strong>
            </span>
          )}
        </div>
      )}

      {/* Fonte oficial */}
      {payload.fonteUrl !== undefined && (
        <a
          href={payload.fonteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn--ghost btn--sm"
          style={{
            alignSelf: "flex-start",
            display: "inline-flex",
            gap: 6,
            alignItems: "center",
            fontSize: 11.5,
          }}
        >
          <ExternalLink size={12} aria-hidden="true" />
          Fonte oficial
        </a>
      )}

      {/* Detalhes colapsáveis */}
      {hasItens && (
        <div>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            aria-expanded={detailsOpen}
            aria-controls={detailsId}
            onClick={() => setDetailsOpen((v) => !v)}
            style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 11.5 }}
          >
            {detailsOpen ? (
              <ChevronUp size={12} aria-hidden="true" />
            ) : (
              <ChevronDown size={12} aria-hidden="true" />
            )}
            {detailsOpen ? "Ocultar detalhes" : `Ver ${payload.itens.length} detalhe${payload.itens.length > 1 ? "s" : ""}`}
          </button>
          {detailsOpen && (
            <div
              id={detailsId}
              style={{
                marginTop: 8,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(min(200px, 100%), 1fr))",
                gap: "6px 12px",
              }}
            >
              {payload.itens.map((item, i) => (
                <div key={`${item.rotulo}-${i}`} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span
                    style={{
                      fontSize: 10.5,
                      color: "var(--t-low)",
                      textTransform: "uppercase",
                      letterSpacing: ".04em",
                      fontWeight: 700,
                    }}
                  >
                    {item.rotulo}
                  </span>
                  <span style={{ fontSize: 12.5, color: "var(--t-hi)", fontWeight: 500 }}>
                    {item.valor || "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Dados brutos */}
      <div>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          aria-expanded={rawOpen}
          aria-controls={rawId}
          onClick={() => setRawOpen((v) => !v)}
          style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 11.5 }}
        >
          <Code size={12} aria-hidden="true" />
          {rawOpen ? (
            <ChevronUp size={12} aria-hidden="true" />
          ) : (
            <ChevronDown size={12} aria-hidden="true" />
          )}
          Dados brutos
        </button>
        {rawOpen && (
          <pre
            id={rawId}
            style={{
              marginTop: 8,
              padding: "10px 12px",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-sm)",
              fontSize: 11,
              lineHeight: 1.5,
              color: "var(--t-mid)",
              overflow: "auto",
              maxHeight: 300,
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}
          >
            {JSON.stringify(result.data, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

// ─── Card de um kind individual ───────────────────────────────────────────────

interface KindCardProps {
  catalogKind: CatalogKind;
  cnpj: string;
  /** Estado já gerenciado pelo acordeão-pai (via mapa compartilhado). */
  kindState: KindState;
  onDispatch: (kind: string) => void;
}

function KindCard({ catalogKind, cnpj, kindState, onDispatch }: KindCardProps) {
  const isLoading = kindState.phase === "loading";
  const canConsult = cnpj.length === 14 && !isLoading;

  return (
    <div
      className="card"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 0,
        position: "relative",
        padding: "14px 16px 16px",
        minWidth: 0,
      }}
    >
      {/* Badge premium */}
      <span
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: ".05em",
          textTransform: "uppercase",
          padding: "2px 7px",
          borderRadius: "var(--r-pill)",
          background: "color-mix(in srgb,var(--warn) 15%,transparent)",
          color: "var(--warn)",
          border: "1px solid color-mix(in srgb,var(--warn) 30%,transparent)",
          lineHeight: 1.6,
        }}
        aria-label="Consulta premium"
      >
        premium
      </span>

      {/* Título */}
      <p
        style={{
          margin: "0 0 12px",
          fontWeight: 600,
          fontSize: 14,
          color: "var(--t-hi)",
          paddingRight: 60,
          lineHeight: 1.4,
        }}
      >
        {catalogKind.titulo}
      </p>

      {/* Botão consultar — só aparece quando ainda não consultou */}
      {kindState.phase === "idle" && (
        <button
          type="button"
          className="btn btn--primary btn--sm"
          disabled={!canConsult}
          onClick={() => onDispatch(catalogKind.kind)}
          style={{
            alignSelf: "flex-start",
            display: "inline-flex",
            gap: 6,
            alignItems: "center",
          }}
        >
          <Search size={13} aria-hidden="true" />
          Consultar
        </button>
      )}

      {/* Loading inline */}
      {kindState.phase === "loading" && (
        <div
          aria-live="polite"
          aria-busy="true"
          style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}
        >
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <Loader2
              size={13}
              aria-hidden="true"
              className="spin"
              style={{ color: "var(--t-low)" }}
            />
            <span style={{ fontSize: 12, color: "var(--t-low)" }}>Consultando…</span>
          </div>
          <div className="skeleton" style={{ height: 10, width: "60%", borderRadius: "var(--r-sm)" }} />
          <div className="skeleton" style={{ height: 10, width: "80%", borderRadius: "var(--r-sm)" }} />
        </div>
      )}

      {/* Resultado */}
      {kindState.phase === "done" && (
        <div aria-live="polite">
          <CertidaoResultView result={kindState.result} />
        </div>
      )}
    </div>
  );
}

// ─── Acordeão por categoria ───────────────────────────────────────────────────

interface CategoryAccordionProps {
  categoria: string;
  kinds: CatalogKind[];
  cnpj: string;
  ufEmpresa?: string;
  /** Mapa de estado compartilhado (kind → KindState). Leitura e escrita via callbacks. */
  kindStates: Map<string, KindState>;
  onDispatchKind: (kind: string) => void;
  onDispatchCategoria: (kinds: CatalogKind[]) => void;
  defaultOpen: boolean;
}

function CategoryAccordion({
  categoria,
  kinds,
  cnpj,
  ufEmpresa,
  kindStates,
  onDispatchKind,
  onDispatchCategoria,
  defaultOpen,
}: CategoryAccordionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [pendingConfirm, setPendingConfirm] = useState(false);
  const sectionId = useId();
  const headerId = useId();

  const isRecomendado =
    ufEmpresa !== undefined && categoriaMatchesUf(categoria, ufEmpresa);

  const anyLoading = kinds.some((k) => {
    const s = kindStates.get(k.kind);
    return s !== undefined && s.phase === "loading";
  });

  const canDispatchCategoria = cnpj.length === 14 && !anyLoading;

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--r-md)",
        overflow: "hidden",
      }}
    >
      {/* Cabeçalho do acordeão */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "14px 16px",
          background: open ? "var(--surface)" : "var(--surface-2)",
          cursor: "pointer",
          userSelect: "none",
          flexWrap: "wrap",
        }}
      >
        {/* Botão de toggle — engloba apenas o nome + chevron */}
        <button
          type="button"
          className="btn btn--ghost"
          aria-expanded={open}
          aria-controls={sectionId}
          id={headerId}
          onClick={() => setOpen((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flex: 1,
            minWidth: 0,
            padding: 0,
            background: "none",
            border: "none",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          {open ? (
            <ChevronUp size={15} aria-hidden="true" style={{ color: "var(--t-low)", flexShrink: 0 }} />
          ) : (
            <ChevronDown size={15} aria-hidden="true" style={{ color: "var(--t-low)", flexShrink: 0 }} />
          )}
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "var(--t-hi)",
              lineHeight: 1.3,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {categoria}
          </span>
          <span
            style={{
              flexShrink: 0,
              fontSize: 11,
              fontWeight: 600,
              padding: "1px 7px",
              borderRadius: "var(--r-pill)",
              background: "var(--surface-3, var(--surface-2))",
              color: "var(--t-low)",
              border: "1px solid var(--border)",
            }}
          >
            {kinds.length}
          </span>
        </button>

        {/* Badge "recomendado p/ UF" */}
        {isRecomendado && ufEmpresa !== undefined && (
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: "var(--r-pill)",
              background: "color-mix(in srgb,var(--brand) 12%,transparent)",
              color: "var(--brand-ink)",
              border: "1px solid color-mix(in srgb,var(--brand) 25%,transparent)",
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            recomendado p/ {ufEmpresa}
          </span>
        )}

        {/* Botão "Consultar categoria" — posicionado à direita no header */}
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          disabled={!canDispatchCategoria}
          aria-busy={anyLoading}
          onClick={(e) => {
            e.stopPropagation();
            if (!open) setOpen(true);
            setPendingConfirm(true);
          }}
          style={{
            display: "inline-flex",
            gap: 5,
            alignItems: "center",
            flexShrink: 0,
            fontSize: 12,
          }}
        >
          {anyLoading ? (
            <Loader2 size={12} aria-hidden="true" className="spin" />
          ) : (
            <Zap size={12} aria-hidden="true" />
          )}
          {anyLoading ? "Consultando…" : "Consultar categoria"}
        </button>
      </div>

      {/* Confirmação inline de disparo de categoria */}
      {pendingConfirm && (
        <div
          role="alertdialog"
          aria-modal="false"
          aria-label={`Confirmar consulta da categoria ${categoria}`}
          tabIndex={-1}
          onKeyDown={(e) => { if (e.key === "Escape") setPendingConfirm(false); }}
          style={{
            padding: "12px 16px",
            background: "color-mix(in srgb,var(--warn) 8%,var(--surface))",
            borderTop: "1px solid color-mix(in srgb,var(--warn) 25%,transparent)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <p style={{ margin: 0, fontSize: 13, color: "var(--t-mid)", lineHeight: 1.5 }}>
            Consultar <strong style={{ color: "var(--t-hi)" }}>{categoria}</strong>?
            {" "}Serão{" "}
            <strong style={{ color: "var(--t-hi)" }}>
              {kinds.filter((k) => {
                const s = kindStates.get(k.kind);
                return s === undefined || s.phase === "idle";
              }).length}
            </strong>{" "}
            consulta{kinds.filter((k) => {
              const s = kindStates.get(k.kind);
              return s === undefined || s.phase === "idle";
            }).length !== 1 ? "s" : ""} e consumirá créditos do plano.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={() => {
                setPendingConfirm(false);
                onDispatchCategoria(kinds);
              }}
              autoFocus
            >
              Confirmar
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setPendingConfirm(false)}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Painel de kinds */}
      {open && (
        <div
          id={sectionId}
          role="region"
          aria-labelledby={headerId}
          className="fade-in"
          style={{
            padding: "14px 14px 16px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(min(260px, 100%), 1fr))",
            gap: 10,
            background: "var(--surface)",
            borderTop: "1px solid var(--border)",
          }}
        >
          {kinds.map((k) => {
            const state = kindStates.get(k.kind) ?? { phase: "idle" as const };
            return (
              <KindCard
                key={k.kind}
                catalogKind={k}
                cnpj={cnpj}
                kindState={state}
                onDispatch={onDispatchKind}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function MaisConsultasSection({ cnpj, ufEmpresa }: MaisConsultasSectionProps) {
  const sectionHeadingId = useId();

  const [catalogState, setCatalogState] = useState<CatalogState>({ phase: "loading" });

  // kindStates: mapa kind → estado da consulta. Guardado como valor imutável para
  // forçar re-render ao mudar (spread + novo Map a cada escrita).
  const [kindStates, setKindStates] = useState<Map<string, KindState>>(new Map());

  // Ref para o cnpj atual — usado para cancelar resultados de consultas stale
  // quando o usuário troca de CNPJ enquanto uma requisição está em andamento.
  const currentCnpjRef = useRef(cnpj);
  useEffect(() => {
    currentCnpjRef.current = cnpj;
  }, [cnpj]);

  // ── Carga do catálogo ─────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setCatalogState({ phase: "loading" });

    void fetchCatalog().then((result) => {
      if (cancelled) return;
      if (result.state === "dormant") {
        setCatalogState({ phase: "dormant" });
        return;
      }
      if (result.state === "error") {
        setCatalogState({ phase: "error", message: result.message });
        return;
      }
      // Filtra os 9 kinds de compliance
      const filtered = result.kinds.filter((k) => !COMPLIANCE_KINDS.has(k.kind));
      const grouped = groupByCategoria(filtered);
      setCatalogState({ phase: "ok", grouped });
    });

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Dispatch de um kind individual ────────────────────────────────────────
  function dispatchKind(kind: string) {
    if (cnpj.length !== 14) return;
    const current = kindStates.get(kind);
    if (current?.phase === "loading") return;

    const dispatchedCnpj = cnpj;
    setKindStates((prev) => new Map([...prev, [kind, { phase: "loading" }]]));

    void consultarCertidao(kind, dispatchedCnpj).then((result) => {
      if (currentCnpjRef.current !== dispatchedCnpj) return;
      setKindStates((prev) =>
        new Map([...prev, [kind, { phase: "done", result }]])
      );
    });
  }

  // ── Dispatch de todos os kinds de uma categoria em paralelo ───────────────
  function dispatchCategoria(kinds: CatalogKind[]) {
    if (cnpj.length !== 14) return;

    // Captura snapshot do estado atual antes de qualquer setState
    // para evitar stale closure ao verificar quais kinds já estão em loading.
    const snapshot = kindStates;

    // Filtra apenas os que não estão em loading
    const toDispatch = kinds.filter((k) => snapshot.get(k.kind)?.phase !== "loading");
    if (toDispatch.length === 0) return;

    // Marca todos como loading (num único setState)
    setKindStates((prev) => {
      const next = new Map(prev);
      for (const k of toDispatch) {
        next.set(k.kind, { phase: "loading" });
      }
      return next;
    });

    // Dispara em paralelo
    const dispatchedCnpj = cnpj;
    for (const k of toDispatch) {
      void consultarCertidao(k.kind, dispatchedCnpj).then((result) => {
        if (currentCnpjRef.current !== dispatchedCnpj) return;
        setKindStates((prev) =>
          new Map([...prev, [k.kind, { phase: "done", result }]])
        );
      });
    }
  }

  // ── Retry do catálogo (extrai a lógica para reusar) ──────────────────────
  function retryCatalog() {
    if (cnpj === "") return;
    setCatalogState({ phase: "loading" });
    setKindStates(new Map());

    void fetchCatalog().then((result) => {
      if (result.state === "dormant") {
        setCatalogState({ phase: "dormant" });
        return;
      }
      if (result.state === "error") {
        setCatalogState({ phase: "error", message: result.message });
        return;
      }
      const filtered = result.kinds.filter((k) => !COMPLIANCE_KINDS.has(k.kind));
      const grouped = groupByCategoria(filtered);
      setCatalogState({ phase: "ok", grouped });
    });
  }

  return (
    <section
      aria-labelledby={sectionHeadingId}
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      {/* ── Cabeçalho da seção ──────────────────────────────────────────────── */}
      <div>
        <h3
          id={sectionHeadingId}
          style={{
            margin: "0 0 4px",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: ".1em",
            textTransform: "uppercase",
            color: "var(--t-low)",
          }}
        >
          Mais consultas — todas as fontes
        </h3>
        <div
          aria-hidden="true"
          style={{
            height: 1,
            background: "var(--border)",
            borderRadius: 1,
          }}
        />
      </div>

      {/* ── Aviso de custo (sempre visível) ─────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "flex-start",
          padding: "10px 14px",
          background: "color-mix(in srgb,var(--warn) 8%,var(--surface))",
          border: "1px solid color-mix(in srgb,var(--warn) 25%,transparent)",
          borderRadius: "var(--r-md)",
        }}
        role="note"
      >
        <Zap
          size={14}
          aria-hidden="true"
          style={{ color: "var(--warn)", flexShrink: 0, marginTop: 1 }}
        />
        <span style={{ fontSize: 12.5, color: "var(--t-mid)", lineHeight: 1.5 }}>
          Cada consulta consome créditos do plano. Selecione com critério.
        </span>
      </div>

      {/* ── Loading do catálogo ─────────────────────────────────────────────── */}
      {catalogState.phase === "loading" && <CatalogSkeleton />}

      {/* ── Catálogo dormant ────────────────────────────────────────────────── */}
      {catalogState.phase === "dormant" && (
        <div className="panel">
          <EmptyState
            title="Consultas premium não configuradas"
            description="O proxy InfoSimples não está ativo neste ambiente. Disponível nos planos Escritório e Corporativo."
            tone="warning"
            action={{ label: "Ver planos", href: "/billing" }}
          />
        </div>
      )}

      {/* ── Erro de catálogo ─────────────────────────────────────────────────── */}
      {catalogState.phase === "error" && (
        <div
          className="panel"
          style={{
            padding: "18px 20px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            alignItems: "flex-start",
          }}
          role="alert"
        >
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <XCircle
              size={16}
              aria-hidden="true"
              style={{ color: "var(--danger)", flexShrink: 0 }}
            />
            <span style={{ fontWeight: 600, fontSize: 13.5, color: "var(--t-hi)" }}>
              Erro ao carregar catálogo
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--t-mid)", lineHeight: 1.5 }}>
            {catalogState.message}
          </p>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={retryCatalog}
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* ── Acordeões por categoria ─────────────────────────────────────────── */}
      {catalogState.phase === "ok" && (
        <div
          style={{ display: "flex", flexDirection: "column", gap: 10 }}
          aria-live="polite"
        >
          {Array.from(catalogState.grouped.entries()).map(([categoria, kinds]) => {
            const isRecomendado =
              ufEmpresa !== undefined && categoriaMatchesUf(categoria, ufEmpresa);
            return (
              <CategoryAccordion
                key={categoria}
                categoria={categoria}
                kinds={kinds}
                cnpj={cnpj}
                {...(ufEmpresa !== undefined ? { ufEmpresa } : {})}
                kindStates={kindStates}
                onDispatchKind={dispatchKind}
                onDispatchCategoria={dispatchCategoria}
                defaultOpen={isRecomendado}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

export default MaisConsultasSection;
