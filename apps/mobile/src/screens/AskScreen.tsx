import { createAnswerCard } from "../components/AnswerCard";
import type { MobileAnswerCardModel, MobileScreenModel } from "../types";

export interface AskScreenModel extends MobileScreenModel {
  inputPlaceholder: string;
  voiceReady: boolean;
  suggestedQuestions: string[];
  answerCards: MobileAnswerCardModel[];
}

export function createAskScreen(): AskScreenModel {
  return {
    id: "ask",
    eyebrow: "Pergunta rapida",
    title: "Fale ou escreva o que quer descobrir",
    primaryAction: { id: "run-question", label: "Analisar", route: "ask" },
    inputPlaceholder: "Esse lote da Receita vale a pena?",
    voiceReady: true,
    suggestedQuestions: [
      "Esse lote permite pessoa fisica?",
      "Qual o risco antes de dar lance?",
      "Essa empresa tem sancao publica?",
      "Essa marca parece livre no INPI?",
    ],
    answerCards: [
      createAnswerCard(),
      createAnswerCard({
        id: "answer-cross-sell-empresas",
        title: "Quer reduzir risco? Cheque a empresa ligada",
        summary: "O proximo passo comercial e liberar Empresas para cruzar CNPJ, sancoes e contratos publicos.",
        moduleId: "empresas",
        priority: "info",
        nextAction: "Liberar modulo Empresas",
      }),
    ],
  };
}
