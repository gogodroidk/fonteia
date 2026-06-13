/**
 * Configuração do Cloudflare Turnstile (anti-bot / CAPTCHA).
 *
 * A site key é pública por design — pode ir no bundle.
 * A secret key fica EXCLUSIVAMENTE no servidor (Supabase / Worker de backend).
 *
 * Turnstile nativo do Supabase Auth: quando o dono habilitar "CAPTCHA protection"
 * no painel Supabase → Authentication → Bot and Abuse Protection → Cloudflare Turnstile,
 * o token gerado aqui é validado automaticamente no servidor ao receber o signUp.
 */

/** Site key pública do Turnstile (domínio cadastrado: fontebrasil.online). */
export const TURNSTILE_SITE_KEY =
  import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "0x4AAAAAADkJxee9Kw5NDLsx";

/**
 * true quando há uma site key configurada.
 * false impede qualquer tentativa de renderizar o widget.
 */
export function isTurnstileEnabled(): boolean {
  return typeof TURNSTILE_SITE_KEY === "string" && TURNSTILE_SITE_KEY.length > 0;
}
