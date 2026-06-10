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

export function createApiServer(options: { leiloesRepository?: LeiloesRepository } = {}) {
  const leiloesRepository = options.leiloesRepository ?? createLeiloesRepositoryFromEnv();

  return createServer(async (request, response) => {
    const routeRequest = createRouteRequest(request.method ?? "GET", request.url ?? "/health");
    const routeResponse = await handleRoute(
      routeRequest,
      leiloesRepository ? { leiloesRepository } : {},
    );

    response.writeHead(routeResponse.status, {
      "content-type": "application/json; charset=utf-8",
    });
    response.end(JSON.stringify(routeResponse.body));
  });
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  const port = Number(process.env.PORT ?? 4000);
  const server = createApiServer();

  server.listen(port, () => {
    console.log(`${apiAppName} listening on http://localhost:${port}`);
  });
}
