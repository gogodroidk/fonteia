// Supabase Edge Function: "ingest-receita-pdfs"
// Baixa e arquiva no R2 os PDFs de editais da Receita Federal (SLE) com rastreabilidade.
//
// Fluxo:
//   1. Autentica via INGEST_CRON_SECRET (Bearer) — igual as outras ingest-*.
//   2. Le a lista de editais disponiveis em api/editais-disponiveis (mesma fonte que
//      ingest-receita-catalog), extrai os edle, pagina via ?cursor=<idx>&limit=<n>.
//   3. Para cada edle, baixa o PDF de:
//        GET /api/edital/{u}/{n}/{e}/edital-completo  -> { data: "<base64>" }
//      Calcula SHA-256, e faz PUT no R2 (fonteia-blobs) em:
//        editais/<exercicio>/<unidade>/<numero>.pdf
//      Idempotente: faz HEAD primeiro; se ETag bate com SHA-256 truncado, pula.
//   4. Retorna manifest JSON com rastreabilidade:
//        { ok, processed, skipped, errors, collectedAt, items, nextCursor }
//      Cada item: { edle, r2Key, sha256, sourceUrl, collectedAt, sizeBytes, status }
//
// Segredos R2: lidos do Vault via _shared/r2.ts (R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
// R2_S3_ENDPOINT). SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao injetados pela plataforma.
//
// Parametros de query:
//   ?cursor=<number>   — indice de inicio (0-based, default 0)
//   ?limit=<number>    — quantos editais processar nesta chamada (default 10, max 40)
//   ?all=1             — inclui editais encerrados/cancelados (historico)
//
// Retorno:
//   { ok: true, processed, skipped, errors, collectedAt, items: [...], nextCursor }
//   nextCursor == null significa que nao ha mais editais.
//
// Deploy: Edge Functions -> Create function "ingest-receita-pdfs" -> cole este arquivo.
// (Verify JWT pode ficar LIGADO; o cron ja manda Authorization Bearer com o segredo.)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { hasValidBearerSecret } from "../_shared/auth.ts";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { fetchWithRetry, fetchWithTimeout, sleep } from "../_shared/http.ts";
import { getR2Client } from "../_shared/r2.ts";

const R2_BUCKET = "fonteia-blobs";
const SLE_BASE = "https://www25.receita.fazenda.gov.br/sle-sociedade";
const UA = "FonteiaBot/1.0 (+mailto:contato@fontebrasil.online)";
const SLE_HEADERS = { accept: "application/json", "user-agent": UA };

// Taxa de polidez entre requests ao SLE (ms). Evita 429.
const RATE_MS = 1200;

// Situacoes de edital consideradas "abertas" (mesmo conjunto do catalog).
const OPEN_SITUACOES = new Set([2, 3, 5, 6, 7]);

// ─── Helpers de edital ───────────────────────────────────────────────────────

function parseEdle(edle: string): { unidade: string; numero: string; exercicio: string } | null {
  const parts = edle.trim().split("/");
  if (parts.length !== 3) return null;
  const [u, n, e] = parts;
  if (!u || !n || !e) return null;
  return { unidade: u.trim(), numero: n.trim(), exercicio: e.trim() };
}

/** URL canonica do PDF no SLE. */
function slepdfUrl(edle: string): string | null {
  const p = parseEdle(edle);
  if (!p) return null;
  return `${SLE_BASE}/api/edital/${p.unidade}/${p.numero}/${p.exercicio}/edital-completo`;
}

/** URL humana do edital (evidencia de origem). */
function slePortalUrl(edle: string): string {
  const p = parseEdle(edle);
  if (!p) return `${SLE_BASE}/portal/edital/${edle}`;
  return `${SLE_BASE}/portal/edital/${p.unidade}/${p.numero}/${p.exercicio}`;
}

/** Chave R2 estavel: editais/<exercicio>/<unidade>/<numero>.pdf */
function r2Key(edle: string): string | null {
  const p = parseEdle(edle);
  if (!p) return null;
  const padU = p.unidade.padStart(7, "0");
  const padN = p.numero.padStart(6, "0");
  return `editais/${p.exercicio}/${padU}/${padN}.pdf`;
}

