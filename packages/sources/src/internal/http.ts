// src/internal/http.ts — utilitários de rede compartilhados do pacote @fonteia/sources.
//
// Todos os conectores usam `fetchWithRetry` em vez de `fetch` diretamente.
// O `fetcher` injetável (para testes) é wrappado com timeout + retry automaticamente.

/** Wraps uma chamada fetch com AbortController de timeout. */
export async function fetchWithTimeout(
  input: string | URL | Request,
  init?: RequestInit,
  timeoutMs = 15_000,
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

export interface RetryOptions {
  /** Timeout por tentativa em ms (default 15 000). */
  timeoutMs?: number;
  /** Número total de tentativas (default 3). */
  retries?: number;
  /** Backoff base em ms — a espera cresce exponencialmente: backoffMs * 2^attempt (default 800). */
  backoffMs?: number;
  /** Status HTTP adicionais que disparam retry (429 e ≥500 já estão incluídos). */
  retryOnStatus?: number[];
  /** Init do fetch (headers, method, body, etc.). */
  init?: RequestInit;
}

/**
 * Executa um fetch com timeout + backoff exponencial.
 *
 * - Faz retry automático em erro de rede (AbortError/timeout) e em HTTP 429 / ≥500.
 * - O `fetcher` injetável é chamado com as opções dadas — o `signal` do timeout é
 *   adicionado apenas quando o fetcher é o `fetch` nativo (os fakes de teste ignoram
 *   o `signal` e continuam funcionando normalmente).
 * - Não faz retry em 4xx (exceto 429) pois indicam erro do cliente.
 */
export interface FetchWithRetryOptions extends RetryOptions {
  /**
   * Fetcher injetável (para testes). Quando omitido ou undefined, usa o `fetch`
   * global. Aceita explicitamente `undefined` para facilitar o padrão
   * `{ fetcher: options.fetcher }` sem violar exactOptionalPropertyTypes.
   */
  fetcher?: typeof fetch | undefined;
}

export async function fetchWithRetry(
  input: string | URL | Request,
  options: FetchWithRetryOptions = {},
): Promise<Response> {
  const {
    timeoutMs = 15_000,
    retries = 3,
    backoffMs = 800,
    retryOnStatus = [],
    init,
    fetcher,
  } = options;

  const shouldRetryStatus = (status: number): boolean =>
    status === 429 || status >= 500 || retryOnStatus.includes(status);

  const callFetch = async (signal: AbortSignal): Promise<Response> => {
    if (fetcher) {
      // Fetchers injetados em teste geralmente ignoram `signal`; passamos de qualquer
      // forma para os que suportam, mas não assumimos nada.
      return fetcher(input as string, { ...init, signal });
    }
    return fetch(input, { ...init, signal });
  };

  let lastError: unknown;

  for (let attempt = 0; attempt < retries; attempt++) {
    if (attempt > 0) {
      // Backoff exponencial: 800ms, 1600ms, 3200ms…
      await new Promise((r) => setTimeout(r, backoffMs * Math.pow(2, attempt - 1)));
    }

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await callFetch(controller.signal);
      clearTimeout(id);

      if (!shouldRetryStatus(res.status)) {
        return res;
      }

      // Status retryável — salva e tenta de novo (se ainda houver tentativas).
      lastError = new Error(`HTTP ${res.status} em ${String(input)}`);
    } catch (err) {
      clearTimeout(id);
      lastError = err;
      // Só retentar erros de rede/timeout; erros de programação (TypeError sync) sobem.
      const isNetwork =
        err instanceof TypeError || (err instanceof DOMException && err.name === "AbortError");
      if (!isNetwork) throw err;
    }
  }

  throw lastError ?? new Error(`fetchWithRetry falhou após ${retries} tentativas em ${String(input)}`);
}
