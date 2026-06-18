import type { LeilaoOpportunityScore } from "@fonteia/scoring";
import { scoreReceitaLeilaoLot } from "@fonteia/scoring";
import type { ReceitaLeilaoLot } from "@fonteia/sources";
import { createHash } from "node:crypto";
import type { Pool } from "pg";

export interface LeilaoLotWithScore {
  lot: ReceitaLeilaoLot;
  score: LeilaoOpportunityScore;
}

export interface ListLotsOptions {
  limit?: number;
  offset?: number;
}

export interface LeiloesRepository {
  listLots(options?: ListLotsOptions): Promise<ReceitaLeilaoLot[]>;
  getLot(lotId: string): Promise<ReceitaLeilaoLot | undefined>;
  getLotScore(lotId: string): Promise<LeilaoOpportunityScore | undefined>;
  upsertLots?(lots: ReceitaLeilaoLot[]): Promise<void>;
}

export const DEFAULT_LOTS_LIMIT = 50;
export const MAX_LOTS_LIMIT = 200;

/** Clamp client-supplied pagination into safe bounds. */
export function normalizeListLotsOptions(options: ListLotsOptions = {}): { limit: number; offset: number } {
  const rawLimit = options.limit;
  const limit =
    typeof rawLimit === "number" && Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), MAX_LOTS_LIMIT)
      : DEFAULT_LOTS_LIMIT;

  const rawOffset = options.offset;
  const offset =
    typeof rawOffset === "number" && Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;

  return { limit, offset };
}

function stableHash(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

export function createMemoryLeiloesRepository(seedLots: ReceitaLeilaoLot[]): LeiloesRepository {
  const lots = new Map(seedLots.map((lot) => [lot.id, lot]));

  return {
    async listLots(options) {
      const { limit, offset } = normalizeListLotsOptions(options);
      return [...lots.values()].slice(offset, offset + limit);
    },
    async getLot(lotId) {
      return lots.get(lotId);
    },
    async getLotScore(lotId) {
      const lot = lots.get(lotId);
      return lot ? scoreReceitaLeilaoLot(lot, new Date("2026-06-10T12:00:00-03:00")) : undefined;
    },
    async upsertLots(nextLots) {
      for (const lot of nextLots) {
        lots.set(lot.id, lot);
      }
    },
  };
}

export function createPostgresLeiloesRepository(pool: Pool): LeiloesRepository {
  return {
    async listLots(options) {
      const { limit, offset } = normalizeListLotsOptions(options);
      const result = await pool.query<{ attributes: ReceitaLeilaoLot }>(
        "SELECT attributes FROM entities WHERE kind = $1 ORDER BY updated_at DESC LIMIT $2 OFFSET $3",
        ["auction_lot", limit, offset],
      );

      return result.rows.map((row) => row.attributes);
    },
    async getLot(lotId) {
      const result = await pool.query<{ attributes: ReceitaLeilaoLot }>(
        "SELECT attributes FROM entities WHERE kind = $1 AND attributes->>'id' = $2 LIMIT 1",
        ["auction_lot", lotId],
      );

      return result.rows[0]?.attributes;
    },
    async getLotScore(lotId) {
      const lot = await this.getLot(lotId);
      return lot ? scoreReceitaLeilaoLot(lot) : undefined;
    },
    async upsertLots(lots) {
      if (lots.length === 0) {
        return;
      }

      // Wrap all three writes (raw_records, entities, evidence) for every lot in
      // a single transaction on one dedicated client so a partial failure never
      // leaves an entity without its backing raw record / evidence.
      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        for (const lot of lots) {
          const contentHash = stableHash(lot.raw);
          const rawRecord = await client.query<{ id: string }>(
            `
              INSERT INTO raw_records (source_id, source_url, external_id, payload, content_hash, collected_at)
              VALUES ($1, $2, $3, $4, $5, $6)
              ON CONFLICT (source_id, external_id)
              WHERE external_id IS NOT NULL
              DO UPDATE SET
                source_url = EXCLUDED.source_url,
                payload = EXCLUDED.payload,
                content_hash = EXCLUDED.content_hash,
                collected_at = EXCLUDED.collected_at
              RETURNING id
            `,
            [lot.sourceId, lot.sourceUrl, lot.id, lot.raw, contentHash, lot.collectedAt],
          );

          const rawRecordId = rawRecord.rows[0]?.id;

          const values = [
            "auction_lot",
            `Lote ${lot.lotNumber} - ${lot.city}`,
            `lote ${lot.lotNumber} ${lot.city}`.toLowerCase(),
            { receitaLotId: lot.id, edital: lot.edital, edle: lot.edle },
            lot,
            [lot.sourceId],
          ];

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
            values,
          );

          if (rawRecordId) {
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
        }

        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
