import { Sun, Moon } from "lucide-react";
import { useTheme } from "../../theme/theme-context";

/**
 * Button that toggles between dark and light theme.
 * Uses .btn .btn--icon .btn--ghost from the design system.
 */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      className="btn btn--icon btn--ghost"
      onClick={toggleTheme}
      title={isDark ? "Tema claro" : "Tema escuro"}
      aria-label={isDark ? "Mudar para tema claro" : "Mudar para tema escuro"}
      style={{ position: "relative", overflow: "hidden" }}
      type="button"
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
