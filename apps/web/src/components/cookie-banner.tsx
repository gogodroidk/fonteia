import { useEffect, useState } from "react";
import { Cookie } from "lucide-react";
import { getConsent, hasConsent, saveConsent } from "../lib/consent";
import { useFocusTrap } from "../hooks/use-focus-trap";

interface CookieBannerProps {
  onOpenPolicy?: () => void;
}

export function CookieBanner({ onOpenPolicy }: CookieBannerProps) {
  const [open, setOpen] = useState(false);
  const [customize, setCustomize] = useState(false);
  const [funcionais, setFuncionais] = useState(true);
  const [analiticos, setAnaliticos] = useState(false);
  const [publicidade, setPublicidade] = useState(false);

  // a11y: trap focus inside the dialog while it is open
  const dialogRef = useFocusTrap<HTMLDivElement>(open);

  useEffect(() => {
    if (!hasConsent()) setOpen(true);
    const reopen = () => {
      const c = getConsent();
      if (c) {
        setFuncionais(c.funcionais);
        setAnaliticos(c.analiticos);
        setPublicidade(c.publicidade);
      }
      setCustomize(true);
      setOpen(true);
    };
    window.addEventListener("fonteia:cookies", reopen);
    return () => window.removeEventListener("fonteia:cookies", reopen);
  }, []);

  // a11y: allow users to dismiss the dialog with the Escape key
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        // Treat Escape as "reject all" to leave the user in a privacy-safe state
        rejectAll();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function acceptAll() {
    saveConsent({ funcionais: true, analiticos: true, publicidade: true });
    setOpen(false);
  }
  function rejectAll() {
    saveConsent({ funcionais: false, analiticos: false, publicidade: false });
    setOpen(false);
  }
  function savePrefs() {
    saveConsent({ funcionais, analiticos, publicidade });
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div className="cookie-banner" role="dialog" aria-modal="true" aria-label="Preferências de cookies" ref={dialogRef}>
      <div className="cookie-banner-inner">
        <div className="cookie-banner-head">
          <Cookie size={20} aria-hidden="true" />
          <strong>Sua privacidade</strong>
        </div>
        <p>
          Usamos cookies para fazer a plataforma funcionar e, com seu consentimento, para
          entender o uso e melhorar a experiência. Você escolhe.{" "}
          {onOpenPolicy && (
            <button type="button" className="link-btn" onClick={onOpenPolicy}>
              Política de Cookies
            </button>
          )}
        </p>

        {customize && (
          <div className="cookie-options">
            <label className="cookie-option cookie-option-locked">
              <span>
                <strong>Necessários</strong>
                <small>Essenciais para login e segurança. Sempre ativos.</small>
              </span>
              <input type="checkbox" checked readOnly disabled />
            </label>
            <label className="cookie-option">
              <span>
                <strong>Funcionais</strong>
                <small>Lembram suas preferências (idioma, filtros).</small>
              </span>
              <input type="checkbox" checked={funcionais} onChange={(e) => setFuncionais(e.target.checked)} />
            </label>
            <label className="cookie-option">
              <span>
                <strong>Analíticos</strong>
                <small>Medem o uso para melhorarmos o produto.</small>
              </span>
              <input type="checkbox" checked={analiticos} onChange={(e) => setAnaliticos(e.target.checked)} />
            </label>
            <label className="cookie-option">
              <span>
                <strong>Publicidade</strong>
                <small>Personalizam comunicações. Desativados por padrão.</small>
              </span>
              <input type="checkbox" checked={publicidade} onChange={(e) => setPublicidade(e.target.checked)} />
            </label>
          </div>
        )}

        <div className="cookie-actions">
          {customize ? (
            <>
              <button type="button" className="ghost-button" onClick={rejectAll}>
                Recusar tudo
              </button>
              <button type="button" className="primary-button" onClick={savePrefs}>
                Salvar preferências
              </button>
            </>
          ) : (
            <>
              <button type="button" className="link-btn" onClick={() => setCustomize(true)}>
                Personalizar
              </button>
              <div className="cookie-actions-main">
                <button type="button" className="ghost-button" onClick={rejectAll}>
                  Recusar
                </button>
                <button type="button" className="primary-button" onClick={acceptAll}>
                  Aceitar tudo
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
