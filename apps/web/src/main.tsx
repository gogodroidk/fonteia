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

// PWA: registra o service worker (network-first) para habilitar instalação no
// celular ("adicionar à tela inicial") e reserva offline. Silencioso se falhar.
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // sem service worker (ex.: ambiente sem suporte) — degrada sem erro
    });
  });
}
