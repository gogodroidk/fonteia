// Helpers de rede resilientes para as Edge Functions (runtime Deno).
// APIs governamentais brasileiras penduram conexoes com frequencia: SEMPRE use
// timeout, e use retry/backoff para erros transitorios (429/5xx).

export interface FetchRetryOptions {
  timeoutMs?: number;
  retries?: number;
  backoffMs?: number;
  /** Retorna true p/ tentar de novo neste status. Padrao: 429 e >= 500. */
  retryOnStatus?: (status: number) => boolean;
  init?: RequestInit;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** fetch com timeout via AbortController (padrao 15s). */
export async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit = {},
  timeoutMs = 15000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** fetch com timeout + retry/backoff exponencial para erros transitorios. */
export async function fetchWithRetry(input: string | URL, opts: FetchRetryOptions = {}): Promise<Response> {
  const { timeoutMs = 15000, retries = 3, backoffMs = 800, retryOnStatus, init = {} } = opts;
  const shouldRetry = retryOnStatus ?? ((s: number) => s === 429 || s >= 500);
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(input, init, timeoutMs);
      if (attempt < retries && shouldRetry(res.status)) {
        await sleep(backoffMs * 2 ** attempt);
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await sleep(backoffMs * 2 ** attempt);
        continue;
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("fetchWithRetry: falha apos retries");
}
