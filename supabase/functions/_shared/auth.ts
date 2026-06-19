// Helpers de autenticacao/autorizacao para as Edge Functions (runtime Deno).
//
// IMPORTANTE:
//  - hasValidApiKey: compara a publishable key (gate basico de endpoints publicos).
//  - hasValidBearerSecret: compara um segredo compartilhado (ex.: cron interno).
//  - getVerifiedUserId: valida o token do usuario contra o Supabase Auth (authz real).
//  - unverifiedJwtSub: decodifica o `sub` SEM verificar assinatura -> use APENAS
//    como chave de rate-limit, NUNCA para autorizacao.

/** Comparacao de strings em tempo constante (evita timing oracle em tokens). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function bearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const g = m?.[1];
  return g ? g.trim() : null;
}

/** true se o header `apikey` bate com a publishable key esperada. */
export function hasValidApiKey(req: Request, expectedKey: string): boolean {
  if (!expectedKey) return false;
  const provided = req.headers.get("apikey") ?? "";
  return safeEqual(provided, expectedKey);
}

/** true se o Bearer do Authorization bate com um segredo compartilhado (cron). */
export function hasValidBearerSecret(req: Request, secret: string): boolean {
  if (!secret) return false;
  const token = bearerToken(req);
  return token !== null && safeEqual(token, secret);
}

/**
 * Header dedicado para o segredo de cron das funcoes ingest-*.
 *
 * Por que NAO usar o Authorization: quando `verify_jwt = true` (padrao das
 * ingest-*), o gateway do Supabase consome o header Authorization para validar
 * um JWT real (o cron manda a anon key, igual as demais ingest-*). Se o segredo
 * de cron fosse colocado no Authorization, o gateway o rejeitaria como JWT
 * invalido (401) ANTES de a funcao rodar. Logo, o segredo opcional de
 * defense-in-depth viaja em um header proprio que o gateway ignora.
 */
export const INGEST_CRON_SECRET_HEADER = "x-ingest-cron-secret";

/** true se o header `x-ingest-cron-secret` bate com o segredo compartilhado. */
export function hasValidCronSecret(req: Request, secret: string): boolean {
  if (!secret) return false;
  const provided = req.headers.get(INGEST_CRON_SECRET_HEADER) ?? "";
  return provided.length > 0 && safeEqual(provided, secret);
}

/**
 * Decodifica o claim `sub` do JWT SEM verificar a assinatura.
 * APENAS para compor chave de rate-limit. NUNCA usar para autorizacao.
 */
export function unverifiedJwtSub(req: Request): string | null {
  const token = bearerToken(req);
  if (!token) return null;
  const parts = token.split(".");
  const payloadPart = parts.length === 3 ? parts[1] : undefined;
  if (!payloadPart) return null;
  try {
    const json = JSON.parse(atob(payloadPart.replace(/-/g, "+").replace(/_/g, "/"))) as { sub?: unknown };
    return typeof json.sub === "string" && json.sub.length > 0 ? json.sub : null;
  } catch {
    return null;
  }
}

/**
 * Verifica o access token do usuario contra o Supabase Auth.
 * Retorna o user id, ou null se o token for invalido/ausente.
 */
export async function getVerifiedUserId(
  req: Request,
  supabaseUrl: string,
  anonKey: string,
): Promise<string | null> {
  const token = bearerToken(req);
  if (!token) return null;
  try {
    const res = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
      headers: { authorization: `Bearer ${token}`, apikey: anonKey },
    });
    if (!res.ok) return null;
    const user = (await res.json()) as { id?: unknown };
    return typeof user.id === "string" ? user.id : null;
  } catch {
    return null;
  }
}
