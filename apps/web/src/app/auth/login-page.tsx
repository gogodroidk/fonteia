import { useState } from "react";
import { useAuth } from "../../auth/auth-context";

type AuthMode = "login" | "signup";

interface LoginPageProps {
  onGoToLanding: () => void;
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

export function LoginPage({ onGoToLanding }: LoginPageProps) {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function handleGoogle() {
    setError(null);
    await signInWithGoogle();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setSubmitting(true);

    const result =
      mode === "login"
        ? await signInWithEmail(email, password)
        : await signUpWithEmail(email, password);

    setSubmitting(false);

    if (result.error) {
      setError(result.error);
    } else if (mode === "signup") {
      setSuccessMsg("Verifique seu e-mail para confirmar o cadastro.");
    }
  }

  return (
    <div className="login-page">
      {/* Left brand panel — desktop only */}
      <div className="login-brand-panel">
        <div className="brand-mark brand-mark-lg">f</div>
        <h2>
          Inteligência em<br />dados públicos<br />brasileiros
        </h2>
        <p>
          Receita Federal, PNCP, CNPJ e mais — transformados
          em decisões rastreáveis com IA.
        </p>
        <div className="login-panel-stats">
          {[
            "Score de oportunidade em cada lote",
            "Alertas automáticos por canal",
            "Evidência rastreável com SHA-256",
            "18 fontes. 5 módulos. R$ 299 para começar.",
          ].map((s) => (
            <div className="login-panel-stat" key={s}>
              <div className="login-panel-stat-dot" />
              {s}
            </div>
          ))}
        </div>
      </div>

      {/* Right form panel */}
      <div className="login-card">
        <div className="login-card-inner">
          {/* Logo */}
          <button className="login-brand" onClick={onGoToLanding} type="button">
            <div className="brand-mark">f</div>
            <div>
              <strong>Fonte.ia</strong>
              <span>by Olli</span>
            </div>
          </button>

          <div>
            <h1 className="login-title">
              {mode === "login" ? "Entrar na plataforma" : "Criar sua conta"}
            </h1>
            <p className="login-sub" style={{ marginTop: "6px" }}>
              {mode === "login"
                ? "Acesse seus módulos, alertas e dossiês."
                : "Comece grátis. Sem cartão de crédito."}
            </p>
          </div>

          {/* Google OAuth */}
          <button className="btn-google" onClick={handleGoogle} type="button">
            <GoogleIcon />
            Continuar com Google
          </button>

          <div className="login-divider">
            <span>ou</span>
          </div>

          {/* Email/senha form */}
          <form onSubmit={(e) => void handleSubmit(e)} className="login-form">
            <div className="login-field">
              <label htmlFor="login-email">E-mail</label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                placeholder="voce@exemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="login-field">
              <label htmlFor="login-password">Senha</label>
              <input
                id="login-password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                placeholder={mode === "login" ? "Sua senha" : "Mínimo 8 caracteres"}
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && <p className="login-error">{error}</p>}
            {successMsg && <p className="login-success">{successMsg}</p>}

            <button className="btn-primary-full" type="submit" disabled={submitting}>
              {submitting ? (
                <span className="spinner" />
              ) : mode === "login" ? (
                "Entrar"
              ) : (
                "Criar conta grátis"
              )}
            </button>
          </form>

          <p className="login-switch">
            {mode === "login" ? (
              <>
                Não tem conta?{" "}
                <button type="button" onClick={() => { setMode("signup"); setError(null); }}>
                  Criar grátis
                </button>
              </>
            ) : (
              <>
                Já tem conta?{" "}
                <button type="button" onClick={() => { setMode("login"); setError(null); }}>
                  Entrar
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
