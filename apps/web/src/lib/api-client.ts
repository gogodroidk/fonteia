const DEFAULT_API_URL = "http://localhost:4000";

export function getPublicEnv(name: string): string | undefined {
  const value = import.meta.env[name];

  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function getConfiguredApiUrl(): string | undefined {
  const configuredApiUrl = getPublicEnv("VITE_API_URL");
  const fallbackApiUrl = import.meta.env.DEV ? DEFAULT_API_URL : undefined;

  return configuredApiUrl ?? fallbackApiUrl;
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
