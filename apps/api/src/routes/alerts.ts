import { buildLeilaoAlertDispatch, type NotificationPreferences } from "@fonteia/alerting";
import { SAMPLE_LEILAO_LOTS } from "./leiloes";
import { jsonResponse, notFound, type ApiResponse, type RouteRequest } from "./types";

export function getAlerts(request: RouteRequest): ApiResponse<ReturnType<typeof buildLeilaoAlertDispatch> | { error: string; path: string }> {
  const moduleId = request.query.get("module") ?? "leiloes";
  const entityId = request.query.get("entityId");

  if (moduleId !== "leiloes") {
    return jsonResponse(
      {
        events: [],
        crossSell: [],
        preferences: defaultPreferences(),
      },
      200,
    );
  }

  const lot = entityId ? SAMPLE_LEILAO_LOTS.find((item) => item.id === entityId) : SAMPLE_LEILAO_LOTS[0];

  if (!lot) {
    return notFound(`/alerts?module=leiloes&entityId=${entityId ?? ""}`);
  }

  return jsonResponse(buildLeilaoAlertDispatch(lot, defaultPreferences(), new Date("2026-07-05T12:00:00-03:00")));
}

function defaultPreferences(): NotificationPreferences {
  return {
    enabled: true,
    channels: ["in_app"],
    disabledTypes: [],
  };
}

