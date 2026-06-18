import { MODULE_IDS, SOURCE_STATUSES, type ModuleId, type SourceStatus } from "@fonteia/domain";
import { listSources, listSourcesByModule, listSourcesByStatus } from "@fonteia/sources";
import { badRequest, jsonResponse, type ApiResponse, type RouteRequest } from "./types";

const moduleIds = new Set<string>(MODULE_IDS);
const sourceStatuses = new Set<string>(SOURCE_STATUSES);

function isModuleId(value: string): value is ModuleId {
  return moduleIds.has(value);
}

function isSourceStatus(value: string): value is SourceStatus {
  return sourceStatuses.has(value);
}

export function getSources(
  request: RouteRequest,
): ApiResponse<ReturnType<typeof listSources> | { error: string }> {
  const moduleId = request.query.get("module");
  const status = request.query.get("status");

  if (moduleId) {
    if (!isModuleId(moduleId)) {
      return badRequest("Invalid module id", { allowed: [...MODULE_IDS] });
    }
    return jsonResponse(listSourcesByModule(moduleId));
  }

  if (status) {
    if (!isSourceStatus(status)) {
      return badRequest("Invalid source status", { allowed: [...SOURCE_STATUSES] });
    }
    return jsonResponse(listSourcesByStatus(status));
  }

  return jsonResponse(listSources());
}
