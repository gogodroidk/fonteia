/**
 * SPA navigation helper — pushState + popstate, matching the pattern
 * already established in relatorios/page.tsx.
 *
 * Use this for internal `<a href>` links that would otherwise cause a
 * full page reload in the Vite / Cloudflare Pages SPA.
 */
export function navigateSpa(to: string): void {
  window.history.pushState(null, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
