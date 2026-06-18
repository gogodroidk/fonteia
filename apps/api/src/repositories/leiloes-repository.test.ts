import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { SAMPLE_LEILAO_LOTS } from "../routes/leiloes";
import { createPostgresLeiloesRepository, normalizeListLotsOptions } from "./leiloes-repository";

type RecordedQuery = { sql: string; values?: unknown[] };

function respondTo(sql: string) {
  if (sql.includes("RETURNING id")) {
    return { rows: [{ id: "raw-record-id" }], rowCount: 1 };
  }

  return { rows: [], rowCount: 0 };
}

/**
 * Records queries issued on both the pool and on clients checked out via
 * `connect()`, so we can assert the upsert path runs inside a transaction.
 */
function createRecordingPool() {
  const queries: RecordedQuery[] = [];
  let released = false;

  const record = (sql: string, values?: unknown[]) => {
    queries.push(values ? { sql, values } : { sql });
    return respondTo(sql);
  };

  const pool = {
    async query(sql: string, values?: unknown[]) {
      return record(sql, values);
    },
    async connect() {
      return {
        async query(sql: string, values?: unknown[]) {
          return record(sql, values);
        },
        release() {
          released = true;
        },
      };
    },
  } as unknown as Pool;

  return { pool, queries, wasReleased: () => released };
}

describe("Postgres leiloes repository", () => {
  it("persists raw records, normalized entities and evidence inside a transaction", async () => {
    const { pool, queries, wasReleased } = createRecordingPool();
    const repository = createPostgresLeiloesRepository(pool);

    await repository.upsertLots?.([SAMPLE_LEILAO_LOTS[0]!]);

    const sqls = queries.map((query) => query.sql.trim());

    expect(sqls[0]).toBe("BEGIN");
    expect(sqls.at(-1)).toBe("COMMIT");
    expect(queries.some((query) => query.sql.includes("INSERT INTO raw_records"))).toBe(true);
    expect(queries.some((query) => query.sql.includes("INSERT INTO entities"))).toBe(true);
    expect(queries.some((query) => query.sql.includes("INSERT INTO evidence"))).toBe(true);
    expect(JSON.stringify(queries)).toContain("sha256:");
    expect(JSON.stringify(queries)).toContain("receita-leiloes-sle");
    expect(wasReleased()).toBe(true);
  });

  it("rolls back and releases the client when a write fails", async () => {
    const queries: RecordedQuery[] = [];
    let released = false;

    const pool = {
      async connect() {
        return {
          async query(sql: string, values?: unknown[]) {
            queries.push(values ? { sql, values } : { sql });
            if (sql.includes("INSERT INTO entities")) {
              throw new Error("boom");
            }
            return respondTo(sql);
          },
          release() {
            released = true;
          },
        };
      },
    } as unknown as Pool;

    const repository = createPostgresLeiloesRepository(pool);

    await expect(repository.upsertLots?.([SAMPLE_LEILAO_LOTS[0]!])).rejects.toThrow("boom");
    expect(queries.some((query) => query.sql.trim() === "ROLLBACK")).toBe(true);
    expect(queries.some((query) => query.sql.trim() === "COMMIT")).toBe(false);
    expect(released).toBe(true);
  });

  it("issues a bounded LIMIT/OFFSET query when listing lots", async () => {
    const { pool, queries } = createRecordingPool();
    const repository = createPostgresLeiloesRepository(pool);

    await repository.listLots({ limit: 99999, offset: 5 });

    const listQuery = queries.find((query) => query.sql.includes("FROM entities WHERE kind"));
    expect(listQuery).toBeDefined();
    expect(listQuery?.sql).toContain("LIMIT $2 OFFSET $3");
    // limit clamped to MAX_LOTS_LIMIT (200), offset preserved.
    expect(listQuery?.values).toEqual(["auction_lot", 200, 5]);
  });

  it("clamps pagination options into safe bounds", () => {
    expect(normalizeListLotsOptions()).toEqual({ limit: 50, offset: 0 });
    expect(normalizeListLotsOptions({ limit: 99999, offset: -3 })).toEqual({ limit: 200, offset: 0 });
    expect(normalizeListLotsOptions({ limit: 10, offset: 20 })).toEqual({ limit: 10, offset: 20 });
    expect(normalizeListLotsOptions({ limit: 0 })).toEqual({ limit: 50, offset: 0 });
  });
});
