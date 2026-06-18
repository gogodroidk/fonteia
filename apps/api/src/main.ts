import { createServer } from "node:http";
import { createRouteRequest, handleRoute } from "./routes/router";
import { createDatabasePool, getDatabaseConfigFromEnv } from "./db/client";
import { createPostgresLeiloesRepository, type LeiloesRepository } from "./repositories/leiloes-repository";

export const apiAppName = "Fonte.ia API";

function createLeiloesRepositoryFromEnv(env: NodeJS.ProcessEnv = process.env): LeiloesRepository | undefined {
  if (!env.DATABASE_URL) {
    return undefined;
  }

  return createPostgresLeiloesRepository(createDatabasePool(getDatabaseConfigFromEnv(env)));
}

const DEFAULT_DEV_ORIGINS = ["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:3000", "http://127.0.0.1:5173"];

export function getAllowedOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.ALLOWED_ORIGINS;

  if (!raw) {
    // Dev default: only localhost origins, never "*".
    return [...DEFAULT_DEV_ORIGINS];
  }

  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

const BASE_CORS_HEADERS: Record<string, string> = {
  "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, x-request-id",
  "access-control-max-age": "86400",
  vary: "Origin",
};

/**
 * Resolve CORS headers for a request. We never reflect "*" together with
 * "authorization": the origin is echoed back only when it is in the allowlist,
 * which keeps credentialed/bearer requests safe.
 */
export function buildCorsHeaders(requestOrigin: string | undefined, allowedOrigins: string[]): Record<string, string> {
  const headers: Record<string, string> = { ...BASE_CORS_HEADERS };

  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    headers["access-control-allow-origin"] = requestOrigin;
  }

  return headers;
}

export function createApiServer(options: { leiloesRepository?: LeiloesRepository; env?: NodeJS.ProcessEnv } = {}) {
  const env = options.env ?? process.env;
  const leiloesRepository = options.leiloesRepository ?? createLeiloesRepositoryFromEnv(env);
  const allowedOrigins = getAllowedOrigins(env);

  return createServer(async (request, response) => {
    const requestOrigin = typeof request.headers.origin === "string" ? request.headers.origin : undefined;
    const corsHeaders = buildCorsHeaders(requestOrigin, allowedOrigins);

    // Preflight CORS
    if (request.method === "OPTIONS") {
      response.writeHead(204, corsHeaders);
      response.end();
      return;
    }

    try {
      const authorization = typeof request.headers.authorization === "string" ? request.headers.authorization : undefined;
      const routeRequest = createRouteRequest(request.method ?? "GET", request.url ?? "/health", { authorization });
      const routeResponse = await handleRoute(
        routeRequest,
        leiloesRepository ? { leiloesRepository } : {},
      );

      response.writeHead(routeResponse.status, {
        "content-type": "application/json; charset=utf-8",
        ...corsHeaders,
        ...routeResponse.headers,
      });
      response.end(JSON.stringify(routeResponse.body));
    } catch (error) {
      console.error("[api] Unhandled error in request handler:", error);
      try {
        response.writeHead(500, { "content-type": "application/json; charset=utf-8", ...corsHeaders });
        response.end(JSON.stringify({ error: "Internal server error" }));
      } catch {
        response.end();
      }
    }
  });
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  process.on("unhandledRejection", (reason) => {
    console.error("[api] Unhandled promise rejection:", reason);
  });

  process.on("uncaughtException", (error) => {
    console.error("[api] Uncaught exception:", error);
    process.exit(1);
  });

  const port = Number(process.env.PORT ?? 4000);
  const server = createApiServer();

  server.listen(port, () => {
    console.log(`${apiAppName} listening on http://localhost:${port}`);
  });
}
