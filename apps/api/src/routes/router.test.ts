import { describe, expect, it } from "vitest";
import { authorizeRequest, createRouteRequest, handleRoute } from "./router";

// A fixed token used to exercise the authenticated paths deterministically.
const TEST_TOKEN = "test-secret-token";

describe("API gateway routes", () => {
  it("returns health status", async () => {
    const response = await handleRoute(createRouteRequest("GET", "/health"));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ok: true, service: "fonteia-api" });
  });

  it("exposes the package version on /health (not a hardcoded value)", async () => {
    const response = await handleRoute(createRouteRequest("GET", "/health"));
    const body = response.body as { version: string };

    // 0.1.0 is the current package.json version; the point is it is read, not invented.
    expect(body.version).toBe("0.1.0");
  });

  it("rejects non-GET methods with 405 and an Allow header", async () => {
    const response = await handleRoute(createRouteRequest("POST", "/health"));

    expect(response.status).toBe(405);
    expect(response.headers?.allow).toBe("GET, OPTIONS");
    expect(response.body).toMatchObject({ error: "Method not allowed", method: "POST" });
  });

  it("returns product modules with locked cross-sell surface", async () => {
    const response = await handleRoute(createRouteRequest("GET", "/modules"));

    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).toContain("leiloes");
    expect(JSON.stringify(response.body)).toContain("ambiental");
    expect(JSON.stringify(response.body)).toContain("locked");
  });

  it("annotates modules with plan entitlements when requested", async () => {
    const response = await handleRoute(createRouteRequest("GET", "/modules?plan=free"));

    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).toContain("entitlement");
    expect(JSON.stringify(response.body)).toContain("recommendedPlanId");
  });

  it("rejects an invalid plan id on /modules with 400", async () => {
    const response = await handleRoute(createRouteRequest("GET", "/modules?plan=enterprise"));

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).toContain("Invalid plan id");
  });

  it("filters sources by module", async () => {
    const response = await handleRoute(createRouteRequest("GET", "/sources?module=ambiental"));

    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).toContain("ibama-dados-abertos");
    expect(JSON.stringify(response.body)).toContain("mapbiomas-alerta");
  });

  it("rejects an invalid source module with 400", async () => {
    const response = await handleRoute(createRouteRequest("GET", "/sources?module=not-a-module"));

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).toContain("Invalid module id");
  });

  it("rejects an invalid source status with 400", async () => {
    const response = await handleRoute(createRouteRequest("GET", "/sources?status=bogus"));

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).toContain("Invalid source status");
  });

  it("searches seeded entities", async () => {
    const response = await handleRoute(createRouteRequest("GET", "/search?q=lote"));

    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).toContain("sample-auction-lot-001");
  });

  it("returns sample dossier with evidence when authenticated", async () => {
    const response = await handleRoute(
      createRouteRequest("GET", "/dossiers/sample-auction-lot-001", { authorization: `Bearer ${TEST_TOKEN}` }),
      { apiToken: TEST_TOKEN },
    );

    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).toContain("sample-evidence-001");
    expect(JSON.stringify(response.body)).toContain("receita-leiloes-sle");
  });

  it("returns leilao lots with clamped pagination and opportunity score", async () => {
    const lotsResponse = await handleRoute(createRouteRequest("GET", "/leiloes/lotes"));

    expect(lotsResponse.status).toBe(200);
    expect(JSON.stringify(lotsResponse.body)).toContain("fragile_operational");
    expect(JSON.stringify(lotsResponse.body)).toContain("200100-1-2026-136");
    expect(lotsResponse.body).toMatchObject({ pagination: { limit: 50, offset: 0 } });

    const scoreResponse = await handleRoute(createRouteRequest("GET", "/leiloes/lotes/200100-1-2026-136/score"));

    expect(scoreResponse.status).toBe(200);
    expect(JSON.stringify(scoreResponse.body)).toContain("maxSuggestedBidCents");
  });

  it("clamps an oversized pagination limit on /leiloes/lotes", async () => {
    const response = await handleRoute(createRouteRequest("GET", "/leiloes/lotes?limit=99999&offset=2"));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ pagination: { limit: 200, offset: 2 } });
  });

  it("answers questions with evidence citations when authenticated", async () => {
    const response = await handleRoute(
      createRouteRequest("GET", "/ask?entityId=200100-1-2026-136&q=esse%20lote%20permite%20PF", {
        authorization: `Bearer ${TEST_TOKEN}`,
      }),
      { apiToken: TEST_TOKEN },
    );

    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).toContain("citations");
    expect(JSON.stringify(response.body)).toContain("receita-leiloes-sle");
  });

  it("returns alert events and locked cross-sell suggestions for leiloes when authenticated", async () => {
    const response = await handleRoute(
      createRouteRequest("GET", "/alerts?module=leiloes&entityId=200100-1-2026-136", {
        authorization: `Bearer ${TEST_TOKEN}`,
      }),
      { apiToken: TEST_TOKEN },
    );

    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).toContain("events");
    expect(JSON.stringify(response.body)).toContain("crossSell");
    expect(JSON.stringify(response.body)).toContain("empresas");
    expect(JSON.stringify(response.body)).toContain("locked");
  });

  it("returns billing plans (public) using the canonical plan names", async () => {
    const plansResponse = await handleRoute(createRouteRequest("GET", "/billing/plans"));

    expect(plansResponse.status).toBe(200);
    const serialized = JSON.stringify(plansResponse.body);
    // Canonical contract: free | pro | corporativo -> Free | Profissional | Escritorio
    expect(serialized).toContain("Profissional");
    expect(serialized).toContain("Escritorio");
    expect(serialized).toContain('"id":"pro"');
    expect(serialized).toContain('"id":"corporativo"');
  });

  it("returns entitlements with non-authoritative client-reported usage when authenticated", async () => {
    const entitlementsResponse = await handleRoute(
      createRouteRequest("GET", "/billing/entitlements?plan=free&aiAnswers=5&alerts=2", {
        authorization: `Bearer ${TEST_TOKEN}`,
      }),
      { apiToken: TEST_TOKEN },
    );

    expect(entitlementsResponse.status).toBe(200);
    const serialized = JSON.stringify(entitlementsResponse.body);
    expect(serialized).toContain("empresas");
    expect(serialized).toContain("upgrade");
    expect(serialized).toContain("blocked");
    // Usage must be explicitly marked as non-authoritative / client-reported.
    expect(entitlementsResponse.body).toMatchObject({
      planSource: "client_reported",
      usage: { authoritative: false, source: "client_reported" },
    });
  });

  it("rejects an invalid plan id on /billing/entitlements with 400 (authenticated)", async () => {
    const response = await handleRoute(
      createRouteRequest("GET", "/billing/entitlements?plan=enterprise", {
        authorization: `Bearer ${TEST_TOKEN}`,
      }),
      { apiToken: TEST_TOKEN },
    );

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).toContain("Invalid plan id");
  });

  it("ignores negative/garbage client-reported usage instead of trusting it", async () => {
    const response = await handleRoute(
      createRouteRequest("GET", "/billing/entitlements?plan=free&searches=-50&seats=not-a-number", {
        authorization: `Bearer ${TEST_TOKEN}`,
      }),
      { apiToken: TEST_TOKEN },
    );

    expect(response.status).toBe(200);
    const body = response.body as { usage: { snapshot: Record<string, number> } };
    expect(body.usage.snapshot.searches).toBeUndefined();
    expect(body.usage.snapshot.seats).toBeUndefined();
  });
});

