import { describe, expect, it } from "vitest";
import { createRouteRequest, handleRoute } from "./router";

describe("API gateway routes", () => {
  it("returns health status", async () => {
    const response = await handleRoute(createRouteRequest("GET", "/health"));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ok: true, service: "fonteia-api" });
  });

  it("returns product modules with locked cross-sell surface", async () => {
    const response = await handleRoute(createRouteRequest("GET", "/modules"));

    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).toContain("leiloes");
    expect(JSON.stringify(response.body)).toContain("ambiental");
    expect(JSON.stringify(response.body)).toContain("locked");
  });

  it("filters sources by module", async () => {
    const response = await handleRoute(createRouteRequest("GET", "/sources?module=ambiental"));

    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).toContain("ibama-dados-abertos");
    expect(JSON.stringify(response.body)).toContain("mapbiomas-alerta");
  });

  it("searches seeded entities", async () => {
    const response = await handleRoute(createRouteRequest("GET", "/search?q=lote"));

    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).toContain("sample-auction-lot-001");
  });

  it("returns sample dossier with evidence", async () => {
    const response = await handleRoute(createRouteRequest("GET", "/dossiers/sample-auction-lot-001"));

    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).toContain("sample-evidence-001");
    expect(JSON.stringify(response.body)).toContain("receita-leiloes-sle");
  });

  it("returns leilao lots and opportunity score", async () => {
    const lotsResponse = await handleRoute(createRouteRequest("GET", "/leiloes/lotes"));

    expect(lotsResponse.status).toBe(200);
    expect(JSON.stringify(lotsResponse.body)).toContain("fragile_operational");
    expect(JSON.stringify(lotsResponse.body)).toContain("200100-1-2026-136");

    const scoreResponse = await handleRoute(createRouteRequest("GET", "/leiloes/lotes/200100-1-2026-136/score"));

    expect(scoreResponse.status).toBe(200);
    expect(JSON.stringify(scoreResponse.body)).toContain("maxSuggestedBidCents");
  });

  it("answers questions with evidence citations", async () => {
    const response = await handleRoute(createRouteRequest("GET", "/ask?entityId=200100-1-2026-136&q=esse%20lote%20permite%20PF"));

    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).toContain("citations");
    expect(JSON.stringify(response.body)).toContain("receita-leiloes-sle");
  });
});
