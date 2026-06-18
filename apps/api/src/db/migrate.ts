import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabasePool, getDatabaseConfigFromEnv } from "./client";

/** Migration files must look like `0001_description.sql`. */
const MIGRATION_FILE_PATTERN = /^\d{4}_.*\.sql$/;

export function isValidMigrationFilename(file: string): boolean {
  return MIGRATION_FILE_PATTERN.test(file);
}

/**
 * Resolve the migrations directory relative to this module rather than the
 * process working directory, so `db:migrate` works regardless of where it runs.
 */
export function defaultMigrationsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // src/db -> repo: ../../../../infra/migrations
  return resolve(here, "..", "..", "..", "..", "infra", "migrations");
}

export function readMigrationFiles(migrationsDir: string): Array<{ name: string; sql: string }> {
  return readdirSync(migrationsDir)
    .filter((file) => isValidMigrationFilename(file))
    .sort()
    .map((file) => ({
      name: file,
      sql: readFileSync(join(migrationsDir, file), "utf8"),
    }));
}

export async function runMigrations(migrationsDir = defaultMigrationsDir()): Promise<void> {
  const pool = createDatabasePool(getDatabaseConfigFromEnv());

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    for (const migration of readMigrationFiles(migrationsDir)) {
      const existing = await pool.query("SELECT name FROM schema_migrations WHERE name = $1", [migration.name]);

      if (existing.rowCount && existing.rowCount > 0) {
        continue;
      }

      await pool.query("BEGIN");
      try {
        await pool.query(migration.sql);
        await pool.query("INSERT INTO schema_migrations (name) VALUES ($1)", [migration.name]);
        await pool.query("COMMIT");
        console.log(`Applied ${migration.name}`);
      } catch (error) {
        await pool.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  runMigrations().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
