import { createServer } from "node:http";
import { createRouteRequest, handleRoute } from "./routes/router";

export const apiAppName = "Fonte.ia API";

export function createApiServer() {
  return createServer((request, response) => {
    const routeRequest = createRouteRequest(request.method ?? "GET", request.url ?? "/health");
    const routeResponse = handleRoute(routeRequest);

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
