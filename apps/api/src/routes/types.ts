export interface ApiResponse<TBody = unknown> {
  status: number;
  body: TBody;
}

export interface RouteRequest {
  method: string;
  path: string;
  query: URLSearchParams;
}

export function jsonResponse<TBody>(body: TBody, status = 200): ApiResponse<TBody> {
  return { status, body };
}

export function notFound(path: string): ApiResponse<{ error: string; path: string }> {
  return jsonResponse({ error: "Not found", path }, 404);
}

