// apps/web/src/app/historico/page.tsx
//
// PROPOSTA (drop-in) para o repo FONTE.IA — tela "Histórico / Inteligência de Preços".
// Navega os ~56 mil lotes ENCERRADOS de `public.auction_lot_history` (46 mil arremates
// reais). Lê SÓ essa tabela (não o `entities`), então o catálogo "Lotes disponíveis"
// (carro-chefe) fica intacto. Design com as classes/tokens do design-system deles.
//
// Wiring em App.tsx: lazy import HistoricoPage, RouteKey "historico",
// pathToRoute /app/historico, NavItem e {route==="historico" && <HistoricoPage />}.

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { History, Search, ExternalLink, Loader2 } from "lucide-react";
import { formatBRL } from "../../data/leiloes-seed";
import { listHistoricoLots, type HistoricoLot, type HistoricoPage as HistoricoResult } from "../../features/leiloes/leiloes-historico-api";

const CATEGORIAS: ReadonlyArray<readonly [string, string]> = [
  ["", "Todas as categorias"],
  ["veiculo", "Veículos"],
  ["celular/acessorio", "Celulares"],
  ["eletronico/audio/video", "Eletrônicos"],
  ["informatica", "Informática"],
  ["componente eletronico", "Componentes eletrônicos"],
  ["relogio/parte", "Relógios"],
  ["videogame", "Videogame"],
  ["bebida", "Bebidas"],
  ["vestuario", "Vestuário"],
  ["bolsa/calcados", "Bolsas e calçados"],
  ["aparelho/peca mecanica", "Aparelhos/Peças"],
  ["caminhao/onibus", "Caminhões/Ônibus"],
  ["diversos", "Diversos"],
];
const UFS = ["", "PR", "SP", "DF", "RS", "RJ", "PA", "CE", "MG", "PE", "RN", "MS", "MT", "BA", "ES", "RO"];
const PAGE_SIZE = 40;
const PORTAL = "https://www25.receita.fazenda.gov.br/sle-sociedade";

