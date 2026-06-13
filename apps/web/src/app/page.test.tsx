import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PRODUCT_MODULES } from "@fonteia/domain";
import { BILLING_PLANS } from "@fonteia/billing";
import { DashboardPage } from "./page";
import { BillingPage } from "./billing/page";
import { ModulesPage } from "./modules/page";
import { SourceStatusBadge } from "../components/source-status-badge";

describe("Fonte.ia web shell", () => {
  it("renders the dashboard with the active leiloes wedge and evidence promise", () => {
    const html = renderToStaticMarkup(<DashboardPage />);

    expect(html).toContain("Melhores lotes para investigar hoje");
    expect(html).toContain("Fonte antes de opiniao");
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

  it("renders billing as the commercial cascade across modules", () => {
    const html = renderToStaticMarkup(<BillingPage />);

    expect(html).toContain("Planos para vender");
    expect(html).toContain("upsells visiveis");
    for (const plan of BILLING_PLANS) {
      expect(html).toContain(plan.name);
    }
  });
});
