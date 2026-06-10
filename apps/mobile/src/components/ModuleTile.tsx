import type { ProductModule } from "@fonteia/domain";
import type { MobileModuleTileModel } from "../types";

export function createModuleTile(module: ProductModule): MobileModuleTileModel {
  const isActive = module.status === "active";

  return {
    id: module.id,
    label: module.label,
    statusLabel: isActive ? "liberado" : "travado",
    promise: module.promise,
    targetPersona: module.targetPersona,
    primaryAction: {
      id: `${module.id}-${isActive ? "open" : "upgrade"}`,
      label: isActive ? "Abrir agora" : "Entrar na lista",
      route: isActive ? "home" : "modules",
      moduleId: module.id,
    },
  };
}
