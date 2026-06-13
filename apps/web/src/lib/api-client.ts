// Backend publico do app. Por padrao usa a Supabase Edge Function "fonteia"
// (supabase/functions/fonteia) — mesmo projeto onde fica a chave da Anthropic.
// Sobrescreva com VITE_API_URL para apontar para outro backend
// (ex.: http://localhost:4000 em dev, ou o Worker Cloudflare services/api).
const SUPABASE_FALLBACK_URL = "https://pwiuiihsyazghdsrpshg.supabase.co";

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

  const supabaseUrl = getPublicEnv("VITE_SUPABASE_URL") ?? SUPABASE_FALLBACK_URL;
  return `${trimTrailingSlash(supabaseUrl)}/functions/v1/fonteia`;
}

export async function fetchJsonFromApi<T>(path: string, fetcher: typeof fetch = fetch): Promise<T> {
  const apiUrl = getConfiguredApiUrl();

  if (!apiUrl) {
    throw new Error(`API URL is not configured for ${path}`);
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const response = await fetcher(`${trimTrailingSlash(apiUrl)}${normalizedPath}`, {
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`API returned ${response.status} for ${normalizedPath}`);
  }

  return (await response.json()) as T;
}
