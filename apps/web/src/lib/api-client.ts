// Backend publico do app (services/api -> Cloudflare Worker fonteia-api).
// Em desenvolvimento, sobrescreva com VITE_API_URL=http://localhost:4000
// para usar a API local. Sem override, o app usa o Worker de producao.
const DEFAULT_API_URL = "https://fonteia-api.igoreluisa.workers.dev";

export function getPublicEnv(name: string): string | undefined {
  const value = import.meta.env[name];

  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function getConfiguredApiUrl(): string | undefined {
  return getPublicEnv("VITE_API_URL") ?? DEFAULT_API_URL;
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
