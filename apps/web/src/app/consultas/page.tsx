import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Code,
  ExternalLink,
  Info,
  Lock,
  Search,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import type { CatalogKind, CatalogResult } from "../../features/infosimples/catalog-api";
import { fetchCatalog, groupByCategoria } from "../../features/infosimples/catalog-api";
import type { CertidaoItem, CertidaoPayload, CertidaoResult } from "../../features/infosimples/infosimples-client";
import { consultarCertidao } from "../../features/infosimples/infosimples-client";
import { EmptyState, SourceBadge, CompanySearch, RoiNote } from "../../components/ui";
import { requestCompanyEnrichment } from "../../features/empresas/company-search";
import { formatCnpj, isValidCnpj } from "../../lib/cnpj";

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
// Valor / uso de cada consulta — por CATEGORIA (linguagem do cliente)
// ---------------------------------------------------------------------------

/**
 * Para cada categoria do catálogo, uma frase honesta de "por que isso importa /
 * quando usar". Sem prometer resultado — descreve a decisão que o dado informa.
 * Casamos por palavra-chave normalizada (o catálogo do proxy pode variar o nome
 * exato da categoria). Fallback genérico cobre categorias novas.
 */
function valorDaCategoria(categoria: string): string {
  const c = categoria.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  if (c.includes("receita") || c.includes("federal") || c.includes("fiscal") || c.includes("tribut"))
    return "Confirma se a empresa está regular com a Receita e a dívida ativa antes de contratar, faturar ou habilitar em licitação.";
  if (c.includes("trabalh") || c.includes("tst") || c.includes("fgts") || c.includes("previd"))
    return "Mostra pendências trabalhistas e de FGTS — exigidas em contratos públicos e numa due diligence de fornecedor.";
  if (c.includes("idonei") || c.includes("sancao") || c.includes("sanco") || c.includes("ceis") || c.includes("cnep") || c.includes("tcu") || c.includes("transparencia") || c.includes("inidoneo"))
    return "Revela se a empresa está impedida de contratar com o poder público. Fechar com quem está sancionado pode anular o contrato.";
  if (c.includes("escravo") || c.includes("mte"))
    return "Verifica inclusão na lista suja do trabalho escravo — risco reputacional e de compliance grave.";
  if (c.includes("cadastr") || c.includes("cnpj") || c.includes("simples") || c.includes("empresa"))
    return "Traz a ficha cadastral oficial: situação, CNAE, regime e quadro societário para confirmar com quem você fala.";
  return "Consulta oficial que reduz risco antes de uma decisão de contrato, crédito ou habilitação.";
}

// ---------------------------------------------------------------------------
// Sub-componente: resultado de uma certidao
// ---------------------------------------------------------------------------

/**
 * Classe de badge (do design system, já WCAG-checada e token-based) por status da
 * certidão. Evita cor hardcoded: reusa .badge--ok/--warn/--danger/--neutral.
 */
function statusBadgeClass(status: string): string {
  switch (status) {
    case "regular":
      return "badge badge--ok";
    case "irregular":
      return "badge badge--danger";
    case "atencao":
      return "badge badge--warn";
    default:
      return "badge badge--neutral";
  }
}

