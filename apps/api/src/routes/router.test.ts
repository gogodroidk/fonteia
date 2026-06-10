import { describe, expect, it } from "vitest";
import { createRouteRequest, handleRoute } from "./router";

describe("API gateway routes", () => {
  it("returns health status", () => {
    const response = handleRoute(createRouteRequest("GET", "/health"));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ok: true, service: "fonteia-api" });
  });

  it("returns product modules with locked cross-sell surface", () => {
    const response = handleRoute(createRouteRequest("GET", "/modules"));

    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).toContain("leiloes");
    expect(JSON.stringify(response.body)).toContain("ambiental");
    expect(JSON.stringify(response.body)).toContain("locked");
  });

  it("filters sources by module", () => {
    const response = handleRoute(createRouteRequest("GET", "/sources?module=ambiental"));

    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).toContain("ibama-dados-abertos");
    expect(JSON.stringify(response.body)).toContain("mapbiomas-alerta");
  });

  it("searches seeded entities", () => {
    const response = handleRoute(createRouteRequest("GET", "/search?q=lote"));

    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).toContain("sample-auction-lot-001");
  });

  it("returns sample dossier with evidence", () => {
    const response = handleRoute(createRouteRequest("GET", "/dossiers/sample-auction-lot-001"));

    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).toContain("sample-evidence-001");
    expect(JSON.stringify(response.body)).toContain("receita-leiloes-sle");
  });
});

