import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { SAMPLE_LEILAO_LOTS } from "../routes/leiloes";
import { createPostgresLeiloesRepository } from "./leiloes-repository";

function createRecordingPool() {
  const queries: Array<{ sql: string; values?: unknown[] }> = [];

  const pool = {
    async query(sql: string, values?: unknown[]) {
      queries.push(values ? { sql, values } : { sql });

      if (sql.includes("RETURNING id")) {
        return { rows: [{ id: "raw-record-id" }], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    },
  } as unknown as Pool;

  return { pool, queries };
}

describe("Postgres leiloes repository", () => {
  it("persists raw records, normalized entities and evidence for each lot", async () => {
    const { pool, queries } = createRecordingPool();
    const repository = createPostgresLeiloesRepository(pool);

    await repository.upsertLots?.([SAMPLE_LEILAO_LOTS[0]!]);

    expect(queries.some((query) => query.sql.includes("INSERT INTO raw_records"))).toBe(true);
    expect(queries.some((query) => query.sql.includes("INSERT INTO entities"))).toBe(true);
    expect(queries.some((query) => query.sql.includes("INSERT INTO evidence"))).toBe(true);
    expect(JSON.stringify(queries)).toContain("sha256:");
    expect(JSON.stringify(queries)).toContain("receita-leiloes-sle");
  });
});
