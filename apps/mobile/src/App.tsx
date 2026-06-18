import { createAlertsScreen } from "./screens/AlertsScreen";
import { createAskScreen } from "./screens/AskScreen";
import { createHomeScreen } from "./screens/HomeScreen";
import { createModulesScreen } from "./screens/ModulesScreen";
import type { MobileRoute } from "./types";

export const mobileAppName = "Fonte.ia Mobile";

export interface FonteiaMobileAppModel {
  name: typeof mobileAppName;
  initialRoute: MobileRoute;
  navigation: Array<{ id: MobileRoute; label: string }>;
  screens: {
    home: ReturnType<typeof createHomeScreen>;
    ask: ReturnType<typeof createAskScreen>;
    modules: ReturnType<typeof createModulesScreen>;
    alerts: ReturnType<typeof createAlertsScreen>;
  };
}

export function createFonteiaMobileApp(): FonteiaMobileAppModel {
  return {
    name: mobileAppName,
    initialRoute: "home",
    navigation: [
      { id: "home", label: "Início" },
      { id: "ask", label: "Perguntar" },
      { id: "modules", label: "Módulos" },
      { id: "alerts", label: "Alertas" },
    ],
    screens: {
      home: createHomeScreen(),
      ask: createAskScreen(),
      modules: createModulesScreen(),
      alerts: createAlertsScreen(),
    },
  };
}
