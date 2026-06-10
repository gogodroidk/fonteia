import type { ModuleId } from "@fonteia/domain";

export type BillingPlanId = "free" | "individual" | "pro" | "business" | "enterprise" | "api";
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
    id: "individual",
    name: "Individual",
    audience: "Revendedores, empreendedores e compradores solo",
    priceLabel: "R$ 79",
    interval: "monthly",
    includedModules: ["leiloes", "inpi"],
    highlightedModules: ["leiloes", "inpi", "empresas"],
    quotas: {
      searchesPerMonth: 300,
      aiAnswersPerMonth: 80,
      dossiersPerMonth: 10,
      alerts: 15,
      apiCallsPerMonth: 0,
      seats: 1,
    },
    promises: ["Leiloes com alertas", "INPI para marca e prazo", "Relatorios simples com fonte"],
    cta: "Assinar Individual",
  },
  {
    id: "pro",
    name: "Pro",
    audience: "Advogados, consultores, analistas e operadores B2G",
    priceLabel: "R$ 299",
    interval: "monthly",
    includedModules: ["leiloes", "inpi", "empresas", "licitacoes", "juridico"],
    highlightedModules: ["licitacoes", "empresas", "juridico"],
    quotas: {
      searchesPerMonth: 2_000,
      aiAnswersPerMonth: 500,
      dossiersPerMonth: 80,
      alerts: 150,
      apiCallsPerMonth: 0,
      seats: 3,
    },
    promises: ["Dossies CNPJ", "Licitacoes e editais", "Monitoramento juridico basico"],
    cta: "Liberar Pro",
  },
  {
    id: "business",
    name: "Business",
    audience: "Equipes comerciais, compliance, agro, bancos e seguradoras",
    priceLabel: "R$ 1.499",
    interval: "monthly",
    includedModules: ["leiloes", "licitacoes", "empresas", "juridico", "inpi", "ambiental", "politica", "municipios"],
    highlightedModules: ["empresas", "ambiental", "municipios"],
    quotas: {
      searchesPerMonth: 15_000,
      aiAnswersPerMonth: 3_000,
      dossiersPerMonth: 500,
      alerts: 1_000,
      apiCallsPerMonth: 0,
      seats: 12,
    },
    promises: ["Equipe e compliance", "Ambiental/ESG", "Municipios e fornecedores publicos"],
    cta: "Falar com vendas",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    audience: "Grandes empresas, midias, govtechs e operacoes com SLA",
    priceLabel: "Sob consulta",
    interval: "custom",
    includedModules: ["leiloes", "licitacoes", "empresas", "juridico", "inpi", "ambiental", "politica", "municipios", "api"],
    highlightedModules: ["api", "empresas", "ambiental"],
    quotas: {
      searchesPerMonth: "custom",
      aiAnswersPerMonth: "custom",
      dossiersPerMonth: "custom",
      alerts: "custom",
      apiCallsPerMonth: "custom",
      seats: "custom",
    },
    promises: ["SLA e volume", "Integracoes e webhooks", "Retencao e governanca customizadas"],
    cta: "Desenhar contrato",
  },
  {
    id: "api",
    name: "API",
    audience: "Desenvolvedores, ERPs, fintechs, consultorias e dados embarcados",
    priceLabel: "A partir de R$ 499",
    interval: "monthly",
    includedModules: ["api"],
    highlightedModules: ["api", "empresas", "licitacoes"],
    quotas: {
      searchesPerMonth: 0,
      aiAnswersPerMonth: 0,
      dossiersPerMonth: 0,
      alerts: 50,
      apiCallsPerMonth: 25_000,
      seats: 2,
    },
    promises: ["Endpoints normalizados", "Historico e evidencia", "Webhooks por fonte e entidade"],
    cta: "Criar chave API",
  },
];

export function getBillingPlan(planId: BillingPlanId): BillingPlan {
  const plan = BILLING_PLANS.find((candidate) => candidate.id === planId);

  if (!plan) {
    throw new Error(`Unknown billing plan: ${planId}`);
  }

  return plan;
}
