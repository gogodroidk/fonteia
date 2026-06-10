import type { ModuleId, SourceStatus } from "@fonteia/domain";
import { listSources, listSourcesByModule, listSourcesByStatus } from "@fonteia/sources";
import { jsonResponse, type ApiResponse, type RouteRequest } from "./types";

export function getSources(request: RouteRequest): ApiResponse<ReturnType<typeof listSources>> {
  const moduleId = request.query.get("module") as ModuleId | null;
  const status = request.query.get("status") as SourceStatus | null;

  if (moduleId) {
    return jsonResponse(listSourcesByModule(moduleId));
  }

  if (status) {
    return jsonResponse(listSourcesByStatus(status));
  }

  return jsonResponse(listSources());
}

