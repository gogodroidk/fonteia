import type { MobileAnswerCardModel } from "../types";

export function createAnswerCard(overrides: Partial<MobileAnswerCardModel> = {}): MobileAnswerCardModel {
  return {
    id: overrides.id ?? "answer-leiloes-margin",
    title: overrides.title ?? "Esse lote parece investigavel",
    summary:
      overrides.summary ??
      "O lote tem lance minimo baixo, prazo curto o suficiente para acao rapida e precisa de validacao de edital antes de qualquer proposta.",
    moduleId: overrides.moduleId ?? "leiloes",
    priority: overrides.priority ?? "warning",
    facts: overrides.facts ?? [
      "Fonte oficial: Receita Federal SLE",
      "Oportunidade depende de retirada, frete e restricoes PF/PJ",
      "A recomendacao nao substitui leitura do edital",
    ],
    nextAction: overrides.nextAction ?? "Abrir evidencia e salvar alerta de prazo",
    evidence: overrides.evidence ?? {
      sourceLabel: "Receita Federal SLE",
      collectedAt: "2026-06-10T10:00:00.000Z",
      confidence: 0.82,
    },
    actions: overrides.actions ?? [
      { id: "open-evidence", label: "Ver evidencia", route: "ask", moduleId: "leiloes" },
      { id: "save-alert", label: "Criar alerta", route: "alerts", moduleId: "leiloes" },
    ],
  };
}
