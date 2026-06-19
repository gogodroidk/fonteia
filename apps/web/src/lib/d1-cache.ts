/**
 * d1-cache.ts — Cache genérico em memória com TTL + deduplicação de requisições
 *   em voo.
 *
 * Design:
 *  - Zero dependências externas; estado de módulo (Map).
 *  - TTL por entrada: dados expirados são ignorados e o loader é re-executado.
 *  - De-duplicação de in-flight: se uma promessa para a mesma chave já está
 *    pendente, retornamos a MESMA promessa — sem requisição dupla ao servidor.
 *  - Erros nunca são cacheados: falha transiente = retry imediato na próxima
 *    chamada.
 *  - Cap de 200 entradas: ao ultrapassar, a entrada mais antiga é removida para
 *    evitar crescimento ilimitado.
 *  - SSG-safe: sem acesso a `window`/`localStorage` no caminho principal. O
 *    espelhamento opcional em sessionStorage (comentado abaixo) é guardado por
 *    `typeof window !== "undefined"`.
 */

// ─── Tipos internos ────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  /** Timestamp (Date.now()) em que o valor expira. */
  expiresAt: number;
  /** Valor resolvido. */
  value: T;
}

const MAX_ENTRIES = 200;

// ─── Estado de módulo ──────────────────────────────────────────────────────────

/** Valores já resolvidos, guardados até expirar o TTL. */
const store = new Map<string, CacheEntry<unknown>>();

/** Promessas em voo: chave → promessa pendente. Removida ao resolver/rejeitar. */
const inFlight = new Map<string, Promise<unknown>>();

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Remove a entrada mais antiga quando o limite de entradas é atingido. */
function evictOldestIfNeeded(): void {
  if (store.size < MAX_ENTRIES) return;
  // Map mantém ordem de inserção — a primeira é a mais antiga.
  const firstKey = store.keys().next().value;
  if (firstKey !== undefined) {
    store.delete(firstKey);
  }
}

// ─── API pública ───────────────────────────────────────────────────────────────

/**
 * Memoizador assíncrono com TTL e deduplicação de requisições em voo.
 *
 * Comportamento:
 *  1. Valor fresco no store → resolve imediatamente (sem rede).
 *  2. Requisição em voo para a mesma `key` → devolve a MESMA Promise (sem
 *     duplicar a chamada de rede).
 *  3. Sem valor ou valor expirado → executa `loader()`, armazena o resultado e o
 *     devolve. Erros do `loader` propagam normalmente e NÃO ficam cacheados.
 *
 * @param key   Chave estável e determinística para esta entrada.
 * @param ttlMs Tempo de vida em milissegundos. Após esse prazo, o dado é
 *              considerado stale e o `loader` é re-executado na próxima chamada.
 * @param loader Função assíncrona que produz o valor (ex.: a chamada de rede).
 */
export function cachedFetch<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const now = Date.now();

  // 1. Hit fresco no store?
  const existing = store.get(key);
  if (existing !== undefined && existing.expiresAt > now) {
    return Promise.resolve(existing.value as T);
  }

  // 2. Requisição em voo para a mesma chave?
  const pending = inFlight.get(key);
  if (pending !== undefined) {
    return pending as Promise<T>;
  }

  // 3. Disparar o loader, registrar a promessa e cachear o resultado.
  const promise: Promise<T> = loader().then(
    (value) => {
      evictOldestIfNeeded();
      store.set(key, { expiresAt: Date.now() + ttlMs, value });
      inFlight.delete(key);
      return value;
    },
    (err: unknown) => {
      // Não cachear erros — próxima chamada tenta de novo.
      inFlight.delete(key);
      throw err;
    },
  );

  inFlight.set(key, promise as Promise<unknown>);
  return promise;
}

/**
 * Invalida entradas do cache.
 *
 * @param prefix Se fornecido, remove apenas as entradas cujas chaves começam com
 *               esse prefixo. Sem argumento (ou `undefined`), limpa tudo.
 *
 * Nota: entradas em voo (inFlight) NÃO são canceladas — a promessa já foi
 * retornada para os chamadores. O resultado que vier será armazenado com o TTL
 * original; se não for desejado, o chamador precisa ignorar o valor.
 */
export function invalidateCache(prefix?: string): void {
  if (prefix === undefined || prefix === "") {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
    }
  }
}

/**
 * (Diagnóstico / testes) Devolve o número de entradas válidas no store.
 * Útil em testes unitários para verificar se o cache foi preenchido/invalidado.
 */
export function cacheSize(): number {
  return store.size;
}