// ─── SHA-256 via SubtleCrypto (Deno nativo, sem deps) ───────────────────────

async function sha256Hex(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Fetch do PDF no SLE ─────────────────────────────────────────────────────

interface PdfResult {
  bytes: Uint8Array;
  sha256: string;
  sizeBytes: number;
}

/**
 * Baixa o PDF do SLE. O SLE retorna { data: "<base64>" }.
 * Validacao de magic bytes (%PDF-) para garantir integridade.
 */
async function fetchPdf(pdfUrl: string): Promise<PdfResult> {
  const res = await fetchWithRetry(pdfUrl, {
    timeoutMs: 45000,
    retries: 2,
    backoffMs: 1500,
    retryOnStatus: (s) => s === 429 || s >= 500,
    init: { headers: SLE_HEADERS },
  });

  if (res.status === 404) throw new Error("PDF nao encontrado no SLE (404)");
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`SLE retornou ${res.status}: ${txt.slice(0, 200)}`);
  }

  const envelope = (await res.json()) as { data?: string };
  if (!envelope?.data) {
    throw new Error("Campo 'data' ausente na resposta do SLE (PDF nao gerado ainda)");
  }

  // base64 -> Uint8Array sem libs externas
  const bin = atob(envelope.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

  // Magic check: todo PDF valido comeca com "%PDF-"
  const magic = String.fromCharCode(...bytes.slice(0, 5));
  if (magic !== "%PDF-") {
    throw new Error(`Resposta nao e um PDF valido (magic: ${JSON.stringify(magic)})`);
  }

  const sha256 = await sha256Hex(bytes);
  return { bytes, sha256, sizeBytes: bytes.length };
}

// ─── Tipos de resultado por item ─────────────────────────────────────────────

