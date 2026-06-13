import {
  normalizeReceitaDestaquesPayload,
  type ReceitaLeilaoLot,
  type ReceitaLeiloesDestaquesPayload,
} from "@fonteia/sources";
import { fetchJsonFromApi, getPublicEnv, trimTrailingSlash } from "../../lib/api-client";

export type LeiloesDataSource = "api" | "supabase" | "sample";

export interface LeiloesLoadResult {
  source: LeiloesDataSource;
  lots: ReceitaLeilaoLot[];
  isDemo: boolean;
  message: string;
  lastSyncedAt?: string | undefined;
  errors?: string[] | undefined;
}

export interface LeilaoLotResult extends LeiloesLoadResult {
  lot: ReceitaLeilaoLot | null;
}

interface SupabaseEntityRow {
  attributes: ReceitaLeilaoLot;
  updated_at?: string;
}

const samplePayload: ReceitaLeiloesDestaquesPayload = {
  agora: "2026-06-10 02:40",
  destaques: [
    {
      permitePF: false,
      orgao: "Receita Federal",
      cidade: "BELEM",
      edital: "0200100/0000001/2026",
      edle: "200100/1/2026",
      dtFimProposta: "2026-07-06 20:00",
      destaque: true,
      imagemDestaque: "https://storagegw.estaleiro.serpro.gov.br/sle-pro-publico/arquivos/images/sample-belem.jpg",
      numero: 136,
      lote: 136,
      valor: 4000,
    },
    {
      permitePF: true,
      orgao: "Receita Federal",
      cidade: "FORTALEZA",
      edital: "0317900/0000002/2026",
      edle: "317900/2/2026",
      dtFimProposta: "2026-06-26 21:00",
      destaque: true,
      imagemDestaque: "https://storagegw.estaleiro.serpro.gov.br/sle-pro-publico/arquivos/images/sample-fortaleza.jpg",
      numero: 250,
      lote: 216,
      valor: 118805,
    },
    {
      permitePF: true,
      orgao: "Receita Federal",
      cidade: "CURITIBA",
      edital: "0900100/0000007/2026",
      edle: "900100/7/2026",
      dtFimProposta: "2026-06-29 20:00",
      destaque: true,
      imagemDestaque: "https://storagegw.estaleiro.serpro.gov.br/sle-pro-publico/arquivos/images/sample-curitiba.jpg",
      numero: 42,
      lote: 42,
      valor: 1490,
    },
  ],
};

export const SAMPLE_LEILAO_LOTS: ReceitaLeilaoLot[] = normalizeReceitaDestaquesPayload(samplePayload);

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function fetchApiLots(fetcher: typeof fetch): Promise<ReceitaLeilaoLot[]> {
  const payload = await fetchJsonFromApi<{ lots?: ReceitaLeilaoLot[] }>("/leiloes/lotes", fetcher);

  if (!Array.isArray(payload.lots)) {
    throw new Error("API response did not include lots");
  }

  return payload.lots;
}

async function fetchApiLotById(lotId: string, fetcher: typeof fetch): Promise<ReceitaLeilaoLot> {
  const payload = await fetchJsonFromApi<ReceitaLeilaoLot>(`/leiloes/lotes/${encodeURIComponent(lotId)}`, fetcher);

  if (!payload?.id) {
    throw new Error("API response did not include a lot");
  }

  return payload;
}

async function fetchSupabaseLots(fetcher: typeof fetch): Promise<{ lots: ReceitaLeilaoLot[]; lastSyncedAt?: string | undefined }> {
  const supabaseUrl = getPublicEnv("VITE_SUPABASE_URL");
  const publishableKey = getPublicEnv("VITE_SUPABASE_PUBLISHABLE_KEY");

  if (!supabaseUrl || !publishableKey) {
    throw new Error("Supabase public environment is not configured");
  }

  const query = "entities?kind=eq.auction_lot&select=attributes,updated_at&order=updated_at.desc&limit=50";
  const response = await fetcher(`${trimTrailingSlash(supabaseUrl)}/rest/v1/${query}`, {
    headers: {
      accept: "application/json",
      apikey: publishableKey,
      authorization: `Bearer ${publishableKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase REST returned ${response.status}`);
  }

  const rows = (await response.json()) as SupabaseEntityRow[];
  const lots = rows.map((row) => row.attributes).filter((lot) => lot?.sourceId === "receita-leiloes-sle");

  return { lots, lastSyncedAt: rows.find((row) => row.updated_at)?.updated_at };
}

export async function listLeilaoLots(fetcher: typeof fetch = fetch): Promise<LeiloesLoadResult> {
  const errors: string[] = [];

  try {
    const lots = await fetchApiLots(fetcher);

    if (lots.length > 0) {
      return {
        source: "api",
        lots,
        isDemo: false,
        message: "Dados carregados pela API Fonte.ia com trilha de fonte e normalizacao do produto.",
      };
    }
  } catch (error) {
    errors.push(`API: ${toErrorMessage(error)}`);
  }

  try {
    const { lots, lastSyncedAt } = await fetchSupabaseLots(fetcher);

    if (lots.length > 0) {
      return {
        source: "supabase",
        lots,
        isDemo: false,
        message: "Dados carregados do Supabase publico com RLS e evidencias da Receita Federal.",
        lastSyncedAt,
        errors,
      };
    }
  } catch (error) {
    errors.push(`Supabase: ${toErrorMessage(error)}`);
  }

  return {
    source: "sample",
    lots: SAMPLE_LEILAO_LOTS,
    isDemo: true,
    message: "Modo demonstracao: usando amostras locais porque a API e o Supabase nao retornaram lotes ao vivo.",
    lastSyncedAt: samplePayload.agora,
    errors,
  };
}

export async function getLeilaoLotById(lotId: string, fetcher: typeof fetch = fetch): Promise<LeilaoLotResult> {
  const errors: string[] = [];

  try {
    const lot = await fetchApiLotById(lotId, fetcher);

    return {
      source: "api",
      lot,
      lots: [lot],
      isDemo: false,
      message: "Lote carregado pela API Fonte.ia.",
    };
  } catch (error) {
    errors.push(`API detail: ${toErrorMessage(error)}`);
  }

  const result = await listLeilaoLots(fetcher);
  const lot = result.lots.find((item) => item.id === lotId) ?? null;

  return {
    ...result,
    lot,
    errors: [...errors, ...(result.errors ?? [])],
    message: lot
      ? result.message
      : `Nao encontramos o lote ${lotId} nas fontes carregadas agora.`,
  };
}

export const loadLeiloesLots = listLeilaoLots;
