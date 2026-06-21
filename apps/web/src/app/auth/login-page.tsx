import { useState, useEffect, useRef, useCallback } from "react";
import { Eye, EyeOff, ArrowLeft, Check, CheckCircle2, AlertCircle, User, Phone, Gift } from "lucide-react";
import { useAuth } from "../../auth/auth-context";
import { ThemeToggle } from "../../components/ui/ThemeToggle";
import { LogoMark } from "../../components/ui/logo-mark";
import { TURNSTILE_SITE_KEY, isTurnstileEnabled } from "../../config/turnstile";

// Injeta <meta name="robots" content="noindex"> para impedir indexação da página de login.
function useNoIndex() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const head = document.head;
    let el = head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const prev = el?.getAttribute("content") ?? null;
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute("name", "robots");
      head.appendChild(el);
    }
    el.setAttribute("content", "noindex");
    return () => {
      if (prev !== null && el) {
        el.setAttribute("content", prev);
      } else if (el) {
        el.remove();
      }
    };
  }, []);
}

// ─── Types ────────────────────────────────────────────────────────────────────

type AuthMode = "login" | "signup";

interface LoginPageProps {
  onGoToLanding: () => void;
}

// ─── Google SVG icon (no external dep) ───────────────────────────────────────

function GoogleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

// ─── Brand lockup ─────────────────────────────────────────────────────────────

function BrandLockup({
  size = "md",
  onClick,
}: {
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
}) {
  const logoSize = size === "lg" ? 34 : size === "md" ? 30 : 24;
  const nameSize = size === "lg" ? 22 : size === "md" ? 19 : 16;

  const inner = (
    <>
      <LogoMark size={logoSize} />
      <div>
        <div
          style={{
            fontSize: nameSize,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: "var(--t-hi)",
            lineHeight: 1,
          }}
        >
          Fonte
          <span style={{ color: "var(--accent-ink)" }}>.ia</span>
        </div>
        <div
          style={{
            fontSize: "9.5px",
            fontWeight: 700,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--t-low)",
            marginTop: 3,
          }}
        >
          by Olli
        </div>
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 11,
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          color: "var(--t-hi)",
        }}
      >
        {inner}
      </button>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11, color: "var(--t-hi)" }}>
      {inner}
    </div>
  );
}

// ─── Feature data ─────────────────────────────────────────────────────────────

const FEATURES_LOGIN = [
  { label: "Score de oportunidade", detail: "calculado por regra a partir da fonte oficial" },
  { label: "Lance mínimo e prazo", detail: "lidos direto do edital da Receita Federal" },
  { label: "Link direto", detail: "para o sistema oficial de lances" },
  { label: "Relatório PDF", detail: "com link e data de coleta da fonte" },
];

const FEATURES_SIGNUP = [
  { label: "Score de oportunidade", detail: "calculado por regra a partir da fonte oficial" },
  { label: "Quem pode participar", detail: "elegibilidade PF/PJ informada no edital" },
  { label: "Assistente de IA", detail: "pergunte em português, receba com a fonte" },
  { label: "Relatório PDF", detail: "com rastreabilidade até a origem" },
];

const TRUST_ITEMS = ["Dado rastreável", "7 dias grátis", "Cancele quando quiser"];

// ─── Left brand panel ─────────────────────────────────────────────────────────

