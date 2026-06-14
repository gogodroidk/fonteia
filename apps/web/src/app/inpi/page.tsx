import { useState, type ReactNode } from "react";
import {
  BadgeCheck,
  Building2,
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
} from "../../features/inpi/inpi-api";
import { FonteDots } from "../../components/ui";

// ─── Constants ───────────────────────────────────────────────────────────────

// Fonte oficial das marcas/patentes: INPI. Verde-esmeralda institucional próprio.
const FONTE_DOTS_INPI = [
  { sigla: "INPI", cor: "#0E9F6E", nome: "INPI — Instituto Nacional da Propriedade Industrial" },
];

// Fonte do contexto da empresa titular: Receita Federal (via Minha Receita).
const FONTE_DOTS_RECEITA = [
  { sigla: "RF", cor: "#1D5FE0", nome: "Receita Federal — cadastro de CNPJ (via Minha Receita)" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Máscara 00.000.000/0000-00 a partir de um CNPJ de 14 dígitos (ou devolve cru). */
function formatCnpj(cnpj: string): string {
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/** Remove acentos e baixa caixa. */
function normalizeForSearch(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

/** Heurística leve: situação ativa para colorir o badge de verde. */
function isSituacaoAtiva(situacao: string): boolean {
  return normalizeForSearch(situacao).includes("ativa");
}

// ─── Card de fato (label + valor) ───────────────────────────────────────────────

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

// ─── Card de marca (usado SÓ quando houver fonte; hoje nunca renderiza) ──────────

function TrademarkCard({ marca }: { marca: InpiTrademark }) {
  return (
    <article
      className="card card--hover"
      style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}
      aria-label={`Marca — ${marca.nome}`}
    >
      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
        <div className="row between" style={{ gap: 8, alignItems: "center" }}>
          {marca.processNumber !== "" && (
            <span className="tiny muted num" style={{ fontVariantNumeric: "tabular-nums" }}>
              Processo {marca.processNumber}
            </span>
          )}
          {marca.status !== "" && <span className="badge badge--neutral">{marca.status}</span>}
        </div>
        <div style={{ fontSize: 15.5, fontWeight: 800, color: "var(--t-hi)", lineHeight: 1.3 }} title={marca.nome}>
          {marca.nome || "Marca sem nome"}
        </div>
        {marca.niceClasses.length > 0 && (
          <div className="row wrap" style={{ gap: 6 }}>
            {marca.niceClasses.map((cls) => (
              <span key={cls} className="chip" style={{ fontSize: 11.5, padding: "4px 9px" }}>
                <Tag size={11} aria-hidden="true" /> Classe {cls}
              </span>
            ))}
          </div>
        )}
        <div className="row between" style={{ gap: 6, marginTop: "auto", paddingTop: 4, alignItems: "center" }}>
          <span className="tiny muted">{marca.titularNome || formatCnpj(marca.titularCnpj)}</span>
          <FonteDots fontes={FONTE_DOTS_INPI} size={20} />
        </div>
      </div>
    </article>
  );
}

// ─── Painel honesto: marcas pendentes (sem fonte gratuita) ──────────────────────

function TrademarksPendingPanel({ inpiUrl }: { inpiUrl: string }) {
  return (
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
      <div className="row between" style={{ gap: 10, alignItems: "flex-start" }}>
        <div className="row" style={{ gap: 10, alignItems: "center", minWidth: 0 }}>
          <div
            aria-hidden="true"
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              flexShrink: 0,
              background: "color-mix(in srgb, var(--brand-ink) 12%, var(--surface))",
              color: "var(--brand-ink)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Copyright size={20} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 14.5, color: "var(--t-hi)" }}>
              Integração de marcas do INPI em andamento
            </div>
            <p className="muted small" style={{ margin: "3px 0 0", maxWidth: 520 }}>
              O INPI não disponibiliza uma API pública gratuita de busca de marcas — só a RPI
              (Revista da Propriedade Industrial) em XML semanal. Estamos avaliando a fonte oficial;
              por ora, consulte as marcas deste titular diretamente na busca oficial do INPI.
            </p>
          </div>
        </div>
        <FonteDots fontes={FONTE_DOTS_INPI} size={22} />
      </div>
      <a
        href={inpiUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn--ghost btn--sm"
        style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6 }}
      >
        Buscar marcas no INPI
        <ExternalLink size={13} aria-hidden="true" />
      </a>
    </div>
  );
}

// ─── Caixa de busca por CNPJ + resultado ────────────────────────────────────────

function InpiCnpjLookup() {
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
    <section className="panel" style={{ padding: "18px 18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="row between" style={{ gap: 8, alignItems: "flex-start" }}>
        <div>
          <span className="eyebrow">Consulta de marcas por CNPJ</span>
          <h3 style={{ margin: "4px 0 0", fontSize: 16, fontWeight: 800, color: "var(--t-hi)" }}>
            Buscar marcas pelo titular (CNPJ)
          </h3>
          <p className="muted small" style={{ margin: "4px 0 0", maxWidth: 520 }}>
            Identificamos a empresa titular no cadastro oficial da Receita Federal e abrimos o
            caminho para as marcas dela no INPI. Gratuito.
          </p>
        </div>
        <FonteDots fontes={FONTE_DOTS_INPI} size={22} />
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
            placeholder="Digite o CNPJ do titular (ex.: 00.000.000/0001-91)"
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

      {/* Resultado */}
      {result !== null && titular !== null && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Titular (contexto real da Receita) */}
          <article className="card" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="row between wrap" style={{ gap: 10, alignItems: "flex-start" }}>
              <div style={{ minWidth: 0 }}>
                <span className="eyebrow">Titular</span>
                <div style={{ fontSize: 18, fontWeight: 800, color: "var(--t-hi)", lineHeight: 1.3, marginTop: 2 }}>
                  {titular.razaoSocial}
                </div>
                {titular.nomeFantasia !== "" && (
                  <div className="muted small" style={{ marginTop: 2 }}>
                    {titular.nomeFantasia}
                  </div>
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

          {/* Marcas: lista real OU painel pendente honesto */}
          {result.trademarksPending || result.trademarks.length === 0 ? (
            <TrademarksPendingPanel inpiUrl={result.inpiBuscaUrl} />
          ) : (
            <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
              {result.trademarks.map((marca) => (
                <TrademarkCard key={marca.id} marca={marca} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ─── Painel: realidade da fonte (transparência) ─────────────────────────────────

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
        O INPI ainda não oferece uma API REST pública e gratuita de busca de marcas. Os dados
        abertos oficiais se limitam à RPI (Revista da Propriedade Industrial) em XML semanal — um
        boletim das movimentações da semana, não uma base consultável por titular. Por isso, hoje
        usamos a busca por CNPJ para identificar a empresa e encaminhar você à busca oficial do
        INPI. Quando uma fonte estável estiver disponível, as marcas aparecerão aqui automaticamente
        — sem nenhum dado fabricado nesse meio-tempo.
      </p>
      <div className="row wrap" style={{ gap: 8 }}>
        <a
          href={INPI_BUSCA_BASE}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn--ghost btn--sm"
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          Busca oficial do INPI
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

// ─── Main page ────────────────────────────────────────────────────────────────

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
          Identifique o titular pelo CNPJ no cadastro oficial da Receita Federal e siga para as
          marcas dele no INPI. A integração direta de marcas está em andamento — sem nenhum dado
          fabricado.
        </p>
      </div>

      {/* Consulta por CNPJ */}
      <InpiCnpjLookup />

      {/* Transparência da fonte */}
      <SourceRealityPanel />
    </div>
  );
}
