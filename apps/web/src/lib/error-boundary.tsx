/**
 * error-boundary.tsx — ErrorBoundary robusto com telemetria integrada.
 *
 * Substitui o ErrorBoundary inline do App.tsx.
 * Uso idêntico: <ErrorBoundary route={route}>{children}</ErrorBoundary>
 * A prop `route` é opcional: se não fornecida, usa window.location.pathname.
 */

import { Component, type ReactNode } from "react";
import { trackBoundaryError } from "./telemetry";

interface Props {
  children: ReactNode;
  /** Rota associada ao boundary (para correlacionar no painel admin). */
  route?: string;
  /** Fallback customizado. Se omitido, exibe a UI padrão de erro. */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error: unknown): State {
    const errorMessage =
      error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    return { hasError: true, errorMessage };
  }

  override componentDidCatch(error: unknown, _info: unknown) {
    const route =
      this.props.route ??
      (typeof window !== "undefined" ? window.location.pathname : "/");
    console.error("[Fonte.ia] Erro capturado pelo ErrorBoundary:", error);
    trackBoundaryError(error, route);
  }

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div
          style={{
            minHeight: "100dvh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            padding: 24,
            background: "var(--bg)",
            color: "var(--t-hi)",
            textAlign: "center",
          }}
        >
          <span style={{ fontSize: 40 }}>⚠️</span>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
            Algo deu errado ao carregar esta página
          </h2>
          <p style={{ margin: 0, color: "var(--t-mid)", maxWidth: 380 }}>
            Isso pode ter sido causado por uma atualização recente. Recarregue a
            página para tentar novamente.
          </p>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              this.setState({ hasError: false, errorMessage: "" });
              window.location.reload();
            }}
            style={{ marginTop: 8 }}
          >
            Recarregar página
          </button>
          {import.meta.env.DEV && (
            <details
              style={{
                marginTop: 16,
                maxWidth: 600,
                textAlign: "left",
                fontSize: 12,
                color: "var(--t-low)",
              }}
            >
              <summary style={{ cursor: "pointer" }}>Detalhes do erro (dev)</summary>
              <pre
                style={{
                  marginTop: 8,
                  padding: 12,
                  background: "var(--surface)",
                  borderRadius: 8,
                  overflow: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                {this.state.errorMessage}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
