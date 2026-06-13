import { useEffect, useMemo, useState } from "react";
import { Search, Sparkles } from "lucide-react";
import type { ReceitaLeilaoLot } from "@fonteia/sources";
import { lotEconomia, scoreReceitaLeilaoLot } from "@fonteia/scoring";
import type { LeilaoOpportunityScore, LotEconomia } from "@fonteia/scoring";
import { listLeilaoLots } from "../../features/leiloes/leiloes-api";
import type { LeiloesDataSource } from "../../features/leiloes/leiloes-api";
import { ScoreRing, FonteDots, riscoBadge } from "../../components/ui";
import { formatBRL, FONTES } from "../../data/leiloes-seed";

// ─── Fonte (Receita Federal) para os FonteDots ────────────────────────────────

const RFB_FONTE = FONTES.find((f) => f.id === "rfb") ?? {
  id: "rfb",
  nome: "Receita Federal do Brasil",
  sigla: "RFB",
  cor: "#1D5FE0",
};

const FONTE_DOTS_RFB = [{ sigla: RFB_FONTE.sigla, cor: RFB_FONTE.cor, nome: RFB_FONTE.nome }];

// ─── Texto / normalização (minúsculas + sem acento) ───────────────────────────

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

const STOPWORDS = new Set([
  "a", "o", "as", "os", "de", "da", "do", "das", "dos", "e", "ou", "em", "no", "na",
  "nos", "nas", "um", "uma", "para", "por", "com", "que", "quais", "qual", "tem",
  "ter", "me", "mostra", "mostre", "quero", "lote", "lotes", "leilao", "leiloes",
  "ha", "sao", "the",
]);

