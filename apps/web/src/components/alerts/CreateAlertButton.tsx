import { useEffect, useRef, useState } from "react";
import { BellPlus, X } from "lucide-react";
import { useAuth } from "../../auth/auth-context";
import { createEntityAlert, ALERT_KIND_LABELS } from "../../features/alerts/alerts-api";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateAlertButtonProps {
  kind: string;
  entityRef: string;
  entityLabel: string;
  query?: string | undefined;
  size?: "sm" | "md";
  variant?: "primary" | "ghost" | "soft";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function kindLabel(kind: string): string {
  return ALERT_KIND_LABELS[kind] ?? kind;
}

// ─── Modal / Popover ──────────────────────────────────────────────────────────

interface AlertModalProps {
  kind: string;
  entityRef: string;
  entityLabel: string;
  query: string | undefined;
  defaultEmail: string;
  onClose: () => void;
  onSuccess: () => void;
}

function AlertModal({
  kind,
  entityRef,
  entityLabel,
  query,
  defaultEmail,
  onClose,
  onSuccess,
}: AlertModalProps) {
  const [email, setEmail] = useState(defaultEmail);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | undefined>();
  const firstInputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Focus the email input on mount
  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  // Close on Escape key
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Close on click outside the dialog
  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === overlayRef.current) onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus("loading");
    setMessage(undefined);

    const result = await createEntityAlert({
      kind,
      ref: entityRef,
      label: entityLabel,
      ...(query !== undefined ? { query } : {}),
      email: email.trim(),
    });

    if (result.ok) {
      setStatus("success");
      setMessage(result.message);
      // Close after a short success confirmation
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1600);
    } else {
      setStatus("error");
      setMessage(result.message);
    }
  }

  const isLoading = status === "loading";

  return (
    /* Overlay */
    <div
      ref={overlayRef}
      role="presentation"
      onClick={handleOverlayClick}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9000,
        background: "rgba(7,12,22,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        backdropFilter: "blur(3px)",
        WebkitBackdropFilter: "blur(3px)",
      }}
    >
      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="alert-modal-title"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-xl)",
          boxShadow: "var(--shadow-xl)",
          width: "100%",
          maxWidth: 420,
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <BellPlus size={16} style={{ color: "var(--brand-ink)", flexShrink: 0 }} />
              <span
                id="alert-modal-title"
                style={{ fontWeight: 700, fontSize: 15, color: "var(--t-hi)" }}
              >
                Criar alerta
              </span>
              <span className="badge badge--info" style={{ fontSize: 11 }}>
                {kindLabel(kind)}
              </span>
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--t-mid)",
                lineHeight: 1.4,
                maxWidth: 320,
                wordBreak: "break-word",
              }}
            >
              {entityLabel}
            </div>
          </div>

          <button
            type="button"
            className="btn btn--icon btn--ghost btn--sm"
            aria-label="Fechar"
            onClick={onClose}
            style={{ flexShrink: 0, marginTop: -2 }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={(e) => void handleSubmit(e)} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label
              htmlFor="alert-email"
              style={{
                display: "block",
                fontSize: 12.5,
                fontWeight: 600,
                color: "var(--t-mid)",
                marginBottom: 6,
              }}
            >
              E-mail para notificação
            </label>
            <input
              id="alert-email"
              ref={firstInputRef}
              type="email"
              className="input"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              disabled={isLoading || status === "success"}
              autoComplete="email"
            />
          </div>

          {/* Status message */}
          {message !== undefined ? (
            <div
              role={status === "error" ? "alert" : "status"}
              style={{
                padding: "10px 14px",
                borderRadius: "var(--r-md)",
                fontSize: 13,
                lineHeight: 1.45,
                background:
                  status === "success"
                    ? "color-mix(in srgb,var(--ok) 10%,var(--surface-2))"
                    : "color-mix(in srgb,var(--danger) 8%,var(--surface-2))",
                border:
                  status === "success"
                    ? "1px solid color-mix(in srgb,var(--ok) 25%,transparent)"
                    : "1px solid color-mix(in srgb,var(--danger) 22%,transparent)",
                color: status === "success" ? "var(--ok)" : "var(--danger)",
              }}
            >
              {message}
            </div>
          ) : null}

          {/* Actions */}
          {status !== "success" ? (
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={onClose}
                disabled={isLoading}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="btn btn--primary btn--sm"
                disabled={isLoading || !email.trim()}
                style={{ minWidth: 120 }}
              >
                {isLoading ? (
                  <span
                    className="spin"
                    style={{
                      width: 14,
                      height: 14,
                      border: "2px solid rgba(255,255,255,0.4)",
                      borderTopColor: "var(--t-hi)",
                      borderRadius: "50%",
                      display: "inline-block",
                    }}
                  />
                ) : null}
                {isLoading ? "Criando…" : "Criar alerta"}
              </button>
            </div>
          ) : null}
        </form>

        {/* Honest note about notification phase */}
        <div
          style={{
            padding: "9px 12px",
            borderRadius: "var(--r-md)",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            fontSize: 11.5,
            color: "var(--t-low)",
            lineHeight: 1.5,
          }}
        >
          Alertas de prazo de leilão chegam automaticamente por e-mail. Para outros módulos
          (empresa, política, ambiental etc.) o monitoramento é registrado — notificação automática
          em ativação (fase 2).
        </div>
      </div>
    </div>
  );
}

