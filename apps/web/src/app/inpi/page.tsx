import { useState, type ReactNode } from "react";
import {
  BadgeCheck,
  Building2,
  ChevronDown,
  ChevronUp,
  Copyright,
  ExternalLink,
  Info,
  Loader2,
  MapPin,
  Search,
  Tag,
  X,
} from "lucide-react";
import {
  type InpiSearchResult,
  type InpiTrademark,
  INPI_BUSCA_BASE,
  INPI_DADOS_ABERTOS_URL,
  sanitizeCnpj,
  searchInpiByCnpj,
  fetchTrademarksByQuery,
  filterTrademarksByNiceClass,
  filterTrademarksBySituacao,
  extractNiceClasses,
  extractSituacoes,
} from "../../features/inpi/inpi-api";
import { FonteDots } from "../../components/ui";

// ─── Constantes ───────────────────────────────────────────────────────────────

const FONTE_DOTS_INPI = [
  { sigla: "INPI", cor: "#0E9F6E", nome: "INPI — Instituto Nacional da Propriedade Industrial (via RPI)" },
];

const FONTE_DOTS_RECEITA = [
  { sigla: "RF", cor: "#1D5FE0", nome: "Receita Federal — cadastro de CNPJ (via Minha Receita)" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCnpj(cnpj: string): string {
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function normalizeForSearch(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

function isSituacaoAtiva(situacao: string): boolean {
  return normalizeForSearch(situacao).includes("ativa");
}

/** Link direto para a busca de uma marca no pePI do INPI pelo número de processo. */
function inpiProcessUrl(processNumber: string): string {
  if (processNumber === "") return INPI_BUSCA_BASE;
  const num = processNumber.replace(/\D/g, "");
  // URL do pePI com o número do processo pré-preenchido.
  return `${INPI_BUSCA_BASE}?processoMarca=${encodeURIComponent(num)}`;
}

// ─── Select control (chip nativo mobile-friendly) ────────────────────────────

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
          maxWidth: 200,
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

// ─── Skeleton de carregamento ─────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="card" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }} aria-hidden="true">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div className="skeleton" style={{ height: 11, width: "28%", borderRadius: 6 }} />
        <div className="skeleton" style={{ height: 20, width: "38%", borderRadius: 999 }} />
      </div>
      <div className="skeleton" style={{ height: 15, width: "80%", borderRadius: 6 }} />
      <div className="skeleton" style={{ height: 13, width: "60%", borderRadius: 6 }} />
      <div style={{ display: "flex", gap: 6 }}>
        <div className="skeleton" style={{ height: 24, width: 70, borderRadius: 8 }} />
        <div className="skeleton" style={{ height: 24, width: 70, borderRadius: 8 }} />
      </div>
      <div className="skeleton" style={{ height: 12, width: "45%", borderRadius: 6, marginTop: 4 }} />
    </div>
  );
}

// ─── Card de fato (label + valor) ────────────────────────────────────────────

function FactItem({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
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

// ─── Card de marca ────────────────────────────────────────────────────────────

function situacaoBadgeClass(situacao: string): string {
  const s = normalizeForSearch(situacao);
  if (s.includes("vigor") || s.includes("registr") || s.includes("concedid") || s.includes("ativa")) {
    return "badge--ok";
  }
  if (s.includes("arquivad") || s.includes("extinct") || s.includes("caducid") || s.includes("cancelad") || s.includes("indeferid")) {
    return "badge--danger";
  }
  if (s.includes("examinand") || s.includes("pendente") || s.includes("aguardand") || s.includes("publicad") || s.includes("deposit")) {
    return "badge--warn";
  }
  return "badge--neutral";
}

function TrademarkCard({ marca }: { marca: InpiTrademark }) {
  const titularLabel = [marca.titularNome, marca.titularUf].filter(Boolean).join(" — ");
  const cnpjLabel = marca.titularCnpj !== "" ? formatCnpj(marca.titularCnpj) : null;

  return (
    <article
      className="card card--hover rise-in"
      style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}
      aria-label={`Marca — ${marca.nome || "sem nome"}`}
    >
      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
        {/* Processo + status */}
        <div className="row between" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {marca.processNumber !== "" && (
            <span className="tiny muted num" style={{ fontVariantNumeric: "tabular-nums" }}>
              Nº {marca.processNumber}
            </span>
          )}
          {marca.status !== "" && (
            <span className={`badge ${situacaoBadgeClass(marca.status)}`} style={{ flexShrink: 0 }}>
              {marca.status}
            </span>
          )}
        </div>

        {/* Nome da marca */}
        <div
          style={{ fontSize: 15.5, fontWeight: 800, color: "var(--t-hi)", lineHeight: 1.3 }}
          title={marca.nome}
        >
          {marca.nome || "Marca sem nome"}
        </div>

        {/* Classes NICE */}
        {marca.niceClasses.length > 0 && (
          <div className="row wrap" style={{ gap: 6 }}>
            {marca.niceClasses.map((cls) => (
              <span key={cls} className="chip" style={{ fontSize: 11.5, padding: "4px 9px" }}>
                <Tag size={11} aria-hidden="true" /> Classe {cls}
              </span>
            ))}
          </div>
        )}

        {/* Titular */}
        {(titularLabel !== "" || cnpjLabel !== null) && (
          <div style={{ fontSize: 12.5, color: "var(--t-mid)", lineHeight: 1.4 }}>
            {titularLabel !== "" && (
              <div style={{ fontWeight: 600 }}>{titularLabel}</div>
            )}
            {cnpjLabel !== null && (
              <div className="num muted" style={{ fontSize: 12, marginTop: 2 }}>{cnpjLabel}</div>
            )}
          </div>
        )}

        {/* Rodapé: fonte + link oficial */}
        <div className="row between" style={{ gap: 6, marginTop: "auto", paddingTop: 6, alignItems: "center" }}>
          <a
            href={inpiProcessUrl(marca.processNumber)}
            target="_blank"
            rel="noopener noreferrer"
            className="tiny"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              color: "var(--brand-ink)",
              fontWeight: 600,
              textDecoration: "none",
            }}
            aria-label={`Ver processo ${marca.processNumber} no INPI`}
          >
            Ver no INPI
            <ExternalLink size={11} aria-hidden="true" />
          </a>
          <FonteDots fontes={FONTE_DOTS_INPI} size={20} />
        </div>
      </div>
    </article>
  );
}

// ─── Busca principal: por nome / titular / classe ─────────────────────────────

const ALL_OPTION = "todas" as const;
type FilterAll = typeof ALL_OPTION;

function InpiNameSearch() {
  const [input, setInput] = useState("");
  const [results, setResults] = useState<InpiTrademark[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastQuery, setLastQuery] = useState<string | null>(null);
  // Filtros client-side sobre os resultados
  const [classeFilter, setClasseFilter] = useState<FilterAll | string>(ALL_OPTION);
  const [situacaoFilter, setSituacaoFilter] = useState<FilterAll | string>(ALL_OPTION);

  const canSearch = input.trim() !== "" && !isLoading;

  // Classes NICE e situações únicas extraídas dos resultados actuais
  const availableClasses = results !== null ? extractNiceClasses(results) : [];
  const availableSituacoes = results !== null ? extractSituacoes(results) : [];

  // Aplica os filtros client-side
  const filteredResults: InpiTrademark[] = (() => {
    if (results === null) return [];
    let out = filterTrademarksByNiceClass(results, classeFilter);
    out = filterTrademarksBySituacao(out, situacaoFilter);
    return out;
  })();

  const hasActiveFilters =
    classeFilter !== ALL_OPTION || situacaoFilter !== ALL_OPTION;

  function clearFilters() {
    setClasseFilter(ALL_OPTION);
    setSituacaoFilter(ALL_OPTION);
  }

  async function handleSearch() {
    const termo = input.trim();
    if (termo === "") return;
    setIsLoading(true);
    setError(null);
    setResults(null);
    setLastQuery(termo);
    setClasseFilter(ALL_OPTION);
    setSituacaoFilter(ALL_OPTION);
    try {
      const marcas = await fetchTrademarksByQuery(termo);
      setResults(marcas);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao consultar as marcas.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleClear() {
    setInput("");
    setResults(null);
    setError(null);
    setLastQuery(null);
    setClasseFilter(ALL_OPTION);
    setSituacaoFilter(ALL_OPTION);
  }

  // Opções para os selects de filtro
  const classeOptions: ReadonlyArray<readonly [string, string]> = [
    [ALL_OPTION, "Todas as classes"],
    ...availableClasses.map((c) => [c, `Classe ${c}`] as const),
  ];

  const situacaoOptions: ReadonlyArray<readonly [string, string]> = [
    [ALL_OPTION, "Todas as situações"],
    ...availableSituacoes.map((s) => [s, s] as const),
  ];

  return (
    <section
      className="panel"
      style={{ padding: "18px 18px 20px", display: "flex", flexDirection: "column", gap: 14 }}
    >
      <div className="row between" style={{ gap: 8, alignItems: "flex-start" }}>
        <div>
          <span className="eyebrow">Base RPI — INPI</span>
          <h3 style={{ margin: "4px 0 0", fontSize: 16, fontWeight: 800, color: "var(--t-hi)" }}>
            Buscar marca por nome, titular ou classe
          </h3>
          <p className="muted small" style={{ margin: "4px 0 0", maxWidth: 560 }}>
            A base vem das <strong>edições recentes da RPI</strong> (Revista da Propriedade
            Industrial do INPI) — marcas publicadas ou movimentadas nas semanas ingeridas.
            Busque pelo nome da marca, razão social do titular ou número de classe NICE
            (ex.: "35", "42").
          </p>
        </div>
        <FonteDots fontes={FONTE_DOTS_INPI} size={22} />
      </div>

      {/* Campo de busca */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSearch();
        }}
        className="row wrap"
        style={{ gap: 10, alignItems: "stretch" }}
      >
        <div className="searchbar" style={{ flex: "1 1 260px", minWidth: 0 }}>
          <Search size={16} style={{ color: "var(--t-low)", flexShrink: 0 }} aria-hidden="true" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ex.: NATURA, classe 3, João Silva…"
            aria-label="Nome da marca, titular ou classe NICE"
            autoComplete="off"
            spellCheck={false}
          />
          {input !== "" && (
            <button
              className="btn btn--icon btn--ghost btn--sm"
              style={{ width: 28, height: 28, flexShrink: 0 }}
              onClick={handleClear}
              type="button"
              aria-label="Limpar busca"
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>
        <button className="btn btn--primary" type="submit" disabled={!canSearch} style={{ flexShrink: 0 }}>
          {isLoading ? (
            <>
              <Loader2 size={16} className="spin" aria-hidden="true" />
              Buscando…
            </>
          ) : (
            <>
              <Search size={16} aria-hidden="true" />
              Buscar
            </>
          )}
        </button>
      </form>

      {/* Estado inicial */}
      {results === null && error === null && !isLoading && lastQuery === null && (
        <div
          className="fade-in"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
            padding: "28px 20px",
            borderRadius: "var(--r-md, 10px)",
            background: "color-mix(in srgb, var(--brand) 6%, var(--surface))",
            border: "1px dashed color-mix(in srgb, var(--brand-ink) 22%, var(--border))",
            textAlign: "center",
          }}
          aria-label="Aguardando busca"
        >
          <div
            aria-hidden="true"
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: "color-mix(in srgb, var(--brand-ink) 10%, var(--surface))",
              color: "var(--brand-ink)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Copyright size={26} />
          </div>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 14.5, color: "var(--t-hi)" }}>
              Digite o nome de uma marca, titular ou classe NICE para pesquisar
            </p>
            <p className="muted small" style={{ margin: "5px 0 0", maxWidth: 440 }}>
              Os resultados vêm das edições recentes da RPI do INPI ingeridas na plataforma.
              Se a marca for antiga ou ainda não publicada, consulte diretamente a busca oficial.
            </p>
          </div>
        </div>
      )}

      {/* Skeletons de carregamento */}
      {isLoading && (
        <div
          role="status"
          aria-label="Carregando marcas…"
          aria-live="polite"
          style={{ display: "flex", flexDirection: "column", gap: 10 }}
        >
          <div
            style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--t-mid)", fontSize: 13.5 }}
            aria-hidden="true"
          >
            <Loader2 size={15} className="spin" />
            Consultando a RPI do INPI…
          </div>
          <div
            className="grid"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}
            aria-hidden="true"
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </div>
      )}

      {/* Erro */}
      {error !== null && (
        <div
          className="panel fade-in"
          style={{
            padding: "12px 16px",
            background: "color-mix(in srgb, var(--danger) 10%, var(--surface))",
            border: "1px solid color-mix(in srgb, var(--danger) 28%, transparent)",
            color: "var(--danger)",
            fontSize: 13.5,
            fontWeight: 600,
          }}
          role="alert"
          aria-live="assertive"
        >
          {error}
        </div>
      )}

      {/* Resultados (com filtros) */}
      {results !== null && results.length === 0 && !isLoading && !hasActiveFilters && (
        <div
          className="fade-in"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            padding: "20px",
            borderRadius: "var(--r-md, 10px)",
            background: "var(--surface-2, var(--surface))",
            border: "1px solid var(--border)",
          }}
          role="status"
          aria-live="polite"
        >
          <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: "var(--t-hi)" }}>
            Nenhuma marca encontrada para "{lastQuery}"
          </p>
          <p className="muted small" style={{ margin: 0, maxWidth: 520 }}>
            A base cobre apenas as edições da RPI já ingeridas. Se a marca existir mas
            não aparecer, pode ser que a edição correspondente ainda não foi processada
            ou que o titular não está vinculado a esse nome. Tente a busca oficial do INPI.
          </p>
          <a
            href={INPI_BUSCA_BASE}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn--ghost btn--sm"
            style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6, marginTop: 4 }}
          >
            Buscar no pePI (INPI)
            <ExternalLink size={13} aria-hidden="true" />
          </a>
        </div>
      )}

      {results !== null && results.length > 0 && !isLoading && (
        <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {/* Barra de filtros */}
          <div className="filter-bar" style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
            <span style={{ fontSize: 12, color: "var(--t-low)", fontWeight: 600, flexShrink: 0 }}>
              Filtrar:
            </span>

            {/* Filtro por classe NICE */}
            {availableClasses.length > 0 && (
              <FilterSelect
                label="Classe NICE"
                value={classeFilter}
                options={classeOptions as ReadonlyArray<readonly [string, string]>}
                onChange={setClasseFilter}
              />
            )}

            {/* Filtro por situação */}
            {availableSituacoes.length > 1 && (
              <FilterSelect
                label="Situação"
                value={situacaoFilter}
                options={situacaoOptions as ReadonlyArray<readonly [string, string]>}
                onChange={setSituacaoFilter}
              />
            )}

            {hasActiveFilters && (
              <button
                className="btn btn--ghost btn--sm"
                type="button"
                onClick={clearFilters}
                style={{ fontSize: 12, padding: "6px 10px" }}
              >
                Limpar filtros
              </button>
            )}
          </div>

          {/* Contagem */}
          <div
            className="tiny muted"
            style={{ paddingLeft: 2 }}
            aria-live="polite"
            role="status"
          >
            {hasActiveFilters
              ? `${filteredResults.length} de ${results.length} marca${results.length !== 1 ? "s" : ""} após filtro`
              : `${results.length} marca${results.length !== 1 ? "s" : ""} encontrada${results.length !== 1 ? "s" : ""} para "${lastQuery}"${results.length === 100 ? " (limite atingido — refine a busca)" : ""}`
            }
          </div>

          {/* Nenhum resultado após filtros */}
          {filteredResults.length === 0 && (
            <div
              style={{
                padding: "16px 18px",
                borderRadius: "var(--r-md, 10px)",
                background: "var(--surface-2, var(--surface))",
                border: "1px solid var(--border)",
                fontSize: 13.5,
                color: "var(--t-mid)",
              }}
              role="status"
            >
              Nenhuma marca corresponde aos filtros selecionados.{" "}
              <button
                className="btn btn--ghost btn--sm"
                type="button"
                onClick={clearFilters}
                style={{ display: "inline", padding: "2px 6px", fontSize: 12.5 }}
              >
                Limpar filtros
              </button>
            </div>
          )}

          {/* Grade de resultados */}
          {filteredResults.length > 0 && (
            <div
              className="grid"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}
            >
              {filteredResults.map((marca) => (
                <TrademarkCard key={marca.id} marca={marca} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ─── Seção secundária: busca por CNPJ ────────────────────────────────────────

function InpiCnpjLookup() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [result, setResult] = useState<InpiSearchResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchedCnpj, setSearchedCnpj] = useState<string | null>(null);

  const digits = sanitizeCnpj(input);
  const canSearch = digits !== "" && !isLoading;

  async function handleSearch() {
    const cnpj = sanitizeCnpj(input);
    if (cnpj === "") {
      setError("CNPJ inválido: digite os 14 números (com ou sem máscara).");
      setResult(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    setResult(null);
    setSearchedCnpj(formatCnpj(cnpj));
    try {
      const res = await searchInpiByCnpj(cnpj);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao consultar o CNPJ.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleClear() {
    setInput("");
    setResult(null);
    setError(null);
    setSearchedCnpj(null);
  }

  const titular = result?.titular ?? null;
  const ativa = titular ? isSituacaoAtiva(titular.situacao) : false;

  return (
    <section
      className="panel"
      style={{ padding: "0", overflow: "hidden", display: "flex", flexDirection: "column" }}
    >
      {/* Cabeçalho colapsável */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          all: "unset",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: "14px 18px",
          width: "100%",
          boxSizing: "border-box",
        }}
        aria-expanded={open}
        aria-controls="cnpj-lookup-body"
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <Building2 size={17} style={{ color: "var(--brand-ink)", flexShrink: 0 }} aria-hidden="true" />
          <div style={{ minWidth: 0 }}>
            <span style={{ fontWeight: 700, fontSize: 14.5, color: "var(--t-hi)" }}>
              Consulta por CNPJ do titular
            </span>
            <span className="muted small" style={{ display: "block", marginTop: 2 }}>
              Limitado — o vínculo por CNPJ é raro na RPI. Usa quando o CNPJ vem embutido no nome do titular.
            </span>
          </div>
        </div>
        <div style={{ flexShrink: 0, color: "var(--t-low)" }} aria-hidden="true">
          {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
      </button>

      {/* Corpo */}
      {open && (
        <div
          id="cnpj-lookup-body"
          style={{
            padding: "0 18px 20px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
            borderTop: "1px solid var(--border)",
          }}
        >
          <p className="muted small" style={{ margin: "12px 0 0", maxWidth: 560 }}>
            O XML da RPI <strong>não traz CNPJ estruturado</strong> do titular — só razão social,
            país e UF. Esta busca só retorna marcas cujo titular trouxe o CNPJ embutido no nome
            (típico de MEI/EI). Para a maioria dos CNPJs a lista virá vazia, o que é correto.
          </p>

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
                placeholder="CNPJ do titular (ex.: 00.000.000/0001-91)"
                inputMode="numeric"
                aria-label="CNPJ do titular a consultar"
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

          {/* Resultado com titular */}
          {result !== null && titular !== null && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Titular (Receita Federal) */}
              <article className="card" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
                <div className="row between wrap" style={{ gap: 10, alignItems: "flex-start" }}>
                  <div style={{ minWidth: 0 }}>
                    <span className="eyebrow">Titular</span>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "var(--t-hi)", lineHeight: 1.3, marginTop: 2 }}>
                      {titular.razaoSocial}
                    </div>
                    {titular.nomeFantasia !== "" && (
                      <div className="muted small" style={{ marginTop: 2 }}>{titular.nomeFantasia}</div>
                    )}
                    <div className="tiny muted num" style={{ marginTop: 6, fontVariantNumeric: "tabular-nums" }}>
                      {formatCnpj(titular.cnpj)}
                    </div>
                  </div>
                  <div className="row" style={{ gap: 8, alignItems: "center" }}>
                    {titular.situacao !== "" && (
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
                        {titular.situacao}
                      </span>
                    )}
                    <FonteDots fontes={FONTE_DOTS_RECEITA} size={20} />
                  </div>
                </div>

                {(titular.municipio !== "" || titular.uf !== "") && (
                  <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                    <FactItem
                      icon={<MapPin size={13} aria-hidden="true" />}
                      label="Localização"
                      value={[titular.municipio, titular.uf].filter(Boolean).join("/") || "—"}
                    />
                  </div>
                )}

                {titular.sourceUrl !== "" && (
                  <a
                    href={titular.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tiny"
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--brand-ink)", fontWeight: 600, textDecoration: "none" }}
                  >
                    Ver dados do titular na fonte
                    <ExternalLink size={12} aria-hidden="true" />
                  </a>
                )}
              </article>

              {/* Marcas: lista real ou estado pendente */}
              {result.trademarksPending || result.trademarks.length === 0 ? (
                <div
                  className="panel"
                  style={{
                    padding: "20px 22px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    background: "color-mix(in srgb, var(--brand-ink) 5%, var(--surface))",
                    border: "1px solid color-mix(in srgb, var(--brand-ink) 18%, var(--border))",
                  }}
                >
                  <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
                    <div
                      aria-hidden="true"
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        flexShrink: 0,
                        background: "color-mix(in srgb, var(--brand-ink) 12%, var(--surface))",
                        color: "var(--brand-ink)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Copyright size={18} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "var(--t-hi)" }}>
                        Sem marcas vinculadas a este CNPJ na RPI
                      </div>
                      <p className="muted small" style={{ margin: "3px 0 0", maxWidth: 480 }}>
                        O XML da RPI não traz CNPJ estruturado do titular. A busca por CNPJ só
                        funciona quando o titular embutiu o CNPJ no próprio nome (ex.: MEI/EI).
                        Use a busca por nome acima ou consulte o pePI diretamente.
                      </p>
                    </div>
                  </div>
                  <a
                    href={result.inpiBuscaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn--ghost btn--sm"
                    style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    Buscar marcas no INPI (pePI)
                    <ExternalLink size={13} aria-hidden="true" />
                  </a>
                </div>
              ) : (
                <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
                  {result.trademarks.map((marca) => (
                    <TrademarkCard key={marca.id} marca={marca} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ─── Painel de transparência da fonte ─────────────────────────────────────────

function SourceRealityPanel() {
  return (
    <section className="panel" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="row" style={{ gap: 10, alignItems: "center" }}>
        <Info size={18} style={{ color: "var(--brand-ink)", flexShrink: 0 }} aria-hidden="true" />
        <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 800, color: "var(--t-hi)" }}>
          Sobre os dados do INPI
        </h3>
      </div>
      <p className="muted small" style={{ margin: 0, maxWidth: 640 }}>
        Esta base vem das <strong>edições recentes da RPI</strong> (Revista da Propriedade
        Industrial), publicada semanalmente pelo INPI em XML. Ela registra as marcas publicadas
        e movimentadas em cada edição — não é o cadastro completo histórico. A busca por nome
        cobre todos os registros ingeridos. O vínculo por CNPJ é limitado pela fonte: a RPI
        não traz CNPJ estruturado do titular (só razão social, país e UF), portanto a busca
        por CNPJ só funciona quando o titular inclui o CNPJ no próprio nome.
        Nenhum dado é fabricado — resultado vazio é resultado honesto.
      </p>
      <div className="row wrap" style={{ gap: 8 }}>
        <a
          href={INPI_BUSCA_BASE}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn--ghost btn--sm"
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          Busca oficial do INPI (pePI)
          <ExternalLink size={13} aria-hidden="true" />
        </a>
        <a
          href={INPI_DADOS_ABERTOS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn--ghost btn--sm"
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          Dados abertos do INPI
          <ExternalLink size={13} aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export function InpiPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Header */}
      <div>
        <span className="eyebrow">Propriedade industrial</span>
        <h2 className="h2" style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 10 }}>
          <BadgeCheck size={22} style={{ color: "var(--brand-ink)" }} aria-hidden="true" />
          Marcas e patentes (INPI)
        </h2>
        <p className="muted small" style={{ marginTop: 4, maxWidth: 600 }}>
          Busque marcas por nome, titular ou classe NICE na base das edições recentes da RPI.
          O vínculo por CNPJ é limitado pela fonte — veja o painel de dados abaixo.
        </p>
      </div>

      {/* Busca principal por nome */}
      <InpiNameSearch />

      {/* Busca secundária por CNPJ (colapsável) */}
      <InpiCnpjLookup />

      {/* Transparência da fonte */}
      <SourceRealityPanel />
    </div>
  );
}
