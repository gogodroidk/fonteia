import type { MobileAlertPreview, MobileScreenModel } from "../types";

export interface AlertsScreenModel extends MobileScreenModel {
  pushReady: boolean;
  alerts: MobileAlertPreview[];
}

export function createAlertsScreen(): AlertsScreenModel {
  return {
    id: "alerts",
    eyebrow: "Alertas inteligentes",
    title: "O app te chama quando precisa agir",
    pushReady: true,
    primaryAction: { id: "create-monitor", label: "Criar monitoramento", route: "alerts" },
    alerts: [
      {
        id: "deadline-receita",
        title: "Prazo de proposta proximo",
        summary: "Lote da Receita precisa de validacao de edital e custos antes do prazo.",
        moduleId: "leiloes",
        priority: "warning",
        dueLabel: "48h",
        action: { id: "review-lot", label: "Revisar lote", route: "home", moduleId: "leiloes" },
      },
      {
        id: "source-update-receita",
        title: "Fonte atualizada",
        summary: "Novos lotes podem ter entrado no endpoint operacional da Receita.",
        moduleId: "leiloes",
        priority: "info",
        action: { id: "open-radar", label: "Abrir radar", route: "home", moduleId: "leiloes" },
      },
      {
        id: "cross-sell-empresas",
        title: "Proximo modulo recomendado",
        summary: "Empresas libera checagem de sancoes, CNPJ e contratos publicos.",
        moduleId: "empresas",
        priority: "info",
        action: { id: "open-modules", label: "Ver upgrade", route: "modules", moduleId: "empresas" },
      },
    ],
  };
}
