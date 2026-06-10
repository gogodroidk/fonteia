import type { LeilaoOpportunityScore } from "@fonteia/scoring";
import { scoreReceitaLeilaoLot } from "@fonteia/scoring";
import type { ReceitaLeilaoLot } from "@fonteia/sources";
import { createHash } from "node:crypto";
import type { Pool } from "pg";

export interface LeilaoLotWithScore {
  lot: ReceitaLeilaoLot;
  score: LeilaoOpportunityScore;
}

export interface LeiloesRepository {
  listLots(): Promise<ReceitaLeilaoLot[]>;
  getLot(lotId: string): Promise<ReceitaLeilaoLot | undefined>;
  getLotScore(lotId: string): Promise<LeilaoOpportunityScore | undefined>;
  upsertLots?(lots: ReceitaLeilaoLot[]): Promise<void>;
}

function stableHash(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

export function createMemoryLeiloesRepository(seedLots: ReceitaLeilaoLot[]): LeiloesRepository {
  const lots = new Map(seedLots.map((lot) => [lot.id, lot]));

  return {
    async listLots() {
      return [...lots.values()];
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
    async listLots() {
      const result = await pool.query<{ attributes: ReceitaLeilaoLot }>(
        "SELECT attributes FROM entities WHERE kind = $1 ORDER BY updated_at DESC LIMIT 200",
        ["auction_lot"],
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
      for (const lot of lots) {
        const contentHash = stableHash(lot.raw);
        const rawRecord = await pool.query<{ id: string }>(
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

        await pool.query(
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
          await pool.query(
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
    },
  };
}
