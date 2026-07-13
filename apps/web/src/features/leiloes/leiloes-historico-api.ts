// apps/web/src/features/leiloes/leiloes-historico-api.ts
//
// PROPOSTA (drop-in) para o repo FONTE.IA — NÃO commitada por mim.
// Objetivo: uma tela de HISTÓRICO / INTELIGÊNCIA DE PREÇOS que navega os ~56 mil
// lotes ENCERRADOS já presentes em `public.auction_lot_history` (com 46 mil arremates
// reais). NÃO usa `entities` — assim o catálogo "Lotes disponíveis" (carro-chefe,
// só lotes correntes, com teto de 10k) continua intacto.
//
// A tabela `auction_lot_history` tem `grant select` para anon/authenticated + RLS
// pública de leitura, então o front lê direto via PostgREST com a publishable key.
//
// Como usar: crie uma rota (ex.: /app/leiloes/historico) ou uma aba "Histórico" na
// página de leilões e chame `listHistoricoLots(filtro)`.

import { getSupabasePublicConfig, trimTrailingSlash } from "../../lib/api-client";

export interface HistoricoLot {
  receitaLotId: string;
  edital: string | null;
  edle: string | null;
  city: string | null;
  uf: string | null;
  categoryRaw: string | null;
  categoryNorm: string | null;
  title: string | null;
  minimumBidCents: number | null;
  appraisalCents: number | null;
  finalValueCents: number | null;   // arremate real (null se não vendido)
  outcome: "closed" | "cancelled";
  closedAt: string | null;
  sourceUrl: string;
  /** desagioRealPct, descricao, icmsEstimadoCents, categoriaFonteia... (enriquecimento). */
  attributes: Record<string, unknown>;
}

export interface HistoricoFiltro {
  categoryNorm?: string;      // ex.: "veiculo" (use fonteia_norm_text)
  city?: string;
  uf?: string;
  soldOnly?: boolean;         // só lotes com arremate
  minAppraisalCents?: number;
  maxAppraisalCents?: number;
  page?: number;              // 0-based
  pageSize?: number;          // default 50
}

interface RawRow {
  receita_lot_id: string;
  edital: string | null;
  edle: string | null;
  city: string | null;
  uf: string | null;
  category_raw: string | null;
  category_norm: string | null;
  title: string | null;
  minimum_bid_cents: number | null;
  appraisal_cents: number | null;
  final_value_cents: number | null;
  outcome: "closed" | "cancelled";
  closed_at: string | null;
  source_url: string;
  attributes: Record<string, unknown> | null;
}

const SELECT =
  "receita_lot_id,edital,edle,city,uf,category_raw,category_norm,title," +
  "minimum_bid_cents,appraisal_cents,final_value_cents,outcome,closed_at,source_url,attributes";

function buildQuery(f: HistoricoFiltro): string {
  const parts = [`select=${SELECT}`, "order=closed_at.desc.nullslast"];
  if (f.categoryNorm) parts.push(`category_norm=eq.${encodeURIComponent(f.categoryNorm)}`);
  if (f.city) parts.push(`city=ilike.*${encodeURIComponent(f.city)}*`);
  if (f.uf) parts.push(`uf=eq.${encodeURIComponent(f.uf)}`);
  if (f.soldOnly) parts.push("final_value_cents=not.is.null");
  if (typeof f.minAppraisalCents === "number") parts.push(`appraisal_cents=gte.${f.minAppraisalCents}`);
  if (typeof f.maxAppraisalCents === "number") parts.push(`appraisal_cents=lte.${f.maxAppraisalCents}`);
  return `auction_lot_history?${parts.join("&")}`;
}

function normalize(r: RawRow): HistoricoLot {
  return {
    receitaLotId: r.receita_lot_id,
    edital: r.edital,
    edle: r.edle,
    city: r.city,
    uf: r.uf,
    categoryRaw: r.category_raw,
    categoryNorm: r.category_norm,
    title: r.title,
    minimumBidCents: r.minimum_bid_cents,
    appraisalCents: r.appraisal_cents,
    finalValueCents: r.final_value_cents,
    outcome: r.outcome,
    closedAt: r.closed_at,
    sourceUrl: r.source_url,
    attributes: r.attributes ?? {},
  };
}

export interface HistoricoPage {
  lots: HistoricoLot[];
  total: number;      // total do recorte (via Content-Range)
  page: number;
  pageSize: number;
}

/** Lista paginada dos lotes históricos (encerrados), lendo `auction_lot_history`. */
export async function listHistoricoLots(
  filtro: HistoricoFiltro = {},
  fetcher: typeof fetch = fetch,
): Promise<HistoricoPage> {
  const { url, key } = getSupabasePublicConfig();
  const page = filtro.page ?? 0;
  const pageSize = filtro.pageSize ?? 50;
  const from = page * pageSize;
  const to = from + pageSize - 1;

  const res = await fetcher(`${trimTrailingSlash(url)}/rest/v1/${buildQuery(filtro)}`, {
    headers: {
      accept: "application/json",
      apikey: key,
      authorization: `Bearer ${key}`,
      Range: `${from}-${to}`,
      "Range-Unit": "items",
      Prefer: "count=exact",   // devolve total no header Content-Range
    },
  });
  if (!res.ok) throw new Error(`auction_lot_history: PostgREST ${res.status}`);

  const rows = (await res.json()) as RawRow[];
  const contentRange = res.headers.get("content-range") ?? "";
  const total = Number(contentRange.split("/")[1]) || rows.length;

  return { lots: rows.map(normalize), total, page, pageSize };
}