function CertidaoResultView({ result }: { result: CertidaoResult }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [rawOpen, setRawOpen] = useState(false);
  const uid = useId();
  const detailsId = `${uid}-details`;
  const rawId = `${uid}-raw`;

  if (result.state === "dormant") {
    return (
      <div className="inset" style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 12, padding: "10px 12px" }}>
        <Info size={16} style={{ color: "var(--t-mid)", flexShrink: 0, marginTop: 2 }} />
        <span className="small" style={{ color: "var(--t-mid)" }}>
          Consultas premium indisponíveis neste ambiente.
        </span>
      </div>
    );
  }

  if (result.state === "login") {
    return (
      <div className="inset" style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 12, padding: "10px 12px" }}>
        <Lock size={16} style={{ color: "var(--t-mid)", flexShrink: 0, marginTop: 2 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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
      <div className="inset" style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 12, padding: "10px 12px" }}>
        <Lock size={16} style={{ color: "var(--brand)", flexShrink: 0, marginTop: 2 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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
      <div className="inset" style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 12, padding: "10px 12px" }}>
        <AlertTriangle size={16} style={{ color: "var(--warn)", flexShrink: 0, marginTop: 2 }} />
        <span className="small" style={{ color: "var(--t-mid)" }}>
          {result.message}
        </span>
      </div>
    );
  }

  if (result.state === "error") {
    return (
      <div className="inset" style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 12, padding: "10px 12px" }}>
        <AlertTriangle size={16} style={{ color: "var(--danger)", flexShrink: 0, marginTop: 2 }} />
        <span className="small" style={{ color: "var(--danger)" }}>
          {result.message}
        </span>
      </div>
    );
  }

  // state === "ok"
  const payload: CertidaoPayload = result.data;

  return (
    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Cabeçalho: status + título */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <span
          className={statusBadgeClass(payload.status)}
          style={{ textTransform: "uppercase", fontSize: 11, letterSpacing: "0.04em" }}
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
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
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
          <SourceBadge
            tipo="oficial"
            fonte={payload.titulo !== "" ? payload.titulo : "Fonte oficial"}
            url={payload.fonteUrl}
            {...(payload.validade !== undefined ? { data: payload.validade } : {})}
          />
        </div>
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
// Sub-componente: card de um kind (consulta)
// ---------------------------------------------------------------------------

interface KindCardProps {
  catalogKind: CatalogKind;
  cnpjDigits: string;
  cnpjValid: boolean;
  onNeedCnpj: () => void;
}

function KindCard({ catalogKind, cnpjDigits, cnpjValid, onNeedCnpj }: KindCardProps) {
  const [kindState, setKindState] = useState<KindResultState>({ state: "idle" });
  const [needCnpjHint, setNeedCnpjHint] = useState(false);

  async function handleConsultar() {
    if (kindState.state === "loading") return;
    if (!cnpjValid) {
      onNeedCnpj();
      setNeedCnpjHint(true);
      window.setTimeout(() => setNeedCnpjHint(false), 4000);
      return;
    }
    setNeedCnpjHint(false);
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
        gap: 10,
        padding: "14px 16px 16px",
      }}
    >
      {/* Título + tag premium na mesma linha (sem badge flutuante sobreposto) */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: "var(--t-hi)", lineHeight: 1.35 }}>
          {catalogKind.titulo}
        </p>
        <span
          className="badge badge--neutral"
          style={{ flexShrink: 0, textTransform: "uppercase", fontSize: 9.5, letterSpacing: "0.05em" }}
        >
          premium
        </span>
      </div>

      {/* Ação */}
      <button
        type="button"
        className="btn btn--primary btn--sm"
        disabled={isLoading}
        onClick={handleConsultar}
        aria-busy={isLoading}
        style={{ alignSelf: "flex-start", display: "inline-flex", gap: 6, alignItems: "center" }}
      >
        {isLoading ? (
          <>
            <span className="spin" style={{ display: "inline-flex" }} aria-hidden="true">
              <Search size={13} />
            </span>
            Consultando…
          </>
        ) : (
          <>
            <Search size={13} />
            Consultar
          </>
        )}
      </button>

      {needCnpjHint && (
        <p
          role="alert"
          className="tiny"
          style={{ margin: 0, color: "var(--warn)", display: "flex", gap: 5, alignItems: "center" }}
        >
          <AlertTriangle size={12} />
          Escolha uma empresa acima para consultar.
        </p>
      )}

      {/* Resultado */}
      <div aria-live="polite" aria-busy={isLoading}>
        {isLoading && (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            <div className="skeleton-text" style={{ width: "60%" }} />
            <div className="skeleton-text" style={{ width: "80%" }} />
            <div className="skeleton-text" style={{ width: "40%" }} />
          </div>
        )}
        {kindState.state === "done" && <CertidaoResultView result={kindState.result} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-componente: seção de categoria
// ---------------------------------------------------------------------------

interface CategorySectionProps {
  categoria: string;
  kinds: CatalogKind[];
  cnpjDigits: string;
  cnpjValid: boolean;
  onNeedCnpj: () => void;
  /** Quando há busca ativa, mantemos a seção aberta (mostra o que casou). */
  forceOpen: boolean;
}

function CategorySection({ categoria, kinds, cnpjDigits, cnpjValid, onNeedCnpj, forceOpen }: CategorySectionProps) {
  const [open, setOpen] = useState(true);
  const sectionId = `section-${categoria.replace(/\s+/g, "-").toLowerCase()}`;
  const isOpen = forceOpen || open;

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <button
        type="button"
        className="btn btn--ghost"
        aria-expanded={isOpen}
        aria-controls={sectionId}
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          borderRadius: "var(--r-md)",
          justifyContent: "space-between",
          width: "100%",
          textAlign: "left",
          height: "auto",
        }}
      >
        <span style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="eyebrow" style={{ color: "var(--brand-ink)" }}>{categoria}</span>
            <span className="badge badge--neutral" style={{ fontSize: 10.5 }}>{kinds.length}</span>
          </span>
          <span
            className="tiny"
            style={{
              color: "var(--t-mid)",
              fontWeight: 500,
              whiteSpace: "normal",
              textTransform: "none",
              letterSpacing: 0,
              lineHeight: 1.4,
            }}
          >
            {valorDaCategoria(categoria)}
          </span>
        </span>
        {isOpen ? <ChevronUp size={16} style={{ flexShrink: 0 }} /> : <ChevronDown size={16} style={{ flexShrink: 0 }} />}
      </button>

      {isOpen && (
        <div
          id={sectionId}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(min(260px, 100%), 1fr))",
            gap: 12,
          }}
        >
          {kinds.map((k) => (
            <KindCard
              key={k.kind}
              catalogKind={k}
              cnpjDigits={cnpjDigits}
              cnpjValid={cnpjValid}
              onNeedCnpj={onNeedCnpj}
            />
          ))}
        </div>
      )}
    </section>
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
              gridTemplateColumns: "repeat(auto-fill, minmax(min(260px, 100%), 1fr))",
              gap: 12,
            }}
          >
            {([0, 1, 2, 3] as const).map((j) => (
              <div key={j} className="skeleton-card" style={{ height: 96, borderRadius: "var(--r-md)" }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filtro do catálogo por texto (nome da consulta ou categoria)
// ---------------------------------------------------------------------------

function normText(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function filterCatalog(grouped: Map<string, CatalogKind[]>, query: string): Map<string, CatalogKind[]> {
  const q = normText(query.trim());
  if (q === "") return grouped;
  const out = new Map<string, CatalogKind[]>();
  for (const [categoria, kinds] of grouped) {
    const catMatch = normText(categoria).includes(q);
    const matched = catMatch
      ? kinds
      : kinds.filter((k) => normText(k.titulo).includes(q) || normText(k.kind).includes(q));
    if (matched.length > 0) out.set(categoria, matched);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

export function ConsultasPage() {
  const [pageState, setPageState] = useState<PageState>("idle");
  const [cnpjDigits, setCnpjDigits] = useState("");
  const [cnpjLabel, setCnpjLabel] = useState("");
  const [catalogError, setCatalogError] = useState("");
  const [filterQuery, setFilterQuery] = useState("");
  const searchAnchorRef = useRef<HTMLDivElement>(null);

  const cnpjValid = isValidCnpj(cnpjDigits);

  // Leva o foco/scroll para o seletor de empresa quando uma consulta é tentada
  // sem CNPJ válido (o botão "Consultar" do card chama isto).
  function requestCnpj() {
    searchAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleSelectCompany(cnpj: string, name?: string) {
    setCnpjDigits(cnpj);
    setCnpjLabel(name ?? formatCnpj(cnpj));
    // Esquenta o cadastro/QSA no D1 (best-effort) — não bloqueia.
    void requestCompanyEnrichment(cnpj);
  }

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

  const catalogData: CatalogLoaded | null =
    typeof pageState === "object" && pageState !== null && "grouped" in pageState
      ? pageState
      : null;

  const filteredGrouped = useMemo(
    () => (catalogData ? filterCatalog(catalogData.grouped, filterQuery) : new Map<string, CatalogKind[]>()),
    [catalogData, filterQuery],
  );

  const totalConsultas = catalogData?.kinds.length ?? 0;
  const totalFiltradas = useMemo(
    () => [...filteredGrouped.values()].reduce((acc, ks) => acc + ks.length, 0),
    [filteredGrouped],
  );

  return (
    <div
      className="fade-in"
      style={{
        maxWidth: 980,
        margin: "0 auto",
        padding: "24px 16px 64px",
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      {/* Cabeçalho */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <ShieldCheck size={22} style={{ color: "var(--brand)" }} aria-hidden="true" />
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "var(--t-hi)", letterSpacing: "-.02em" }}>
            Consultas oficiais
          </h1>
          {totalConsultas > 0 && (
            <span className="badge badge--info" style={{ fontSize: 11 }}>
              {totalConsultas} consultas
            </span>
          )}
        </div>
        <p className="muted" style={{ margin: 0, maxWidth: 620 }}>
          Certidões e situações cadastrais direto das fontes oficiais (Receita, TST, Caixa/FGTS, CGU,
          TCU). Escolha a empresa, encontre a consulta e gere o documento com link para a fonte.
        </p>
      </div>

      {/* Retorno (ROI) */}
      <RoiNote tone="brand">
        Emitir essas certidões uma a uma nos sites do governo toma horas e cada uma tem um portal
        diferente. Aqui você confirma a regularidade de um fornecedor em minutos — o tipo de checagem
        que evita habilitar quem está irregular e justifica a assinatura num único mês de uso.
      </RoiNote>

      {/* Seletor de empresa (por NOME ou CNPJ) */}
      <div
        ref={searchAnchorRef}
        className="panel"
        style={{ padding: "16px 16px 18px", display: "flex", flexDirection: "column", gap: 10 }}
      >
        <CompanySearch
          label="Empresa para consultar"
          placeholder="Digite o nome da empresa ou o CNPJ"
          buttonLabel="Selecionar"
          onSelect={handleSelectCompany}
        />
        {cnpjValid && (
          <div
            className="inset"
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px" }}
            role="status"
          >
            <CheckCircle2 size={15} style={{ color: "var(--ok)", flexShrink: 0 }} aria-hidden="true" />
            <span
              className="small"
              style={{ color: "var(--t-hi)", fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {cnpjLabel}
            </span>
            <span className="tiny" style={{ color: "var(--t-mid)", flexShrink: 0 }}>
              {formatCnpj(cnpjDigits)}
            </span>
          </div>
        )}
        <p className="tiny" style={{ margin: 0, color: "var(--t-mid)", display: "flex", gap: 6, alignItems: "flex-start" }}>
          <Info size={13} style={{ flexShrink: 0, marginTop: 1, color: "var(--t-low)" }} aria-hidden="true" />
          Cada consulta desconta um crédito do seu plano. Selecione a empresa uma vez e dispare quantas
          consultas precisar.
        </p>
      </div>

      {/* Conteúdo principal */}
      {pageState === "idle" || pageState === "loading-catalog" ? (
        <CatalogSkeleton />
      ) : pageState === "catalog-error" ? (
        <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start", padding: "20px 24px" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <XCircle size={18} style={{ color: "var(--danger)" }} />
            <span style={{ fontWeight: 700, color: "var(--t-hi)" }}>Erro ao carregar consultas</span>
          </div>
          <p className="small" style={{ color: "var(--t-mid)", margin: 0 }}>{catalogError}</p>
          <button type="button" className="btn btn--primary btn--sm" onClick={runCatalogFetch}>
            Tentar novamente
          </button>
        </div>
      ) : pageState === "dormant" ? (
        <div className="panel">
          <EmptyState
            icon={Lock}
            title="Consultas premium não configuradas"
            description="O serviço de certidões oficiais não está ativo neste ambiente. Disponível nos planos Escritório e Corporativo."
            tone="warning"
            action={{ label: "Ver planos", href: "/app/planos" }}
          />
        </div>
      ) : catalogData !== null ? (
        <>
          {/* Barra de busca das consultas */}
          <div className="searchbar" style={{ padding: "0 14px" }}>
            <Search size={16} style={{ color: "var(--t-low)", flexShrink: 0 }} aria-hidden="true" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Filtrar consultas (ex.: FGTS, idoneidade, Simples)"
              aria-label="Filtrar consultas por nome ou categoria"
              autoComplete="off"
            />
            {filterQuery !== "" && (
              <button
                type="button"
                className="btn btn--icon btn--ghost btn--sm"
                style={{ width: 28, height: 28, flexShrink: 0 }}
                onClick={() => setFilterQuery("")}
                aria-label="Limpar filtro"
              >
                <XCircle size={15} aria-hidden="true" />
              </button>
            )}
          </div>

          {!cnpjValid && (
            <div
              className="inset"
              role="status"
              style={{ display: "flex", gap: 8, alignItems: "center", borderColor: "var(--brand)", padding: "10px 14px" }}
            >
              <Info size={16} style={{ color: "var(--brand)", flexShrink: 0 }} aria-hidden="true" />
              <span className="small" style={{ color: "var(--t-hi)", fontWeight: 600 }}>
                Escolha uma empresa acima para liberar o botão Consultar de cada cartão.
              </span>
            </div>
          )}

          {filterQuery !== "" && (
            <p className="tiny muted" style={{ margin: 0 }}>
              {totalFiltradas} de {totalConsultas} consultas para “{filterQuery}”.
            </p>
          )}

          {filteredGrouped.size === 0 ? (
            <div className="panel">
              <EmptyState
                icon={Search}
                title="Nenhuma consulta encontrada"
                description={`Nada casou com “${filterQuery}”. Tente outro termo (ex.: trabalhista, dívida ativa, cadastro).`}
                tone="neutral"
                compact
                action={{ label: "Limpar filtro", onClick: () => setFilterQuery("") }}
              />
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 24,
                opacity: cnpjValid ? 1 : 0.92,
                transition: "opacity .2s ease",
              }}
            >
              {Array.from(filteredGrouped.entries()).map(([categoria, kinds]) => (
                <CategorySection
                  key={categoria}
                  categoria={categoria}
                  kinds={kinds}
                  cnpjDigits={cnpjDigits}
                  cnpjValid={cnpjValid}
                  onNeedCnpj={requestCnpj}
                  forceOpen={filterQuery !== ""}
                />
              ))}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
