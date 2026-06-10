import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CORE_TABLES, REQUIRED_EXTENSIONS, REQUIRED_INDEXES, SCHEMA_CONTRACT } from "./schema";

const migrationSql = readFileSync(resolve(__dirname, "../../../../infra/migrations/0001_core_schema.sql"), "utf8");

describe("core database schema", () => {
  it("creates every core table used by the intelligence platform", () => {
    for (const table of CORE_TABLES) {
      expect(migrationSql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
  });

  it("enables geospatial and vector extensions for environmental maps and AI retrieval", () => {
    for (const extension of REQUIRED_EXTENSIONS) {
      expect(migrationSql).toContain(`CREATE EXTENSION IF NOT EXISTS ${extension}`);
    }
  });

  it("creates the indexes needed for entity, source and geospatial lookup", () => {
    for (const index of REQUIRED_INDEXES) {
      expect(migrationSql).toMatch(new RegExp(`CREATE (UNIQUE )?INDEX IF NOT EXISTS ${index}`));
    }
  });

  it("keeps raw records and evidence as first-class concepts before normalized claims", () => {
    expect(SCHEMA_CONTRACT.rawBeforeNormalized).toEqual(["raw_records", "evidence", "claims", "entities"]);
    expect(migrationSql).toContain("payload JSONB NOT NULL");
    expect(migrationSql).toContain("content_hash TEXT");
    expect(migrationSql).toContain("evidence_ids UUID[]");
  });

  it("enables Supabase RLS and keeps public catalogs read-only", () => {
    for (const table of CORE_TABLES) {
      expect(migrationSql).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    }

    expect(migrationSql).toContain('CREATE POLICY "Public source catalog is readable"');
    expect(migrationSql).toContain('CREATE POLICY "Public module catalog is readable"');
    expect(migrationSql).toContain("REVOKE EXECUTE ON FUNCTION public.rls_auto_enable()");
  });
});
