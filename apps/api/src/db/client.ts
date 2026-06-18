import { Pool, type PoolConfig } from "pg";

export interface DatabaseConfig {
  connectionString: string;
  ssl?: boolean;
  /** Optional PEM CA bundle used to verify the server certificate. */
  sslCa?: string;
  max?: number;
  connectionTimeoutMillis?: number;
  idleTimeoutMillis?: number;
}

const DEFAULT_MAX_CONNECTIONS = 10;
const DEFAULT_CONNECTION_TIMEOUT_MS = 10_000;
const DEFAULT_IDLE_TIMEOUT_MS = 30_000;

export function createDatabasePool(config: DatabaseConfig): Pool {
  const poolConfig: PoolConfig = {
    connectionString: config.connectionString,
    max: config.max ?? DEFAULT_MAX_CONNECTIONS,
    connectionTimeoutMillis: config.connectionTimeoutMillis ?? DEFAULT_CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: config.idleTimeoutMillis ?? DEFAULT_IDLE_TIMEOUT_MS,
  };

  if (config.ssl) {
    // Always verify the server certificate. Provide a CA bundle via DATABASE_CA
    // (or DATABASE_SSL_CA) when connecting to a provider with a custom root.
    poolConfig.ssl = config.sslCa
      ? { rejectUnauthorized: true, ca: config.sslCa }
      : { rejectUnauthorized: true };
  }

  return new Pool(poolConfig);
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function getDatabaseConfigFromEnv(env: NodeJS.ProcessEnv = process.env): DatabaseConfig {
  const connectionString = env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required to connect to Fonte.ia database");
  }

  const config: DatabaseConfig = {
    connectionString,
    ssl: env.DATABASE_SSL === "true",
  };

  const sslCa = env.DATABASE_CA ?? env.DATABASE_SSL_CA;
  if (sslCa) {
    config.sslCa = sslCa;
  }

  const max = parsePositiveInt(env.DATABASE_POOL_MAX);
  if (max !== undefined) {
    config.max = max;
  }

  const connectionTimeoutMillis = parsePositiveInt(env.DATABASE_CONNECTION_TIMEOUT_MS);
  if (connectionTimeoutMillis !== undefined) {
    config.connectionTimeoutMillis = connectionTimeoutMillis;
  }

  const idleTimeoutMillis = parsePositiveInt(env.DATABASE_IDLE_TIMEOUT_MS);
  if (idleTimeoutMillis !== undefined) {
    config.idleTimeoutMillis = idleTimeoutMillis;
  }

  return config;
}
