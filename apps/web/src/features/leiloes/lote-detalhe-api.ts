import type { ReceitaLeilaoLot } from "@fonteia/sources";
import { getSupabasePublicConfig, trimTrailingSlash } from "../../lib/api-client";

export interface LoteItem {
  descricao: string;
  quantidade?: string | undefined;
  unidade?: string | undefined;
}

export interface LoteDetalhe {
  titulo: string | null;
  categoria: string | null;
  recinto: string | null;
  itens: LoteItem[];
  imagens: string[];
  avisos: string[];
}

interface LoteDetalheResponse {
  ok?: boolean;
  error?: string;
  titulo?: string | null;
  categoria?: string | null;
  recinto?: string | null;
  itens?: LoteItem[];
  imagens?: string[];
  avisos?: string[];
}

/**
 * Busca o detalhe rico do lote (descrição dos bens, quantidade, recinto, avisos e
 * fotos) via a Edge Function `lote-detalhe`, que faz proxy do SLE da Receita.
 * Gracioso: devolve null em qualquer falha — a página segue com os dados base.
 */
export async function fetchLoteDetalhe(
  lot: Pick<ReceitaLeilaoLot, "edle" | "edital" | "lotNumber">,
  accessToken?: string | undefined,
  fetcher: typeof fetch = fetch,
): Promise<LoteDetalhe | null> {
  const edle = lot.edle || lot.edital;
  if (!edle || !lot.lotNumber) return null;

  const { url, key } = getSupabasePublicConfig();
  const endpoint =
    `${trimTrailingSlash(url)}/functions/v1/lote-detalhe` +
    `?edle=${encodeURIComponent(edle)}&lote=${encodeURIComponent(lot.lotNumber)}`;

  // A função tem verify_jwt: a página de detalhe é logada, então mandamos o token
  // da sessão. Sem token, a chamada retorna 401 e a página segue só com os dados base.
  const bearer = accessToken && accessToken.length > 0 ? accessToken : key;

  try {
    const res = await fetcher(endpoint, {
      headers: { accept: "application/json", apikey: key, authorization: `Bearer ${bearer}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as LoteDetalheResponse;
    if (!data.ok) return null;
    return {
      titulo: data.titulo ?? null,
      categoria: data.categoria ?? null,
      recinto: data.recinto ?? null,
      itens: Array.isArray(data.itens) ? data.itens : [],
      imagens: Array.isArray(data.imagens) ? data.imagens : [],
      avisos: Array.isArray(data.avisos) ? data.avisos : [],
    };
  } catch {
    return null;
  }
}
