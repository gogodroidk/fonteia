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

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, x-request-id",
  "access-control-max-age": "86400",
};

export function createApiServer(options: { leiloesRepository?: LeiloesRepository } = {}) {
  const leiloesRepository = options.leiloesRepository ?? createLeiloesRepositoryFromEnv();

  return createServer(async (request, response) => {
    // Preflight CORS
    if (request.method === "OPTIONS") {
      response.writeHead(204, CORS_HEADERS);
      response.end();
      return;
    }

    try {
      const routeRequest = createRouteRequest(request.method ?? "GET", request.url ?? "/health");
      const routeResponse = await handleRoute(
        routeRequest,
        leiloesRepository ? { leiloesRepository } : {},
      );

      response.writeHead(routeResponse.status, {
        "content-type": "application/json; charset=utf-8",
        ...CORS_HEADERS,
      });
      response.end(JSON.stringify(routeResponse.body));
    } catch (error) {
      console.error("[api] Unhandled error in request handler:", error);
      try {
        response.writeHead(500, { "content-type": "application/json; charset=utf-8", ...CORS_HEADERS });
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
