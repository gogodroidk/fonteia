/**
 * PWA Install Prompt — Fonte.ia
 *
 * Two paths:
 *   • Android/Chrome: intercepts the native `beforeinstallprompt` event and
 *     shows a dismissible banner with an "Instalar" button.
 *   • iOS/Safari: detects the platform and shows instructions to use the
 *     Share → "Adicionar à Tela de Início" flow.
 *
 * SSG-safe: NO browser API is accessed at module level or during the first
 * synchronous render. All browser reads happen inside useEffect / event handlers
 * guarded by `typeof window !== "undefined"`.
 */

import { useEffect, useState } from "react";
import { Share, X, Smartphone } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type BannerKind = "android" | "ios" | null;

// ── Constants ──────────────────────────────────────────────────────────────────

const LS_KEY = "fonteia.pwa.dismissed";
const DISMISS_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

// ── Helpers (only called from inside effects/handlers — never at module level) ─

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigator as any).standalone === true
  );
}

function isDismissedRecently(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "t" in parsed &&
      typeof (parsed as { t: unknown }).t === "number"
    ) {
      return Date.now() - (parsed as { t: number }).t < DISMISS_TTL_MS;
    }
  } catch {
    // ignore parse errors
  }
  return false;
}

function saveDismissed(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ t: Date.now() }));
  } catch {
    // ignore storage errors (private mode, full quota, etc.)
  }
}

function detectiOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function detectSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  // Safari on iOS: has "Safari" in UA but NOT "Chrome", "CriOS", or "FxiOS"
  const ua = navigator.userAgent;
  return /safari/i.test(ua) && !/chrome|crios|fxios|edgios/i.test(ua);
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PwaInstallPrompt() {
  // null → not determined yet (SSG renders null), non-null → show banner
  const [kind, setKind] = useState<BannerKind>(null);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  // Determine which banner to show (or none)
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Already installed — never show
    if (isStandalone()) return;

    // Previously dismissed recently — skip
    if (isDismissedRecently()) return;

    const iOS = detectiOS();
    const safari = detectSafari();

    // iOS Safari path: no beforeinstallprompt, show manual instructions
    if (iOS && safari) {
      setKind("ios");
      setVisible(true);
      return;
    }

    // Android/Chrome path: wait for the native event
    function handleBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setKind("android");
      setVisible(true);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
    };
  }, []);

  function handleDismiss() {
    saveDismissed();
    setVisible(false);
  }

  async function handleInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      // Installed — hide permanently for this session
      setVisible(false);
      setDeferredPrompt(null);
    } else {
      // User declined the native dialog — treat like a dismiss
      saveDismissed();
      setVisible(false);
    }
  }

  // Render nothing while we don't know the state (SSG / first render)
  if (!visible || kind === null) return null;

  return (
    <>
      {/* Scoped styles — avoids leaking into the global stylesheet */}
      <style>{`
        .pwa-banner {
          position: fixed;
          z-index: 9999;
          left: 12px;
          right: 12px;
          bottom: calc(64px + env(safe-area-inset-bottom) + 12px);
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--r-xl);
          box-shadow: var(--shadow-xl);
          padding: 14px 14px 14px 16px;
          display: flex;
          align-items: flex-start;
          gap: 12px;
          animation: pwa-slide-in 0.28s cubic-bezier(0.2, 0.8, 0.3, 1) both;
        }

        @media (min-width: 901px) {
          .pwa-banner {
            left: auto;
            right: 24px;
            bottom: 24px;
            max-width: 360px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .pwa-banner {
            animation: none;
          }
        }

        @keyframes pwa-slide-in {
          from {
            opacity: 0;
            transform: translateY(18px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .pwa-banner__icon {
          flex: 0 0 auto;
          width: 44px;
          height: 44px;
          border-radius: var(--r-md);
          object-fit: cover;
          box-shadow: var(--shadow-sm);
        }

        .pwa-banner__body {
          flex: 1 1 0;
          min-width: 0;
        }

        .pwa-banner__title {
          font-size: 14px;
          font-weight: 700;
          color: var(--t-hi);
          margin: 0 0 3px;
          line-height: 1.3;
        }

        .pwa-banner__sub {
          font-size: 12.5px;
          color: var(--t-mid);
          margin: 0 0 12px;
          line-height: 1.4;
        }

        .pwa-banner__actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .pwa-banner__close {
          flex: 0 0 auto;
          align-self: flex-start;
          padding: 4px;
          background: transparent;
          border: 0;
          cursor: pointer;
          color: var(--t-low);
          border-radius: var(--r-sm);
          line-height: 0;
          transition: color 0.15s, background 0.15s;
        }

        .pwa-banner__close:hover {
          color: var(--t-hi);
          background: var(--surface-2);
        }

        .pwa-banner__close:focus-visible {
          outline: 2px solid var(--brand-ink);
          outline-offset: 2px;
        }

        .pwa-banner__ios-tip {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12.5px;
          color: var(--t-mid);
          margin: 0 0 12px;
          line-height: 1.4;
        }

        .pwa-banner__ios-tip svg {
          flex: 0 0 auto;
          color: var(--brand-ink);
        }
      `}</style>

      <div
        className="pwa-banner"
        role="region"
        aria-label="Instalar aplicativo Fonte.ia"
      >
        <img
          src="/icon-192.png"
          alt="Ícone Fonte.ia"
          className="pwa-banner__icon"
          width={44}
          height={44}
          decoding="async"
        />

        <div className="pwa-banner__body">
          <p className="pwa-banner__title">
            {kind === "android"
              ? "Instale o Fonte.ia no seu celular"
              : "Adicione o Fonte.ia à Tela de Início"}
          </p>

          {kind === "android" && (
            <>
              <p className="pwa-banner__sub">
                Acesso rápido, em tela cheia, direto da sua tela inicial.
              </p>
              <div className="pwa-banner__actions">
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={() => void handleInstall()}
                >
                  <Smartphone size={14} aria-hidden="true" />
                  Instalar
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={handleDismiss}
                >
                  Agora não
                </button>
              </div>
            </>
          )}

          {kind === "ios" && (
            <>
              <p className="pwa-banner__sub">
                Acesso rápido, em tela cheia, direto da sua tela inicial.
              </p>
              <p className="pwa-banner__ios-tip">
                <Share size={14} aria-hidden="true" />
                Toque em{" "}
                <strong style={{ color: "var(--t-hi)" }}>Compartilhar</strong>
                {" "}e escolha{" "}
                <strong style={{ color: "var(--t-hi)" }}>
                  &ldquo;Adicionar à Tela de Início&rdquo;
                </strong>
                .
              </p>
              <div className="pwa-banner__actions">
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={handleDismiss}
                >
                  Entendi
                </button>
              </div>
            </>
          )}
        </div>

        <button
          type="button"
          className="pwa-banner__close"
          onClick={handleDismiss}
          aria-label="Fechar"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </>
  );
}

export default PwaInstallPrompt;
