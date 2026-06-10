import type { ReceitaLeilaoLot } from "@fonteia/sources";

export type AlertType = "deadline" | "source_update" | "entity_change" | "new_match" | "risk_increase";
export type NotificationChannel = "in_app" | "email" | "push" | "webhook";

export interface AlertEvent {
  id: string;
  type: AlertType;
  moduleId: "leiloes" | "licitacoes" | "empresas" | "juridico" | "inpi" | "ambiental" | "politica" | "municipios" | "api";
  entityId: string;
  title: string;
  summary: string;
  severity: "info" | "warning" | "critical";
  dueAt?: string;
  evidenceIds: string[];
  createdAt: string;
}

export interface CrossSellSuggestion {
  id: string;
  sourceModuleId: "leiloes";
  targetModuleId: "empresas" | "municipios" | "juridico" | "politica";
  label: string;
  reason: string;
  locked: boolean;
  upgradeCta: string;
}

export interface NotificationPreferences {
  enabled: boolean;
  channels: NotificationChannel[];
  disabledTypes?: AlertType[];
}

function daysUntil(deadline: string, now: Date): number {
  const deadlineMs = new Date(deadline).getTime();

  if (Number.isNaN(deadlineMs)) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.ceil((deadlineMs - now.getTime()) / 86_400_000);
}

export function buildLeilaoAlerts(lot: ReceitaLeilaoLot, now = new Date()): AlertEvent[] {
  const createdAt = now.toISOString();
  const alerts: AlertEvent[] = [
    {
      id: `${lot.id}:source-update`,
      type: "source_update",
      moduleId: "leiloes",
      entityId: lot.id,
      title: "Fonte da Receita monitorada",
      summary: "Este lote vem de endpoint operacional publico da Receita e deve ser verificado na fonte oficial antes de agir.",
      severity: "info",
      evidenceIds: [`ev-${lot.id}-source`],
      createdAt,
    },
    {
      id: `${lot.id}:entity-change`,
      type: "entity_change",
      moduleId: "leiloes",
      entityId: lot.id,
      title: "Monitorar mudancas no lote",
      summary: "Acompanhe mudancas de valor, prazo, elegibilidade e imagem do lote.",
      severity: "info",
      evidenceIds: [`ev-${lot.id}-source`],
      createdAt,
    },
  ];

  const days = daysUntil(lot.proposalDeadline, now);

  if (days <= 2) {
    alerts.push({
      id: `${lot.id}:proposal-deadline`,
      type: "deadline",
      moduleId: "leiloes",
      entityId: lot.id,
      title: "Prazo de proposta proximo",
      summary: `O prazo de proposta do lote ${lot.lotNumber} esta perto. Confirme regras, documentos e logistica antes de ofertar.`,
      severity: days <= 0 ? "critical" : "warning",
      dueAt: lot.proposalDeadline,
      evidenceIds: [`ev-${lot.id}-deadline`],
      createdAt,
    });
  }

  if (!lot.eligiblePersonTypes.includes("pf")) {
    alerts.push({
      id: `${lot.id}:pj-risk`,
      type: "risk_increase",
      moduleId: "leiloes",
      entityId: lot.id,
      title: "Restricao de participacao",
      summary: "O lote parece restrito a pessoa juridica, reduzindo o publico comprador e exigindo operacao formal.",
      severity: "warning",
      evidenceIds: [`ev-${lot.id}-eligibility`],
      createdAt,
    });
  }

  return alerts;
}

export function buildLeilaoCrossSellSuggestions(lot: ReceitaLeilaoLot): CrossSellSuggestion[] {
  return [
    {
      id: `${lot.id}:company-check`,
      sourceModuleId: "leiloes",
      targetModuleId: "empresas",
      label: "Analisar fornecedor como empresa",
      reason: "Cruze CNPJ, sancoes e contratos publicos antes de montar uma operacao de revenda.",
      locked: true,
      upgradeCta: "Liberar modulo Empresas",
    },
    {
      id: `${lot.id}:municipality-monitor`,
      sourceModuleId: "leiloes",
      targetModuleId: "municipios",
      label: "Monitorar municipio do lote",
      reason: `Entenda logistica, indicadores e oportunidades publicas ligadas a ${lot.city}.`,
      locked: true,
      upgradeCta: "Liberar modulo Municipios",
    },
    {
      id: `${lot.id}:dou-search`,
      sourceModuleId: "leiloes",
      targetModuleId: "juridico",
      label: "Pesquisar DOU e riscos juridicos",
      reason: "Procure mencoes, restricoes e atos oficiais que possam afetar retirada, revenda ou regularidade.",
      locked: true,
      upgradeCta: "Liberar modulo Juridico",
    },
    {
      id: `${lot.id}:public-money-map`,
      sourceModuleId: "leiloes",
      targetModuleId: "politica",
      label: "Ver contexto publico da regiao",
      reason: "Conecte oportunidades de leilao com contratos, repasses e atividade publica regional.",
      locked: true,
      upgradeCta: "Liberar modulo Politica",
    },
  ];
}

export function filterAlertEventsByPreferences(events: AlertEvent[], preferences: NotificationPreferences): AlertEvent[] {
  if (!preferences.enabled || preferences.channels.length === 0) {
    return [];
  }

  const disabledTypes = new Set(preferences.disabledTypes ?? []);
  return events.filter((event) => !disabledTypes.has(event.type));
}