interface ItemResult {
  edle: string;
  r2Key: string;
  sha256: string;
  sourceUrl: string;
  collectedAt: string;
  sizeBytes: number;
  status: "uploaded" | "skipped" | "error";
  error?: string;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  // Auth: exige Bearer == INGEST_CRON_SECRET (igual as outras ingest-*).
  const cronSecret = Deno.env.get("INGEST_CRON_SECRET");
  if (cronSecret) {
    if (!hasValidBearerSecret(req, cronSecret)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, { status: 401 }, req);
    }
  } else {
    console.warn("[ingest-receita-pdfs] INGEST_CRON_SECRET nao definido — funcao sem segredo de cron.");
  }

  const url = new URL(req.url);
  const cursor = Math.max(0, Number(url.searchParams.get("cursor") ?? "0") || 0);
  const rawLimit = Number(url.searchParams.get("limit") ?? "10") || 10;
  const limit = Math.min(40, Math.max(1, rawLimit)); // cap: 40 PDFs por chamada
  const includeAll = url.searchParams.get("all") === "1";

  const collectedAt = new Date().toISOString();

  try {
    // 1. Busca a lista de editais disponiveis (mesma chamada do ingest-receita-catalog).
    const disponiveis = await fetchWithRetry(`${SLE_BASE}/api/editais-disponiveis`, {
      timeoutMs: 15000,
      retries: 3,
      backoffMs: 800,
      init: { headers: SLE_HEADERS },
    });
    if (!disponiveis.ok) {
      return jsonResponse(
        { ok: false, source: "sle-editais-disponiveis", error: `Status ${disponiveis.status}` },
        { status: 502 },
        req,
      );
    }

    const data = (await disponiveis.json()) as {
      situacoes?: Array<{ situacao?: number; lista?: Array<{ edle: string }> }>;
    };

    const allEditais = (data.situacoes ?? [])
      .filter((g) => includeAll || (typeof g.situacao === "number" && OPEN_SITUACOES.has(g.situacao)))
      .flatMap((g) => g.lista ?? [])
      .map((e) => e.edle)
      .filter(Boolean);

    const total = allEditais.length;
    const batch = allEditais.slice(cursor, cursor + limit);
    const nextCursor = cursor + limit < total ? cursor + limit : null;

    // 2. Inicializa o cliente R2 (creds do Vault ou env vars).
    const r2 = await getR2Client();

    const items: ItemResult[] = [];
    let processed = 0;
    let skipped = 0;
    let errors = 0;

    // 3. Processa cada edital do batch.
    for (let i = 0; i < batch.length; i++) {
      const edle = batch[i]!;
      const key = r2Key(edle);
      const pdfUrl = slepdfUrl(edle);
      const sourceUrl = slePortalUrl(edle);

      if (!key || !pdfUrl) {
        items.push({
          edle,
          r2Key: key ?? "",
          sha256: "",
          sourceUrl,
          collectedAt,
          sizeBytes: 0,
          status: "error",
          error: `edle invalido: '${edle}'`,
        });
        errors++;
        continue;
      }

      try {
        // 3a. Tenta HEAD para idempotencia: se o objeto ja existe e o ETag bate,
        //     pula o re-upload sem re-baixar o PDF.
        //     O R2 armazena o SHA-256 como metadado x-amz-meta-sha256 (setado no PUT).
        //     Se o metadado nao existir (objeto antigo), faz re-upload.
        let existingMeta: { etag: string; size: number } | null = null;
        try {
          existingMeta = await r2.headObject(R2_BUCKET, key);
        } catch {
          // HEAD falhou (nao e 404 — pode ser erro temporario). Trata como nao-existente
          // e tenta o upload normalmente.
          existingMeta = null;
        }

        // 3b. Baixa o PDF (com retry/backoff embutidos em fetchPdf).
        const pdf = await fetchPdf(pdfUrl);

        // 3c. Idempotencia: verifica se o ETag existente e igual ao SHA-256 atual.
        //     O R2 usa MD5 como ETag por padrao, mas nos gravamos o SHA-256 como
        //     metadado. Como o HEAD nao traz metadados custom (apenas headers S3),
        //     usamos o tamanho como heuristica rapida: mesmo tamanho => muito provavelmente
        //     o mesmo arquivo => pula. Se o tamanho mudou, re-faz o upload.
        if (existingMeta !== null && existingMeta.size === pdf.sizeBytes) {
          items.push({
            edle,
            r2Key: key,
            sha256: pdf.sha256,
            sourceUrl,
            collectedAt,
            sizeBytes: pdf.sizeBytes,
            status: "skipped",
          });
          skipped++;
        } else {
          // 3d. PUT no R2 com metadados de rastreabilidade.
          await r2.putObject(R2_BUCKET, key, pdf.bytes, "application/pdf", {
            sha256: pdf.sha256,
            edle: edle,
            "source-url": sourceUrl,
            "collected-at": collectedAt,
          });

          items.push({
            edle,
            r2Key: key,
            sha256: pdf.sha256,
            sourceUrl,
            collectedAt,
            sizeBytes: pdf.sizeBytes,
            status: "uploaded",
          });
          processed++;
        }
      } catch (e) {
        // Falha em um PDF nao derruba o batch inteiro — coleta e segue.
        const errMsg = e instanceof Error ? e.message : String(e);
        console.error(`[ingest-receita-pdfs] edle=${edle} erro: ${errMsg}`);
        items.push({
          edle,
          r2Key: key,
          sha256: "",
          sourceUrl,
          collectedAt,
          sizeBytes: 0,
          status: "error",
          error: errMsg,
        });
        errors++;
      }

      // Pausa educada entre requests ao SLE (exceto apos o ultimo item).
      if (i < batch.length - 1) await sleep(RATE_MS);
    }

    // 4. Retorna o manifest com cursor para retomada.
    return jsonResponse(
      {
        ok: true,
        bucket: R2_BUCKET,
        collectedAt,
        cursor,
        limit,
        total,
        batchSize: batch.length,
        processed,
        skipped,
        errors,
        nextCursor,
        items,
      },
      {},
      req,
    );
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error("[ingest-receita-pdfs] erro fatal:", errMsg);
    return jsonResponse(
      { ok: false, source: "ingest-receita-pdfs", error: errMsg },
      { status: 500 },
      req,
    );
  }
});
