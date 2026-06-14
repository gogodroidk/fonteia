import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Building2,
  CalendarDays,
  ExternalLink,
  Gavel,
  Landmark,
  Loader2,
  MapPin,
  Search,
  Users,
  X,
} from "lucide-react";
import type { OrgaoPublico } from "@fonteia/sources";
import {
  type EmpresaCnpj,
  listOrgaos,
  lookupCnpj,
  sanitizeCnpj,
} from "../../features/empresas/empresas-api";
import { FonteDots } from "../../components/ui";

// Quantos órgãos renderizar por vez (o scroll carrega mais sozinho).
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

// ─── Caixa de busca de CNPJ + perfil ───────────────────────────────────────────

function CnpjLookup() {
  const [input, setInput] = useState("");
  const [empresa, setEmpresa] = useState<EmpresaCnpj | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchedCnpj, setSearchedCnpj] = useState<string | null>(null);

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
    setSearchedCnpj(formatCnpj(cnpj));
    try {
      const result = await lookupCnpj(cnpj);
      setEmpresa(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao consultar o CNPJ.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleClear() {
    setInput("");
    setEmpresa(null);
    setError(null);
    setSearchedCnpj(null);
  }

  const ativa = empresa ? isSituacaoAtiva(empresa.situacao) : false;

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
            inputMode="numeric"
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
    </section>
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

// ─── Skeleton card (órgãos) ────────────────────────────────────────────────────

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

function EmptyState({ onClear }: { onClear: () => void }) {
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
      <div style={{ fontWeight: 700, fontSize: 15 }}>Nenhum órgão com esses filtros</div>
      <p className="muted small" style={{ margin: 0, maxWidth: 340 }}>
        Tente ampliar a busca ou trocar a UF.
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
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // ── Filter state ──
  const [query, setQuery] = useState("");
  const [uf, setUf] = useState("todas");

  // ── Paginação por scroll ──
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // ── Load órgãos ──
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setErrorMessage(null);

    listOrgaos()
      .then((result) => {
        if (cancelled) return;
        setOrgaos(result.orgaos);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : "Erro ao carregar órgãos.");
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

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

  // ── Filtered + sorted (por nome A→Z, depois mais licitações) ──
  const filtered = useMemo<OrgaoPublico[]>(() => {
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

  // Reinicia a janela ao mudar busca/filtros.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query, uf]);

  // Carrega mais quando o sentinela entra na viewport.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((current) => Math.min(current + PAGE_SIZE, filtered.length));
        }
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [filtered.length]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  function clearFilters() {
    setQuery("");
    setUf("todas");
  }

  const hasActiveFilters = query !== "" || uf !== "todas";

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
          públicos contratantes que já mapeamos a partir das licitações do PNCP.
        </p>
      </div>

      {/* Consulta de CNPJ */}
      <CnpjLookup />

      {/* Lista de órgãos públicos */}
      <div>
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
      {errorMessage !== null && (
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
          Erro ao carregar dados: {errorMessage}
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
      {!isLoading && errorMessage === null && orgaos.length > 0 && (
        <div className="row between wrap" style={{ gap: 8 }}>
          <span style={{ fontSize: 13, color: "var(--t-mid)" }}>
            <b className="num" style={{ color: "var(--t-hi)", fontVariantNumeric: "tabular-nums" }}>
              {filtered.length}
            </b>{" "}
            {filtered.length === 1 ? "órgão encontrado" : "órgãos encontrados"}
            {filtered.length > visible.length ? ` · mostrando ${visible.length}` : ""}
          </span>
          {hasActiveFilters && (
            <button className="btn btn--ghost btn--sm" onClick={clearFilters} type="button">
              Limpar filtros
            </button>
          )}
        </div>
      )}

      {/* Grid / states */}
      {isLoading ? (
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
      ) : errorMessage !== null ? null : orgaos.length === 0 ? (
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
      ) : filtered.length === 0 ? (
        <EmptyState onClear={clearFilters} />
      ) : (
        <>
          <div
            className="grid"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}
          >
            {visible.map((orgao) => (
              <OrgaoCard key={orgao.id} orgao={orgao} />
            ))}
          </div>
          {hasMore && (
            <div
              ref={sentinelRef}
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
