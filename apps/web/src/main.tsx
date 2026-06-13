import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/figtree";
import { AuthProvider } from "./auth/auth-context";
import { ThemeProvider } from "./theme/theme-context";
import { App } from "./App";
import "./styles.css";
import "./styles/design-system.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
);
