import type { ReceitaLeilaoLot } from "@fonteia/sources";
import {
  buildLeilaoAlerts,
  buildLeilaoCrossSellSuggestions,
  filterAlertEventsByPreferences,
  type AlertEvent,
  type CrossSellSuggestion,
  type NotificationPreferences,
} from "./rules";

export interface AlertDispatchResult {
  events: AlertEvent[];
  crossSell: CrossSellSuggestion[];
  preferences: NotificationPreferences;
}

export function buildLeilaoAlertDispatch(
  lot: ReceitaLeilaoLot,
  preferences: NotificationPreferences,
  now = new Date(),
): AlertDispatchResult {
  const events = filterAlertEventsByPreferences(buildLeilaoAlerts(lot, now), preferences);

  return {
    events,
    crossSell: buildLeilaoCrossSellSuggestions(lot),
    preferences,
  };
}

