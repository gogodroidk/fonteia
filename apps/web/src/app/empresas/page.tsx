import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  ExternalLink,
  Gavel,
  Landmark,
  Loader2,
  MapPin,
  Search,
  ShieldAlert,
  Users,
  X,
} from "lucide-react";
import type { OrgaoPublico } from "@fonteia/sources";
import {
  type EmpresaCnpj,
  type SancaoItem,
  type CompanyEnrichItem,
  fetchCompanyEnrichment,
  formatCnpjSancao,
  listOrgaos,
  listSancoes,
  lookupCnpj,
  sanitizeCnpj,
} from "../../features/empresas/empresas-api";
import { FonteDots } from "../../components/ui";
import { CreateAlertButton } from "../../components/alerts/CreateAlertButton";
import { ReportButton } from "../../components/report/ReportButton";
import type { SavedReport } from "../../features/reports/reports-store";

// Quantos órgãos/sanções renderizar por vez (o scroll carrega mais sozinho).
const PAGE_SIZE = 36;

// ─── Constants ───────────────────────────────────────────────────────────────

// Fonte oficial da consulta de CNPJ: Receita Federal (via Minha Receita). Azul institucional.
const FONTE_DOTS_RECEITA = [
  { sigla: "RF", cor: "#1D5FE0", nome: "Receita Federal — cadastro de CNPJ (via Minha Receita)" },
];

// Fonte dos órgãos: derivada das licitações do PNCP. Roxo institucional.
const FONTE_DOTS_PNCP = [
  { sigla: "PNCP", cor: "#7C5CFF", nome: "PNCP — órgãos públicos (derivado das licitações)" },
];

