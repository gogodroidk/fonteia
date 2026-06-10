import { describe, expect, it } from "vitest";
import { ingestReceitaLeiloesDestaques } from "./ingest-receita-leiloes";

function createFetchResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    async json() {
      return payload;
    },
  } as Response;
}

function createRecordingPool() {
  const queries: Array<{ sql: string; values?: unknown[] }> = [];

  const client = {
    async query(sql: string, values?: unknown[]) {
      queries.push(values ? { sql, values } : { sql });

      if (sql.includes("INSERT INTO source_runs") && sql.includes("RETURNING id")) {
        return { rows: [{ id: "source-run-id" }], rowCount: 1 };
      }

      if (sql.includes("INSERT INTO raw_records") && sql.includes("RETURNING id")) {
        return { rows: [{ id: "raw-record-id" }], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    },
    release() {
      queries.push({ sql: "release" });
    },
  };

  return {
    queries,
    pool: {
      async connect() {
        return client;
      },
      async query(sql: string, values?: unknown[]) {
        queries.push(values ? { sql, values } : { sql });
        return { rows: [], rowCount: 0 };
      },
    },
  };
}

describe("Receita Leiloes ingest job", () => {
  it("fetches and persists raw records, entities, evidence and source run status", async () => {
    const { pool, queries } = createRecordingPool();
    const fetcher = async () =>
      createFetchResponse({
        agora: "2026-06-10 10:00",
        destaques: [
          {
            permitePF: true,
            orgao: "Receita Federal",
            cidade: "SANTOS",
            edital: "0817800/0000001/2026",
            edle: "817800/1/2026",
            dtFimProposta: "2026-06-20 21:00",
            destaque: true,
            numero: 1,
            lote: 12,
            valor: 15000,
          },
        ],
      });

    const count = await ingestReceitaLeiloesDestaques({ pool: pool as never, fetcher: fetcher as typeof fetch });

    expect(count).toBe(1);
    expect(queries.some((query) => query.sql.includes("INSERT INTO source_runs"))).toBe(true);
    expect(queries.some((query) => query.sql.includes("INSERT INTO raw_records"))).toBe(true);
    expect(queries.some((query) => query.sql.includes("INSERT INTO entities"))).toBe(true);
    expect(queries.some((query) => query.sql.includes("INSERT INTO evidence"))).toBe(true);
    expect(queries.some((query) => query.sql.includes("records_inserted"))).toBe(true);
  });
});
