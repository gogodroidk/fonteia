import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = "fonteia-theme";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === "dark" || saved === "light") return saved;
  // Toda a UI já está no design system novo (compatível com dark). Dark-first por padrão.
  return "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    root.style.colorScheme = theme;
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const value: ThemeContextValue = {
    theme,
    setTheme: (next) => setThemeState(next),
    toggleTheme: () => setThemeState((current) => (current === "dark" ? "light" : "dark")),
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// Padrão inerte usado quando o hook roda FORA de um ThemeProvider — acontece no
// pré-render/SSG das páginas públicas (que agora têm ThemeToggle). Em vez de
// lançar e derrubar o build, devolvemos dark + no-ops; no cliente o provider real
// hidrata e o tema volta a funcionar normalmente.
const SSR_THEME_FALLBACK: ThemeContextValue = {
  theme: "dark",
  setTheme: () => {},
  toggleTheme: () => {},
};

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext) ?? SSR_THEME_FALLBACK;
}
