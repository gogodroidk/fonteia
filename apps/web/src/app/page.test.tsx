import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PRODUCT_MODULES } from "@fonteia/domain";
import { PLANOS } from "../data/leiloes-seed";
import { AuthProvider } from "../auth/auth-context";
import { DashboardPage } from "./page";
import { BillingPage } from "./billing/page";
import { ModulesPage } from "./modules/page";
import { SourceStatusBadge } from "../components/source-status-badge";

describe("Fonte.ia web shell", () => {
  it("renders the dashboard with the active leiloes wedge and evidence promise", () => {
    const html = renderToStaticMarkup(
      <AuthProvider>
        <DashboardPage />
      </AuthProvider>,
    );

    expect(html).toContain("Últimos lotes publicados");
    expect(html).toContain("fonte antes de opinião");
    expect(html).toContain("Receita Federal SLE");
  });

  it("shows Leiloes active and keeps adjacent modules visible", () => {
    const html = renderToStaticMarkup(<ModulesPage />);

    expect(html).toContain("Leiloes");
    expect(html).toContain("liberado");
    expect(html).toContain("INPI");
    expect(html).toContain("travado");
    expect(PRODUCT_MODULES).toHaveLength(9);
  });

  it("labels source statuses in product language", () => {
    const html = renderToStaticMarkup(<SourceStatusBadge status="fragile_operational" />);

    expect(html).toContain("operacional fragil");
  });

  it("renders billing plans with checkout CTAs", () => {
    const html = renderToStaticMarkup(
      <AuthProvider>
        <BillingPage />
      </AuthProvider>,
    );

    expect(html).toContain("Planos");
    for (const plano of PLANOS) {
      expect(html).toContain(plano.nome);
    }
  });
});
