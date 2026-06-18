import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { jsonResponse, type ApiResponse } from "./types";

export interface HealthBody {
  ok: true;
  service: "fonteia-api";
  version: string;
}

function readPackageVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    // src/routes -> apps/api/package.json
    const packageJsonPath = resolve(here, "..", "..", "package.json");
    const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : "unknown";
  } catch {
    return "unknown";
  }
}

const VERSION = readPackageVersion();

export function getHealth(): ApiResponse<HealthBody> {
  return jsonResponse({
    ok: true,
    service: "fonteia-api",
    version: VERSION,
  });
}
