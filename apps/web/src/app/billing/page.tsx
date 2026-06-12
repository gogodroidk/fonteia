import { useState } from "react";
import { BILLING_PLANS, getPlanEntitlements } from "@fonteia/billing";

const featuredPlanIds = new Set(["individual", "pro", "business"]);

/**
 * Links de pagamento do Stripe (Payment Links). Cole a URL de cada plano,
 * gerada no painel do Stripe (Produtos → Payment Links). Enquanto vazio,
 * o botão mostra o contato. Assim o checkout funciona sem backend.
 */
const STRIPE_PAYMENT_LINKS: Record<string, string> = {
  individual: "",
  escritorio: "",
  pro: "",
  business: "",
};

function formatQuota(value: number | "custom"): string {
  return value === "custom" ? "sob medida" : String(value);
}

export function BillingPage() {
  const [chosenPlan, setChosenPlan] = useState<string | null>(null);

  return (
    <section className="page-panel">
      {chosenPlan && (
        <div className="billing-confirm" role="status">
          <strong>Plano {chosenPlan} selecionado.</strong>
          <span>
            Para concluir, escreva para <a href="mailto:contato@olli.com.br">contato@olli.com.br</a> — o
            checkout automático entra no ar em breve.
          </span>
          <button className="ghost-button" type="button" onClick={() => setChosenPlan(null)}>
            Fechar
          </button>
        </div>
      )}
      <div className="section-header">
        <div>
          <span className="section-label">Receita recorrente</span>
          <h2>Planos para vender o mesmo motor em varias frentes</h2>
        </div>
      </div>

      <div className="billing-grid">
        {BILLING_PLANS.map((plan) => {
          const entitlements = getPlanEntitlements(plan.id);
          const included = entitlements.filter((item) => item.access !== "upgrade");
          const locked = entitlements.filter((item) => item.access === "upgrade");

          return (
            <article className={featuredPlanIds.has(plan.id) ? "billing-card featured" : "billing-card"} key={plan.id}>
              <div>
                <span className="section-label">{plan.audience}</span>
                <h3>{plan.name}</h3>
                <strong>{plan.priceLabel}</strong>
              </div>
              <p>{plan.promises.join(" | ")}</p>
              <div className="billing-meta">
                <span>{included.length} modulos incluidos</span>
                <span>{locked.length} upsells visiveis</span>
                <span>{formatQuota(plan.quotas.aiAnswersPerMonth)} respostas IA/mes</span>
              </div>
              <button
                className={featuredPlanIds.has(plan.id) ? "primary-button" : "ghost-button"}
                type="button"
                onClick={() => {
                  const link = STRIPE_PAYMENT_LINKS[plan.id];
                  if (link) {
                    window.location.href = link;
                  } else {
                    setChosenPlan(plan.name);
                  }
                }}
              >
                {plan.cta}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
