/**
 * Configuração de checkout do Stripe — Payment Links (sem backend).
 *
 * ┌─ COMO LIGAR O CHECKOUT REAL ──────────────────────────────────────────────┐
 * │ 1. No painel do Stripe → Produtos → Payment Links, crie um link recorrente │
 * │    mensal (BRL) para cada plano pago.                                       │
 * │ 2. Cole as URLs (https://buy.stripe.com/...) em STRIPE_PAYMENT_LINKS abaixo.│
 * │ 3. (Opcional) Cole a URL do Customer Portal (https://billing.stripe.com/...)│
 * │    em STRIPE_CUSTOMER_PORTAL_URL para o botão "Gerenciar assinatura".       │
 * │ Enquanto os campos estão vazios, o botão "Assinar" mostra o contato —       │
 * │ nada quebra. Depois de colar, o checkout passa a cobrar de verdade.         │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * Os ids batem com os planos em data/leiloes-seed.ts (PLANOS): "pro" e "escritorio".
 * O plano "free" (Avaliação) é gratuito e não usa Stripe.
 */
export const STRIPE_PAYMENT_LINKS: Record<string, string> = {
  pro: "", // Profissional — R$ 197/mês
  escritorio: "", // Corporativo — R$ 597/mês
};

/** URL do Customer Portal do Stripe (gerenciar/cancelar assinatura, trocar cartão). */
export const STRIPE_CUSTOMER_PORTAL_URL = "";

/** Retorna o Payment Link do plano, ou null se ainda não configurado. */
export function stripeLinkFor(planId: string): string | null {
  const link = STRIPE_PAYMENT_LINKS[planId];
  return link && link.length > 0 ? link : null;
}

/** true quando há pelo menos um Payment Link configurado. */
export function isStripeConfigured(): boolean {
  return Object.values(STRIPE_PAYMENT_LINKS).some((url) => url.length > 0);
}
