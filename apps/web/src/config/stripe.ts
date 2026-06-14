/**
 * Configuração de checkout do Stripe — Payment Links em modo LIVE (produção).
 *
 * ⚠️ PRODUÇÃO: estes Payment Links cobram de verdade (cartão/Pix).
 *
 * Este arquivo (frontend) contém APENAS dados públicos:
 *  - Payment Links, Customer Portal e a Publishable Key (pk_live_…) podem ir no bundle.
 *  - A Secret Key (sk_live_…) NUNCA entra aqui — fica só no Worker de webhook (env var).
 *
 * A liberação de plano é feita pelo WEBHOOK (services/stripe-webhook) que escreve
 * no Supabase — não pelo redirect de sucesso (que é só visual).
 */

/** Chave publishable do Stripe (pública por design). */
export const STRIPE_PUBLISHABLE_KEY =
  "pk_live_51Sei4m4zjAI9pGd7PT2FgBYrpeUujaeQPEqXQ6J9X6yVnaZtaMXAXdhzGYhqXibJsYDg9hh32lHcOkF2iHMHYw3I007IWdiHIC";

/**
 * Payment Links por id de plano (bate com PLANOS em data/leiloes-seed.ts).
 *
 * O plano Corporativo NÃO tem Payment Link aqui por design:
 * o CTA em PLANOS é "Falar com vendas" (contato comercial, não checkout direto).
 * Ter um Payment Link para ele faria o botão redirecionar ao Stripe cobrando R$597
 * na hora, quebrando a expectativa do usuário que clicou esperando falar com um humano.
 * Quando não há link, handleChoose() em billing/page.tsx exibe o painel de contato
 * com o e-mail comercial — ação e CTA ficam coerentes (honestidade de oferta).
 */
export const STRIPE_PAYMENT_LINKS: Record<string, string> = {
  pro: "https://buy.stripe.com/dRm00c4NGgYPdpV8HHasg00", // Profissional — R$ 197/mês
  // corporativo: removido — CTA é "Falar com vendas", não checkout direto.
  // Adicione o link aqui SOMENTE se o CTA em leiloes-seed.ts mudar para "Assinar o Corporativo".
};

/**
 * Customer Portal do Stripe (gerenciar/cancelar assinatura, trocar cartão, faturas).
 * ⚠️ DEIXAR VAZIO até colar o link REAL do dashboard
 * (Stripe → Settings → Billing → Customer portal → ativar → "Share link").
 * O valor anterior era cópia do slug do Payment Link (link quebrado) — removido
 * pra não mostrar um botão "Gerenciar assinatura" que não funciona. Enquanto vazio,
 * o botão fica oculto e o cancelamento é por contato@olli.com.br.
 */
export const STRIPE_CUSTOMER_PORTAL_URL: string = "";

export type PlanId = "free" | "pro" | "corporativo";

/** Mapeamento price_id (Stripe) → plan_id (app/banco). Usado pelo webhook. */
export const STRIPE_PRICE_TO_PLAN: Record<string, PlanId> = {
  price_1ThjWB4zjAI9pGd7GOAfQwBT: "pro",
  price_1ThjhR4zjAI9pGd7UyBOlctV: "corporativo",
};

/** Mapeia um price_id do Stripe para o plano interno (fallback: free). */
export function getPlanByStripePrice(priceId: string): PlanId {
  return STRIPE_PRICE_TO_PLAN[priceId] ?? "free";
}

/** Retorna o Payment Link do plano, ou null se não houver. */
export function stripeLinkFor(planId: string): string | null {
  const link = STRIPE_PAYMENT_LINKS[planId];
  return link && link.length > 0 ? link : null;
}

/** true quando há pelo menos um Payment Link configurado. */
export function isStripeConfigured(): boolean {
  return Object.values(STRIPE_PAYMENT_LINKS).some((url) => url.length > 0);
}
