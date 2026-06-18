export interface ApiResponse<TBody = unknown> {
  status: number;
  body: TBody;
  /** Optional extra HTTP headers (e.g. `Allow` on 405, `WWW-Authenticate` on 401). */
  headers?: Record<string, string>;
}

export interface RouteRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  /** Raw value of the incoming `Authorization` header, when present. */
  authorization?: string;
}

export function jsonResponse<TBody>(body: TBody, status = 200): ApiResponse<TBody> {
  return { status, body };
}

export function notFound(path: string): ApiResponse<{ error: string; path: string }> {
  return jsonResponse({ error: "Not found", path }, 404);
}

export function badRequest(message: string, details?: Record<string, unknown>): ApiResponse<{ error: string } & Record<string, unknown>> {
  return jsonResponse({ error: message, ...(details ?? {}) }, 400);
}

export function unauthorized(message = "Authentication required"): ApiResponse<{ error: string }> {
  return {
    status: 401,
    body: { error: message },
    headers: { "www-authenticate": 'Bearer realm="fonteia-api"' },
  };
}

export function methodNotAllowed(method: string, allowed: readonly string[]): ApiResponse<{ error: string; method: string }> {
  return {
    status: 405,
    body: { error: "Method not allowed", method },
    headers: { allow: allowed.join(", ") },
  };
}