describe("authentication guard", () => {
  it("leaves public routes open even without a token", () => {
    for (const path of ["/health", "/modules", "/sources", "/leiloes/lotes", "/billing/plans", "/search"]) {
      const result = authorizeRequest(createRouteRequest("GET", path), TEST_TOKEN);
      expect(result).toBeUndefined();
    }
  });

  it("blocks account routes with 401 when the token is missing or wrong", async () => {
    for (const path of ["/alerts", "/billing/entitlements", "/ask", "/dossiers/abc", "/dossiers/abc/export"]) {
      const missing = await handleRoute(createRouteRequest("GET", path), { apiToken: TEST_TOKEN });
      expect(missing.status).toBe(401);
      expect(missing.headers?.["www-authenticate"]).toContain("Bearer");

      const wrong = await handleRoute(
        createRouteRequest("GET", path, { authorization: "Bearer nope" }),
        { apiToken: TEST_TOKEN },
      );
      expect(wrong.status).toBe(401);
    }
  });

  it("allows account routes with a correct bearer token", () => {
    const result = authorizeRequest(
      createRouteRequest("GET", "/alerts", { authorization: `Bearer ${TEST_TOKEN}` }),
      TEST_TOKEN,
    );
    expect(result).toBeUndefined();
  });

  it("is permissive (dev mode) when no token is configured", () => {
    const result = authorizeRequest(createRouteRequest("GET", "/alerts"), undefined);
    expect(result).toBeUndefined();
  });
});