// Fonte das sanções: Portal da Transparência — CEIS/CNEP.
const FONTE_DOTS_CGU = [
  { sigla: "CGU", cor: "#D32F2F", nome: "Portal da Transparência — CEIS/CNEP (CGU)" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Remove acentos e baixa caixa para busca tolerante. */
function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Busca por múltiplos termos (AND), tolerante a acento: cada termo precisa
 * aparecer em algum campo (nome, CNPJ, UF, nome da UF).
 */
function matchesSearch(o: OrgaoPublico, q: string): boolean {
  const query = normalizeForSearch(q);
  if (query === "") return true;
  const haystack = normalizeForSearch([o.nome, o.cnpj, o.uf, o.ufNome].join(" "));
  return query.split(/\s+/).every((term) => haystack.includes(term));
}

/** Busca tolerante em sanção. */
function matchesSearchSancao(s: SancaoItem, q: string): boolean {
  const query = normalizeForSearch(q);
  if (query === "") return true;
  const haystack = normalizeForSearch(
    [
      s.nome,
      s.cnpj,
      s.attributes.origem ?? "",
      s.attributes.tipoSancao ?? "",
      s.attributes.orgaoSancionador ?? "",
    ].join(" "),
  );
  return query.split(/\s+/).every((term) => haystack.includes(term));
}

/** Máscara 00.000.000/0000-00 a partir de um CNPJ de 14 dígitos (ou devolve cru). */
function formatCnpj(cnpj: string): string {
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/** Formata uma data ISO/yyyy-mm-dd em dd/mm/aaaa; devolve cru se não der. */
function formatDate(value: string): string {
  if (!value) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return value;
}

/** Heurística leve: situação ativa para colorir o badge de verde. */
function isSituacaoAtiva(situacao: string): boolean {
  return normalizeForSearch(situacao).includes("ativa");
}

/** Build a SavedReport for the looked-up empresa. */
function buildEmpresaReport(empresa: EmpresaCnpj): SavedReport {
  const cnpjDigits = sanitizeCnpj(empresa.cnpj);
  const fields: SavedReport["fields"] = [
    { label: "CNPJ", value: empresa.cnpj },
    { label: "Situação", value: empresa.situacao },
    ...(empresa.cnaePrincipal !== ""
      ? [{ label: "Atividade principal (CNAE)", value: empresa.cnaePrincipal }]
      : []),
    ...((empresa.municipio !== "" || empresa.uf !== "")
      ? [{ label: "Localização", value: [empresa.municipio, empresa.uf].filter(Boolean).join("/") }]
      : []),
    ...(empresa.abertura !== "" ? [{ label: "Abertura", value: formatDate(empresa.abertura) }] : []),
    ...(empresa.naturezaJuridica !== ""
      ? [{ label: "Natureza jurídica", value: empresa.naturezaJuridica }]
      : []),
    ...(empresa.porte !== "" ? [{ label: "Porte", value: empresa.porte }] : []),
    ...(empresa.endereco !== "" ? [{ label: "Endereço", value: empresa.endereco }] : []),
    ...(empresa.nomeFantasia !== ""
      ? [{ label: "Nome fantasia", value: empresa.nomeFantasia }]
      : []),
  ];
  return {
    id: `empresa:${cnpjDigits}`,
    kind: "empresa",
    kindLabel: "Empresa (CNPJ)",
    title: empresa.razaoSocial,
    subtitle: empresa.cnpj,
    fields,
    sources: [{ label: "Receita Federal — cadastro de CNPJ (via Minha Receita)", url: empresa.sourceUrl }],
    createdAt: new Date().toISOString(),
  };
}

// ─── Caixa de busca de CNPJ + perfil ───────────────────────────────────────────

function CnpjLookup({ sancoesPorCnpj }: { sancoesPorCnpj: Map<string, SancaoItem[]> }) {
  const [input, setInput] = useState("");
  const [empresa, setEmpresa] = useState<EmpresaCnpj | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchedCnpj, setSearchedCnpj] = useState<string | null>(null);
  const [enrichment, setEnrichment] = useState<CompanyEnrichItem | null>(null);
  const [isLoadingEnrich, setIsLoadingEnrich] = useState(false);

  const digits = sanitizeCnpj(input);
  const canSearch = digits !== "" && !isLoading;

  async function handleSearch() {
    const cnpj = sanitizeCnpj(input);
    if (cnpj === "") {
      setError("CNPJ inválido: digite os 14 números (com ou sem máscara).");
      setEmpresa(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    setEmpresa(null);
    setEnrichment(null);
    setIsLoadingEnrich(true);
    setSearchedCnpj(formatCnpj(cnpj));

    let cancelled = false;

    try {
      const result = await lookupCnpj(cnpj);
      setEmpresa(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao consultar o CNPJ.");
      cancelled = true;
      setIsLoadingEnrich(false);
    } finally {
      setIsLoading(false);
    }

    if (!cancelled) {
      fetchCompanyEnrichment(cnpj)
        .then((result) => {
          setEnrichment(result.company);
          setIsLoadingEnrich(false);
        })
        .catch(() => {
          setIsLoadingEnrich(false);
        });
    }
  }

  function handleClear() {
    setInput("");
    setEmpresa(null);
    setError(null);
    setSearchedCnpj(null);
    setEnrichment(null);
    setIsLoadingEnrich(false);
  }

  const ativa = empresa ? isSituacaoAtiva(empresa.situacao) : false;

  // Sanções associadas ao CNPJ consultado
  const sancoesDaEmpresa = empresa
    ? (sancoesPorCnpj.get(sanitizeCnpj(empresa.cnpj)) ?? [])
    : [];

  return (
    <section
      className="panel"
      style={{ padding: "18px 18px 20px", display: "flex", flexDirection: "column", gap: 14 }}
    >
      <div className="row between" style={{ gap: 8, alignItems: "flex-start" }}>
        <div>
          <span className="eyebrow">Consulta de CNPJ</span>
          <h3 style={{ margin: "4px 0 0", fontSize: 16, fontWeight: 800, color: "var(--t-hi)" }}>
            Buscar empresa pelo CNPJ
          </h3>
          <p className="muted small" style={{ margin: "4px 0 0", maxWidth: 520 }}>
            Consulta on-demand do cadastro oficial da Receita Federal: razão social, situação, CNAE,
            sócios e localização. Gratuito.
          </p>
        </div>
        <FonteDots fontes={FONTE_DOTS_RECEITA} size={22} />
      </div>

      {/* Caixa de busca */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSearch();
        }}
        className="row wrap"
        style={{ gap: 10, alignItems: "stretch" }}
      >
        <div className="searchbar" style={{ flex: "1 1 260px", minWidth: 0 }}>
          <Building2 size={16} style={{ color: "var(--t-low)", flexShrink: 0 }} aria-hidden="true" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Digite o CNPJ (ex.: 00.000.000/0001-91)"
            inputMode="text"
            aria-label="CNPJ a consultar"
          />
          {input !== "" && (
            <button
              className="btn btn--icon btn--ghost btn--sm"
              style={{ width: 28, height: 28, flexShrink: 0 }}
              onClick={handleClear}
              type="button"
              aria-label="Limpar"
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>
        <button className="btn btn--primary" type="submit" disabled={!canSearch} style={{ flexShrink: 0 }}>
          {isLoading ? (
            <>
              <Loader2 size={16} className="spin" aria-hidden="true" />
              Consultando…
            </>
          ) : (
            <>
              <Search size={16} aria-hidden="true" />
              Consultar
            </>
          )}
        </button>
      </form>

      {/* Erro */}
      {error !== null && (
        <div
          className="panel"
          style={{
            padding: "12px 16px",
            background: "color-mix(in srgb, var(--danger) 10%, var(--surface))",
            border: "1px solid color-mix(in srgb, var(--danger) 28%, transparent)",
            color: "var(--danger)",
            fontSize: 13.5,
            fontWeight: 600,
          }}
          role="alert"
        >
          {error}
          {searchedCnpj ? ` (${searchedCnpj})` : ""}
        </div>
      )}

      {/* Perfil da empresa */}
      {empresa !== null && (
        <article
          className="card"
          style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 16 }}
        >
          {/* Aviso de sanção */}
          {sancoesDaEmpresa.length > 0 && (
            <div
              style={{
                padding: "10px 14px",
                background: "color-mix(in srgb, var(--danger) 10%, var(--surface))",
                border: "1px solid color-mix(in srgb, var(--danger) 30%, transparent)",
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
              role="alert"
            >
              <AlertTriangle
                size={18}
                style={{ color: "var(--danger)", flexShrink: 0 }}
                aria-hidden="true"
              />
              <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--danger)" }}>
                ⚠️ Empresa com {sancoesDaEmpresa.length}{" "}
                {sancoesDaEmpresa.length === 1 ? "sanção" : "sanções"} no CEIS/CNEP
              </span>
            </div>
          )}

          {/* Cabeçalho: razão social + situação */}
          <div className="row between wrap" style={{ gap: 10, alignItems: "flex-start" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: "var(--t-hi)", lineHeight: 1.3 }}>
                {empresa.razaoSocial}
              </div>
              {empresa.nomeFantasia !== "" && (
                <div className="muted small" style={{ marginTop: 2 }}>
                  {empresa.nomeFantasia}
                </div>
              )}
              <div
                className="tiny muted num"
                style={{ marginTop: 6, fontVariantNumeric: "tabular-nums" }}
              >
                {empresa.cnpj}
              </div>
            </div>
            <span
              className="badge"
              style={{
                flexShrink: 0,
                fontWeight: 700,
                color: ativa ? "var(--accent-ink, #0a7d4b)" : "var(--t-mid)",
                background: ativa
                  ? "color-mix(in srgb, var(--accent, #16a34a) 16%, var(--surface))"
                  : "var(--surface-2, var(--surface))",
                border: "1px solid var(--border)",
              }}
            >
              {empresa.situacao}
            </span>
          </div>

          {/* Grade de fatos */}
          <div
            className="grid"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}
          >
            {empresa.cnaePrincipal !== "" && (
              <FactItem
                label="Atividade principal (CNAE)"
                value={empresa.cnaeCodigo !== "" ? `${empresa.cnaePrincipal} · ${empresa.cnaeCodigo}` : empresa.cnaePrincipal}
              />
            )}
            {(empresa.municipio !== "" || empresa.uf !== "") && (
              <FactItem
                icon={<MapPin size={13} aria-hidden="true" />}
                label="Localização"
                value={[empresa.municipio, empresa.uf].filter(Boolean).join("/") || "—"}
              />
            )}
            {empresa.abertura !== "" && (
              <FactItem
                icon={<CalendarDays size={13} aria-hidden="true" />}
                label="Abertura"
                value={formatDate(empresa.abertura)}
              />
            )}
            {empresa.naturezaJuridica !== "" && (
              <FactItem label="Natureza jurídica" value={empresa.naturezaJuridica} />
            )}
            {empresa.porte !== "" && <FactItem label="Porte" value={empresa.porte} />}
            {empresa.endereco !== "" && <FactItem label="Endereço" value={empresa.endereco} />}
          </div>

          {/* Ações */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <CreateAlertButton
              kind="empresa"
              entityRef={sanitizeCnpj(empresa.cnpj)}
              entityLabel={empresa.razaoSocial}
              size="sm"
              variant="soft"
            />
            <ReportButton report={buildEmpresaReport(empresa)} />
          </div>

          {/* Sócios (QSA) */}
          {empresa.socios.length > 0 && (
            <div>
              <div
                className="tiny"
                style={{ fontWeight: 700, color: "var(--t-hi)", display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}
              >
                <Users size={14} aria-hidden="true" />
                Quadro societário ({empresa.socios.length})
              </div>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                {empresa.socios.map((socio, i) => (
                  <li
                    key={`${socio.nome}-${i}`}
                    className="inset"
                    style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 2 }}
                  >
                    <span style={{ fontWeight: 600, color: "var(--t-hi)", fontSize: 13.5 }}>
                      {socio.nome}
                    </span>
                    <span className="tiny muted">
                      {[socio.qualificacao, socio.faixaEtaria].filter(Boolean).join(" · ") || "Sócio"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Rodapé: fonte oficial */}
          <div className="row between" style={{ gap: 8, alignItems: "center", paddingTop: 2 }}>
            <a
              href={empresa.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="tiny"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                color: "var(--brand-ink)",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Ver dados na fonte
              <ExternalLink size={12} aria-hidden="true" />
            </a>
            <FonteDots fontes={FONTE_DOTS_RECEITA} size={20} />
          </div>
        </article>
      )}

      {/* Enriquecimento BrasilAPI */}
      {(isLoadingEnrich || enrichment !== null) && empresa !== null && (
        <EnrichmentPanel enrichment={enrichment} isLoading={isLoadingEnrich} />
      )}
    </section>
  );
}

// ─── Painel de enriquecimento BrasilAPI ─────────────────────────────────────────

/** Lista de CNAEs com colapso após 3 itens. */
function CnaeChips({ items }: { items: Array<{ codigo: string; descricao: string }> }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, 3);
  const remaining = items.length - 3;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
      {visible.map((c) => (
        <span
          key={c.codigo}
          className="badge badge--neutral"
          style={{ fontSize: 12 }}
          title={c.descricao}
        >
          {c.codigo}
        </span>
      ))}
      {!expanded && remaining > 0 && (
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          style={{ fontSize: 12, padding: "2px 8px", height: "auto" }}
          onClick={() => setExpanded(true)}
        >
          Ver todos ({items.length})
        </button>
      )}
    </div>
  );
}

/** Painel de dados enriquecidos — BrasilAPI / D1. */
function EnrichmentPanel({
  enrichment,
  isLoading,
}: {
  enrichment: CompanyEnrichItem | null;
  isLoading: boolean;
}) {
  const FONTE_DOTS_BRASIL_API = [
    { sigla: "BA", cor: "#2563eb", nome: "BrasilAPI — enriquecimento cadastral (D1)" },
  ];

  return (
    <article
      className="card"
      style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 16 }}
    >
      {/* Cabeçalho */}
      <div className="row between" style={{ gap: 8, alignItems: "center" }}>
        <div
          className="tiny"
          style={{
            fontWeight: 700,
            color: "var(--t-hi)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span
            style={{
              padding: "1px 8px",
              borderRadius: 4,
              background: "color-mix(in srgb, #2563eb 12%, var(--surface))",
              color: "#1d4ed8",
              fontWeight: 800,
              fontSize: 11,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            BrasilAPI
          </span>
          Dados Enriquecidos — BrasilAPI
          {isLoading && (
            <Loader2
              size={14}
              className="spin"
              aria-hidden="true"
              style={{ color: "var(--t-low)" }}
            />
          )}
        </div>
        <FonteDots fontes={FONTE_DOTS_BRASIL_API} size={20} />
      </div>

      {/* Conteúdo: spinner quando carregando, dados quando disponível */}
      {isLoading && enrichment === null ? (
        <div
          className="tiny muted"
          style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 4 }}
        >
          <Loader2 size={14} className="spin" aria-hidden="true" />
          Buscando dados complementares…
        </div>
      ) : enrichment === null ? (
        <p className="tiny muted" style={{ margin: 0 }}>
          Nenhum dado de enriquecimento disponível para este CNPJ no momento.
        </p>
      ) : (
        <EnrichmentContent enrichment={enrichment} />
      )}
    </article>
  );
}

function EnrichmentContent({ enrichment }: { enrichment: CompanyEnrichItem }) {
  const { attributes } = enrichment;

  const {
    capitalSocial,
    simples,
    mei,
    situacaoCadastral,
    cnaePrincipal,
    cnaesSecundarios,
    qsa,
  } = attributes;

  const hasSituacaoAtiva =
    situacaoCadastral != null &&
    situacaoCadastral.toUpperCase().includes("ATIVA");
  const hasSituacaoBaixa =
    situacaoCadastral != null &&
    (situacaoCadastral.toUpperCase().includes("BAIXADA") ||
      situacaoCadastral.toUpperCase().includes("SUSPENSA"));

  const situacaoColor = hasSituacaoAtiva
    ? "#0a7d4b"
    : hasSituacaoBaixa
    ? "var(--danger)"
    : "var(--t-mid)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Capital social */}
      {capitalSocial != null && capitalSocial > 0 && (
        <div>
          <div className="tiny muted" style={{ marginBottom: 3 }}>
            Capital social
          </div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--t-hi)" }}>
            {capitalSocial.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </div>
        </div>
      )}

      {/* Regime tributário */}
      {simples != null && (
        <div>
          <div className="tiny muted" style={{ marginBottom: 6 }}>
            Regime tributário
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {simples === true && (
              <span
                className="badge"
                style={{
                  background: "color-mix(in srgb, #16a34a 14%, var(--surface))",
                  color: "#0a7d4b",
                  border: "1px solid color-mix(in srgb, #16a34a 28%, transparent)",
                  fontWeight: 700,
                }}
              >
                Simples Nacional
              </span>
            )}
            {mei === true && (
              <span
                className="badge"
                style={{
                  background: "color-mix(in srgb, #16a34a 14%, var(--surface))",
                  color: "#0a7d4b",
                  border: "1px solid color-mix(in srgb, #16a34a 28%, transparent)",
                  fontWeight: 700,
                }}
              >
                MEI
              </span>
            )}
            {simples === false && (
              <span className="badge badge--neutral" style={{ fontWeight: 600 }}>
                Não optante
              </span>
            )}
          </div>
        </div>
      )}

      {/* Situação cadastral */}
      {situacaoCadastral != null && (
        <div>
          <div className="tiny muted" style={{ marginBottom: 3 }}>
            Situação cadastral
          </div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: situacaoColor }}>
            {situacaoCadastral}
          </div>
        </div>
      )}

      {/* CNAE principal */}
      {cnaePrincipal != null && (
        <div>
          <div className="tiny muted" style={{ marginBottom: 3 }}>
            CNAE principal
          </div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--t-hi)" }}>
            {cnaePrincipal.codigo} — {cnaePrincipal.descricao}
          </div>
        </div>
      )}

      {/* CNAEs secundários */}
      {cnaesSecundarios != null && cnaesSecundarios.length > 0 && (
        <div>
          <div className="tiny muted" style={{ marginBottom: 6 }}>
            CNAEs secundários
          </div>
          <CnaeChips items={cnaesSecundarios} />
        </div>
      )}

      {/* Quadro societário — BrasilAPI */}
      {qsa != null && qsa.length > 0 && (
        <div>
          <div
            className="tiny"
            style={{
              fontWeight: 700,
              color: "var(--t-hi)",
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 8,
            }}
          >
            <Users size={14} aria-hidden="true" />
            Quadro societário — BrasilAPI ({qsa.length})
          </div>
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {qsa.map((socio, i) => (
              <li
                key={`${socio.nome}-${i}`}
                className="inset"
                style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 2 }}
              >
                <span style={{ fontWeight: 600, color: "var(--t-hi)", fontSize: 13.5 }}>
                  {socio.nome}
                </span>
                <span className="tiny muted">{socio.qualificacao || "Sócio"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function FactItem({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="tiny muted" style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
        {icon}
        {label}
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--t-hi)", overflowWrap: "anywhere" }}>
        {value}
      </div>
    </div>
  );
}

// ─── Skeleton card (órgãos/sanções) ────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="card card--pad" aria-hidden="true">
      <div className="skeleton" style={{ height: 12, width: "28%", marginBottom: 12 }} />
      <div className="skeleton" style={{ height: 16, width: "75%", marginBottom: 10 }} />
      <div className="skeleton" style={{ height: 11, width: "50%", marginBottom: 8 }} />
      <div className="skeleton" style={{ height: 11, width: "40%" }} />
    </div>
  );
}

// ─── Órgão card ────────────────────────────────────────────────────────────────

function OrgaoCard({ orgao }: { orgao: OrgaoPublico }) {
  const temLicitacoes = orgao.licitacoesCount > 0;
  return (
    <article
      className="card card--hover"
      style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}
      aria-label={`Órgão público — ${orgao.nome}${orgao.uf ? `/${orgao.uf}` : ""}`}
    >
      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
        {/* Top: UF + CNPJ */}
        <div className="row between" style={{ gap: 8, alignItems: "center" }}>
          <span className="badge badge--neutral" style={{ flexShrink: 0 }}>
            {orgao.uf || "—"}
          </span>
          {orgao.cnpj !== "" && (
            <span className="tiny muted num" style={{ fontVariantNumeric: "tabular-nums" }}>
              {formatCnpj(orgao.cnpj)}
            </span>
          )}
        </div>

        {/* Nome — identidade do órgão */}
        <div
          style={{
            fontSize: 15.5,
            fontWeight: 800,
            color: "var(--t-hi)",
            lineHeight: 1.3,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
          title={orgao.nome}
        >
          {orgao.nome || "Órgão sem nome"}
        </div>

        {/* Localização */}
        <div className="tiny muted" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <MapPin size={13} style={{ flexShrink: 0 }} aria-hidden="true" />
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {orgao.ufNome || orgao.uf || "Brasil"}
          </span>
        </div>

        {/* Licitações + fonte */}
        <div className="row between" style={{ gap: 6, marginTop: "auto", paddingTop: 4, alignItems: "center" }}>
          <div
            className="tiny"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontWeight: 700,
              color: temLicitacoes ? "var(--t-hi)" : "var(--t-low)",
            }}
          >
            <Gavel size={13} style={{ flexShrink: 0, color: temLicitacoes ? "var(--brand-ink)" : "var(--t-low)" }} aria-hidden="true" />
            <span className="num" style={{ fontVariantNumeric: "tabular-nums" }}>
              {orgao.licitacoesCount}
            </span>
            {orgao.licitacoesCount === 1 ? "licitação" : "licitações"}
          </div>
          <FonteDots fontes={FONTE_DOTS_PNCP} size={20} />
        </div>
      </div>
    </article>
  );
}

// ─── Sanção card ────────────────────────────────────────────────────────────────

function SancaoCard({ sancao }: { sancao: SancaoItem }) {
  const { attributes } = sancao;
  const origem = attributes.origem ?? "—";
  const isAtiva =
    !attributes.dataFimSancao || new Date(attributes.dataFimSancao) >= new Date();

  return (
    <article
      className="card card--hover"
      style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}
      aria-label={`Sanção — ${sancao.nome}`}
    >
      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
        {/* Top: origem + badge ativa/expirada */}
        <div className="row between" style={{ gap: 8, alignItems: "center" }}>
          <span
            className="badge"
            style={{
              flexShrink: 0,
              background: "color-mix(in srgb, var(--danger) 14%, var(--surface))",
              color: "var(--danger)",
              border: "1px solid color-mix(in srgb, var(--danger) 28%, transparent)",
              fontWeight: 700,
            }}
          >
            {origem}
          </span>
          <span
            className="tiny"
            style={{
              fontWeight: 700,
              color: isAtiva ? "var(--danger)" : "var(--t-low)",
            }}
          >
            {isAtiva ? "Ativa" : "Expirada"}
          </span>
        </div>

        {/* Nome do sancionado */}
        <div
          style={{
            fontSize: 15,
            fontWeight: 800,
            color: "var(--t-hi)",
            lineHeight: 1.3,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
          title={sancao.nome}
        >
          {sancao.nome || "Sancionado sem nome"}
        </div>

        {/* CNPJ */}
        {sancao.cnpj !== "" && (
          <div className="tiny muted num" style={{ fontVariantNumeric: "tabular-nums" }}>
            {formatCnpjSancao(sancao.cnpj)}
          </div>
        )}

        {/* Tipo de sanção */}
        {attributes.tipoSancao && (
          <p
            className="tiny muted"
            style={{
              margin: 0,
              lineHeight: 1.5,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {attributes.tipoSancao}
          </p>
        )}

        {/* Período: início–fim */}
        <div className="tiny muted" style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <CalendarDays size={12} style={{ flexShrink: 0 }} aria-hidden="true" />
          <span>
            {attributes.dataInicioSancao ? formatDate(attributes.dataInicioSancao) : "—"}
            {attributes.dataFimSancao ? ` → ${formatDate(attributes.dataFimSancao)}` : " → em vigor"}
          </span>
        </div>

        {/* Órgão sancionador + fonte */}
        <div
          className="row between"
          style={{ gap: 6, marginTop: "auto", paddingTop: 4, alignItems: "center" }}
        >
          {attributes.orgaoSancionador ? (
            <span
              className="tiny muted"
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                minWidth: 0,
              }}
              title={attributes.orgaoSancionador}
            >
              {attributes.orgaoSancionador}
            </span>
          ) : (
            <span />
          )}
          <FonteDots fontes={FONTE_DOTS_CGU} size={20} />
        </div>
      </div>
    </article>
  );
}

// ─── Select control ─────────────────────────────────────────────────────────────

function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<readonly [T, string]>;
  onChange: (next: T) => void;
}) {
  return (
    <label className="chip" style={{ gap: 8, paddingRight: 10 }}>
      <span style={{ color: "var(--t-low)", fontWeight: 600 }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        style={{
          border: "none",
          background: "transparent",
          color: "var(--t-hi)",
          fontFamily: "inherit",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          maxWidth: 180,
        }}
      >
        {options.map(([val, text]) => (
          <option key={val} value={val}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

// ─── Empty (filters) state ──────────────────────────────────────────────────────

function EmptyState({ onClear, label }: { onClear: () => void; label: string }) {
  return (
    <div
      className="panel"
      style={{ padding: 48, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}
    >
      <div
        aria-hidden="true"
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          background: "color-mix(in srgb, var(--brand-ink) 10%, var(--surface))",
          color: "var(--brand-ink)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Search size={28} />
      </div>
      <div style={{ fontWeight: 700, fontSize: 15 }}>Nenhum(a) {label} com esses filtros</div>
      <p className="muted small" style={{ margin: 0, maxWidth: 340 }}>
        Tente ampliar a busca ou trocar o filtro.
      </p>
      <button className="btn btn--ghost btn--sm" onClick={onClear} type="button">
        Limpar filtros
      </button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function EmpresasPage() {
  // ── Órgãos data state ──
  const [orgaos, setOrgaos] = useState<OrgaoPublico[]>([]);
  const [isLoadingOrgaos, setIsLoadingOrgaos] = useState(true);
  const [errorOrgaos, setErrorOrgaos] = useState<string | null>(null);

  // ── Sanções data state ──
  const [sancoes, setSancoes] = useState<SancaoItem[]>([]);
  const [isLoadingSancoes, setIsLoadingSancoes] = useState(true);
  const [errorSancoes, setErrorSancoes] = useState<string | null>(null);

  // ── Filter state (órgãos) ──
  const [query, setQuery] = useState("");
  const [uf, setUf] = useState("todas");

  // ── Filter state (sanções) ──
  const [querySancao, setQuerySancao] = useState("");
  const [origemFiltro, setOrigemFiltro] = useState("todas");

  // ── Paginação por scroll ──
  const [visibleCountOrgaos, setVisibleCountOrgaos] = useState(PAGE_SIZE);
  const [visibleCountSancoes, setVisibleCountSancoes] = useState(PAGE_SIZE);
  const sentinelOrgaosRef = useRef<HTMLDivElement | null>(null);
  const sentinelSancoesRef = useRef<HTMLDivElement | null>(null);

  // ── Load órgãos ──
  useEffect(() => {
    let cancelled = false;
    setIsLoadingOrgaos(true);
    setErrorOrgaos(null);

    listOrgaos()
      .then((result) => {
        if (cancelled) return;
        setOrgaos(result.orgaos);
        setIsLoadingOrgaos(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorOrgaos(err instanceof Error ? err.message : "Erro ao carregar órgãos.");
        setIsLoadingOrgaos(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Load sanções ──
  useEffect(() => {
    let cancelled = false;
    setIsLoadingSancoes(true);
    setErrorSancoes(null);

    listSancoes()
      .then((result) => {
        if (cancelled) return;
        setSancoes(result.sancoes);
        setIsLoadingSancoes(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorSancoes(err instanceof Error ? err.message : "Erro ao carregar sanções.");
        setIsLoadingSancoes(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Map CNPJ → sanções (para o aviso no lookup) ──
  const sancoesPorCnpj = useMemo<Map<string, SancaoItem[]>>(() => {
    const m = new Map<string, SancaoItem[]>();
    for (const s of sancoes) {
      if (s.cnpj === "") continue;
      const arr = m.get(s.cnpj) ?? [];
      arr.push(s);
      m.set(s.cnpj, arr);
    }
    return m;
  }, [sancoes]);

  // ── Derived UF options ──
  const ufOptions = useMemo<ReadonlyArray<readonly [string, string]>>(() => {
    const distinct = Array.from(
      new Set(
        orgaos
          .map((o) => o.uf?.trim())
          .filter((u): u is string => typeof u === "string" && u.length > 0),
      ),
    ).sort((a, b) => a.localeCompare(b, "pt-BR"));
    return [["todas", "Todas"], ...distinct.map((u) => [u, u] as const)];
  }, [orgaos]);

  // ── Derived origem options (CEIS / CNEP) ──
  const origemOptions = useMemo<ReadonlyArray<readonly [string, string]>>(() => {
    const distinct = Array.from(
      new Set(
        sancoes
          .map((s) => s.attributes.origem?.trim())
          .filter((o): o is string => typeof o === "string" && o.length > 0),
      ),
    ).sort();
    return [["todas", "Todas"], ...distinct.map((o) => [o, o] as const)];
  }, [sancoes]);

  // ── Filtered + sorted (por nome A→Z, depois mais licitações) ──
  const filteredOrgaos = useMemo<OrgaoPublico[]>(() => {
    const list = orgaos.filter((o) => {
      if (!matchesSearch(o, query)) return false;
      if (uf !== "todas" && o.uf !== uf) return false;
      return true;
    });
    return [...list].sort((a, b) => {
      if (b.licitacoesCount !== a.licitacoesCount) return b.licitacoesCount - a.licitacoesCount;
      return a.nome.localeCompare(b.nome, "pt-BR");
    });
  }, [orgaos, query, uf]);

  // ── Filtered sanções ──
  const filteredSancoes = useMemo<SancaoItem[]>(() => {
    return sancoes.filter((s) => {
      if (!matchesSearchSancao(s, querySancao)) return false;
      if (origemFiltro !== "todas" && (s.attributes.origem ?? "") !== origemFiltro) return false;
      return true;
    });
  }, [sancoes, querySancao, origemFiltro]);

  // Reinicia as janelas ao mudar busca/filtros.
  useEffect(() => {
    setVisibleCountOrgaos(PAGE_SIZE);
  }, [query, uf]);

  useEffect(() => {
    setVisibleCountSancoes(PAGE_SIZE);
  }, [querySancao, origemFiltro]);

  // Carrega mais órgãos quando o sentinela entra na viewport.
  useEffect(() => {
    const node = sentinelOrgaosRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCountOrgaos((current) => Math.min(current + PAGE_SIZE, filteredOrgaos.length));
        }
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [filteredOrgaos.length]);

  // Carrega mais sanções quando o sentinela entra na viewport.
  useEffect(() => {
    const node = sentinelSancoesRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCountSancoes((current) => Math.min(current + PAGE_SIZE, filteredSancoes.length));
        }
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [filteredSancoes.length]);

  const visibleOrgaos = filteredOrgaos.slice(0, visibleCountOrgaos);
  const hasMoreOrgaos = visibleCountOrgaos < filteredOrgaos.length;

  const visibleSancoes = filteredSancoes.slice(0, visibleCountSancoes);
  const hasMoreSancoes = visibleCountSancoes < filteredSancoes.length;

  function clearFiltersOrgaos() {
    setQuery("");
    setUf("todas");
  }

  function clearFiltersSancoes() {
    setQuerySancao("");
    setOrigemFiltro("todas");
  }

  const hasActiveFiltersOrgaos = query !== "" || uf !== "todas";
  const hasActiveFiltersSancoes = querySancao !== "" || origemFiltro !== "todas";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Header */}
      <div>
        <span className="eyebrow">Empresas — CNPJ</span>
        <h2 className="h2" style={{ marginTop: 4 }}>
          Empresas e órgãos públicos
        </h2>
        <p className="muted small" style={{ marginTop: 4, maxWidth: 580 }}>
          Consulte qualquer CNPJ no cadastro oficial da Receita Federal e navegue pelos órgãos
          públicos contratantes e empresas sancionadas (CEIS/CNEP) já mapeadas.
        </p>
      </div>

      {/* Consulta de CNPJ */}
      <CnpjLookup sancoesPorCnpj={sancoesPorCnpj} />

      {/* ── Seção: Sanções (CEIS/CNEP) ── */}
      <div>
        <span className="eyebrow">Sanções públicas</span>
        <h3 style={{ margin: "4px 0 0", fontSize: 16, fontWeight: 800, color: "var(--t-hi)", display: "flex", alignItems: "center", gap: 8 }}>
          <ShieldAlert size={18} style={{ color: "var(--danger)" }} aria-hidden="true" />
          Empresas sancionadas — CEIS / CNEP
        </h3>
        <p className="muted small" style={{ margin: "4px 0 0", maxWidth: 560 }}>
          Empresas e pessoas físicas com sanções no Cadastro de Empresas Inidôneas e Suspensas (CEIS)
          e no Cadastro Nacional de Empresas Punidas (CNEP), do Portal da Transparência (CGU).
        </p>
      </div>

      {/* Error banner (sanções) */}
      {errorSancoes !== null && (
        <div
          className="panel"
          style={{
            padding: "14px 18px",
            background: "color-mix(in srgb, var(--danger) 10%, var(--surface))",
            border: "1px solid color-mix(in srgb, var(--danger) 28%, transparent)",
            color: "var(--danger)",
            fontSize: 13.5,
            fontWeight: 600,
          }}
          role="alert"
        >
          Erro ao carregar sanções: {errorSancoes}
        </div>
      )}

      {/* Filter bar (sanções) */}
      <div className="panel" style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="searchbar">
          <Search size={16} style={{ color: "var(--t-low)", flexShrink: 0 }} aria-hidden="true" />
          <input
            value={querySancao}
            onChange={(e) => setQuerySancao(e.target.value)}
            placeholder="Buscar por nome, CNPJ, tipo de sanção ou órgão sancionador…"
            aria-label="Buscar sanções"
          />
          {querySancao !== "" && (
            <button
              className="btn btn--icon btn--ghost btn--sm"
              style={{ width: 28, height: 28, flexShrink: 0 }}
              onClick={() => setQuerySancao("")}
              type="button"
              aria-label="Limpar busca"
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>
        {origemOptions.length > 1 && (
          <div className="row wrap" style={{ gap: 10 }}>
            <FilterSelect
              label="Origem"
              value={origemFiltro}
              options={origemOptions}
              onChange={setOrigemFiltro}
            />
          </div>
        )}
      </div>

      {/* Count row (sanções) */}
      {!isLoadingSancoes && errorSancoes === null && sancoes.length > 0 && (
        <div className="row between wrap" style={{ gap: 8 }}>
          <span style={{ fontSize: 13, color: "var(--t-mid)" }}>
            <b className="num" style={{ color: "var(--t-hi)", fontVariantNumeric: "tabular-nums" }}>
              {filteredSancoes.length}
            </b>{" "}
            {filteredSancoes.length === 1 ? "sanção encontrada" : "sanções encontradas"}
            {filteredSancoes.length > visibleSancoes.length ? ` · mostrando ${visibleSancoes.length}` : ""}
          </span>
          {hasActiveFiltersSancoes && (
            <button className="btn btn--ghost btn--sm" onClick={clearFiltersSancoes} type="button">
              Limpar filtros
            </button>
          )}
        </div>
      )}

      {/* Grid sanções / states */}
      {isLoadingSancoes ? (
        <div
          className="grid"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}
          aria-busy="true"
          aria-label="Carregando sanções…"
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : errorSancoes !== null ? null : sancoes.length === 0 ? (
        <div
          className="panel"
          style={{ padding: 48, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}
        >
          <ShieldAlert size={28} style={{ color: "var(--t-low)" }} aria-hidden="true" />
          <div style={{ fontWeight: 700, fontSize: 15 }}>Nenhuma sanção disponível ainda</div>
          <p className="muted small" style={{ margin: 0, maxWidth: 360 }}>
            As sanções vêm do Portal da Transparência (CGU). Aguarde a próxima sincronização.
          </p>
        </div>
      ) : filteredSancoes.length === 0 ? (
        <EmptyState onClear={clearFiltersSancoes} label="sanção" />
      ) : (
        <>
          <div
            className="grid"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}
          >
            {visibleSancoes.map((sancao) => (
              <SancaoCard key={sancao.id} sancao={sancao} />
            ))}
          </div>
          {hasMoreSancoes && (
            <div
              ref={sentinelSancoesRef}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: 20,
                color: "var(--t-mid)",
                fontSize: 13,
              }}
              aria-hidden="true"
            >
              <Loader2 size={16} className="spin" />
              Carregando mais sanções…
            </div>
          )}
        </>
      )}

      {/* ── Seção: Órgãos públicos conhecidos ── */}
      <div style={{ marginTop: 8 }}>
        <span className="eyebrow">Órgãos públicos conhecidos</span>
        <h3 style={{ margin: "4px 0 0", fontSize: 16, fontWeight: 800, color: "var(--t-hi)" }}>
          Órgãos contratantes (derivados do PNCP)
        </h3>
        <p className="muted small" style={{ margin: "4px 0 0", maxWidth: 560 }}>
          Órgãos públicos distintos extraídos das licitações já coletadas, com CNPJ, UF e quantas
          licitações vimos de cada um.
        </p>
      </div>

      {/* Error banner */}
      {errorOrgaos !== null && (
        <div
          className="panel"
          style={{
            padding: "14px 18px",
            background: "color-mix(in srgb, var(--danger) 10%, var(--surface))",
            border: "1px solid color-mix(in srgb, var(--danger) 28%, transparent)",
            color: "var(--danger)",
            fontSize: 13.5,
            fontWeight: 600,
          }}
          role="alert"
        >
          Erro ao carregar dados: {errorOrgaos}
        </div>
      )}

      {/* Filter bar (órgãos) */}
      <div className="panel" style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="searchbar">
          <Search size={16} style={{ color: "var(--t-low)", flexShrink: 0 }} aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar órgão por nome, CNPJ ou UF…"
            aria-label="Buscar órgãos públicos"
          />
          {query !== "" && (
            <button
              className="btn btn--icon btn--ghost btn--sm"
              style={{ width: 28, height: 28, flexShrink: 0 }}
              onClick={() => setQuery("")}
              type="button"
              aria-label="Limpar busca"
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>
        {ufOptions.length > 1 && (
          <div className="row wrap" style={{ gap: 10 }}>
            <FilterSelect label="UF" value={uf} options={ufOptions} onChange={setUf} />
          </div>
        )}
      </div>

      {/* Count row */}
      {!isLoadingOrgaos && errorOrgaos === null && orgaos.length > 0 && (
        <div className="row between wrap" style={{ gap: 8 }}>
          <span style={{ fontSize: 13, color: "var(--t-mid)" }}>
            <b className="num" style={{ color: "var(--t-hi)", fontVariantNumeric: "tabular-nums" }}>
              {filteredOrgaos.length}
            </b>{" "}
            {filteredOrgaos.length === 1 ? "órgão encontrado" : "órgãos encontrados"}
            {filteredOrgaos.length > visibleOrgaos.length ? ` · mostrando ${visibleOrgaos.length}` : ""}
          </span>
          {hasActiveFiltersOrgaos && (
            <button className="btn btn--ghost btn--sm" onClick={clearFiltersOrgaos} type="button">
              Limpar filtros
            </button>
          )}
        </div>
      )}

      {/* Grid / states */}
      {isLoadingOrgaos ? (
        <div
          className="grid"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}
          aria-busy="true"
          aria-label="Carregando órgãos…"
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : errorOrgaos !== null ? null : orgaos.length === 0 ? (
        <div
          className="panel"
          style={{ padding: 48, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}
        >
          <Landmark size={28} style={{ color: "var(--t-low)" }} aria-hidden="true" />
          <div style={{ fontWeight: 700, fontSize: 15 }}>Nenhum órgão público disponível ainda</div>
          <p className="muted small" style={{ margin: 0, maxWidth: 360 }}>
            Os órgãos são derivados das licitações do PNCP. Assim que a coleta rodar, eles aparecem aqui.
          </p>
        </div>
      ) : filteredOrgaos.length === 0 ? (
        <EmptyState onClear={clearFiltersOrgaos} label="órgão" />
      ) : (
        <>
          <div
            className="grid"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}
          >
            {visibleOrgaos.map((orgao) => (
              <OrgaoCard key={orgao.id} orgao={orgao} />
            ))}
          </div>
          {hasMoreOrgaos && (
            <div
              ref={sentinelOrgaosRef}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: 20,
                color: "var(--t-mid)",
                fontSize: 13,
              }}
              aria-hidden="true"
            >
              <Loader2 size={16} className="spin" />
              Carregando mais órgãos…
            </div>
          )}
        </>
      )}
    </div>
  );
}
