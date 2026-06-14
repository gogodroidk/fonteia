import { useEffect, useRef, useState } from "react";
import { Cookie } from "lucide-react";
import { getConsent, hasConsent, saveConsent } from "../lib/consent";

interface CookieBannerProps {
  onOpenPolicy?: () => void;
}

export function CookieBanner({ onOpenPolicy }: CookieBannerProps) {
  const [open, setOpen] = useState(false);
  const [customize, setCustomize] = useState(false);
  const [funcionais, setFuncionais] = useState(true);
  const [analiticos, setAnaliticos] = useState(false);
  const [publicidade, setPublicidade] = useState(false);
  const innerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Barra de consentimento (NÃO é modal): aparece com um atraso curto pra não
    // cobrir o hero/formulário no carregamento e não bloquear a interação.
    let t: ReturnType<typeof setTimeout> | undefined;
    if (!hasConsent()) t = setTimeout(() => setOpen(true), 1400);
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
    return () => {
      window.removeEventListener("fonteia:cookies", reopen);
      if (t) clearTimeout(t);
    };
  }, []);

  // Reserva espaço no fim da página enquanto a barra estiver visível, para que
  // ela NUNCA cubra conteúdo (ex.: formulário de login, link de WhatsApp em
  // /contato). Mede a altura real do banner e aplica como padding-bottom no body.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const body = document.body;
    if (!open) {
      body.style.removeProperty("padding-bottom");
      return;
    }
    const apply = () => {
      const h = innerRef.current?.getBoundingClientRect().height ?? 0;
      // 24px de folga abaixo do banner
      body.style.paddingBottom = `${Math.ceil(h) + 24}px`;
    };
    apply();
    const ro =
      typeof ResizeObserver !== "undefined" && innerRef.current
        ? new ResizeObserver(apply)
        : null;
    if (ro && innerRef.current) ro.observe(innerRef.current);
    window.addEventListener("resize", apply);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", apply);
      body.style.removeProperty("padding-bottom");
    };
  }, [open, customize]);

  // a11y: Escape apenas DISPENSA a barra quando o foco está dentro dela.
  // Não força "recusar tudo" (decisão de consentimento não solicitada) nem
  // sequestra o Escape global da página — sem consentimento salvo, a barra
  // reaparece numa próxima visita (estado privacy-safe e não presuntivo).
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key !== "Escape") return;
      const node = innerRef.current;
      if (node && node.contains(document.activeElement)) {
        setOpen(false);
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
    <div className="cookie-banner" role="region" aria-label="Preferências de cookies">
      <div className="cookie-banner-inner" ref={innerRef}>
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
              <input type="checkbox" checked readOnly aria-disabled="true" />
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
