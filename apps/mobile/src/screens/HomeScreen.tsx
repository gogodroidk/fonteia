import { PRODUCT_MODULES } from "@fonteia/domain";
import { createAnswerCard } from "../components/AnswerCard";
import { createModuleTile } from "../components/ModuleTile";
import type { MobileAlertPreview, MobileScreenModel } from "../types";

export interface HomeScreenModel extends MobileScreenModel {
  moduleTiles: ReturnType<typeof createModuleTile>[];
  recentDossiers: Array<{
    id: string;
    title: string;
    subtitle: string;
    moduleId: "leiloes" | "empresas" | "politica";
  }>;
  alertPreview: MobileAlertPreview;
  featuredAnswer: ReturnType<typeof createAnswerCard>;
}

export function createHomeScreen(): HomeScreenModel {
  return {
    id: "home",
    eyebrow: "Hoje no Fonte.ia",
    title: "Decida rapido com fonte oficial",
    primaryAction: { id: "ask-now", label: "Perguntar para a IA", route: "ask" },
    moduleTiles: PRODUCT_MODULES.slice(0, 6).map(createModuleTile),
    recentDossiers: [
      {
        id: "dossier-leilao-curitiba",
        title: "Lote Receita em Curitiba",
        subtitle: "Score, prazo, restricoes e evidencia oficial",
        moduleId: "leiloes",
      },
      {
        id: "dossier-empresa-cross-sell",
        title: "Fornecedor para checagem",
        subtitle: "Modulo Empresas travado como proximo upsell",
        moduleId: "empresas",
      },
      {
        id: "dossier-politica-demo",
        title: "Mapa publico da regiao",
        subtitle: "Transparencia e politica aparecem como cascata",
        moduleId: "politica",
      },
    ],
    alertPreview: {
      id: "alert-leilao-prazo",
      title: "Prazo de proposta chegando",
      summary: "Confirme edital, retirada e custos antes de fazer qualquer movimento.",
      moduleId: "leiloes",
      priority: "warning",
      dueLabel: "48h",
      action: { id: "open-alerts", label: "Ver alertas", route: "alerts", moduleId: "leiloes" },
    },
    featuredAnswer: createAnswerCard(),
  };
}
