import type { ModuleId } from "@fonteia/domain";

/**
 * Modelo de planos CANONICO (fonte de verdade unica do produto).
 *
 * Alinhado com: apps/web/src/config/stripe.ts, apps/web/src/lib/use-plan.ts,
 * services/stripe-webhook, infra/migrations/0002 e a RPC `my_plan`.
 *
 *   free        -> R$ 0
 *   pro         -> R$ 197/mes  (Individual/Profissional)  price_1ThjWB4zjAI9pGd7GOAfQwBT
 *   corporativo -> R$ 597/mes  (Escritorio)               price_1ThjhR4zjAI9pGd7UyBOlctV
 *
 * NAO reintroduzir tiers "individual/business/enterprise/api": o webhook so grava
 * free|pro|corporativo, e qualquer outro valor quebraria getBillingPlan().
 */
export type BillingPlanId = "free" | "pro" | "corporativo";
export type BillingInterval = "monthly" | "custom";

export interface PlanQuotas {
  searchesPerMonth: number | "custom";
  aiAnswersPerMonth: number | "custom";
  dossiersPerMonth: number | "custom";
  alerts: number | "custom";
  apiCallsPerMonth: number | "custom";
  seats: number | "custom";
}

export interface BillingPlan {
  id: BillingPlanId;
  name: string;
  audience: string;
  priceLabel: string;
  interval: BillingInterval;
  /** price_id do Stripe (quando ha checkout direto). */
  stripePriceId?: string;
  includedModules: ModuleId[];
  highlightedModules: ModuleId[];
  quotas: PlanQuotas;
  promises: string[];
  cta: string;
}

export const BILLING_PLANS: BillingPlan[] = [
  {
    id: "free",
    name: "Free",
    audience: "Curiosos, validacao inicial e politica/transparencia basica",
    priceLabel: "R$ 0",
    interval: "monthly",
    includedModules: ["leiloes"],
    highlightedModules: ["leiloes", "politica"],
    quotas: {
      searchesPerMonth: 20,
      aiAnswersPerMonth: 5,
      dossiersPerMonth: 1,
      alerts: 1,
      apiCallsPerMonth: 0,
      seats: 1,
    },
    promises: ["Radar limitado de Leiloes", "Fontes e evidencias visiveis", "Upgrade claro para modulos travados"],
    cta: "Comecar gratis",
  },
  {
    id: "pro",
    name: "Profissional",
    audience: "Revendedores, empreendedores e compradores solo",
    priceLabel: "R$ 197",
    interval: "monthly",
    stripePriceId: "price_1ThjWB4zjAI9pGd7GOAfQwBT",
    includedModules: ["leiloes", "inpi", "empresas"],
    highlightedModules: ["leiloes", "inpi", "empresas"],
    quotas: {
      searchesPerMonth: 500,
      aiAnswersPerMonth: 100,
      dossiersPerMonth: 20,
      alerts: 20,
      apiCallsPerMonth: 0,
      seats: 1,
    },
    promises: ["Leiloes com alertas", "INPI para marca e prazo", "Dossies CNPJ com fonte rastreavel"],
    cta: "Assinar Profissional",
  },
  {
    id: "corporativo",
    name: "Escritorio",
    audience: "Advogados, consultores, analistas, compliance e operadores B2G",
    priceLabel: "R$ 597",
    interval: "monthly",
    stripePriceId: "price_1ThjhR4zjAI9pGd7UyBOlctV",
    includedModules: ["leiloes", "inpi", "empresas", "licitacoes", "juridico", "ambiental", "politica", "municipios"],
    highlightedModules: ["licitacoes", "empresas", "juridico"],
    quotas: {
      searchesPerMonth: 5_000,
      aiAnswersPerMonth: 1_000,
      dossiersPerMonth: 200,
      alerts: 500,
      apiCallsPerMonth: 0,
      seats: 5,
    },
    promises: ["Todos os modulos", "Licitacoes, juridico e ambiental", "Equipe e monitoramento continuo"],
    cta: "Liberar Escritorio",
  },
];

export function getBillingPlan(planId: BillingPlanId): BillingPlan {
  const plan = BILLING_PLANS.find((candidate) => candidate.id === planId);

  if (!plan) {
    throw new Error(`Unknown billing plan: ${planId}`);
  }

  return plan;
}
