import { askFonteia } from "./ask";
import { getAlerts } from "./alerts";
import { getBillingEntitlements, getBillingPlans } from "./billing";
import { getDossier, exportDossier } from "./dossiers";
import { getHealth } from "./health";
import { getLeilaoLot, getLeilaoLots, getLeilaoLotScore } from "./leiloes";
import { getModules } from "./modules";
import { getSources } from "./sources";
import { searchEntities } from "./search";
import { methodNotAllowed, notFound, unauthorized, type ApiResponse, type RouteRequest } from "./types";
import type { LeiloesRepository } from "../repositories/leiloes-repository";

export interface RouteDependencies {
  leiloesRepository?: LeiloesRepository;
  /**
   * Expected bearer token. Defaults to `process.env.API_TOKEN`. When unset, the
   * auth guard runs in permissive (dev) mode and only logs a warning.
   */
  apiToken?: string;
}

const ALLOWED_METHODS = ["GET", "OPTIONS"] as const;

/**
 * Routes that read or accept account/tenant data. These require a valid bearer
 * token when `API_TOKEN` is configured. Public catalog/read endpoints
 * (`/health`, `/leiloes/*`, `/sources`, `/modules`, `/search`, `/billing/plans`)
 * stay open.
 */
function requiresAuth(path: string): boolean {
  if (path === "/alerts") return true;
  if (path === "/billing/entitlements") return true;
  if (path === "/ask") return true;
  if (path === "/dossiers" || path.startsWith("/dossiers/")) return true;

  return false;
}

function extractBearerToken(authorization: string | undefined): string | undefined {
  if (!authorization) {
    return undefined;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || undefined;
}

let warnedAboutMissingToken = false;

/**
 * Constant-time-ish comparison to avoid trivial early-exit timing leaks.
 * Both strings are short tokens; this is a defense-in-depth measure.
 */
function tokensMatch(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) {
    return false;
  }

  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= provided.charCodeAt(index) ^ expected.charCodeAt(index);
  }

  return mismatch === 0;
}

/**
 * Returns `undefined` when the request is allowed to proceed, otherwise an
 * `ApiResponse` (401) describing why it was rejected.
 */
export function authorizeRequest(request: RouteRequest, expectedToken: string | undefined): ApiResponse | undefined {
  if (!requiresAuth(request.path)) {
    return undefined;
  }

  if (!expectedToken) {
    // Dev mode: no token configured. Allow but warn once so it is obvious in logs.
    if (!warnedAboutMissingToken) {
      console.warn(
        "[api] API_TOKEN is not set: account routes (/ask, /alerts, /dossiers, /billing/entitlements) are UNAUTHENTICATED. Set API_TOKEN before deploying.",
      );
      warnedAboutMissingToken = true;
    }
    return undefined;
  }

  const provided = extractBearerToken(request.authorization);

  if (!provided || !tokensMatch(provided, expectedToken)) {
    return unauthorized();
  }

  return undefined;
}

export function createRouteRequest(method: string, rawUrl: string, options: { authorization?: string } = {}): RouteRequest {
  const url = new URL(rawUrl, "http://localhost");

  const request: RouteRequest = {
    method,
    path: url.pathname,
    query: url.searchParams,
  };

  if (options.authorization !== undefined) {
    request.authorization = options.authorization;
  }

  return request;
}

export async function handleRoute(request: RouteRequest, dependencies: RouteDependencies = {}): Promise<ApiResponse> {
  if (request.method !== "GET") {
    return methodNotAllowed(request.method, ALLOWED_METHODS);
  }

  const expectedToken = dependencies.apiToken ?? process.env.API_TOKEN;
  const authFailure = authorizeRequest(request, expectedToken);
  if (authFailure) {
    return authFailure;
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
    return getLeilaoLots(dependencies.leiloesRepository, request);
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
