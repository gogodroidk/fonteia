import { describe, expect, it } from "vitest";
import { PRODUCT_MODULES } from "@fonteia/domain";
import { createFonteiaMobileApp } from "./App";

describe("Fonte.ia mobile shell", () => {
  it("keeps mobile focused on quick decisions, IA and alerts", () => {
    const app = createFonteiaMobileApp();

    expect(app.initialRoute).toBe("home");
    expect(app.navigation.map((item) => item.id)).toEqual(["home", "ask", "modules", "alerts"]);
    expect(app.screens.ask.voiceReady).toBe(true);
    expect(app.screens.alerts.pushReady).toBe(true);
    expect(app.screens.home.featuredAnswer.evidence.sourceLabel).toContain("Receita");
  });

  it("shows Leiloes active and the other modules as visible locked upsells", () => {
    const app = createFonteiaMobileApp();
    const leiloes = app.screens.modules.tiles.find((tile) => tile.id === "leiloes");
    const lockedTiles = app.screens.modules.tiles.filter((tile) => tile.statusLabel === "travado");

    expect(app.screens.modules.tiles).toHaveLength(PRODUCT_MODULES.length);
    expect(leiloes?.statusLabel).toBe("liberado");
    expect(lockedTiles.length).toBeGreaterThan(5);
    expect(app.screens.modules.upgradeMessage).toContain("cascata");
  });
});
