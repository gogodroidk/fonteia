import { getDossier } from "./dossiers";
import { getHealth } from "./health";
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

export function handleRoute(request: RouteRequest): ApiResponse {
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

  const dossierMatch = request.path.match(/^\/dossiers\/([^/]+)$/);
  if (dossierMatch?.[1]) {
    return getDossier(decodeURIComponent(dossierMatch[1]));
  }

  return notFound(request.path);
}

