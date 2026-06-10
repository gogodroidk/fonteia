import { PRODUCT_MODULES } from "@fonteia/domain";
import { createModuleTile } from "../components/ModuleTile";
import type { MobileModuleTileModel, MobileScreenModel } from "../types";

export interface ModulesScreenModel extends MobileScreenModel {
  activeModuleId: "leiloes";
  tiles: MobileModuleTileModel[];
  upgradeMessage: string;
}

export function createModulesScreen(): ModulesScreenModel {
  return {
    id: "modules",
    eyebrow: "Produtos dentro do SaaS",
    title: "Uma entrada, varias formas de monetizar",
    activeModuleId: "leiloes",
    tiles: PRODUCT_MODULES.map(createModuleTile),
    upgradeMessage:
      "Modulos travados ficam visiveis para criar desejo, explicar a cascata e puxar upgrade sem esconder o potencial da plataforma.",
  };
}
