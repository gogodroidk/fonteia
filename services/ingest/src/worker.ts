/// <reference types="@cloudflare/workers-types" />
import {
  fetchReceitaLeiloesDestaquesWithCache,
  type ReceitaLeilaoLot,
} from "@fonteia/sources";

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  RECEITA_CACHE: KVNamespace;
}

const SOURCE_ID = "receita-leiloes-sle";

function supabaseHeaders(env: Env): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Prefer: "return=representation",
  };
}

async function supabaseFetch(
  env: Env,
  path: string,
  init: RequestInit,
): Promise<Response> {
  const url = `${env.SUPABASE_URL}/rest/v1${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      ...supabaseHeaders(env),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase ${init.method ?? "GET"} ${path} failed [${res.status}]: ${body}`);
  }
  return res;
}

async function ensureSource(env: Env): Promise<void> {
  await supabaseFetch(env, "/sources", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      id: SOURCE_ID,
      name: "Receita Federal - Sistema de Leilao Eletronico",
      owner: "Receita Federal do Brasil",
      source_url: "https://www25.receita.fazenda.gov.br/sle-sociedade/portal/editais-disponiveis",
      docs_url: "https://www.gov.br/receitafederal/pt-br/assuntos/leilao",
      status: "fragile_operational",
      access_kind: "open",
      reliability: "official_fragile",
      modules: ["leiloes"],
      refresh_cadence: "daily",
      commercial_risk: "medium",
      notes: "Portal publico oficial. Endpoint operacional nao documentado; usar cache e fallback.",
    }),
  });
}

async function createSourceRun(env: Env, recordsSeen: number): Promise<string> {
  const res = await supabaseFetch(env, "/source_runs", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      source_id: SOURCE_ID,
      status: "running",
      started_at: new Date().toISOString(),
      records_seen: recordsSeen,
    }),
  });
  const rows = (await res.json()) as Array<{ id: string }>;
  const id = rows[0]?.id;
  if (!id) throw new Error("Could not create source_run — no id returned");
  return id;
}

async function updateSourceRun(
  env: Env,
  sourceRunId: string,
  status: "success" | "failed",
  recordsInserted: number,
  errorMessage?: string,
): Promise<void> {
  await supabaseFetch(env, `/source_runs?id=eq.${sourceRunId}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      status,
      finished_at: new Date().toISOString(),
      records_inserted: recordsInserted,
      ...(errorMessage ? { error_message: errorMessage } : {}),
    }),
  });
}

async function sha256Hex(value: unknown): Promise<string> {
  const data = new TextEncoder().encode(JSON.stringify(value));
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return "sha256:" + hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Idempotência multi-tabela no PostgREST:
//   O PostgREST NÃO abre transação que abranja vários requests HTTP — cada UPSERT
//   abaixo (raw_records, entities, evidence) é commitado isoladamente. Não há
//   rollback conjunto: se um passo posterior falhar, os anteriores permanecem.
//   Isso é aceitável aqui porque CADA upsert é idempotente por uma chave natural
//   (unique index parcial em 0001_core_schema.sql), então uma re-execução do cron
//   converge para o mesmo estado sem duplicar linhas:
//     - raw_records: on_conflict=(source_id,external_id)  (idx_raw_records_source_external_unique)
//     - entities   : on_conflict=(external_ids->>'receitaLotId')  (idx_entities_auction_lot_receita_unique;
//                    semanticamente a chave natural é (kind, external_id) para auction_lot)
//     - evidence   : on_conflict=(raw_record_id,kind)     (idx_evidence_raw_kind_unique)
//   `resolution=merge-duplicates` SEM `on_conflict` explícito faz o PostgREST cair
//   na PK, ignorando o índice natural pretendido e quebrando a deduplicação — por
//   isso os três passos declaram o on_conflict explicitamente.
async function persistLot(env: Env, lot: ReceitaLeilaoLot, sourceRunId: string): Promise<void> {
  const contentHash = await sha256Hex(lot.raw);

  // UPSERT raw_records — conflito na chave natural (source_id, external_id).
  const rawRes = await supabaseFetch(env, "/raw_records?on_conflict=source_id,external_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      source_id: lot.sourceId,
      source_run_id: sourceRunId,
      source_url: lot.sourceUrl,
      external_id: lot.id,
      payload: lot.raw,
      content_hash: contentHash,
      collected_at: lot.collectedAt,
    }),
  });
  const rawRows = (await rawRes.json()) as Array<{ id: string }>;
  const rawRecordId = rawRows[0]?.id;

  // UPSERT entities — conflito na coluna `external_id` (mapeada de external_ids->>'receitaLotId'
  // pelo unique index parcial idx_entities_auction_lot_receita_unique). A chave natural da
  // entidade é (kind, external_id): como aqui kind é sempre 'auction_lot', external_id basta.
  await supabaseFetch(env, "/entities?on_conflict=external_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      kind: "auction_lot",
      name: `Lote ${lot.lotNumber} - ${lot.city}`,
      normalized_name: `lote ${lot.lotNumber} ${lot.city}`.toLowerCase(),
      external_id: lot.id,
      external_ids: { receitaLotId: lot.id, edital: lot.edital, edle: lot.edle },
      attributes: lot,
      source_ids: [lot.sourceId],
      updated_at: new Date().toISOString(),
    }),
  });

  if (!rawRecordId) return;

  // UPSERT evidence — conflito na chave natural (raw_record_id, kind).
  await supabaseFetch(env, "/evidence?on_conflict=raw_record_id,kind", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      kind: "api_payload",
      source_id: lot.sourceId,
      source_url: lot.sourceUrl,
      collected_at: lot.collectedAt,
      raw_record_id: rawRecordId,
      quote: `Lote ${lot.lotNumber} coletado do Sistema de Leilao Eletronico da Receita Federal.`,
      path: "$.destaques[*]",
      content_hash: contentHash,
      confidence: 0.78,
    }),
  });
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`[ingest] scheduled cron triggered at ${new Date(event.scheduledTime).toISOString()}`);

    let sourceRunId: string | undefined;
    let recordsInserted = 0;

    try {
      const { lots, fromCache } = await fetchReceitaLeiloesDestaquesWithCache(env.RECEITA_CACHE);
      console.log(`[ingest] fetched ${lots.length} lots (fromCache=${fromCache})`);

      await ensureSource(env);

      sourceRunId = await createSourceRun(env, lots.length);
      console.log(`[ingest] source_run created: ${sourceRunId}`);

      for (const lot of lots) {
        await persistLot(env, lot, sourceRunId);
        recordsInserted++;
      }

      await updateSourceRun(env, sourceRunId, "success", recordsInserted);
      console.log(`[ingest] done — ${recordsInserted} records upserted`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[ingest] failed: ${message}`);

      if (sourceRunId) {
        try {
          await updateSourceRun(env, sourceRunId, "failed", recordsInserted, message);
        } catch (updateError) {
          console.error(`[ingest] also failed to update source_run status: ${updateError}`);
        }
      }

      throw error;
    }
  },
};
