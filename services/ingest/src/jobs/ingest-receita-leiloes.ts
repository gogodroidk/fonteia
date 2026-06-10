import { createHash } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import {
  fetchReceitaLeiloesDestaques,
  RECEITA_LEILOES_DESTAQUES_URL,
  type ReceitaLeilaoLot,
} from "@fonteia/sources";

export interface IngestReceitaLeiloesOptions {
  pool?: Pool;
  fetcher?: typeof fetch;
  env?: NodeJS.ProcessEnv;
}

function stableHash(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function createPoolFromEnv(env: NodeJS.ProcessEnv): Pool | undefined {
  if (!env.DATABASE_URL) {
    return undefined;
  }

  return new Pool({
    connectionString: env.DATABASE_URL,
    ssl: env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
}

async function ensureReceitaSource(client: PoolClient): Promise<void> {
  await client.query(
    `
      INSERT INTO sources (id, name, owner, source_url, docs_url, status, access_kind, reliability, modules, refresh_cadence, commercial_risk, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, ARRAY['leiloes'], $9, $10, $11)
      ON CONFLICT (id) DO UPDATE
      SET source_url = EXCLUDED.source_url,
          status = EXCLUDED.status,
          updated_at = now()
    `,
    [
      "receita-leiloes-sle",
      "Receita Federal - Sistema de Leilao Eletronico",
      "Receita Federal do Brasil",
      "https://www25.receita.fazenda.gov.br/sle-sociedade/portal/editais-disponiveis",
      "https://www.gov.br/receitafederal/pt-br/assuntos/leilao",
      "fragile_operational",
      "open",
      "official_fragile",
      "daily",
      "medium",
      "Portal publico oficial. Endpoint operacional nao documentado; usar cache e fallback.",
    ],
  );
}

async function persistLot(client: PoolClient, lot: ReceitaLeilaoLot, sourceRunId: string): Promise<void> {
  const contentHash = stableHash(lot.raw);
  const rawRecord = await client.query<{ id: string }>(
    `
      INSERT INTO raw_records (source_id, source_run_id, source_url, external_id, payload, content_hash, collected_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (source_id, external_id)
      WHERE external_id IS NOT NULL
      DO UPDATE SET
        source_run_id = EXCLUDED.source_run_id,
        source_url = EXCLUDED.source_url,
        payload = EXCLUDED.payload,
        content_hash = EXCLUDED.content_hash,
        collected_at = EXCLUDED.collected_at
      RETURNING id
    `,
    [lot.sourceId, sourceRunId, lot.sourceUrl, lot.id, lot.raw, contentHash, lot.collectedAt],
  );

  const rawRecordId = rawRecord.rows[0]?.id;

  await client.query(
    `
      INSERT INTO entities (kind, name, normalized_name, external_ids, attributes, source_ids)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT ((external_ids->>'receitaLotId'))
      WHERE kind = 'auction_lot' AND external_ids ? 'receitaLotId'
      DO UPDATE SET
        name = EXCLUDED.name,
        normalized_name = EXCLUDED.normalized_name,
        external_ids = EXCLUDED.external_ids,
        attributes = EXCLUDED.attributes,
        source_ids = EXCLUDED.source_ids,
        updated_at = now()
    `,
    [
      "auction_lot",
      `Lote ${lot.lotNumber} - ${lot.city}`,
      `lote ${lot.lotNumber} ${lot.city}`.toLowerCase(),
      { receitaLotId: lot.id, edital: lot.edital, edle: lot.edle },
      lot,
      [lot.sourceId],
    ],
  );

  if (!rawRecordId) {
    return;
  }

  await client.query(
    `
      INSERT INTO evidence (kind, source_id, source_url, collected_at, raw_record_id, quote, path, content_hash, confidence)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (raw_record_id, kind)
      WHERE raw_record_id IS NOT NULL
      DO UPDATE SET
        source_url = EXCLUDED.source_url,
        collected_at = EXCLUDED.collected_at,
        quote = EXCLUDED.quote,
        path = EXCLUDED.path,
        content_hash = EXCLUDED.content_hash,
        confidence = EXCLUDED.confidence
    `,
    [
      "api_payload",
      lot.sourceId,
      lot.sourceUrl,
      lot.collectedAt,
      rawRecordId,
      `Lote ${lot.lotNumber} coletado do Sistema de Leilao Eletronico da Receita Federal.`,
      "$.destaques[*]",
      contentHash,
      0.78,
    ],
  );
}

export async function ingestReceitaLeiloesDestaques(options: IngestReceitaLeiloesOptions = {}): Promise<number> {
  const lots = await fetchReceitaLeiloesDestaques(options.fetcher);
  const createdPool = options.pool ? undefined : createPoolFromEnv(options.env ?? process.env);
  const pool = options.pool ?? createdPool;

  if (!pool) {
    return lots.length;
  }

  const client = await pool.connect();
  let sourceRunId: string | undefined;

  try {
    await client.query("BEGIN");
    await ensureReceitaSource(client);

    const sourceRun = await client.query<{ id: string }>(
      `
        INSERT INTO source_runs (source_id, status, records_seen)
        VALUES ($1, $2, $3)
        RETURNING id
      `,
      ["receita-leiloes-sle", "running", lots.length],
    );
    sourceRunId = sourceRun.rows[0]?.id;

    if (!sourceRunId) {
      throw new Error("Could not create Receita Leiloes source run");
    }

    for (const lot of lots) {
      await persistLot(client, lot, sourceRunId);
    }

    await client.query(
      `
        UPDATE source_runs
        SET status = $2,
            finished_at = now(),
            records_inserted = $3
        WHERE id = $1
      `,
      [sourceRunId, "success", lots.length],
    );

    await client.query("COMMIT");
    return lots.length;
  } catch (error) {
    await client.query("ROLLBACK");

    if (sourceRunId) {
      await pool.query(
        `
          UPDATE source_runs
          SET status = $2,
              finished_at = now(),
              error_message = $3
          WHERE id = $1
        `,
        [sourceRunId, "failed", error instanceof Error ? error.message : String(error)],
      );
    }

    throw error;
  } finally {
    client.release();
    await createdPool?.end();
  }
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  ingestReceitaLeiloesDestaques()
    .then((count) => {
      console.log(`Ingested ${count} Receita leilao destaque lots from ${RECEITA_LEILOES_DESTAQUES_URL}`);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
