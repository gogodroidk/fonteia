// Orquestrador da ingestão do catálogo COMPLETO da Receita Federal (SLE).
//
// Implementa o fluxo recomendado em docs/research/SLE_INGESTION_CONTRACT.md §7:
//   1. editais-disponiveis -> achata situacoes[].lista[]
//   2. para cada edital relevante (rate-limited): edital completo + todos os lotes
//   3. (opcional) PDF do edital como EVIDÊNCIA (base64 -> bytes -> sha256)
//
// O orquestrador é PURO: a persistência entra por uma porta (`CatalogSink`),
// o relógio por `sleep`, e a rede por `fetch`. Isso torna o miolo testável sem
// DB e adaptável a pg/Supabase/edge sem reescrever a lógica de varredura.

import {
  editalPdfApiUrl,
  fetchEditaisDisponiveis,
  fetchEditalCompleto,
  fetchEditalPdfEnvelope,
  listAllEditais,
  normalizeEditalLots,
  type ReceitaCatalogLot,
  type ReceitaEditalCompletoRaw,
  type ReceitaEditalResumoRaw,
} from "@fonteia/sources";

// Situações de edital que valem coletar (antes/durante o leilão) — enum §5.1 do contrato:
// 2 DISPONIBILIZADO, 3 ABERTO_PARA_PROPOSTA, 5/6 sessão pública (classificação),
// 7 ABERTA_SESSAO_PARA_LANCE. Encerrados/cancelados (10/14/15) ficam de fora por padrão.
export const SITUACOES_RELEVANTES: ReadonlySet<number> = new Set([2, 3, 5, 6, 7]);

export interface EditalPdfEvidence {
  bytes: Uint8Array;
  name: string;
  contentHash: string;
  sourceUrl: string;
}

/**
 * Porta de persistência — adaptável a pg/Supabase/edge. Mantém o orquestrador
 * puro e testável. Implementações concretas fazem o upsert idempotente (chave
 * natural `edle` para edital e `(edle, loleNrSq)` para lote) e gravam o PDF no
 * Storage + uma linha de `evidence` com o content_hash.
 */
export interface CatalogSink {
  upsertEdital(edital: ReceitaEditalCompletoRaw, contentHash: string, collectedAt: string): Promise<void>;
  upsertLots(lots: ReceitaCatalogLot[], collectedAt: string): Promise<number>;
  putEditalPdf(edle: string, pdf: EditalPdfEvidence, collectedAt: string): Promise<void>;
}

export interface IngestCatalogOptions {
  sink: CatalogSink;
  fetcher?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** ms de pausa entre editais (politeness do contrato §6). Default 2000. */
  rateLimitMs?: number;
  /** Situações a coletar. Default SITUACOES_RELEVANTES. */
  situacoes?: ReadonlySet<number>;
  /** Limite de editais por execução (0 = sem limite). Útil para varredura incremental. Default 0. */
  maxEditais?: number;
  /** Baixar e guardar o PDF do edital como evidência. Default true. */
  includePdf?: boolean;
  /** Logger opcional. */
  log?: (msg: string) => void;
}

export interface IngestCatalogResult {
  editaisSeen: number;
  editaisIngested: number;
  lotsUpserted: number;
  pdfsStored: number;
  errors: Array<{ edle: string; message: string }>;
}

const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

async function sha256OfString(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return `sha256:${toHex(new Uint8Array(digest))}`;
}

async function sha256OfBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.buffer as ArrayBuffer);
  return `sha256:${toHex(new Uint8Array(digest))}`;
}

/** base64 -> bytes (atob existe em Node 18+, Deno e Workers). */
export function decodeBase64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

/** Confere os magic bytes "%PDF". */
export function isPdf(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  );
}

async function fetchEditalPdfEvidence(edle: string, fetcher: typeof fetch): Promise<EditalPdfEvidence> {
  const envelope = await fetchEditalPdfEnvelope(edle, fetcher);
  const bytes = decodeBase64ToBytes(envelope.data);
  if (!isPdf(bytes)) {
    throw new Error(`edital-completo de ${edle} não começa com %PDF`);
  }
  return {
    bytes,
    name: envelope.name ?? `edital-${edle.replaceAll("/", "-")}.pdf`,
    contentHash: await sha256OfBytes(bytes),
    sourceUrl: editalPdfApiUrl(edle),
  };
}

/**
 * Varre o catálogo completo da Receita e persiste via `sink`. Idempotente:
 * cada execução re-coleta e faz upsert; mudanças/erratas viram novo content_hash.
 */
export async function ingestReceitaCatalog(options: IngestCatalogOptions): Promise<IngestCatalogResult> {
  const fetcher = options.fetcher ?? fetch;
  const sleep = options.sleep ?? realSleep;
  const rateLimitMs = options.rateLimitMs ?? 2000;
  const situacoes = options.situacoes ?? SITUACOES_RELEVANTES;
  const includePdf = options.includePdf ?? true;
  const log = options.log ?? (() => undefined);

  const result: IngestCatalogResult = {
    editaisSeen: 0,
    editaisIngested: 0,
    lotsUpserted: 0,
    pdfsStored: 0,
    errors: [],
  };

  const payload = await fetchEditaisDisponiveis(fetcher);
  const collectedAt = new Date().toISOString();

  let editais: ReceitaEditalResumoRaw[] = listAllEditais(payload).filter((edital) =>
    situacoes.has(edital.codigoSituacao),
  );
  result.editaisSeen = editais.length;

  if (options.maxEditais && options.maxEditais > 0) {
    editais = editais.slice(0, options.maxEditais);
  }

  for (let i = 0; i < editais.length; i++) {
    const edle = editais[i]!.edle;
    try {
      const edital = await fetchEditalCompleto(edle, fetcher);
      const editalHash = await sha256OfString(JSON.stringify(edital));
      await options.sink.upsertEdital(edital, editalHash, collectedAt);

      const lots = normalizeEditalLots(edital, collectedAt);
      result.lotsUpserted += await options.sink.upsertLots(lots, collectedAt);
      result.editaisIngested += 1;
      log(`[catalog] ${edle}: ${lots.length} lotes`);

      if (includePdf) {
        try {
          const pdf = await fetchEditalPdfEvidence(edle, fetcher);
          await options.sink.putEditalPdf(edle, pdf, collectedAt);
          result.pdfsStored += 1;
        } catch (pdfErr) {
          result.errors.push({ edle, message: `pdf: ${errorMessage(pdfErr)}` });
        }
      }
    } catch (err) {
      result.errors.push({ edle, message: errorMessage(err) });
      log(`[catalog] erro em ${edle}: ${errorMessage(err)}`);
    }

    // Politeness: pausa entre editais (não após o último).
    if (i < editais.length - 1 && rateLimitMs > 0) {
      await sleep(rateLimitMs);
    }
  }

  return result;
}
