import type { LeilaoOpportunityScore } from "@fonteia/scoring";
import { scoreReceitaLeilaoLot } from "@fonteia/scoring";
import type { ReceitaLeilaoLot } from "@fonteia/sources";
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
        const existing = await pool.query<{ id: string }>(
          "SELECT id FROM entities WHERE kind = $1 AND external_ids->>'receitaLotId' = $2 LIMIT 1",
          ["auction_lot", lot.id],
        );

        const values = [
          "auction_lot",
          `Lote ${lot.lotNumber} - ${lot.city}`,
          `lote ${lot.lotNumber} ${lot.city}`.toLowerCase(),
          { receitaLotId: lot.id, edital: lot.edital, edle: lot.edle },
          lot,
          [lot.sourceId],
        ];

        if (existing.rows[0]) {
          await pool.query(
            `
              UPDATE entities
              SET name = $2,
                  normalized_name = $3,
                  external_ids = $4,
                  attributes = $5,
                  source_ids = $6,
                  updated_at = now()
              WHERE id = $7
            `,
            [...values, existing.rows[0].id],
          );
          continue;
        }

        await pool.query(
          `
            INSERT INTO entities (kind, name, normalized_name, external_ids, attributes, source_ids)
            VALUES ($1, $2, $3, $4, $5, $6)
          `,
          values,
        );
      }
    },
  };
}