// ─── Login prompt ─────────────────────────────────────────────────────────────

interface LoginPromptProps {
  onClose: () => void;
}

function LoginPrompt({ onClose }: LoginPromptProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === overlayRef.current) onClose();
  }

  return (
    <div
      ref={overlayRef}
      role="presentation"
      onClick={handleOverlayClick}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9000,
        background: "rgba(7,12,22,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        backdropFilter: "blur(3px)",
        WebkitBackdropFilter: "blur(3px)",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-prompt-title"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-xl)",
          boxShadow: "var(--shadow-xl)",
          width: "100%",
          maxWidth: 360,
          padding: "28px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          alignItems: "center",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            background: "color-mix(in srgb,var(--brand) 12%,var(--surface-2))",
            border: "1px solid color-mix(in srgb,var(--brand) 22%,transparent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <BellPlus size={22} style={{ color: "var(--brand-ink)" }} />
        </div>

        <div>
          <div
            id="login-prompt-title"
            style={{ fontWeight: 700, fontSize: 15, color: "var(--t-hi)", marginBottom: 6 }}
          >
            Faça login para criar alertas
          </div>
          <div style={{ fontSize: 13, color: "var(--t-mid)", lineHeight: 1.5 }}>
            Monitore empresas, parlamentares, leilões, marcas e muito mais. Receba avisos direto no
            seu e-mail.
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, width: "100%" }}>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={onClose}
            style={{ flex: 1 }}
          >
            Agora não
          </button>
          <a
            href="/entrar"
            className="btn btn--primary btn--sm"
            style={{ flex: 1, textDecoration: "none" }}
          >
            Entrar
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * CreateAlertButton — drop anywhere on a detail page to let a user subscribe
 * to changes for that specific entity.
 *
 * Example (empresa):
 *   <CreateAlertButton kind="empresa" entityRef="12345678000195" entityLabel="Acme Ltda" />
 *
 * Example (parlamentar):
 *   <CreateAlertButton kind="parlamentar" entityRef="204554" entityLabel="João Silva" size="sm" variant="ghost" />
 */
export function CreateAlertButton({
  kind,
  entityRef,
  entityLabel,
  query,
  size = "md",
  variant = "soft",
}: CreateAlertButtonProps) {
  const { user, session } = useAuth();
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState(false);

  const isLoggedIn = user !== null;
  const userEmail = session?.user.email ?? user?.email ?? "";

  const btnClass = [
    "btn",
    variant === "primary"
      ? "btn--primary"
      : variant === "ghost"
        ? "btn--ghost"
        : "btn--soft",
    size === "sm" ? "btn--sm" : "",
  ]
    .filter(Boolean)
    .join(" ");

  function handleClick() {
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        className={btnClass}
        onClick={handleClick}
        aria-label={`Criar alerta para ${entityLabel}`}
        title={created ? "Alerta criado" : "Criar alerta"}
        style={{ minWidth: size === "sm" ? 0 : 120 }}
      >
        <BellPlus size={size === "sm" ? 13 : 15} aria-hidden="true" />
        {size === "sm" ? "Alerta" : "Criar alerta"}
        {created ? (
          <span
            className="badge badge--ok"
            style={{ fontSize: 10, padding: "2px 6px", marginLeft: 2 }}
          >
            ativo
          </span>
        ) : null}
      </button>

      {open ? (
        isLoggedIn ? (
          <AlertModal
            kind={kind}
            entityRef={entityRef}
            entityLabel={entityLabel}
            query={query}
            defaultEmail={userEmail}
            onClose={() => setOpen(false)}
            onSuccess={() => setCreated(true)}
          />
        ) : (
          <LoginPrompt onClose={() => setOpen(false)} />
        )
      ) : null}
    </>
  );
}
