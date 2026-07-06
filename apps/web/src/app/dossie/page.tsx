/**
 * dossie/page.tsx — Dossiê Empresarial Automatizado
 *
 * O usuário cola um CNPJ e recebe, numa só tela, uma visão consolidada de TODOS os
 * módulos da Fonte.ia: sanções, contratos, licitações, infrações ambientais, marcas
 * INPI, despesas parlamentares, processos judiciais — com score de risco transparente
 * e links para as fontes oficiais (rastreabilidade).
 *
 * Stack: Vite + React + TypeScript. CSS design system próprio (vars, sem Tailwind).
 * Mobile-first 375px. Dark/light safe. Reduced-motion safe. SSG-safe (window-guarded).
 */

import { useState, useCallback, useId } from "react";
import {
  AlertTriangle,
  Brain,
  Building2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileSearch2,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  buildDossie,
  dossieToReport,
  riskColor,
  riskLabelPt,
  type Dossie,
  type DossieItem,
  type DossieSection,
} from "../../features/dossie/dossie-api";
import { sanitizeCnpj, formatCnpj } from "../../features/cerebro/cerebro-api";
import { MODULE_META } from "../../features/cerebro/types";
import { requestCompanyEnrichment } from "../../features/empresas/company-search";
import { CompanySearch, RoiNote } from "../../components/ui";
import { ReportButton } from "../../components/report/ReportButton";
import { CreateAlertButton } from "../../components/alerts/CreateAlertButton";
import { CertidoesSection } from "./CertidoesSection";

// ─── Exemplos de CNPJ para facilitar a descoberta ────────────────────────────

const EXEMPLOS: Array<{ label: string; cnpj: string }> = [
  { label: "Banco do Brasil", cnpj: "00.000.000/0001-91" },
  { label: "Petrobras", cnpj: "33.000.167/0001-01" },
  { label: "Embraer", cnpj: "07.689.002/0001-89" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

/** Navega para o Cérebro pre-carregado com o CNPJ, usando o padrão SPA do app. */
function navigateToCerebro(cnpj: string): void {
  if (typeof window === "undefined") return;
  const url = `/app/cerebro?cnpj=${encodeURIComponent(cnpj)}`;
  window.history.pushState(null, "", url);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/**
 * Rola até o campo de busca do CompanySearch e foca, para consultar outra
 * empresa. O CompanySearch renderiza o <input> com id `${id}-input`.
 */
function focusSearchInput(baseId: string): void {
  if (typeof document === "undefined") return;
  const el = document.getElementById(`${baseId}-input`);
  if (el === null) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  if (el instanceof HTMLInputElement) {
    el.focus();
    el.select();
  } else {
    el.focus();
  }
}

/**
 * Converte os warnings técnicos de falha parcial (ex.: "public_contract: d1-bridge
 * retornou 503") num texto pt-BR sem código HTTP nem nome de kind cru:
 * "Alguns módulos (Contratos, Ambiental) tiveram falha parcial e podem estar
 * incompletos." Presentação apenas — não altera os dados.
 */
function friendlyWarning(warnings: readonly string[]): string {
  const meta = MODULE_META as unknown as Record<string, { label?: string }>;
  const labels: string[] = [];
  for (const w of warnings) {
    const idx = w.indexOf(":");
    const rawKind = (idx >= 0 ? w.slice(0, idx) : w).trim();
    // Normaliza tokens do tipo "person(QSA)" → "person".
    const kindKey = rawKind.replace(/\(.*\)$/, "").trim();
    const label =
      Object.prototype.hasOwnProperty.call(meta, kindKey) && meta[kindKey]?.label
        ? (meta[kindKey]?.label as string)
        : undefined;
    if (label !== undefined && !labels.includes(label)) labels.push(label);
  }

  if (labels.length === 0) {
    return "Alguns módulos tiveram falha parcial e podem estar incompletos. Os demais carregaram normalmente.";
  }
  return `Alguns módulos (${labels.join(", ")}) tiveram falha parcial e podem estar incompletos. Os demais carregaram normalmente.`;
}

// ─── Sub-componentes: Skeleton ────────────────────────────────────────────────

function DossieSkeleton() {
  return (
    <div
      className="fade-in"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
      aria-busy="true"
      aria-label="Carregando dossiê…"
    >
      {/* Header skeleton */}
      <div
        className="panel"
        style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 14 }}
      >
        <div className="skeleton" style={{ height: 14, width: "40%", borderRadius: 6 }} />
        <div className="skeleton" style={{ height: 26, width: "70%", borderRadius: 8 }} />
        <div className="skeleton" style={{ height: 13, width: "30%", borderRadius: 6 }} />
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <div className="skeleton" style={{ height: 34, width: 130, borderRadius: 9 }} />
          <div className="skeleton" style={{ height: 34, width: 130, borderRadius: 9 }} />
          <div className="skeleton" style={{ height: 34, width: 110, borderRadius: 9 }} />
        </div>
      </div>

      {/* Risk card skeleton */}
      <div
        className="panel"
        style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 12 }}
      >
        <div className="skeleton" style={{ height: 13, width: "25%", borderRadius: 6 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div className="skeleton" style={{ width: 72, height: 72, borderRadius: "50%" }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="skeleton" style={{ height: 20, width: "45%", borderRadius: 8 }} />
            <div className="skeleton" style={{ height: 13, width: "80%", borderRadius: 6 }} />
            <div className="skeleton" style={{ height: 13, width: "60%", borderRadius: 6 }} />
          </div>
        </div>
      </div>

      {/* Section skeletons */}
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="panel"
          style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 10 }}
        >
          <div className="skeleton" style={{ height: 14, width: "35%", borderRadius: 6 }} />
          <div className="skeleton" style={{ height: 12, width: "55%", borderRadius: 6 }} />
        </div>
      ))}
    </div>
  );
}

