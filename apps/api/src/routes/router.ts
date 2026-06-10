import { askFonteia } from "./ask";
import { getDossier } from "./dossiers";
import { getHealth } from "./health";
import { getLeilaoLot, getLeilaoLots, getLeilaoLotScore } from "./leiloes";
import { getModules } from "./modules";
import { getSources } from "./sources";
import { searchEntities } from "./search";
import { notFound, type ApiResponse, type RouteRequest } from "./types";

export function createRouteRequest(method: string, rawUrl: string): RouteRequest {
  const url = new URL(rawUrl, "http://localhost");

  return {
    method,
    path: url.pathname,
    query: url.searchParams,
  };
}

export async function handleRoute(request: RouteRequest): Promise<ApiResponse> {
  if (request.method !== "GET") {
    return {
      status: 405,
      body: { error: "Method not allowed", method: request.method },
    };
  }

  if (request.path === "/health") {
    return getHealth();
  }

  if (request.path === "/modules") {
    return getModules();
  }

  if (request.path === "/sources") {
    return getSources(request);
  }

  if (request.path === "/search") {
    return searchEntities(request);
  }

  if (request.path === "/ask") {
    return askFonteia(request);
  }

  if (request.path === "/leiloes/lotes") {
    return getLeilaoLots();
  }

  const leilaoScoreMatch = request.path.match(/^\/leiloes\/lotes\/([^/]+)\/score$/);
  if (leilaoScoreMatch?.[1]) {
    return getLeilaoLotScore(decodeURIComponent(leilaoScoreMatch[1]));
  }

  const leilaoLotMatch = request.path.match(/^\/leiloes\/lotes\/([^/]+)$/);
  if (leilaoLotMatch?.[1]) {
    return getLeilaoLot(decodeURIComponent(leilaoLotMatch[1]));
  }

  const dossierMatch = request.path.match(/^\/dossiers\/([^/]+)$/);
  if (dossierMatch?.[1]) {
    return getDossier(decodeURIComponent(dossierMatch[1]));
  }

  return notFound(request.path);
}
