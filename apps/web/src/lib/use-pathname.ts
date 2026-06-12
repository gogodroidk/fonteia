import { useCallback, useEffect, useState } from "react";

/**
 * Roteamento por URL real, sem dependência externa.
 * Usa a History API do navegador: dá endereços compartilháveis e
 * suporte ao botão voltar/avançar. Upgrade para TanStack Router é
 * drop-in quando houver `pnpm install` disponível.
 */
export function usePathname(): { path: string; navigate: (to: string) => void } {
  const [path, setPath] = useState<string>(() =>
    typeof window === "undefined" ? "/" : window.location.pathname || "/",
  );

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname || "/");
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((to: string) => {
    if (typeof window !== "undefined" && to !== window.location.pathname) {
      window.history.pushState({}, "", to);
    }
    setPath(to);
  }, []);

  return { path, navigate };
}