function LeftPanel({ mode }: { mode: AuthMode }) {
  const features = mode === "login" ? FEATURES_LOGIN : FEATURES_SIGNUP;

  const heroTag =
    mode === "login"
      ? "Inteligência de dados governamentais"
      : "7 dias grátis · cancele quando quiser";

  const heroHeadline =
    mode === "login" ? (
      <>
        Leilões públicos.<br />
        Informação completa.<br />
        Decisão fundamentada.
      </>
    ) : (
      <>
        Comece a analisar<br />
        lotes em minutos.
      </>
    );

  const heroBody =
    mode === "login"
      ? "A Fonte.ia organiza cada lote de leilão da Receita Federal com os dados oficiais — lance mínimo, prazo e elegibilidade — e entrega rastreabilidade até a fonte. Mais órgãos em breve."
      : "Crie sua conta e analise lotes da Receita Federal — score de oportunidade por regra, rastreabilidade até a fonte e assistente de IA. Comece com 7 dias grátis, cancele quando quiser.";

  return (
    <div className="auth-left-panel" style={{ flex: "0 0 52%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "48px 56px", background: "var(--bg)", position: "relative", overflow: "hidden" }}>

      {/* Grid background */}
      <div className="gridbg" style={{ position: "absolute", inset: 0, zIndex: 0 }} />

      {/* Decorative orbs */}
      <div className="orb" style={{ width: 360, height: 320, background: "var(--brand)", top: -80, right: -40, opacity: 0.18, zIndex: 0 }} />
      <div className="orb" style={{ width: 280, height: 260, background: "var(--accent)", bottom: -60, left: 20, opacity: 0.15, zIndex: 0 }} />

      {/* Logo */}
      <div style={{ position: "relative", zIndex: 1 }}>
        <BrandLockup size="md" />
      </div>

      {/* Hero content */}
      <div style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", alignItems: "center", padding: "48px 0" }}>
        <div>
          {/* Eyebrow tag */}
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--accent-ink)", marginBottom: 22, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 20, height: 2, background: "var(--accent-ink)", borderRadius: 2, display: "inline-block", flexShrink: 0 }} />
            {heroTag}
          </div>

          {/* Headline */}
          <div style={{ fontSize: "clamp(28px, 3.5vw, 40px)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.08, color: "var(--t-hi)", marginBottom: 18 }}>
            {heroHeadline}
          </div>

          {/* Body */}
          <p style={{ fontSize: 15, color: "var(--t-low)", lineHeight: 1.65, maxWidth: 420, margin: 0 }}>
            {heroBody}
          </p>

          {/* Feature list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 36 }}>
            {features.map((f) => (
              <div key={f.label} style={{ display: "flex", alignItems: "flex-start", gap: 13 }}>
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "var(--accent-ink)",
                    flexShrink: 0,
                    marginTop: 6,
                    display: "inline-block",
                  }}
                />
                <div style={{ fontSize: 14, color: "var(--t-mid)", lineHeight: 1.5 }}>
                  <strong style={{ color: "var(--t-hi)", fontWeight: 600 }}>{f.label}</strong>{" "}
                  {f.detail}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Trust row */}
      <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
        {TRUST_ITEMS.map((item) => (
          <span
            key={item}
            style={{ fontSize: 12, color: "var(--t-low)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}
          >
            <Check size={13} strokeWidth={3} aria-hidden="true" style={{ color: "var(--accent-ink)", flexShrink: 0 }} />
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <span
      role="status"
      aria-label="Aguardando…"
      style={{
        display: "inline-block",
        width: 17,
        height: 17,
        border: "2.5px solid rgba(255,255,255,0.3)",
        borderTopColor: "#fff",
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
        flexShrink: 0,
      }}
    />
  );
}

// ─── Password input with visibility toggle ────────────────────────────────────

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  minLength,
  required,
  rightSlot,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  placeholder: string;
  minLength?: number;
  required?: boolean;
  rightSlot?: React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="auth-field">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
        <label htmlFor={id} className="auth-label">{label}</label>
        {rightSlot}
      </div>
      <div style={{ position: "relative" }}>
        <input
          id={id}
          type={visible ? "text" : "password"}
          className="input"
          autoComplete={autoComplete}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          minLength={minLength}
          required={required}
          style={{ paddingRight: 44 }}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          title={visible ? "Ocultar senha" : "Ver senha"}
          aria-label={visible ? "Ocultar senha" : "Ver senha"}
          aria-pressed={visible}
          style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--t-low)", padding: 8, display: "flex", alignItems: "center", justifyContent: "center", minWidth: 36, minHeight: 36 }}
        >
          {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}

// ─── Phone mask helper ────────────────────────────────────────────────────────

function applyPhoneMask(raw: string): string {
  // Strip everything except digits
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  if (digits.length === 0) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  // 11 digits — mobile with 9th digit
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

// ─── Signup banner ────────────────────────────────────────────────────────────

function SignupBanner() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "13px 16px",
        borderRadius: "var(--r-md)",
        background: "color-mix(in srgb, var(--accent-ink) 10%, transparent)",
        border: "1px solid color-mix(in srgb, var(--accent-ink) 22%, transparent)",
        marginBottom: 22,
      }}
    >
      <Gift
        size={20}
        aria-hidden="true"
        style={{ color: "var(--accent-ink)", flexShrink: 0 }}
      />
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--t-hi)", marginBottom: 2 }}>
          7 dias grátis, sem cartão de crédito
        </div>
        <div style={{ fontSize: 12, color: "var(--t-low)", lineHeight: 1.4 }}>
          Acesso completo ao módulo de leilões da Receita Federal. Cancele quando quiser.
        </div>
      </div>
    </div>
  );
}

// ─── Field with icon ──────────────────────────────────────────────────────────

function IconField({
  id,
  label,
  icon,
  hint,
  children,
}: {
  id: string;
  label: string;
  icon: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="auth-field" style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
        <span style={{ color: "var(--accent-ink)", display: "flex", alignItems: "center" }} aria-hidden="true">
          {icon}
        </span>
        <label htmlFor={id} className="auth-label" style={{ margin: 0 }}>
          {label}
        </label>
        {hint && (
          <span style={{ fontSize: 11, color: "var(--t-low)", fontWeight: 500, marginLeft: 2 }}>
            {hint}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

// ─── Cloudflare Turnstile ─────────────────────────────────────────────────────

// Minimal type for the Turnstile API exposed on window.
interface TurnstileAPI {
  render: (
    el: HTMLElement,
    params: {
      sitekey: string;
      callback: (token: string) => void;
      "error-callback": () => void;
      "expired-callback": () => void;
      theme?: "light" | "dark" | "auto";
    },
  ) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileAPI;
  }
}

/** Loads the Turnstile script once, then resolves. */
function loadTurnstileScript(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (window.turnstile) {
      resolve();
      return;
    }
    if (document.querySelector("script[data-turnstile]")) {
      // Already injected — wait for it.
      const poll = setInterval(() => {
        if (window.turnstile) {
          clearInterval(poll);
          resolve();
        }
      }, 80);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.dataset["turnstile"] = "1";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Turnstile script failed to load"));
    document.head.appendChild(script);
  });
}

interface TurnstileWidgetProps {
  onToken: (token: string) => void;
  onError: () => void;
  onExpire: () => void;
  widgetIdRef: React.MutableRefObject<string | null>;
}

function TurnstileWidget({ onToken, onError, onExpire, widgetIdRef }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!isTurnstileEnabled()) return;

    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        // Clear any previous render (e.g. mode switch re-mount)
        containerRef.current.innerHTML = "";
        const id = window.turnstile.render(containerRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token) => { onToken(token); },
          "error-callback": () => { setLoadError(true); onError(); },
          "expired-callback": () => { onExpire(); },
          theme: "auto",
        });
        widgetIdRef.current = id;
      })
      .catch(() => {
        if (!cancelled) { setLoadError(true); onError(); }
      });

    return () => {
      cancelled = true;
      // Remove the rendered widget so remounting (login ↔ signup ↔ reset) doesn't
      // leave orphaned iframes/timers from the Turnstile script.
      const id = widgetIdRef.current;
      if (id && window.turnstile) {
        try { window.turnstile.remove(id); } catch { /* widget already gone */ }
      }
      widgetIdRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isTurnstileEnabled()) return null;

  return (
    <div style={{ margin: "0 0 16px" }}>
      <div ref={containerRef} />
      {loadError && (
        <p
          role="status"
          style={{
            fontSize: 11.5,
            color: "var(--t-low)",
            marginTop: 6,
            lineHeight: 1.4,
          }}
        >
          Verificação anti-bot indisponível neste ambiente — você pode continuar.
        </p>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function LoginPage({ onGoToLanding }: LoginPageProps) {
  useNoIndex();
  const { signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword, demoMode } = useAuth();

  const [mode, setMode] = useState<AuthMode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Signup-only extra fields
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Separate loading flags so one in-flight action disables the others without
  // hijacking the form's primary spinner.
  const [googleLoading, setGoogleLoading] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const anyBusy = submitting || googleLoading || forgotLoading;

  // ── Turnstile state ──────────────────────────────────────────────────────────
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  // true when the widget loaded and rendered without error
  const [captchaReady, setCaptchaReady] = useState(false);
  // widget id so we can call window.turnstile.reset() after submission errors
  const turnstileWidgetId = useRef<string | null>(null);

  const handleCaptchaToken = useCallback((token: string) => {
    setCaptchaToken(token);
    setCaptchaReady(true);
  }, []);

  const handleCaptchaError = useCallback(() => {
    // Widget failed (network, domain not whitelisted, etc.) — degrade gracefully.
    setCaptchaToken(null);
    setCaptchaReady(false);
  }, []);

  const handleCaptchaExpire = useCallback(() => {
    setCaptchaToken(null);
  }, []);

  function resetTurnstile() {
    if (turnstileWidgetId.current && window.turnstile) {
      window.turnstile.reset(turnstileWidgetId.current);
    }
    setCaptchaToken(null);
  }

  // Captcha gate, shared by all flows. Only blocks when the widget actually
  // loaded (captchaReady) but no token is held yet. If the widget failed to load
  // (captchaReady=false), we degrade gracefully and proceed without a token —
  // and the server still enforces it if CAPTCHA protection is on in Supabase.
  function captchaMissing(): boolean {
    return captchaReady && !captchaToken;
  }

  // ── Auth handlers ────────────────────────────────────────────────────────────

  async function handleGoogle() {
    if (anyBusy) return;
    setError(null);
    setSuccessMsg(null);
    setGoogleLoading(true);
    try {
      // On success this redirects the browser away; on failure we surface a
      // translated error instead of leaving the button stuck.
      const result = await signInWithGoogle();
      if (result.error) setError(result.error);
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (anyBusy) return;
    setError(null);
    setSuccessMsg(null);
    setNameError(null);

    // Signup-specific field validation
    if (mode === "signup") {
      const trimmedName = fullName.trim();
      if (trimmedName.length === 0) {
        setNameError("Nome completo é obrigatório.");
        return;
      }
    }

    // Captcha gate applies to BOTH login and signup: Supabase CAPTCHA protection,
    // once enabled, guards sign-in, sign-up and password reset alike.
    if (captchaMissing()) {
      setError("Por favor, complete a verificação anti-bot antes de continuar.");
      return;
    }

    setSubmitting(true);

    let result: { error: string | null };

    try {
      if (mode === "login") {
        result = await signInWithEmail(email, password, captchaToken ?? undefined);
      } else {
        const trimmedName = fullName.trim();
        const trimmedPhone = phone.trim();
        // Only pass captchaToken when we actually have one (exactOptionalPropertyTypes safe).
        result = await signUpWithEmail(
          email,
          password,
          {
            full_name: trimmedName,
            ...(trimmedPhone ? { phone: trimmedPhone } : {}),
          },
          captchaToken ?? undefined,
        );
      }
    } finally {
      setSubmitting(false);
    }

    if (result.error) {
      setError(result.error);
      // Token is single-use — refresh the widget so the user gets a fresh one.
      resetTurnstile();
    } else if (mode === "signup") {
      setSuccessMsg("Conta criada! Verifique seu e-mail para confirmar o cadastro.");
    }
    // mode === "login" success: onAuthStateChange swaps the screen, nothing to do.
  }

  async function handleForgot() {
    if (anyBusy) return;
    setError(null);
    setSuccessMsg(null);
    if (!email.trim()) {
      setError("Digite seu e-mail no campo acima para receber o link de redefinição.");
      return;
    }
    // Password reset is also covered by Supabase CAPTCHA protection.
    if (captchaMissing()) {
      setError("Complete a verificação anti-bot antes de pedir a redefinição.");
      return;
    }

    setForgotLoading(true);
    let result: { error: string | null };
    try {
      result = await resetPassword(email.trim(), captchaToken ?? undefined);
    } finally {
      setForgotLoading(false);
    }

    if (result.error) {
      setError(result.error);
      resetTurnstile();
    } else {
      // Neutral message regardless of whether the account exists (anti-enumeration).
      setSuccessMsg("Se existir uma conta com esse e-mail, enviamos um link para você redefinir a senha.");
      resetTurnstile();
    }
  }

  function switchMode(next: AuthMode) {
    setMode(next);
    setError(null);
    setSuccessMsg(null);
    setNameError(null);
    // Drop any held captcha token when switching modes — the widget remounts via
    // key={mode} and will issue a fresh token for the new flow.
    setCaptchaToken(null);
    setCaptchaReady(false);
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const isSignup = mode === "signup";

  return (
    <div style={{ display: "flex", minHeight: "100dvh", background: "var(--bg)", color: "var(--t-hi)" }}>

      {/* ── Left brand panel (hidden on mobile) ── */}
      <LeftPanel mode={mode} />

      {/* ── Right form panel ── */}
      <div
        className="auth-right-panel"
        style={{
          flex: 1,
          background: "var(--surface)",
          borderLeft: "1px solid var(--border)",
          display: "flex",
          alignItems: isSignup ? "flex-start" : "center",
          justifyContent: "center",
          padding: isSignup ? "52px 40px" : "48px 40px",
          position: "relative",
          overflowY: isSignup ? "auto" : undefined,
        }}
      >
        {/* Top-right controls */}
        <div style={{ position: "absolute", top: 20, right: 20, display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={onGoToLanding}
            className="btn btn--ghost btn--sm"
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <ArrowLeft size={14} aria-hidden="true" />
            Voltar ao site
          </button>
          <ThemeToggle />
        </div>

        {/* Form box */}
        <div className="auth-form-box" style={{ width: "100%", maxWidth: 420, marginTop: isSignup ? 48 : 0 }}>

          {/* Mobile logo */}
          <div style={{ marginBottom: 28 }}>
            <BrandLockup size="sm" onClick={onGoToLanding} />
          </div>

          {/* ── SIGNUP HEADER ── */}
          {isSignup ? (
            <div style={{ marginBottom: 24 }}>
              <h1
                className="h2"
                style={{
                  fontSize: 26,
                  fontWeight: 800,
                  letterSpacing: "-0.03em",
                  lineHeight: 1.1,
                  marginBottom: 6,
                  color: "var(--t-hi)",
                }}
              >
                Crie sua conta
              </h1>
              <p style={{ fontSize: 14.5, color: "var(--t-low)", lineHeight: 1.5, margin: 0 }}>
                7 dias grátis, sem cartão.{" "}
                <button
                  type="button"
                  className="link"
                  style={{ fontSize: 14.5 }}
                  onClick={() => switchMode("login")}
                >
                  Já tem conta? Entrar
                </button>
              </p>
            </div>
          ) : (
            /* ── LOGIN HEADER ── */
            <div style={{ marginBottom: 32 }}>
              <h1 className="h2" style={{ fontSize: 23, fontWeight: 800, letterSpacing: "-0.025em", marginBottom: 6 }}>
                Acesse sua conta
              </h1>
              <p style={{ fontSize: 14.5, color: "var(--t-low)", lineHeight: 1.5, margin: 0 }}>
                Não tem conta?{" "}
                <button type="button" className="link" style={{ fontSize: 14.5 }} onClick={() => switchMode("signup")}>
                  Criar conta grátis
                </button>
              </p>
            </div>
          )}

          {/* Demo mode banner */}
          {demoMode && (
            <div
              style={{
                padding: "11px 14px",
                borderRadius: "var(--r-md)",
                background: "color-mix(in srgb, var(--accent) 14%, transparent)",
                border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
                fontSize: 13,
                color: "var(--accent-ink)",
                marginBottom: 20,
                lineHeight: 1.5,
              }}
            >
              <strong>Modo demonstração</strong> — sem Supabase configurado.
              Login e cadastro são simulados localmente.
            </div>
          )}

          {/* Error message */}
          {error && (
            <div
              role="alert"
              style={{
                background: "color-mix(in srgb, var(--danger) 10%, transparent)",
                border: "1px solid color-mix(in srgb, var(--danger) 28%, transparent)",
                borderRadius: "var(--r-md)",
                padding: "11px 14px",
                fontSize: 13,
                color: "var(--danger)",
                marginBottom: 18,
                lineHeight: 1.5,
                display: "flex",
                alignItems: "flex-start",
                gap: 9,
              }}
            >
              <AlertCircle size={15} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{error}</span>
            </div>
          )}

          {/* Success message */}
          {successMsg && (
            <div
              role="status"
              style={{
                background: "color-mix(in srgb, var(--ok) 14%, transparent)",
                border: "1px solid color-mix(in srgb, var(--ok) 30%, transparent)",
                borderRadius: "var(--r-md)",
                padding: "11px 14px",
                fontSize: 13,
                color: "var(--ok)",
                marginBottom: 18,
                lineHeight: 1.5,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <CheckCircle2 size={15} aria-hidden="true" style={{ flexShrink: 0 }} />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Signup trust banner */}
          {isSignup && <SignupBanner />}

          {/* Google OAuth button */}
          <button
            type="button"
            onClick={() => void handleGoogle()}
            disabled={anyBusy}
            aria-busy={googleLoading}
            className="btn btn--ghost btn--block btn--lg"
            style={{ justifyContent: "center", gap: 10, fontWeight: 600, fontSize: 14.5 }}
          >
            {googleLoading ? (
              <>
                <span
                  role="status"
                  aria-label="Conectando…"
                  style={{
                    display: "inline-block",
                    width: 16,
                    height: 16,
                    border: "2.5px solid color-mix(in srgb, var(--t-low) 40%, transparent)",
                    borderTopColor: "var(--t-hi)",
                    borderRadius: "50%",
                    animation: "spin 0.7s linear infinite",
                    flexShrink: 0,
                  }}
                />
                Conectando…
              </>
            ) : (
              <>
                <GoogleIcon />
                Continuar com Google
              </>
            )}
          </button>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}>
            <hr className="divide" style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: "var(--t-low)", fontWeight: 600, whiteSpace: "nowrap" }}>
              {isSignup ? "ou preencha seus dados" : "ou"}
            </span>
            <hr className="divide" style={{ flex: 1 }} />
          </div>

          {/* Email + password form */}
          <form onSubmit={(e) => void handleSubmit(e)} noValidate>

            {/* ── SIGNUP-ONLY FIELDS ── */}
            {isSignup && (
              <>
                {/* Nome completo */}
                <IconField
                  id="auth-fullname"
                  label="Nome completo"
                  icon={<User size={13} />}
                >
                  <input
                    id="auth-fullname"
                    type="text"
                    className={`input${nameError ? " input--error" : ""}`}
                    autoComplete="name"
                    placeholder="Seu nome e sobrenome"
                    value={fullName}
                    onChange={(e) => {
                      setFullName(e.target.value);
                      if (nameError) setNameError(null);
                    }}
                    required
                    aria-required="true"
                    aria-describedby={nameError ? "auth-fullname-err" : undefined}
                    style={{ marginTop: 0 }}
                  />
                  {nameError && (
                    <span
                      id="auth-fullname-err"
                      role="alert"
                      style={{ fontSize: 12, color: "var(--danger)", marginTop: 5, display: "block" }}
                    >
                      {nameError}
                    </span>
                  )}
                </IconField>

                {/* Telefone / WhatsApp */}
                <IconField
                  id="auth-phone"
                  label="WhatsApp"
                  icon={<Phone size={13} />}
                  hint="(recomendado)"
                >
                  <input
                    id="auth-phone"
                    type="tel"
                    className="input"
                    autoComplete="tel"
                    placeholder="(11) 99999-9999"
                    value={phone}
                    onChange={(e) => setPhone(applyPhoneMask(e.target.value))}
                    inputMode="numeric"
                    aria-label="Telefone ou WhatsApp (opcional)"
                    style={{ marginTop: 0 }}
                  />
                </IconField>

                {/* Horizontal rule to visually group account credentials */}
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "var(--t-low)",
                    margin: "18px 0 14px",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <span style={{ flex: 1, height: 1, background: "var(--border)", display: "inline-block" }} />
                  Acesso
                  <span style={{ flex: 1, height: 1, background: "var(--border)", display: "inline-block" }} />
                </div>
              </>
            )}

            {/* Email */}
            <div className="auth-field" style={{ marginBottom: 14 }}>
              <label htmlFor="auth-email" className="auth-label" style={{ marginBottom: 7 }}>
                E-mail
              </label>
              <input
                id="auth-email"
                type="email"
                className="input"
                autoComplete="email"
                placeholder="voce@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                aria-required="true"
              />
            </div>

            {/* Password */}
            <div style={{ marginBottom: isSignup ? 20 : 22 }}>
              <PasswordField
                id="auth-password"
                label="Senha"
                value={password}
                onChange={setPassword}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                placeholder={mode === "login" ? "••••••••" : "Mínimo 8 caracteres"}
                minLength={8}
                required
                rightSlot={
                  mode === "login" ? (
                    <button
                      type="button"
                      className="link"
                      disabled={anyBusy}
                      aria-busy={forgotLoading}
                      style={{
                        fontSize: 12.5,
                        background: "none",
                        border: "none",
                        cursor: anyBusy ? "default" : "pointer",
                        padding: 0,
                        opacity: anyBusy ? 0.6 : 1,
                      }}
                      onClick={() => void handleForgot()}
                    >
                      {forgotLoading ? "Enviando…" : "Esqueceu?"}
                    </button>
                  ) : undefined
                }
              />
            </div>

            {/* Turnstile anti-bot widget — rendered for BOTH login and signup.
                Supabase CAPTCHA protection, once enabled in the dashboard, guards
                sign-in, sign-up and password reset; the same token covers the
                "Esqueceu?" reset flow which lives on the login screen.
                key={mode} forces a fresh widget (and fresh token) on mode switch. */}
            <TurnstileWidget
              key={mode}
              onToken={handleCaptchaToken}
              onError={handleCaptchaError}
              onExpire={handleCaptchaExpire}
              widgetIdRef={turnstileWidgetId}
            />

            {/* Submit */}
            {isSignup ? (
              <button
                type="submit"
                className="btn btn--primary btn--block btn--lg"
                disabled={anyBusy}
                aria-busy={submitting}
                style={{
                  justifyContent: "center",
                  gap: 8,
                  letterSpacing: "-0.01em",
                  fontSize: 15.5,
                  fontWeight: 700,
                  padding: "14px 20px",
                }}
              >
                {submitting ? <Spinner /> : "Começar grátis →"}
              </button>
            ) : (
              <button
                type="submit"
                className="btn btn--primary btn--block btn--lg"
                disabled={anyBusy}
                aria-busy={submitting}
                style={{ justifyContent: "center", gap: 8, letterSpacing: "-0.01em" }}
              >
                {submitting ? <Spinner /> : "Entrar"}
              </button>
            )}

            {/* Signup fine print */}
            {isSignup && (
              <p style={{ fontSize: 11.5, color: "var(--t-low)", textAlign: "center", marginTop: 12, lineHeight: 1.5 }}>
                Ao criar sua conta você concorda com os{" "}
                <a href="/termos" target="_blank" rel="noreferrer" className="link" style={{ fontSize: 11.5 }}>
                  Termos de uso
                </a>{" "}
                e a{" "}
                <a href="/privacidade" target="_blank" rel="noreferrer" className="link" style={{ fontSize: 11.5 }}>
                  Política de privacidade
                </a>
                .
              </p>
            )}
          </form>

          {/* Footer links */}
          <p style={{ fontSize: 12.5, color: "var(--t-low)", textAlign: "center", marginTop: isSignup ? 16 : 22 }}>
            {mode === "login" ? (
              <>
                Não tem conta?{" "}
                <button type="button" className="link" style={{ fontSize: 12.5 }} onClick={() => switchMode("signup")}>
                  Criar conta
                </button>
                {"  ·  "}
                <button type="button" className="link" style={{ fontSize: 12.5 }} onClick={onGoToLanding}>
                  Saiba mais
                </button>
              </>
            ) : (
              <>
                Já tem conta?{" "}
                <button type="button" className="link" style={{ fontSize: 12.5 }} onClick={() => switchMode("login")}>
                  Entrar
                </button>
              </>
            )}
          </p>
        </div>
      </div>

      {/* ── Inline responsive styles ── */}
      <style>{`
        @media (max-width: 820px) {
          .auth-left-panel {
            display: none !important;
          }
          .auth-right-panel {
            background: var(--bg) !important;
            border-left: none !important;
            /* Extra top padding clears the absolute back/theme controls so the
               logo and title never sit under them on phones. */
            padding: 72px 22px 40px !important;
            align-items: flex-start !important;
          }
        }
        @media (max-width: 820px) {
          /* Panel top padding already clears the controls — drop the desktop
             signup offset so the form starts cleanly under the logo. */
          .auth-form-box { margin-top: 0 !important; }
        }
        @media (max-width: 380px) {
          .auth-right-panel { padding-left: 18px !important; padding-right: 18px !important; }
        }
        .auth-label {
          display: block;
          font-size: 13px;
          font-weight: 600;
          color: var(--t-mid);
          letter-spacing: 0.01em;
        }
        .auth-field {
          display: flex;
          flex-direction: column;
        }
        .input--error {
          border-color: var(--danger) !important;
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--danger) 15%, transparent);
        }
      `}</style>
    </div>
  );
}
