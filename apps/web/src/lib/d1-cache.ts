/**
 * d1-cache.ts — Cache genérico em memória com TTL + deduplicação de requisições
 *   em voo + espelhamento opcional em sessionStorage para catálogos estáveis.
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
 *  - SSG-safe: todo acesso a `sessionStorage` é guardado por
 *    `typeof window !== "undefined"` e envolto em try/catch (modo privado
 *    bloqueia sessionStorage em alguns browsers).
 *  - sessionStorage opcional (`cachedFetchSession`): persiste entre navegações
 *    SPA da mesma aba — ideal para catálogos que não mudam em horas (ex.: lista
 *    de kinds do InfoSimples). Ao recarregar a aba, a entrada sobrevive até o TTL.
 */

// ─── Tipos internos ────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  /** Timestamp (Date.now()) em que o valor expira. */
  expiresAt: number;
  /** Valor resolvido. */
  value: T;
}

/** Forma serializada que vai para o sessionStorage. */
interface SessionEntry {
  expiresAt: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any;
}

const MAX_ENTRIES = 200;

/** Prefixo de namespace para entradas do sessionStorage. */
const SS_PREFIX = "fonteia_cache_v1_";

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

/** Lê uma entrada do sessionStorage; retorna undefined se inválida/expirada. */
function ssRead<T>(key: string): T | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.sessionStorage.getItem(SS_PREFIX + key);
    if (raw === null) return undefined;
    const entry = JSON.parse(raw) as SessionEntry;
    if (typeof entry.expiresAt !== "number" || Date.now() > entry.expiresAt) {
      window.sessionStorage.removeItem(SS_PREFIX + key);
      return undefined;
    }
    return entry.value as T;
  } catch {
    return undefined;
  }
}

/** Escreve uma entrada no sessionStorage; silencia erros (modo privado, etc.). */
function ssWrite<T>(key: string, value: T, expiresAt: number): void {
  if (typeof window === "undefined") return;
  try {
    const entry: SessionEntry = { expiresAt, value };
    window.sessionStorage.setItem(SS_PREFIX + key, JSON.stringify(entry));
  } catch {
    // sessionStorage pode estar desabilitado (modo privado, quota exceeded).
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
 * Variante de `cachedFetch` que espelha o resultado em `sessionStorage`.
 *
 * Use para dados que:
 *  - São estáveis por horas (catálogos, listas de referência).
 *  - Precisam sobreviver a navegações SPA entre páginas na mesma aba.
 *  - Não contêm dados sensíveis (sessionStorage é visível ao JS da página).
 *
 * Ordem de leitura:
 *  1. Store em memória (mais rápido).
 *  2. sessionStorage (sobrevive à navegação SPA mas não ao fechar a aba).
 *  3. loader() (rede).
 *
 * @param key   Chave estável — deve ser única entre todos os callers.
 * @param ttlMs TTL em ms. Aplica-se tanto ao store em memória quanto ao
 *              sessionStorage (ambos expiram no mesmo instante).
 * @param loader Função assíncrona que produz o valor.
 */
export function cachedFetchSession<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const now = Date.now();

  // 1. Hit fresco no store em memória?
  const existing = store.get(key);
  if (existing !== undefined && existing.expiresAt > now) {
    return Promise.resolve(existing.value as T);
  }

  // 2. Requisição em voo para a mesma chave?
  const pending = inFlight.get(key);
  if (pending !== undefined) {
    return pending as Promise<T>;
  }

  // 3. Hit fresco no sessionStorage? (sobreviveu a uma navegação SPA)
  const ssValue = ssRead<T>(key);
  if (ssValue !== undefined) {
    // Promove para o store em memória (próxima leitura sem JSON.parse).
    evictOldestIfNeeded();
    // Lemos o expiresAt do sessionStorage para alinhar o TTL restante.
    const ssExpiresAt = (() => {
      if (typeof window === "undefined") return now + ttlMs;
      try {
        const raw = window.sessionStorage.getItem(SS_PREFIX + key);
        if (raw === null) return now + ttlMs;
        const entry = JSON.parse(raw) as SessionEntry;
        return typeof entry.expiresAt === "number" ? entry.expiresAt : now + ttlMs;
      } catch {
        return now + ttlMs;
      }
    })();
    store.set(key, { expiresAt: ssExpiresAt, value: ssValue });
    return Promise.resolve(ssValue);
  }

  // 4. Disparar o loader.
  const promise: Promise<T> = loader().then(
    (value) => {
      const expiresAt = Date.now() + ttlMs;
      evictOldestIfNeeded();
      store.set(key, { expiresAt, value });
      ssWrite(key, value, expiresAt);
      inFlight.delete(key);
      return value;
    },
    (err: unknown) => {
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
 *
 * Quando `clearSession` é `true`, também remove as entradas correspondentes do
 * sessionStorage (útil para forçar re-fetch do catálogo após mudança de plano).
 */
export function invalidateCache(prefix?: string, clearSession?: boolean): void {
  if (prefix === undefined || prefix === "") {
    store.clear();
    if (clearSession && typeof window !== "undefined") {
      try {
        const toRemove: string[] = [];
        for (let i = 0; i < window.sessionStorage.length; i++) {
          const k = window.sessionStorage.key(i);
          if (k !== null && k.startsWith(SS_PREFIX)) toRemove.push(k);
        }
        for (const k of toRemove) window.sessionStorage.removeItem(k);
      } catch {
        // ignorar
      }
    }
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
    }
  }
  if (clearSession && typeof window !== "undefined") {
    try {
      const ssKey = SS_PREFIX + prefix;
      const toRemove: string[] = [];
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const k = window.sessionStorage.key(i);
        if (k !== null && k.startsWith(ssKey)) toRemove.push(k);
      }
      for (const k of toRemove) window.sessionStorage.removeItem(k);
    } catch {
      // ignorar
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
