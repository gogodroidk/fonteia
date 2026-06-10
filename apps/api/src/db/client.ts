import { Pool } from "pg";

export interface DatabaseConfig {
  connectionString: string;
  ssl?: boolean;
}

export function createDatabasePool(config: DatabaseConfig): Pool {
  return new Pool({
    connectionString: config.connectionString,
    ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
  });
}

export function getDatabaseConfigFromEnv(env: NodeJS.ProcessEnv = process.env): DatabaseConfig {
  const connectionString = env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required to connect to Fonte.ia database");
  }

  return {
    connectionString,
    ssl: env.DATABASE_SSL === "true",
  };
}

