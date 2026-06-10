import { jsonResponse, type ApiResponse } from "./types";

export interface HealthBody {
  ok: true;
  service: "fonteia-api";
  version: string;
}

export function getHealth(): ApiResponse<HealthBody> {
  return jsonResponse({
    ok: true,
    service: "fonteia-api",
    version: "0.1.0",
  });
}

