import { askFonteia } from "./ask";
import { getAlerts } from "./alerts";
import { getBillingEntitlements, getBillingPlans } from "./billing";
import { getDossier, exportDossier } from "./dossiers";
import { getHealth } from "./health";
import { getLeilaoLot, getLeilaoLots, getLeilaoLotScore } from "./leiloes";
import { getModules } from "./modules";
import { getSources } from "./sources";
import { searchEntities } from "./search";
import { notFound, type ApiResponse, type RouteRequest } from "./types";
import type { LeiloesRepository } from "../repositories/leiloes-repository";

export interface RouteDependencies {
  leiloesRepository?: LeiloesRepository;
}

export function createRouteRequest(method: string, rawUrl: string): RouteRequest {
  const url = new URL(rawUrl, "http://localhost");

  return {
    method,
    path: url.pathname,
    query: url.searchParams,
  };
}

export async function handleRoute(request: RouteRequest, dependencies: RouteDependencies = {}): Promise<ApiResponse> {
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
    return getModules(request);
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

  if (request.path === "/alerts") {
    return getAlerts(request);
  }

  if (request.path === "/billing/plans") {
    return getBillingPlans();
  }

  if (request.path === "/billing/entitlements") {
    return getBillingEntitlements(request);
  }

  if (request.path === "/leiloes/lotes") {
    return getLeilaoLots(dependencies.leiloesRepository);
  }

  const leilaoScoreMatch = request.path.match(/^\/leiloes\/lotes\/([^/]+)\/score$/);
  if (leilaoScoreMatch?.[1]) {
    return getLeilaoLotScore(decodeURIComponent(leilaoScoreMatch[1]), dependencies.leiloesRepository);
  }

  const leilaoLotMatch = request.path.match(/^\/leiloes\/lotes\/([^/]+)$/);
  if (leilaoLotMatch?.[1]) {
    return getLeilaoLot(decodeURIComponent(leilaoLotMatch[1]), dependencies.leiloesRepository);
  }

  const dossierExportMatch = request.path.match(/^\/dossiers\/([^/]+)\/export$/);
  if (dossierExportMatch?.[1]) {
    return exportDossier(decodeURIComponent(dossierExportMatch[1]));
  }

  const dossierMatch = request.path.match(/^\/dossiers\/([^/]+)$/);
  if (dossierMatch?.[1]) {
    return getDossier(decodeURIComponent(dossierMatch[1]));
  }

  return notFound(request.path);
}