// ─── Sub-componente: Card de risco ────────────────────────────────────────────

interface RiskCardProps {
  dossie: Dossie;
}

function RiskCard({ dossie }: RiskCardProps) {
  const color = riskColor(dossie.riskLabel);
  const labelPt = riskLabelPt(dossie.riskLabel);

  // Ícone por nível
  const RiskIcon =
    dossie.riskLabel === "alto"
      ? ShieldOff
      : dossie.riskLabel === "medio"
        ? ShieldAlert
        : ShieldCheck;

  return (
    <section
      className="panel"
      style={{ padding: "24px" }}
      aria-labelledby="risk-card-heading"
    >
      <div
        id="risk-card-heading"
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: ".1em",
          textTransform: "uppercase",
          color: "var(--t-low)",
          marginBottom: 16,
        }}
      >
        Avaliação de risco
      </div>

      {/* Score principal */}
      <div
        className="row wrap"
        style={{ gap: 20, alignItems: "flex-start", marginBottom: 20 }}
      >
        {/* Gauge circular simplificado */}
        <div
          aria-hidden="true"
          style={{
            position: "relative",
            width: 80,
            height: 80,
            flexShrink: 0,
          }}
        >
          <svg width="80" height="80" viewBox="0 0 80 80" aria-hidden="true">
            {/* Trilha */}
            <circle
              cx="40"
              cy="40"
              r="34"
              fill="none"
              stroke="var(--border)"
              strokeWidth="8"
            />
            {/* Progresso */}
            <circle
              cx="40"
              cy="40"
              r="34"
              fill="none"
              stroke={color}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 34}`}
              strokeDashoffset={`${2 * Math.PI * 34 * (1 - dossie.riskScore / 100)}`}
              transform="rotate(-90 40 40)"
              style={{ transition: "stroke-dashoffset .6s ease" }}
            />
          </svg>
          {/* Score numérico */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 0,
            }}
          >
            <span
              style={{
                fontSize: 20,
                fontWeight: 800,
                color,
                lineHeight: 1,
              }}
            >
              {dossie.riskScore}
            </span>
            <span style={{ fontSize: 9.5, color: "var(--t-low)", fontWeight: 600 }}>
              /100
            </span>
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            className="row"
            style={{ gap: 8, marginBottom: 6, flexWrap: "wrap" }}
          >
            <RiskIcon size={18} style={{ color, flexShrink: 0 }} aria-hidden="true" />
            <span
              style={{
                fontSize: 18,
                fontWeight: 800,
                color,
                letterSpacing: "-.02em",
              }}
            >
              Risco {labelPt}
            </span>
          </div>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: "var(--t-mid)",
              lineHeight: 1.55,
            }}
          >
            {dossie.riskLabel === "baixo" &&
              "Nenhum sinal de alerta significativo foi identificado nas fontes públicas. Isso não elimina riscos não cobertos pelas fontes — complemente com due diligence documental."}
            {dossie.riskLabel === "medio" &&
              "Foram identificados sinais de atenção. Analise os fatores abaixo e valide diretamente nas fontes antes de fechar qualquer negócio."}
            {dossie.riskLabel === "alto" &&
              "Sinais de risco relevantes encontrados. Recomenda-se análise criteriosa dos fatores abaixo e consulta jurídica antes de prosseguir."}
          </p>
        </div>
      </div>

      {/* Fatores */}
      {dossie.riskFactors.length > 0 && (
        <div
          style={{ display: "flex", flexDirection: "column", gap: 10 }}
          role="list"
          aria-label="Fatores de risco"
        >
          {dossie.riskFactors.map((f) => (
            <div
              key={f.label}
              role="listitem"
              style={{
                padding: "12px 14px",
                borderRadius: "var(--r-md)",
                border: "1px solid var(--border)",
                background: "var(--surface-2)",
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background:
                    f.weight > 20
                      ? "var(--danger)"
                      : f.weight > 0
                        ? "var(--warn)"
                        : "var(--ok)",
                  marginTop: 5,
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 13,
                    color: "var(--t-hi)",
                    marginBottom: 3,
                  }}
                >
                  {f.label}
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: 12.5,
                    color: "var(--t-mid)",
                    lineHeight: 1.5,
                  }}
                >
                  {f.detail}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Aviso de honestidade */}
      <div
        style={{
          marginTop: 14,
          padding: "9px 12px",
          borderRadius: "var(--r-md)",
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          fontSize: 11.5,
          color: "var(--t-low)",
          lineHeight: 1.5,
        }}
      >
        Score calculado exclusivamente a partir de dados oficiais públicos. Não substitui
        análise jurídica ou contábil. Fontes: Portal da Transparência, IBAMA, PNCP, CNJ,
        INPI, Câmara dos Deputados, Receita Federal.
      </div>
    </section>
  );
}

// ─── Sub-componente: Item de seção ────────────────────────────────────────────

interface SectionItemRowProps {
  item: DossieItem;
}

function SectionItemRow({ item }: SectionItemRowProps) {
  const [open, setOpen] = useState(false);
  const hasDetails = (item.details?.length ?? 0) > 0;

  return (
    <div
      style={{
        borderTop: "1px solid var(--border)",
        padding: "10px 0",
      }}
    >
      <div
        className="row between"
        style={{ gap: 8, flexWrap: "nowrap", alignItems: "flex-start" }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13.5,
              fontWeight: 600,
              color: "var(--t-hi)",
              wordBreak: "break-word",
              lineHeight: 1.35,
            }}
          >
            {item.label}
          </div>
          {item.sublabel !== undefined && (
            <div
              style={{
                fontSize: 11.5,
                color: "var(--t-low)",
                marginTop: 2,
                wordBreak: "break-word",
              }}
            >
              {item.sublabel}
            </div>
          )}
        </div>

        <div
          className="row"
          style={{ gap: 4, flexShrink: 0, marginTop: 1 }}
        >
          {item.sourceUrl !== undefined && (
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn--ghost btn--sm"
              title="Ver na fonte oficial"
              aria-label="Ver na fonte oficial"
              style={{ padding: "4px 8px" }}
            >
              <ExternalLink size={12} aria-hidden="true" />
            </a>
          )}
          {hasDetails && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-label={open ? "Ocultar detalhes" : "Ver detalhes"}
              style={{ padding: "4px 8px" }}
            >
              {open ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}
            </button>
          )}
        </div>
      </div>

      {/* Detalhes expandidos */}
      {open && hasDetails && (
        <div
          className="fade-in"
          style={{
            marginTop: 10,
            padding: "10px 12px",
            background: "var(--surface-2)",
            borderRadius: "var(--r-md)",
            border: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {item.details!.map((d) => (
            <div
              key={d.label}
              style={{ display: "flex", gap: 8, fontSize: 12.5, lineHeight: 1.4 }}
            >
              <span
                style={{
                  fontWeight: 700,
                  color: "var(--t-low)",
                  minWidth: 120,
                  flexShrink: 0,
                  fontSize: 11,
                  letterSpacing: ".04em",
                  textTransform: "uppercase",
                  paddingTop: 1,
                }}
              >
                {d.label}
              </span>
              <span style={{ color: "var(--t-hi)", wordBreak: "break-word" }}>
                {d.value || "—"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Sub-componente: Seção do dossiê ──────────────────────────────────────────

interface DossieSectionCardProps {
  section: DossieSection;
  defaultOpen?: boolean;
}

function DossieSectionCard({ section, defaultOpen = false }: DossieSectionCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const headingId = useId();
  const isEmpty = section.count === 0;

  return (
    <div
      className="panel"
      style={{ overflow: "hidden" }}
      role="region"
      aria-labelledby={headingId}
    >
      {/* Cabeçalho colapsável */}
      <button
        type="button"
        id={headingId}
        onClick={() => { if (!isEmpty) setOpen((o) => !o); }}
        disabled={isEmpty}
        aria-expanded={isEmpty ? undefined : open}
        style={{
          width: "100%",
          background: "none",
          border: "none",
          cursor: isEmpty ? "default" : "pointer",
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          textAlign: "left",
        }}
      >
        <div className="row" style={{ gap: 10, flex: 1, minWidth: 0 }}>
          <span
            style={{
              fontWeight: 700,
              fontSize: 13.5,
              color: isEmpty ? "var(--t-low)" : "var(--t-hi)",
              lineHeight: 1.3,
            }}
          >
            {section.kindLabel}
          </span>
          <span
            className={`badge ${isEmpty ? "badge--neutral" : "badge--info"}`}
            style={{ flexShrink: 0, fontSize: 11 }}
          >
            {section.count}
          </span>
        </div>

        {!isEmpty && (
          <div
            aria-hidden="true"
            style={{ color: "var(--t-low)", flexShrink: 0, transition: "transform .18s" }}
          >
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </div>
        )}
      </button>

      {/* Items — só renderiza quando aberto */}
      {open && !isEmpty && (
        <div
          className="fade-in"
          style={{ padding: "0 20px 16px" }}
        >
          {section.count === 0 ? (
            <p
              style={{
                margin: 0,
                fontSize: 13,
                color: "var(--t-low)",
                fontStyle: "italic",
              }}
            >
              Nada encontrado nas fontes.
            </p>
          ) : (
            <>
              {section.items.map((item, idx) => (
                <SectionItemRow key={`${item.label}-${idx}`} item={item} />
              ))}
            </>
          )}
        </div>
      )}

      {/* Mensagem quando vazio */}
      {isEmpty && (
        <div
          style={{ padding: "0 20px 16px", fontSize: 12.5, color: "var(--t-low)", fontStyle: "italic" }}
        >
          Nada encontrado nas fontes para este CNPJ.
        </div>
      )}
    </div>
  );
}

// ─── Sub-componente: Sócios ───────────────────────────────────────────────────

interface SociosCardProps {
  socios: Dossie["socios"];
}

function SociosCard({ socios }: SociosCardProps) {
  if (socios.length === 0) return null;

  return (
    <div className="panel" style={{ padding: "20px" }}>
      <div
        className="row"
        style={{ gap: 8, marginBottom: 14 }}
      >
        <Users size={15} style={{ color: "var(--brand-ink)", flexShrink: 0 }} aria-hidden="true" />
        <span
          style={{
            fontSize: 13.5,
            fontWeight: 700,
            color: "var(--t-hi)",
          }}
        >
          Sócios / Administradores (QSA)
        </span>
        <span className="badge badge--neutral" style={{ fontSize: 11 }}>
          {socios.length}
        </span>
      </div>

      <div
        style={{ display: "flex", flexDirection: "column", gap: 0 }}
        role="list"
        aria-label="Sócios e administradores"
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
              gap: 2,
            }}
          >
            <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--t-hi)" }}>
              {s.nome}
            </span>
            <div
              className="row"
              style={{ gap: 8, flexWrap: "wrap" }}
            >
              {s.qualificacao && (
                <span className="badge badge--neutral" style={{ fontSize: 10.5 }}>
                  {s.qualificacao}
                </span>
              )}
              {s.entrada && (
                <span style={{ fontSize: 11.5, color: "var(--t-low)" }}>
                  Desde {s.entrada}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 10,
          fontSize: 11,
          color: "var(--t-low)",
          lineHeight: 1.5,
        }}
      >
        Fonte: BrasilAPI — Quadro de Sócios e Administradores (QSA) da Receita Federal
      </div>
    </div>
  );
}

// ─── Sub-componente: Cadastro ─────────────────────────────────────────────────

interface CadastroCardProps {
  campos: Dossie["cadastro"];
  sourceUrl?: string | undefined;
}

function CadastroCard({ campos, sourceUrl }: CadastroCardProps) {
  const relevant = campos.filter(
    (f) => f.label !== "CNPJ" && f.label !== "Razão social" && f.value !== "",
  );
  if (relevant.length === 0) return null;

  return (
    <div className="panel" style={{ padding: "20px" }}>
      <div
        className="row between"
        style={{ gap: 8, marginBottom: 14 }}
      >
        <div className="row" style={{ gap: 8 }}>
          <Building2
            size={15}
            style={{ color: "var(--brand-ink)", flexShrink: 0 }}
            aria-hidden="true"
          />
          <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--t-hi)" }}>
            Dados cadastrais
          </span>
        </div>
        {sourceUrl !== undefined && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn--ghost btn--sm"
            style={{ fontSize: 11, padding: "4px 8px" }}
          >
            <ExternalLink size={11} aria-hidden="true" />
            Fonte
          </a>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {relevant.map((f, i) => (
          <div
            key={f.label}
            style={{
              display: "flex",
              gap: 10,
              padding: "8px 0",
              borderTop: i > 0 ? "1px solid var(--border)" : undefined,
              alignItems: "flex-start",
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: ".05em",
                textTransform: "uppercase",
                color: "var(--t-low)",
                minWidth: 130,
                flexShrink: 0,
                paddingTop: 1,
              }}
            >
              {f.label}
            </span>
            <span
              style={{
                fontSize: 13,
                color: "var(--t-hi)",
                fontWeight: 500,
                wordBreak: "break-word",
              }}
            >
              {f.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Sub-componente: Fontes ───────────────────────────────────────────────────

interface SourcesCardProps {
  sources: Dossie["sources"];
}

function SourcesCard({ sources }: SourcesCardProps) {
  return (
    <div className="panel" style={{ padding: "20px" }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: ".1em",
          textTransform: "uppercase",
          color: "var(--t-low)",
          marginBottom: 12,
        }}
      >
        Fontes consultadas (rastreabilidade)
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {sources.map((s) => (
          <div
            key={s.label}
            style={{
              fontSize: 12.5,
              color: "var(--t-mid)",
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: "var(--brand-ink)",
                marginTop: 5,
                flexShrink: 0,
              }}
            />
            <span>
              {s.label}
              {s.url !== undefined && (
                <>
                  {" — "}
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: "var(--brand-ink)",
                      textDecoration: "none",
                      fontSize: 11.5,
                      wordBreak: "break-all",
                    }}
                  >
                    {s.url}
                  </a>
                </>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function DossiePage() {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [dossie, setDossie] = useState<Dossie | undefined>();
  const [errorMsg, setErrorMsg] = useState<string | undefined>();
  // Distingue "CNPJ inválido" (não dá pra tentar de novo) de "falha ao consultar"
  // (transitória — vale um retry). Guarda o último CNPJ consultável.
  const [retryCnpj, setRetryCnpj] = useState<string | undefined>();
  const inputId = useId();

  const handleSubmit = useCallback(async (rawCnpj: string) => {
    const cnpj = sanitizeCnpj(rawCnpj);
    if (cnpj.length !== 14) {
      setErrorMsg("CNPJ inválido. Informe os 14 dígitos (com ou sem máscara).");
      setRetryCnpj(undefined);
      setStatus("error");
      return;
    }

    // Enriquecimento LAZY do cadastro/QSA no D1 (best-effort; não bloqueia a tela).
    void requestCompanyEnrichment(cnpj);

    setRetryCnpj(cnpj);
    setStatus("loading");
    setErrorMsg(undefined);
    setDossie(undefined);

    try {
      const result = await buildDossie(cnpj);
      setDossie(result);
      setStatus("done");
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Falha ao consultar o CNPJ nas bases. Pode ser instabilidade momentânea — tente novamente.",
      );
      setStatus("error");
    }
  }, []);

  function handleExampleClick(cnpj: string) {
    void handleSubmit(cnpj);
  }

  const isLoading = status === "loading";

  // Situação cadastral da empresa (para o header)
  const situacao =
    dossie?.cadastro.find((f) => f.label === "Situação" || f.label === "Situação cadastral")
      ?.value ?? "";

  // URL da fonte do cadastro (BrasilAPI)
  const cadastroSourceUrl =
    dossie
      ? `https://brasilapi.com.br/api/cnpj/v1/${dossie.cnpj}`
      : undefined;

  // Seções com registros (para abrir por padrão a primeira que tiver dados)
  const sectionsWithData =
    dossie?.sections.filter((s) => s.count > 0) ?? [];

  return (
    <div
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "24px 16px 64px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      {/* ── Cabeçalho da página ────────────────────────────────────────────── */}
      <div style={{ marginBottom: 8 }}>
        <div
          className="row"
          style={{ gap: 10, marginBottom: 8, flexWrap: "wrap" }}
        >
          <FileSearch2
            size={22}
            style={{ color: "var(--brand-ink)", flexShrink: 0 }}
            aria-hidden="true"
          />
          <h1
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: "-.03em",
              color: "var(--t-hi)",
              lineHeight: 1.2,
            }}
          >
            Dossiê Empresarial
          </h1>
          <span className="badge badge--accent" style={{ fontSize: 11 }}>
            Novo
          </span>
        </div>
        <p
          style={{
            margin: 0,
            fontSize: 14,
            color: "var(--t-mid)",
            lineHeight: 1.55,
            maxWidth: 560,
          }}
        >
          Cole um CNPJ e receba, em segundos, o dossiê completo da empresa —
          sanções, contratos públicos, licitações, infrações ambientais, marcas INPI,
          processos judiciais e muito mais, tudo com link para a fonte oficial.
        </p>
      </div>

      {/* ── Formulário de busca — por NOME (ou CNPJ) ───────────────────────── */}
      <div className="panel" style={{ padding: "20px 20px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
        <CompanySearch
          id={inputId}
          label="Empresa"
          placeholder="Digite o nome da empresa (ex.: Banco do Brasil) ou o CNPJ"
          buttonLabel={isLoading ? "Consultando…" : "Gerar dossiê"}
          disabled={isLoading}
          onSelect={(cnpj) => void handleSubmit(cnpj)}
        />

        {/* Exemplos */}
        <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span
            style={{
              fontSize: 11.5,
              color: "var(--t-low)",
              fontWeight: 600,
              letterSpacing: ".04em",
              textTransform: "uppercase",
            }}
          >
            Exemplos:
          </span>
          {EXEMPLOS.map((ex) => (
            <button
              key={ex.cnpj}
              type="button"
              className="chip"
              onClick={() => handleExampleClick(ex.cnpj)}
              disabled={isLoading}
              aria-label={`Consultar ${ex.label} (${ex.cnpj})`}
            >
              {ex.label}
            </button>
          ))}
        </div>

        <RoiNote>
          <strong style={{ color: "var(--t-hi)" }}>Em vez de pagar um relatório de crédito por empresa</strong>,
          o dossiê reúne sanções, contratos, processos, marcas e sócios de fontes oficiais numa tela só —
          com link para cada fonte. É a diligência que justifica a assinatura quando você avalia mais de
          um fornecedor por mês.
        </RoiNote>
      </div>

      {/* ── Erro ──────────────────────────────────────────────────────────── */}
      {status === "error" && errorMsg !== undefined && (
        <div
          id="dossie-error"
          role="alert"
          className="panel fade-in"
          style={{
            padding: "16px 20px",
            border: "1px solid color-mix(in srgb,var(--danger) 30%,transparent)",
            background: "color-mix(in srgb,var(--danger) 8%,var(--surface))",
          }}
        >
          <div className="row" style={{ gap: 8 }}>
            <AlertTriangle
              size={16}
              style={{ color: "var(--danger)", flexShrink: 0 }}
              aria-hidden="true"
            />
            <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--danger)" }}>
              {errorMsg}
            </span>
          </div>
          {retryCnpj !== undefined && (
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={() => void handleSubmit(retryCnpj)}
              >
                <RefreshCw size={13} aria-hidden="true" />
                Tentar novamente
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Skeleton (loading) ────────────────────────────────────────────── */}
      {isLoading && <DossieSkeleton />}

      {/* ── Dossiê carregado ────────────────────────────────────────────── */}
      {status === "done" && dossie !== undefined && (
        <div
          className="fade-in"
          style={{ display: "flex", flexDirection: "column", gap: 16 }}
        >
          {/* ── Cabeçalho da empresa ────────────────────────────────────────── */}
          <section
            className="panel"
            style={{ padding: "24px" }}
            aria-labelledby="empresa-heading"
          >
            <div style={{ marginBottom: 14 }}>
              <span className="badge badge--neutral" style={{ marginBottom: 8, fontSize: 11 }}>
                CNPJ {formatCnpj(dossie.cnpj)}
              </span>
              {situacao !== "" && (
                <span
                  className={`badge ${situacao.toLowerCase().includes("ativa") ? "badge--ok" : "badge--warn"}`}
                  style={{ marginBottom: 8, fontSize: 11, marginLeft: 6 }}
                >
                  {situacao}
                </span>
              )}
            </div>

            <h2
              id="empresa-heading"
              style={{
                margin: "0 0 6px",
                fontSize: 20,
                fontWeight: 800,
                letterSpacing: "-.025em",
                color: "var(--t-hi)",
                lineHeight: 1.25,
                wordBreak: "break-word",
              }}
            >
              {dossie.razaoSocial}
            </h2>

            <p
              style={{
                margin: "0 0 16px",
                fontSize: 12.5,
                color: "var(--t-low)",
              }}
            >
              Dossiê gerado em {formatDate(dossie.generatedAt)} ·{" "}
              {dossie.sections.reduce((acc, s) => acc + s.count, 0)} registros em{" "}
              {sectionsWithData.length} módulo{sectionsWithData.length !== 1 ? "s" : ""}
            </p>

            {/* Ações */}
            <div
              className="row"
              style={{ gap: 8, flexWrap: "wrap" }}
            >
              <ReportButton
                report={dossieToReport(dossie)}
                label="Salvar relatório"
              />
              <CreateAlertButton
                kind="empresa"
                entityRef={dossie.cnpj}
                entityLabel={dossie.razaoSocial}
                size="sm"
              />
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => navigateToCerebro(dossie.cnpj)}
                title="Ver conexões no Cérebro (grafo)"
              >
                <Brain size={13} aria-hidden="true" />
                Ver no Cérebro
              </button>
            </div>

            {/* Avisos não-fatais */}
            {dossie.warnings.length > 0 && (
              <div
                style={{
                  marginTop: 14,
                  padding: "9px 12px",
                  borderRadius: "var(--r-md)",
                  background: "color-mix(in srgb,var(--warn) 8%,var(--surface-2))",
                  border: "1px solid color-mix(in srgb,var(--warn) 22%,transparent)",
                  fontSize: 11.5,
                  color: "var(--warn)",
                  lineHeight: 1.5,
                }}
                role="status"
              >
                <strong>Atenção:</strong> {friendlyWarning(dossie.warnings)}
              </div>
            )}
          </section>

          {/* ── Card de risco ─────────────────────────────────────────────────── */}
          <RiskCard dossie={dossie} />

          {/* ── Dados cadastrais ──────────────────────────────────────────────── */}
          <CadastroCard
            campos={dossie.cadastro}
            sourceUrl={cadastroSourceUrl}
          />

          {/* ── Sócios / QSA ──────────────────────────────────────────────────── */}
          <SociosCard socios={dossie.socios} />

          {/* ── Certidões & Idoneidade (InfoSimples) ───────────────────────────── */}
          <CertidoesSection cnpj={dossie.cnpj} />

          {/* ── Seções por módulo ─────────────────────────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
              Módulos — clique para expandir
            </div>

            {dossie.sections.map((section, idx) => (
              <DossieSectionCard
                key={section.kind}
                section={section}
                defaultOpen={
                  // Abre automaticamente as seções com dado que têm mais sinais de risco
                  section.kind === "sanction"
                    ? section.count > 0
                    : idx === 0 && section.count > 0
                }
              />
            ))}
          </div>

          {/* ── Resumo de módulos vazios ────────────────────────────────────── */}
          {dossie.sections.every((s) => s.count === 0) && (
            <div
              className="panel"
              style={{
                padding: "24px",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
              }}
            >
              <TrendingUp
                size={32}
                style={{ color: "var(--ok)", marginBottom: 0 }}
                aria-hidden="true"
              />
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--t-hi)" }}>
                Empresa localizada — sem registros públicos nas bases coletadas
              </h3>
              <p style={{ margin: 0, fontSize: 13.5, color: "var(--t-mid)", lineHeight: 1.55, maxWidth: 460 }}>
                Encontramos o cadastro, mas nenhum registro de sanção, contrato, licitação,
                infração ou processo apareceu nas fontes já indexadas. Isso costuma indicar uma
                empresa nova, de pequeno porte ou de baixa exposição pública — ausência de
                registro <strong>não</strong> é sinal de problema.
              </p>
              <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 2 }}>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => navigateToCerebro(dossie.cnpj)}
                  title="Ver conexões desta empresa no Cérebro (grafo)"
                >
                  <Brain size={13} aria-hidden="true" />
                  Ver conexões no Cérebro
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => focusSearchInput(inputId)}
                >
                  <Search size={13} aria-hidden="true" />
                  Consultar outra empresa
                </button>
              </div>
            </div>
          )}

          {/* ── Fontes ────────────────────────────────────────────────────────── */}
          <SourcesCard sources={dossie.sources} />
        </div>
      )}

      {/* ── Estado vazio inicial ──────────────────────────────────────────── */}
      {status === "idle" && (
        <div
          className="panel"
          style={{
            padding: "40px 24px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
          }}
        >
          <FileSearch2
            size={40}
            style={{ color: "var(--border-2)", marginBottom: 4 }}
            aria-hidden="true"
          />
          <p
            style={{
              margin: 0,
              fontSize: 15,
              fontWeight: 600,
              color: "var(--t-mid)",
            }}
          >
            Informe um CNPJ para gerar o dossiê
          </p>
          <p style={{ margin: 0, fontSize: 13, color: "var(--t-low)", lineHeight: 1.55, maxWidth: 400 }}>
            Cruzamos automaticamente sanções, contratos, licitações, infrações
            ambientais, marcas, processos e despesas parlamentares — com score de
            risco explicado e links para as fontes oficiais.
          </p>
        </div>
      )}
    </div>
  );
}

export default DossiePage;