function tokenize(value: string): string[] {
  return normalize(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

// ─── Detecção de intenção (palavras simples, sem IA) ──────────────────────────

type SortIntent = "barato" | "desconto" | "score";

const CHEAP_WORDS = ["barato", "barata", "baratos", "baratas", "menor", "preco", "precos", "acessivel", "acessiveis", "economico", "economicos"];
const DISCOUNT_WORDS = ["desconto", "descontos", "oportunidade", "oportunidades", "abaixo", "avaliacao", "economia"];
const PF_WORDS = ["fisica", "fisicas"];

interface ParsedQuery {
  raw: string;
  tokens: string[];
  sort: SortIntent;
  onlyPf: boolean;
}

function parseQuery(raw: string): ParsedQuery {
  const norm = normalize(raw);
  const tokens = tokenize(raw);
  const has = (words: string[]) => words.some((w) => norm.includes(w));

  let sort: SortIntent = "score";
  if (has(DISCOUNT_WORDS)) sort = "desconto";
  else if (has(CHEAP_WORDS)) sort = "barato";

  // "pj"/"juridica" não restringe — todo lote PF-elegível também aceita PJ.
  const onlyPf =
    norm.includes("pessoa fisica") ||
    /(^|\s)pf(\s|$)/.test(norm) ||
    PF_WORDS.some((w) => tokens.includes(w));

  return { raw, tokens, sort, onlyPf };
}

// ─── Ranking ──────────────────────────────────────────────────────────────────

interface RankedLot {
  lot: ReceitaLeilaoLot;
  scoring: LeilaoOpportunityScore;
  economia: LotEconomia | null;
  /** Quantos termos da busca casaram no texto do lote. */
  keywordHits: number;
}

/** Texto pesquisável de um lote (cidade, órgão, edital, categoria, número). */
function lotHaystack(lot: ReceitaLeilaoLot): string {
  return normalize(
    [lot.city, lot.agency, lot.edital, lot.category ?? "", lot.displayNumber, lot.edle].join(" "),
  );
}

function rankLots(lots: ReceitaLeilaoLot[], parsed: ParsedQuery, now: Date): RankedLot[] {
  const { tokens, sort, onlyPf } = parsed;

  let pool = lots;
  if (onlyPf) {
    pool = pool.filter((lot) => lot.eligiblePersonTypes.includes("pf"));
  }

  const ranked: RankedLot[] = pool.map((lot) => {
    const haystack = lotHaystack(lot);
    const keywordHits = tokens.reduce((acc, token) => (haystack.includes(token) ? acc + 1 : acc), 0);
    return {
      lot,
      scoring: scoreReceitaLeilaoLot(lot, now),
      economia: lotEconomia(lot),
      keywordHits,
    };
  });

  // Se o usuário digitou termos de conteúdo (cidade, órgão, categoria…),
  // mostramos só os que casaram. Buscas de pura intenção (ex.: "mais barato",
  // "só pf") não têm termos de conteúdo e mantêm todo o universo elegível.
  const anyHit = ranked.some((entry) => entry.keywordHits > 0);
  const filtered = tokens.length > 0 && anyHit ? ranked.filter((entry) => entry.keywordHits > 0) : ranked;

  const byScore = (a: RankedLot, b: RankedLot) => b.scoring.score - a.scoring.score;

  filtered.sort((a, b) => {
    // Relevância textual primeiro, quando houver termos.
    if (a.keywordHits !== b.keywordHits) return b.keywordHits - a.keywordHits;

    if (sort === "barato") {
      if (a.lot.minimumBidCents !== b.lot.minimumBidCents) {
        return a.lot.minimumBidCents - b.lot.minimumBidCents;
      }
      return byScore(a, b);
    }

    if (sort === "desconto") {
      const da = a.economia?.descontoPct ?? -1;
      const db = b.economia?.descontoPct ?? -1;
      if (da !== db) return db - da;
      return byScore(a, b);
    }

    return byScore(a, b);
  });

  return filtered;
}

// ─── Formatação de prazo ──────────────────────────────────────────────────────

function formatDeadlineShort(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function daysUntil(value: string): number {
  const ms = new Date(value).getTime() - Date.now();
  if (Number.isNaN(ms)) return -1;
  return Math.ceil(ms / 86_400_000);
}

function deadlineUrgencyClass(days: number): string {
  if (days <= 0) return "t-danger";
  if (days <= 3) return "t-warn";
  return "t-mid";
}

// ─── Card de resultado ────────────────────────────────────────────────────────

interface ResultCardProps {
  entry: RankedLot;
  onOpen: () => void;
}

function ResultCard({ entry, onOpen }: ResultCardProps) {
  const { lot, scoring, economia } = entry;
  const { className: riscoClass, label: riscoLabel } = riscoBadge(scoring.label);
  const days = daysUntil(lot.proposalDeadline);
  const urgencyClass = deadlineUrgencyClass(days);
  const deadlineLabel = formatDeadlineShort(lot.proposalDeadline);
  const bidLabel = formatBRL(lot.minimumBidCents / 100);

  return (
    <article
      className="card card--hover"
      style={{ overflow: "hidden", cursor: "pointer", minWidth: 0 }}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label={`Lote ${lot.displayNumber} — ${lot.agency}, ${lot.city}`}
    >
      <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Cidade + órgão + edital */}
        <div className="row between" style={{ gap: 10, alignItems: "flex-start" }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "var(--t-hi)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {lot.city}
            </div>
            <div
              className="tiny muted"
              style={{ marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
            >
              {lot.agency}
            </div>
            <div className="tiny muted" style={{ marginTop: 1, fontFamily: "monospace" }}>
              {lot.edital}
              {lot.category ? ` · ${lot.category}` : ""}
            </div>
          </div>
          <div style={{ flexShrink: 0 }}>
            <ScoreRing value={scoring.score} size={48} />
          </div>
        </div>

        {/* Risco badge */}
        <div>
          <span className={`badge ${riscoClass}`}>{riscoLabel}</span>
        </div>

        {/* Lance mínimo + economia (só quando há avaliação confiável) */}
        <div className="row between" style={{ gap: 10, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div className="tiny muted" style={{ marginBottom: 2 }}>
              Lance mínimo
            </div>
            <div className="num" style={{ fontSize: 15, fontWeight: 800, color: "var(--t-hi)" }}>
              {bidLabel}
            </div>
          </div>
          {economia ? (
            <div style={{ textAlign: "right", minWidth: 0 }}>
              <div className="tiny muted" style={{ marginBottom: 2 }}>
                Economia
              </div>
              <div className="num" style={{ fontSize: 15, fontWeight: 800, color: "var(--ok, #16a34a)" }}>
                {formatBRL(economia.economiaCents / 100)}
                <span className="tiny" style={{ marginLeft: 6, fontWeight: 700 }}>
                  -{economia.descontoPct}%
                </span>
              </div>
            </div>
          ) : null}
        </div>

        {/* Prazo + fonte */}
        <div className="row between" style={{ gap: 6, marginTop: 2 }}>
          <div className={`tiny ${urgencyClass}`} style={{ fontWeight: 600 }}>
            {days <= 0 ? "Prazo vencido" : days === 1 ? "Vence amanhã" : `${deadlineLabel} · ${days}d`}
          </div>
          <FonteDots fontes={FONTE_DOTS_RFB} size={20} />
        </div>
      </div>
    </article>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────

type LoadState = "loading" | "ready" | "empty" | "error";

interface SearchPageProps {
  initialQuestion?: string;
  /** Quando informado, clicar num resultado seleciona o lote (rota interna). */
  onSelectLot?: ((lot: ReceitaLeilaoLot) => void) | undefined;
}

export function SearchPage({ initialQuestion, onSelectLot }: SearchPageProps = {}) {
  const [question, setQuestion] = useState(initialQuestion?.trim() ?? "");
  const [submitted, setSubmitted] = useState(initialQuestion?.trim() ?? "");
  const [lots, setLots] = useState<ReceitaLeilaoLot[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadMessage, setLoadMessage] = useState("");
  const [source, setSource] = useState<LeiloesDataSource>("empty");

  // Carrega os lotes reais uma vez.
  useEffect(() => {
    let mounted = true;
    setLoadState("loading");
    void listLeilaoLots()
      .then((result) => {
        if (!mounted) return;
        setLots(result.lots);
        setSource(result.source);
        setLoadMessage(result.message);
        setLoadState(result.lots.length > 0 ? "ready" : "empty");
      })
      .catch((error) => {
        if (!mounted) return;
        setLots([]);
        setLoadMessage(error instanceof Error ? error.message : String(error));
        setLoadState("error");
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Se a pergunta chega do dashboard, já reflete na busca.
  useEffect(() => {
    const seed = initialQuestion?.trim() ?? "";
    setQuestion(seed);
    setSubmitted(seed);
  }, [initialQuestion]);

  const parsed = useMemo(() => parseQuery(submitted), [submitted]);

  const results = useMemo(() => {
    if (loadState !== "ready") return [];
    return rankLots(lots, parsed, new Date());
  }, [lots, parsed, loadState]);

  function openLot(lot: ReceitaLeilaoLot) {
    if (onSelectLot) {
      onSelectLot(lot);
      return;
    }
    // Fallback sem reload: navega pela History API e avisa o roteador (usePathname).
    if (typeof window !== "undefined") {
      const to = `/app/lotes/${encodeURIComponent(lot.id)}`;
      if (to !== window.location.pathname) {
        window.history.pushState({}, "", to);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }
    }
  }

  function submit() {
    setSubmitted(question.trim());
  }

  const hasQuery = submitted.trim().length > 0;

  return (
    <section className="search-kw">
      <style>{searchStyles}</style>

      <div className="panel" style={{ padding: 24 }}>
        <span className="eyebrow">Busca por palavra-chave</span>
        <h2 className="h2" style={{ margin: "8px 0 4px" }}>
          Pergunte em português e encontre os lotes
        </h2>
        <p className="muted small" style={{ margin: 0, maxWidth: 560 }}>
          Busca por palavra-chave nos dados oficiais. O Raio-X com IA (resposta em texto) acende
          quando ativado.
        </p>

        <form
          className="search-kw__form"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label className="search-kw__field">
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              value={question}
              placeholder="Ex.: lotes mais baratos para pessoa física em Curitiba"
              onChange={(e) => setQuestion(e.target.value)}
              aria-label="Pergunte sobre os lotes"
              enterKeyHint="search"
            />
          </label>
          <button className="btn btn--primary search-kw__submit" type="submit">
            Buscar
          </button>
        </form>

        {/* Sugestões rápidas */}
        <div className="search-kw__chips" role="group" aria-label="Sugestões de busca">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className="chip search-kw__chip"
              onClick={() => {
                setQuestion(s);
                setSubmitted(s);
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Estados de carregamento das fontes */}
      {loadState === "loading" ? (
        <div className="panel search-kw__state" role="status">
          <span className="spinner" aria-hidden="true" />
          <span>Carregando lotes das fontes oficiais…</span>
        </div>
      ) : null}

      {loadState === "error" ? (
        <div className="panel search-kw__state search-kw__state--error" role="alert">
          Não foi possível carregar os lotes agora{loadMessage ? `: ${loadMessage}` : "."}
        </div>
      ) : null}

      {loadState === "empty" ? (
        <div className="panel search-kw__state">
          <div style={{ fontSize: 28 }} aria-hidden="true">
            🗂️
          </div>
          <strong>Nenhum lote disponível no momento</strong>
          <p className="muted small" style={{ margin: 0, maxWidth: 360 }}>
            {loadMessage || "A coleta dos leilões da Receita roda periodicamente. Volte em breve."}
          </p>
        </div>
      ) : null}

      {/* Resultados */}
      {loadState === "ready" ? (
        <>
          <div className="search-kw__resultline">
            <Sparkles size={15} aria-hidden="true" />
            <span>
              {hasQuery
                ? `${results.length} ${results.length === 1 ? "lote encontrado" : "lotes encontrados"}`
                : `${results.length} ${results.length === 1 ? "lote disponível" : "lotes disponíveis"}`}
              {source === "api" || source === "supabase" ? " · dados oficiais" : ""}
              {parsed.sort === "barato" ? " · ordenado por menor preço" : ""}
              {parsed.sort === "desconto" ? " · ordenado por maior desconto" : ""}
              {parsed.onlyPf ? " · só pessoa física" : ""}
            </span>
          </div>

          {results.length === 0 ? (
            <div className="panel search-kw__state">
              <div style={{ fontSize: 28 }} aria-hidden="true">
                🔍
              </div>
              <strong>Nenhum lote bate com essa busca</strong>
              <p className="muted small" style={{ margin: 0, maxWidth: 380 }}>
                Tente termos mais simples — uma cidade, um órgão, “mais barato” ou “pessoa física”.
                Nenhuma resposta é inventada: mostramos apenas o que existe nas fontes.
              </p>
              {hasQuery ? (
                <button
                  className="btn btn--ghost btn--sm"
                  type="button"
                  onClick={() => {
                    setQuestion("");
                    setSubmitted("");
                  }}
                >
                  Limpar busca
                </button>
              ) : null}
            </div>
          ) : (
            <div className="search-kw__grid">
              {results.map((entry) => (
                <ResultCard key={entry.lot.id} entry={entry} onOpen={() => openLot(entry.lot)} />
              ))}
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}

const SUGGESTIONS = ["mais baratos", "maior desconto", "pessoa física"];

// ─── Estilos locais (escopados — sem tocar no CSS global) ─────────────────────

const searchStyles = `
.search-kw {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  max-width: 100%;
}
.search-kw__form {
  display: flex;
  gap: 10px;
  margin-top: 16px;
  flex-wrap: wrap;
}
.search-kw__field {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1 1 240px;
  min-width: 0;
  padding: 0 12px;
  height: 46px;
  border: 1px solid var(--border, #d4d8e0);
  border-radius: var(--r-md, 10px);
  background: var(--surface, #fff);
  color: var(--t-low, #5a6473);
}
.search-kw__field input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  font-size: 15px;
  color: var(--t-hi, #0d1320);
}
.search-kw__submit {
  height: 46px;
  flex: 0 0 auto;
  min-height: 44px;
  padding: 0 20px;
}
.search-kw__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.search-kw__chip {
  cursor: pointer;
  min-height: 34px;
}
.search-kw__resultline {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 600;
  color: var(--t-low, #5a6473);
  padding: 0 2px;
}
.search-kw__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(260px, 100%), 1fr));
  gap: 16px;
}
.search-kw__state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 10px;
  padding: 40px 24px;
}
.search-kw__state--error {
  color: var(--danger, #dc2626);
}
@media (max-width: 520px) {
  .search-kw__submit {
    flex: 1 1 100%;
  }
}
`;
