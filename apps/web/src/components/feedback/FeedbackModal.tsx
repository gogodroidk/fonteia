// components/feedback/FeedbackModal.tsx
// Modal de suporte/feedback acessível — design system próprio (CSS vars, sem shadcn/Next.js).
//
// Props:
//   open       — controla visibilidade
//   onClose    — callback para fechar
//   currentPath — rota atual (capturada pelo shell para rastreabilidade)
//   userEmail  — e-mail do usuário logado (pré-preenchido, não editável)
//
// Estados:
//   idle → submitting → success | error

import { useEffect, useId, useRef, useState } from "react";
import { X, CheckCircle, AlertTriangle, MessageSquare } from "lucide-react";
import {
  submitFeedback,
  FEEDBACK_TIPOS,
  type FeedbackTipo,
} from "../../features/feedback/feedback-api";

// ─── Types ────────────────────────────────────────────────────────────────────

type ModalState = "idle" | "submitting" | "success" | "error";

interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
  currentPath?: string;
  userEmail?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_CHARS = 10;
const MAX_CHARS = 1000;

// ─── Component ────────────────────────────────────────────────────────────────

export function FeedbackModal({
  open,
  onClose,
  currentPath,
  userEmail,
}: FeedbackModalProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const firstFocusRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();

  const [tipo, setTipo]         = useState<FeedbackTipo>("sugestão");
  const [mensagem, setMensagem] = useState("");
  const [state, setState]       = useState<ModalState>("idle");
  const [serverMsg, setServerMsg] = useState("");

  const charCount = mensagem.length;
  const tooShort  = charCount < MIN_CHARS;
  const tooLong   = charCount > MAX_CHARS;
  const invalid   = tooShort || tooLong;

  // Reset de estado ao abrir
  useEffect(() => {
    if (open) {
      setTipo("sugestão");
      setMensagem("");
      setState("idle");
      setServerMsg("");
    }
  }, [open]);

  // Foco inicial quando abre
  useEffect(() => {
    if (open) {
      // defer para garantir que o dialog já está no DOM
      const id = setTimeout(() => {
        firstFocusRef.current?.focus();
      }, 20);
      return () => clearTimeout(id);
    }
  }, [open]);

  // Fecha no Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  // Scroll lock no body
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (invalid || state === "submitting") return;

    setState("submitting");
    const result = await submitFeedback({
      tipo,
      mensagem: mensagem.trim(),
      ...(currentPath ? { contexto: currentPath } : {}),
      ...(userEmail   ? { email: userEmail }      : {}),
    });

    if (result.ok) {
      setState("success");
      setServerMsg(result.message);
    } else {
      setState("error");
      setServerMsg(result.message);
    }
  }

  return (
    <>
      {/* Scrim */}
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(4,8,18,.55)",
          zIndex: 200,
          animation: "feedbackFade .18s ease",
        }}
      />

      {/* Dialog */}
      <dialog
        ref={dialogRef}
        open
        aria-modal="true"
        aria-labelledby={titleId}
        style={{
          position: "fixed",
          inset: 0,
          margin: "auto",
          zIndex: 201,
          padding: 0,
          border: 0,
          background: "transparent",
          maxHeight: "100dvh",
          maxWidth: "100vw",
          width: "min(540px, 96vw)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          animation: "feedbackSlideUp .22s cubic-bezier(.2,.7,.3,1)",
        }}
      >
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-xl)",
            boxShadow: "var(--shadow-xl, 0 24px 64px rgba(0,0,0,.28))",
            width: "100%",
            maxHeight: "90dvh",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* ── Header ── */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "20px 22px 16px",
              borderBottom: "1px solid var(--border)",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                aria-hidden="true"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "var(--r-md)",
                  background: "color-mix(in srgb, var(--brand) 12%, var(--surface))",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--brand-ink)",
                  flexShrink: 0,
                }}
              >
                <MessageSquare size={17} aria-hidden="true" />
              </span>
              <div>
                <h2
                  id={titleId}
                  style={{ fontSize: 16, fontWeight: 700, color: "var(--t-hi)", margin: 0 }}
                >
                  Suporte e Feedback
                </h2>
                <p style={{ fontSize: 12, color: "var(--t-mid)", margin: "2px 0 0" }}>
                  Ajude a Fonte.ia a melhorar para você
                </p>
              </div>
            </div>
            <button
              ref={firstFocusRef}
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--t-low)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 6,
                borderRadius: "var(--r-md)",
                transition: "color .14s, background .14s",
              }}
              onMouseOver={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "var(--t-hi)";
                (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-2)";
              }}
              onMouseOut={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "var(--t-low)";
                (e.currentTarget as HTMLButtonElement).style.background = "none";
              }}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          {/* ── Body ── */}
          <div style={{ padding: "20px 22px 24px", flex: 1 }}>
            {state === "success" ? (
              <SuccessView message={serverMsg} onClose={onClose} />
            ) : (
              <form onSubmit={(e) => { void handleSubmit(e); }} noValidate>
                {/* Tipo */}
                <fieldset style={{ border: "none", margin: 0, padding: 0, marginBottom: 18 }}>
                  <legend
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--t-hi)",
                      marginBottom: 10,
                      display: "block",
                      float: "left",
                      width: "100%",
                    }}
                  >
                    Qual o tipo de feedback?
                  </legend>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, 1fr)",
                      gap: 8,
                      clear: "both",
                    }}
                    role="group"
                  >
                    {FEEDBACK_TIPOS.map((ft) => {
                      const isSelected = tipo === ft.value;
                      return (
                        <button
                          key={ft.value}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          onClick={() => setTipo(ft.value)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "10px 13px",
                            borderRadius: "var(--r-md)",
                            border: `1.5px solid ${isSelected ? "var(--brand-ink)" : "var(--border)"}`,
                            background: isSelected
                              ? "color-mix(in srgb, var(--brand) 10%, var(--surface))"
                              : "var(--surface-2)",
                            color: isSelected ? "var(--brand-ink)" : "var(--t-mid)",
                            fontWeight: isSelected ? 700 : 500,
                            fontSize: 13.5,
                            cursor: "pointer",
                            transition: "border-color .14s, background .14s, color .14s",
                            textAlign: "left",
                            fontFamily: "inherit",
                          }}
                        >
                          <span aria-hidden="true" style={{ fontSize: 16 }}>{ft.emoji}</span>
                          <span>{ft.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                {/* Mensagem */}
                <div style={{ marginBottom: 18 }}>
                  <label
                    htmlFor="feedback-mensagem"
                    style={{
                      display: "block",
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--t-hi)",
                      marginBottom: 7,
                    }}
                  >
                    Descreva com detalhes
                    <span aria-hidden="true" style={{ color: "var(--danger)", marginLeft: 3 }}>*</span>
                  </label>
                  <textarea
                    id="feedback-mensagem"
                    name="mensagem"
                    rows={5}
                    required
                    minLength={MIN_CHARS}
                    maxLength={MAX_CHARS + 50}
                    placeholder={
                      tipo === "bug"
                        ? "O que aconteceu? Em qual tela? O que você esperava que acontecesse?"
                        : tipo === "reclamação"
                        ? "O que não está funcionando bem para você?"
                        : tipo === "melhoria"
                        ? "O que poderia ser melhorado? Como seria a versão ideal?"
                        : "O que você gostaria de ver na Fonte.ia?"
                    }
                    value={mensagem}
                    onChange={(e) => setMensagem(e.target.value)}
                    aria-invalid={charCount > 0 && tooShort ? "true" : undefined}
                    aria-describedby="feedback-char-hint"
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      padding: "11px 13px",
                      borderRadius: "var(--r-md)",
                      border: `1.5px solid ${charCount > 0 && tooShort ? "var(--danger)" : tooLong ? "var(--warn)" : "var(--border)"}`,
                      background: "var(--surface-2)",
                      color: "var(--t-hi)",
                      fontSize: 14,
                      fontFamily: "inherit",
                      lineHeight: 1.5,
                      resize: "vertical",
                      outline: "none",
                      transition: "border-color .14s",
                    }}
                    onFocus={(e) => {
                      if (!(charCount > 0 && tooShort) && !tooLong) {
                        (e.target as HTMLTextAreaElement).style.borderColor = "var(--brand-ink)";
                      }
                    }}
                    onBlur={(e) => {
                      const inErr = (charCount > 0 && tooShort) || tooLong;
                      (e.target as HTMLTextAreaElement).style.borderColor = inErr
                        ? charCount > 0 && tooShort ? "var(--danger)" : "var(--warn)"
                        : "var(--border)";
                    }}
                  />
                  <div
                    id="feedback-char-hint"
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginTop: 5,
                      fontSize: 11.5,
                    }}
                  >
                    {charCount > 0 && tooShort ? (
                      <span style={{ color: "var(--danger)" }}>
                        Mínimo de {MIN_CHARS} caracteres ({MIN_CHARS - charCount} restantes)
                      </span>
                    ) : (
                      <span style={{ color: "var(--t-low)" }}>Mínimo {MIN_CHARS} caracteres</span>
                    )}
                    <span
                      style={{
                        color: tooLong ? "var(--danger)" : charCount > MAX_CHARS * 0.85 ? "var(--warn)" : "var(--t-low)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {charCount}/{MAX_CHARS}
                    </span>
                  </div>
                </div>

                {/* Contexto capturado automaticamente */}
                {currentPath ? (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      padding: "8px 11px",
                      borderRadius: "var(--r-md)",
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      marginBottom: 18,
                      fontSize: 12,
                      color: "var(--t-mid)",
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                      <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
                      <path d="M6.5 5v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                      <circle cx="6.5" cy="3.5" r=".7" fill="currentColor" />
                    </svg>
                    <span>
                      Rota capturada automaticamente:{" "}
                      <code style={{ fontSize: 11, fontFamily: "monospace", color: "var(--t-hi)" }}>
                        {currentPath}
                      </code>
                    </span>
                  </div>
                ) : null}

                {/* Erro do servidor */}
                {state === "error" ? (
                  <div
                    role="alert"
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 9,
                      padding: "11px 13px",
                      borderRadius: "var(--r-md)",
                      background: "color-mix(in srgb, var(--danger) 10%, var(--surface))",
                      border: "1px solid color-mix(in srgb, var(--danger) 30%, transparent)",
                      marginBottom: 16,
                      fontSize: 13,
                      color: "var(--danger)",
                    }}
                  >
                    <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
                    <span>{serverMsg || "Ocorreu um erro. Tente novamente."}</span>
                  </div>
                ) : null}

                {/* Actions */}
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={onClose}
                    style={{
                      padding: "9px 18px",
                      borderRadius: "var(--r-md)",
                      border: "1px solid var(--border)",
                      background: "var(--surface-2)",
                      color: "var(--t-mid)",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      transition: "background .14s",
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={invalid || state === "submitting"}
                    aria-busy={state === "submitting"}
                    style={{
                      padding: "9px 22px",
                      borderRadius: "var(--r-md)",
                      border: "none",
                      background: invalid || state === "submitting"
                        ? "color-mix(in srgb, var(--brand) 55%, var(--surface))"
                        : "var(--brand-ink)",
                      color: "#fff",
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: invalid || state === "submitting" ? "not-allowed" : "pointer",
                      fontFamily: "inherit",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 7,
                      transition: "background .14s, opacity .14s",
                      opacity: state === "submitting" ? 0.8 : 1,
                    }}
                  >
                    {state === "submitting" ? (
                      <>
                        <SpinnerIcon />
                        Enviando…
                      </>
                    ) : (
                      "Enviar feedback"
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </dialog>

      <style>{`
        @keyframes feedbackFade     { from { opacity: 0 } to { opacity: 1 } }
        @keyframes feedbackSlideUp  { from { opacity: 0; transform: translateY(18px) } to { opacity: 1; transform: translateY(0) } }
        @media (prefers-reduced-motion: reduce) {
          [style*="feedbackFade"], [style*="feedbackSlideUp"] { animation: none !important }
        }
      `}</style>
    </>
  );
}

// ─── Success view ─────────────────────────────────────────────────────────────

function SuccessView({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: 14,
        padding: "24px 12px 8px",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 52,
          height: 52,
          borderRadius: "50%",
          background: "color-mix(in srgb, var(--ok, #16a34a) 12%, var(--surface))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--ok, #16a34a)",
        }}
      >
        <CheckCircle size={26} aria-hidden="true" />
      </span>
      <div>
        <div style={{ fontWeight: 700, fontSize: 16, color: "var(--t-hi)", marginBottom: 6 }}>
          Recebemos seu feedback!
        </div>
        <p style={{ fontSize: 14, color: "var(--t-mid)", margin: 0, lineHeight: 1.5 }}>
          {message || "Obrigado pela sua contribuição. Isso nos ajuda a melhorar a Fonte.ia."}
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        style={{
          marginTop: 8,
          padding: "9px 28px",
          borderRadius: "var(--r-md)",
          border: "1px solid var(--border)",
          background: "var(--surface-2)",
          color: "var(--t-hi)",
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        Fechar
      </button>
    </div>
  );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function SpinnerIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      style={{ animation: "spin .75s linear infinite" }}
    >
      <circle cx="7" cy="7" r="5.5" stroke="rgba(255,255,255,.3)" strokeWidth="1.5" />
      <path d="M7 1.5A5.5 5.5 0 0 1 12.5 7" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </svg>
  );
}
