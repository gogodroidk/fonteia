// components/feedback/FeedbackButton.tsx
// Botão de gatilho para o modal de feedback.
// Pode ser usado como ícone (variant="icon") ou pill (variant="pill").
// O modal é lazy — só monta quando o botão é clicado pela primeira vez.

import { useState, lazy, Suspense } from "react";
import { MessageSquare } from "lucide-react";

const FeedbackModal = lazy(() =>
  import("./FeedbackModal").then((m) => ({ default: m.FeedbackModal })),
);

interface FeedbackButtonProps {
  currentPath?: string;
  userEmail?: string;
  /** "icon" = botão quadrado só ícone; "pill" = label + ícone */
  variant?: "icon" | "pill";
  className?: string;
}

export function FeedbackButton({
  currentPath,
  userEmail,
  variant = "icon",
  className,
}: FeedbackButtonProps) {
  const [open, setOpen] = useState(false);
  // Abre o modal e mantém-no montado após a primeira abertura (evita re-montar).
  const [everOpened, setEverOpened] = useState(false);

  function handleOpen() {
    setEverOpened(true);
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className={className}
        aria-label="Enviar feedback ou sugestão"
        title="Suporte e Feedback"
        style={
          variant === "pill"
            ? {
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 14px",
                borderRadius: 999,
                border: "1px solid var(--border)",
                background: "var(--surface-2)",
                color: "var(--t-mid)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "background .14s, color .14s",
              }
            : {
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
                width: 36,
                height: 36,
                borderRadius: "var(--r-md)",
                border: "none",
                background: "none",
                color: "var(--t-low)",
                cursor: "pointer",
                transition: "color .14s, background .14s",
              }
        }
        onMouseOver={(e) => {
          const el = e.currentTarget as HTMLButtonElement;
          el.style.color = "var(--brand-ink)";
          el.style.background = "color-mix(in srgb, var(--brand) 9%, transparent)";
        }}
        onMouseOut={(e) => {
          const el = e.currentTarget as HTMLButtonElement;
          el.style.color = variant === "pill" ? "var(--t-mid)" : "var(--t-low)";
          el.style.background = variant === "pill" ? "var(--surface-2)" : "none";
        }}
      >
        <MessageSquare size={variant === "pill" ? 15 : 18} aria-hidden="true" />
        {variant === "pill" && <span>Feedback</span>}
      </button>

      {everOpened && (
        <Suspense fallback={null}>
          <FeedbackModal
            open={open}
            onClose={() => setOpen(false)}
            {...(currentPath !== undefined ? { currentPath } : {})}
            {...(userEmail !== undefined  ? { userEmail }  : {})}
          />
        </Suspense>
      )}
    </>
  );
}
