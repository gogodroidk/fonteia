// Service worker mínimo: network-first (sempre tenta a versão nova),
// usa cache só como reserva offline. Evita servir versão antiga.
const CACHE = "fonteia-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

/**
 * Returns true for requests that must never be cached:
 *   - Supabase REST/Functions/realtime endpoints
 *   - Any request that carries an Authorization header (authenticated session)
 */
function isUncacheable(req) {
  const url = req.url;
  if (
    url.includes("supabase.co") ||
    url.includes("/rest/v1") ||
    url.includes("/functions/v1")
  ) {
    return true;
  }
  if (req.headers.has("authorization")) {
    return true;
  }
  return false;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || !req.url.startsWith("http")) return;

  // Skip caching for authenticated / API requests — always go to network.
  if (isUncacheable(req)) {
    event.respondWith(fetch(req));
    return;
  }

  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req)),
  );
});