function centsToBRL(c: number | null | undefined): string {
  return typeof c === "number" ? formatBRL(Math.round(c / 100)) : "—";
}
function desagio(l: HistoricoLot): number | null {
  const a = l.attributes?.["desagioRealPct"];
  if (typeof a === "number") return a;
  if (l.finalValueCents && l.appraisalCents && l.appraisalCents > 0) {
    return Math.round((1 - l.finalValueCents / l.appraisalCents) * 100);
  }
  return null;
}
function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export function HistoricoPage() {
  const [categoria, setCategoria] = useState("");
  const [uf, setUf] = useState("");
  const [cidade, setCidade] = useState("");
  const [soldOnly, setSoldOnly] = useState(true);
  const [page, setPage] = useState(0);
  const [lots, setLots] = useState<HistoricoLot[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => { setPage(0); }, [categoria, uf, cidade, soldOnly]);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    setErro(null);
    listHistoricoLots({
      categoryNorm: categoria || undefined,
      uf: uf || undefined,
      city: cidade.trim() || undefined,
      soldOnly,
      page,
      pageSize: PAGE_SIZE,
    })
      .then((r: HistoricoResult) => { if (!cancel) { setLots(r.lots); setTotal(r.total); } })
      .catch((e: unknown) => { if (!cancel) setErro(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [categoria, uf, cidade, soldOnly, page]);

  const idaRecorte = useMemo(() => {
    const ds = lots.map(desagio).filter((d): d is number => d !== null);
    return median(ds);
  }, [lots]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="fade-in" style={{ maxWidth: 1180, margin: "0 auto", padding: "8px 4px 64px" }}>
      {/* Cabeçalho */}
      <div className="eyebrow" style={{ color: "var(--accent-ink)", display: "flex", alignItems: "center", gap: 8 }}>
        <History size={14} /> INTELIGÊNCIA DE PREÇOS
      </div>
      <h1 style={{ fontSize: 26, fontWeight: 800, color: "var(--t-hi)", margin: "4px 0 4px", letterSpacing: "-.02em" }}>
        Histórico de leilões encerrados
      </h1>
      <p style={{ color: "var(--t-mid)", fontSize: 14, marginTop: 0, maxWidth: 720 }}>
        Base perene de lotes já encerrados da Receita Federal — por quanto cada categoria realmente
        saiu, o deságio sobre a avaliação e o comprador (anônimo). Dado rastreável à fonte oficial.
      </p>

      {/* KPIs do recorte */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, margin: "16px 0" }}>
        <Kpi label="Lotes no recorte" value={total.toLocaleString("pt-BR")} />
        <Kpi label="Deságio mediano (IDA)" value={idaRecorte === null ? "—" : `${idaRecorte}%`} accent />
        <Kpi label="Página" value={`${page + 1} de ${totalPages.toLocaleString("pt-BR")}`} />
      </div>

      {/* Filtros */}
      <div className="filters" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <select className="filter-select" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          {CATEGORIAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select className="filter-select" value={uf} onChange={(e) => setUf(e.target.value)}>
          {UFS.map((u) => <option key={u} value={u}>{u || "Todas as UF"}</option>)}
        </select>
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <Search size={15} style={{ position: "absolute", left: 10, color: "var(--t-low)" }} />
          <input
            className="filter-select"
            placeholder="Cidade / unidade"
            value={cidade}
            onChange={(e) => setCidade(e.target.value)}
            style={{ paddingLeft: 30, minWidth: 200 }}
          />
        </div>
        <button
          type="button"
          className={soldOnly ? "chip chip--on" : "chip"}
          onClick={() => setSoldOnly((v) => !v)}
        >
          Só vendidos
        </button>
      </div>

      {/* Resultados */}
      {erro ? (
        <div className="panel" style={{ padding: 20, color: "var(--danger)" }}>Erro ao carregar: {erro}</div>
      ) : (
        <div className="panel" style={{ overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: "var(--t-mid)", textAlign: "left" }}>
                <th style={thStyle}>Item</th>
                <th style={thStyle}>Cidade</th>
                <th style={thStyle}>Ano</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Avaliação</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Arremate</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Deságio</th>
                <th style={thStyle} />
              </tr>
            </thead>
            <tbody>
              {loading && lots.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 24, textAlign: "center", color: "var(--t-mid)" }}>
                  <Loader2 className="spin" size={18} style={{ verticalAlign: "middle" }} /> Carregando…
                </td></tr>
              ) : lots.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 24, textAlign: "center", color: "var(--t-mid)" }}>
                  Nenhum lote neste recorte.
                </td></tr>
              ) : (
                lots.map((l) => {
                  const d = desagio(l);
                  const titulo = (l.title || l.categoryRaw || "Lote").toString();
                  const ano = l.closedAt ? l.closedAt.slice(0, 4) : (l.edle?.split("/").pop() ?? "");
                  return (
                    <tr key={l.receitaLotId} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ ...tdStyle, maxWidth: 340, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={titulo}>
                        {titulo}
                      </td>
                      <td style={tdStyle}>{l.city || ""}{l.uf ? `/${l.uf}` : ""}</td>
                      <td style={tdStyle}>{ano}</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{centsToBRL(l.appraisalCents)}</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--accent-ink)" }}>{centsToBRL(l.finalValueCents)}</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {d === null ? "—" : <span style={{ color: d >= 0 ? "var(--accent-ink)" : "var(--danger)" }}>{d >= 0 ? "▼ " : "▲ "}{Math.abs(d)}%</span>}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <a href={l.sourceUrl || `${PORTAL}/portal/editais-disponiveis`} target="_blank" rel="noreferrer" style={{ color: "var(--brand-ink)" }} title="Ver no portal da Receita">
                          <ExternalLink size={15} />
                        </a>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginação */}
      {total > PAGE_SIZE && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginTop: 16 }}>
          <button className="btn btn--soft btn--sm" disabled={page === 0 || loading} onClick={() => setPage((p) => Math.max(0, p - 1))}>Anterior</button>
          <span style={{ color: "var(--t-mid)", fontSize: 13 }}>{page + 1} / {totalPages.toLocaleString("pt-BR")}</span>
          <button className="btn btn--soft btn--sm" disabled={page + 1 >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>Próxima</button>
        </div>
      )}

      <p style={{ color: "var(--t-low)", fontSize: 11.5, marginTop: 18, textAlign: "center" }}>
        Base histórica (Receita Federal SLE). Compradores anônimos por lei. ICMS/deságio são estimativas rastreáveis; nada fabricado.
      </p>
    </div>
  );
}

const thStyle: CSSProperties = { padding: "10px 12px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em", fontWeight: 600 };
const tdStyle: CSSProperties = { padding: "9px 12px", color: "var(--t-hi)" };

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="card card--pad" style={{ padding: 14 }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--t-mid)" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4, color: accent ? "var(--accent-ink)" : "var(--t-hi)", fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}
