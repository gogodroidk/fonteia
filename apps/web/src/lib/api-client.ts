// Backend publico do app. Por padrao usa a Supabase Edge Function "fonteia"
// (supabase/functions/fonteia) — mesmo projeto onde fica a chave da Anthropic.
// Sobrescreva com VITE_API_URL para apontar para outro backend
// (ex.: http://localhost:4000 em dev, ou o Worker Cloudflare services/api).
//
// Segredos NÃO são embutidos aqui. As variáveis VITE_SUPABASE_URL e
// VITE_SUPABASE_PUBLISHABLE_KEY devem ser injetadas pelo ambiente de build
// (.env.local em dev, variáveis de ambiente na CI/Cloudflare Pages).
// Sem elas o app opera em modo degradado (sem dados) — não crasha.

/** URL + chave pública do Supabase, lidos das env vars de build. */
export function getSupabasePublicConfig(): { url: string; key: string } {
  // Acesso estático (não bracket-notation) para que o bundler substitua em build time.
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  return {
    url: typeof url === "string" && url.trim().length > 0 ? url.trim() : "",
    key: typeof key === "string" && key.trim().length > 0 ? key.trim() : "",
  };
}

export function getPublicEnv(name: string): string | undefined {
  const value = import.meta.env[name];

  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function getConfiguredApiUrl(): string | undefined {
  const explicit = getPublicEnv("VITE_API_URL");
  if (explicit) {
    return explicit;
  }

  const supabaseUrl = getPublicEnv("VITE_SUPABASE_URL");
  if (!supabaseUrl) {
    // Sem env vars configuradas — modo degradado, sem dados.
    return undefined;
  }
  return `${trimTrailingSlash(supabaseUrl)}/functions/v1/fonteia`;
}

export async function fetchJsonFromApi<T>(path: string, fetcher: typeof fetch = fetch): Promise<T> {
  const apiUrl = getConfiguredApiUrl();

  if (!apiUrl) {
    throw new Error(`API URL is not configured for ${path}`);
  }

  // A Edge Function exige o header `apikey` (chave pública). Sem ele, todo GET
  // tomava 401 ("apikey ausente") — por isso os dados nunca vinham do backend.
  const { key } = getSupabasePublicConfig();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const response = await fetcher(`${trimTrailingSlash(apiUrl)}${normalizedPath}`, {
    headers: {
      accept: "application/json",
      apikey: key,
      authorization: `Bearer ${key}`,
    },
  });

  if (!response.ok) {
    throw new Error(`API returned ${response.status} for ${normalizedPath}`);
  }

  return (await response.json()) as T;
}
