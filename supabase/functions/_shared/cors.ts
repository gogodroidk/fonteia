// CORS compartilhado para as Edge Functions da Fonte.ia (runtime Deno).
//
// Allowlist real de producao (espelha services/api/src/worker.ts):
//   - https://fontebrasil.online (+ subdominios)
//   - *.igoreluisa.workers.dev
//   - fonteia.pages.dev (+ subdominios) e localhost (dev)
//
// Para endpoints publicos de leitura, `strict:false` (padrao) reflete a origem
// permitida ou cai para "*" (sem credenciais). Para endpoints de sessao/billing,
// use `strict:true`: so origens da allowlist sao refletidas.

const STATIC_ALLOWED = new Set<string>([
  "https://fontebrasil.online",
  "https://www.fontebrasil.online",
  "https://fonteia.pages.dev",
  "http://localhost:5173",
  "http://localhost:4173",
]);

export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (STATIC_ALLOWED.has(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.fontebrasil\.online$/.test(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.igoreluisa\.workers\.dev$/.test(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.fonteia\.pages\.dev$/.test(origin)) return true;
  return false;
}

export interface CorsOptions {
  /**
   * true  -> so origens da allowlist sao refletidas (recomendado p/ sessao/billing).
   * false -> origem permitida e refletida, senao "*" (ok p/ leitura publica, sem credenciais).
   */
  strict?: boolean;
  methods?: string;
}

export function corsHeaders(req: Request, opts: CorsOptions = {}): Record<string, string> {
  const origin = req.headers.get("origin");
  const allowed = isAllowedOrigin(origin) && origin ? origin : opts.strict ? "https://fontebrasil.online" : "*";
  return {
    "access-control-allow-origin": allowed,
    "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
    "access-control-allow-methods": opts.methods ?? "GET, POST, OPTIONS",
    "vary": "Origin",
  };
}

/** Responde o preflight OPTIONS (204). Retorna null se nao for OPTIONS. */
export function handlePreflight(req: Request, opts: CorsOptions = {}): Response | null {
  if (req.method !== "OPTIONS") return null;
  return new Response(null, { status: 204, headers: corsHeaders(req, opts) });
}

/** Resposta JSON ja com headers de CORS (quando `req` e fornecido). */
export function jsonResponse(
  body: unknown,
  init: ResponseInit = {},
  req?: Request,
  opts: CorsOptions = {},
): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  if (req) {
    for (const [k, v] of Object.entries(corsHeaders(req, opts))) headers.set(k, v);
  }
  return new Response(JSON.stringify(body), { ...init, headers });
}
