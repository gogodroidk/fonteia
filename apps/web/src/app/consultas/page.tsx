import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Code,
  ExternalLink,
  Info,
  Loader2,
  Lock,
  Search,
  ShieldAlert,
  X,
  XCircle,
  Zap,
} from "lucide-react";

import type { CatalogKind, CatalogResult } from "../../features/infosimples/catalog-api";
import { fetchCatalog, groupByCategoria } from "../../features/infosimples/catalog-api";
import type { CertidaoItem, CertidaoPayload, CertidaoResult } from "../../features/infosimples/infosimples-client";
import { consultarCertidao } from "../../features/infosimples/infosimples-client";

// ---------------------------------------------------------------------------
// Tipos de estado da página
// ---------------------------------------------------------------------------

interface CatalogLoaded {
  kinds: CatalogKind[];
  grouped: Map<string, CatalogKind[]>;
}

type PageState =
  | "idle"
  | "loading-catalog"
  | "catalog-error"
  | "dormant"
  | CatalogLoaded;

type KindResultState =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "done"; result: CertidaoResult };

// ---------------------------------------------------------------------------
// Utilitários de CNPJ
// ---------------------------------------------------------------------------

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function formatCnpj(digits: string): string {
  const d = digits.slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

// ---------------------------------------------------------------------------
// Sub-componente: resultado de uma certidao
// ---------------------------------------------------------------------------

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

function CertidaoResultView({ result }: { result: CertidaoResult }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [rawOpen, setRawOpen] = useState(false);

  if (result.state === "dormant") {
    return (
      <div className="inset" style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 12 }}>
        <Info size={16} style={{ color: "var(--t-mid)", flexShrink: 0, marginTop: 2 }} />
        <span className="small" style={{ color: "var(--t-mid)" }}>
          Consultas premium indisponíveis neste ambiente.
        </span>
      </div>
    );
  }

  if (result.state === "login") {
    return (
      <div className="inset" style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 12 }}>
        <Lock size={16} style={{ color: "var(--t-mid)", flexShrink: 0, marginTop: 2 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="small" style={{ color: "var(--t-mid)" }}>
            Faça login para utilizar consultas premium.
          </span>
          <a href="/entrar" className="btn btn--sm btn--ghost" style={{ alignSelf: "flex-start" }}>
            Entrar
          </a>
        </div>
      </div>
    );
  }

  if (result.state === "plan") {
    return (
      <div className="inset" style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 12 }}>
        <Lock size={16} style={{ color: "var(--brand)", flexShrink: 0, marginTop: 2 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="small" style={{ color: "var(--t-mid)" }}>
            Esta consulta exige um plano superior.
          </span>
          <a href="/app/planos" className="btn btn--sm btn--primary" style={{ alignSelf: "flex-start" }}>
            Ver planos
          </a>
        </div>
      </div>
    );
  }

  if (result.state === "empty") {
    return (
      <div className="inset" style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 12 }}>
        <AlertTriangle size={16} style={{ color: "var(--warn)", flexShrink: 0, marginTop: 2 }} />
        <span className="small" style={{ color: "var(--t-mid)" }}>
          {result.message}
        </span>
      </div>
    );
  }

  if (result.state === "error") {
    return (
      <div className="inset" style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 12 }}>
        <AlertTriangle size={16} style={{ color: "var(--danger)", flexShrink: 0, marginTop: 2 }} />
        <span className="small" style={{ color: "var(--danger)" }}>
          {result.message}
        </span>
      </div>
    );
  }

  // state === "ok"
  const payload: CertidaoPayload = result.data;
  const badgeStyle = statusBadgeStyle(payload.status);
  const detailsId = `details-${payload.titulo.replace(/\s+/g, "-").toLowerCase()}`;
  const rawId = `raw-${payload.titulo.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Cabeçalho: status + título */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <span
          className="badge"
          style={{
            background: badgeStyle.background,
            color: badgeStyle.color,
            border: "none",
            fontWeight: 600,
            textTransform: "uppercase",
            fontSize: 11,
            letterSpacing: "0.04em",
          }}
        >
          {payload.status}
        </span>
        <span style={{ fontWeight: 600, color: "var(--t-hi)", fontSize: 13 }}>{payload.titulo}</span>
      </div>

      {payload.resumo && (
        <p className="small" style={{ color: "var(--t-mid)", margin: 0 }}>
          {payload.resumo}
        </p>
      )}

      {/* Metadados opcionais */}
      {(payload.validade ?? payload.numeroCertidao) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {payload.validade && (
            <span className="tiny" style={{ color: "var(--t-low)" }}>
              Validade: {payload.validade}
            </span>
          )}
          {payload.numeroCertidao && (
            <span className="tiny" style={{ color: "var(--t-low)" }}>
              N. certidão: {payload.numeroCertidao}
            </span>
          )}
        </div>
      )}

      {/* Fonte oficial */}
      {payload.fonteUrl && (
        <a
          href={payload.fonteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn--ghost btn--sm"
          style={{ alignSelf: "flex-start", display: "inline-flex", gap: 6, alignItems: "center" }}
        >
          <ExternalLink size={13} />
          Fonte oficial
        </a>
      )}

      {/* Detalhes colapsáveis */}
      {payload.itens && payload.itens.length > 0 && (
        <div>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            aria-expanded={detailsOpen}
            aria-controls={detailsId}
            onClick={() => setDetailsOpen((v) => !v)}
            style={{ display: "inline-flex", gap: 6, alignItems: "center" }}
          >
            {detailsOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            Ver detalhes
          </button>
          {detailsOpen && (
            <div
              id={detailsId}
              style={{
                marginTop: 8,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(min(220px, 100%), 1fr))",
                gap: "6px 12px",
              }}
            >
              {payload.itens.map((item: CertidaoItem, i: number) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span className="tiny" style={{ color: "var(--t-low)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    {item.rotulo}
                  </span>
                  <span className="small" style={{ color: "var(--t-hi)", fontWeight: 500 }}>
                    {item.valor}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Dados brutos colapsáveis */}
      <div>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          aria-expanded={rawOpen}
          aria-controls={rawId}
          onClick={() => setRawOpen((v) => !v)}
          style={{ display: "inline-flex", gap: 6, alignItems: "center" }}
        >
          <Code size={13} />
          {rawOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
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
              maxHeight: 320,
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

// ---------------------------------------------------------------------------
// Sub-componente: card de um kind
// ---------------------------------------------------------------------------

interface KindCardProps {
  catalogKind: CatalogKind;
  cnpjDigits: string;
  cnpjValid: boolean;
}

function KindCard({ catalogKind, cnpjDigits, cnpjValid }: KindCardProps) {
  const [kindState, setKindState] = useState<KindResultState>({ state: "idle" });
  const resultRef = useRef<HTMLDivElement>(null);

  async function handleConsultar() {
    if (!cnpjValid || kindState.state === "loading") return;
    setKindState({ state: "loading" });
    const result = await consultarCertidao(catalogKind.kind, cnpjDigits);
    setKindState({ state: "done", result });
  }

  const isLoading = kindState.state === "loading";

  return (
    <div
      className="card"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 0,
        position: "relative",
        padding: "14px 16px 16px",
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
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          padding: "2px 7px",
          borderRadius: "var(--r-pill)",
          background: "var(--warn)",
          color: "var(--surface)",
          opacity: 0.85,
          lineHeight: 1.6,
        }}
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
          paddingRight: 56,
          lineHeight: 1.4,
        }}
      >
        {catalogKind.titulo}
      </p>

      {/* Botão consultar */}
      <button
        type="button"
        className="btn btn--primary btn--sm"
        disabled={!cnpjValid || isLoading}
        onClick={handleConsultar}
        aria-busy={isLoading}
        style={{ alignSelf: "flex-start", display: "inline-flex", gap: 6, alignItems: "center" }}
      >
        {isLoading ? (
          <>
            <Loader2 size={13} className="spin" />
            Consultando...
          </>
        ) : (
          <>
            <Search size={13} />
            Consultar
          </>
        )}
      </button>

      {/* Resultado */}
      <div
        ref={resultRef}
        aria-live="polite"
        aria-busy={isLoading}
      >
        {kindState.state === "loading" && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
            <div className="skeleton-text" style={{ width: "60%" }} />
            <div className="skeleton-text" style={{ width: "80%" }} />
            <div className="skeleton-text" style={{ width: "40%" }} />
          </div>
        )}
        {kindState.state === "done" && (
          <CertidaoResultView result={kindState.result} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-componente: seção colapsável de categoria
// ---------------------------------------------------------------------------

interface CategorySectionProps {
  categoria: string;
  kinds: CatalogKind[];
  cnpjDigits: string;
  cnpjValid: boolean;
}

function CategorySection({ categoria, kinds, cnpjDigits, cnpjValid }: CategorySectionProps) {
  const [open, setOpen] = useState(true);
  const sectionId = `section-${categoria.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <button
        type="button"
        className="btn btn--ghost"
        aria-expanded={open}
        aria-controls={sectionId}
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "0 0 6px",
          borderBottom: "1px solid var(--border)",
          borderRadius: 0,
          justifyContent: "space-between",
          width: "100%",
        }}
      >
        <span className="eyebrow">{categoria}</span>
        {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>

      {open && (
        <div
          id={sectionId}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(min(280px, 100%), 1fr))",
            gap: 14,
          }}
        >
          {kinds.map((k) => (
            <KindCard
              key={k.kind}
              catalogKind={k}
              cnpjDigits={cnpjDigits}
              cnpjValid={cnpjValid}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton de loading do catálogo
// ---------------------------------------------------------------------------

function CatalogSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {([0, 1, 2] as const).map((i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="skeleton-text" style={{ width: "30%", height: 14 }} />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(min(280px, 100%), 1fr))",
              gap: 14,
            }}
          >
            {([0, 1, 2, 3] as const).map((j) => (
              <div key={j} className="skeleton-card" style={{ height: 90, borderRadius: "var(--r-md)" }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

export function ConsultasPage() {
  const [pageState, setPageState] = useState<PageState>("idle");
  const [cnpjDisplay, setCnpjDisplay] = useState("");
  const [catalogError, setCatalogError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const cnpjDigits = onlyDigits(cnpjDisplay);
  const cnpjValid = cnpjDigits.length === 14;

  function runCatalogFetch() {
    setPageState("loading-catalog");
    setCatalogError("");
    void fetchCatalog().then((result: CatalogResult) => {
      if (result.state === "ok") {
        const grouped = groupByCategoria(result.kinds);
        setPageState({ kinds: result.kinds, grouped });
      } else if (result.state === "dormant") {
        setPageState("dormant");
      } else {
        setCatalogError(result.message);
        setPageState("catalog-error");
      }
    });
  }

  // Carrega o catálogo uma vez ao montar.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { runCatalogFetch(); }, []);

  function handleCnpjChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = onlyDigits(e.target.value);
    setCnpjDisplay(formatCnpj(raw));
  }

  function handleCnpjClear() {
    setCnpjDisplay("");
    inputRef.current?.focus();
  }

  const catalogData: CatalogLoaded | null =
    typeof pageState === "object" && pageState !== null && "grouped" in pageState
      ? pageState
      : null;

  return (
    <div
      className="fade-in"
      style={{
        maxWidth: 960,
        margin: "0 auto",
        padding: "24px 16px 64px",
        display: "flex",
        flexDirection: "column",
        gap: 28,
      }}
    >
      {/* Cabeçalho */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ShieldAlert size={22} style={{ color: "var(--brand)" }} />
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "var(--t-hi)" }}>
            Consultas Premium
          </h1>
        </div>
        <p className="muted" style={{ margin: 0, maxWidth: 560 }}>
          Certidões e dados cadastrais via fontes oficiais. Informe o CNPJ e escolha as consultas desejadas.
        </p>
      </div>

      {/* Campo CNPJ */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 480 }}>
        <label htmlFor="cnpj-input" style={{ fontWeight: 600, fontSize: 13, color: "var(--t-hi)" }}>
          CNPJ
        </label>
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <Building2
            size={16}
            style={{
              position: "absolute",
              left: 12,
              color: "var(--t-low)",
              pointerEvents: "none",
            }}
          />
          <input
            ref={inputRef}
            id="cnpj-input"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="00.000.000/0000-00"
            value={cnpjDisplay}
            onChange={handleCnpjChange}
            maxLength={18}
            className="searchbar"
            style={{
              width: "100%",
              paddingLeft: 36,
              paddingRight: cnpjDisplay ? 40 : 12,
            }}
          />
          {cnpjDisplay && (
            <button
              type="button"
              className="btn btn--icon btn--ghost btn--sm"
              onClick={handleCnpjClear}
              aria-label="Limpar CNPJ"
              style={{
                position: "absolute",
                right: 6,
                color: "var(--t-low)",
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Contador / validação */}
        {cnpjDisplay && !cnpjValid && (
          <span className="tiny" style={{ color: "var(--t-low)" }}>
            {cnpjDigits.length} dígito{cnpjDigits.length !== 1 ? "s" : ""} — faltam {14 - cnpjDigits.length}
          </span>
        )}
        {cnpjValid && (
          <span
            className="tiny"
            style={{ color: "var(--ok)", display: "flex", alignItems: "center", gap: 4 }}
          >
            <CheckCircle2 size={12} />
            CNPJ válido
          </span>
        )}
      </div>

      {/* Aviso de custo */}
      <div
        className="inset"
        style={{
          display: "flex",
          gap: 8,
          alignItems: "flex-start",
          maxWidth: 560,
        }}
      >
        <Zap size={15} style={{ color: "var(--warn)", flexShrink: 0, marginTop: 1 }} />
        <span className="small" style={{ color: "var(--t-mid)" }}>
          Cada consulta desconta um crédito do plano. Clique com critério.
        </span>
      </div>

      {/* Conteúdo principal */}
      {pageState === "idle" || pageState === "loading-catalog" ? (
        <CatalogSkeleton />
      ) : pageState === "catalog-error" ? (
        <div
          className="panel"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            alignItems: "flex-start",
            padding: "20px 24px",
          }}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <XCircle size={18} style={{ color: "var(--danger)" }} />
            <span style={{ fontWeight: 600, color: "var(--t-hi)" }}>Erro ao carregar catálogo</span>
          </div>
          <p className="small" style={{ color: "var(--t-mid)", margin: 0 }}>
            {catalogError}
          </p>
          <button type="button" className="btn btn--primary btn--sm" onClick={runCatalogFetch}>
            Tentar novamente
          </button>
        </div>
      ) : pageState === "dormant" ? (
        <div
          className="panel"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            padding: "20px 24px",
            maxWidth: 480,
          }}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Info size={18} style={{ color: "var(--brand)" }} />
            <span style={{ fontWeight: 600, color: "var(--t-hi)" }}>Consultas premium não configuradas</span>
          </div>
          <p className="small" style={{ color: "var(--t-mid)", margin: 0 }}>
            O proxy InfoSimples não está ativo neste ambiente. Entre em contato com o administrador para habilitar consultas premium.
          </p>
        </div>
      ) : catalogData !== null ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {Array.from(catalogData.grouped.entries()).map(([categoria, kinds]) => (
            <CategorySection
              key={categoria}
              categoria={categoria}
              kinds={kinds}
              cnpjDigits={cnpjDigits}
              cnpjValid={cnpjValid}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
