import { useEffect, useState } from "react";
import { Check, ShieldCheck, X, Zap } from "lucide-react";
import { PLANOS, formatBRL } from "../../data/leiloes-seed";
import { stripeLinkFor } from "../../config/stripe";
import { CouponRedeem } from "../../components/coupon-redeem";
import { useAuth } from "../../auth/auth-context";

function precoLabel(preco: number, periodo: string): string {
  if (preco === 0) return "R$ 0";
  return `${formatBRL(preco)}${periodo}`;
}

export function BillingPage() {
  const { user } = useAuth();
  const [chosen, setChosen] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "sucesso") setPaid(true);
  }, []);

  function handleChoose(id: string, nome: string) {
    const link = stripeLinkFor(id);
    if (link) {
      // Pré-preenche o e-mail do login no checkout: garante que a assinatura do
      // Stripe use o MESMO e-mail que o app usa em my_plan() para liberar o Pro.
      const email = user?.email;
      window.location.href = email
        ? `${link}?prefilled_email=${encodeURIComponent(email)}`
        : link;
      return;
    }
    setChosen(nome);
  }

  return (
    <section style={{ maxWidth: 1080, margin: "0 auto", padding: "8px 4px 40px" }}>
      {paid && (
        <div
          className="panel elevated"
          role="status"
          style={{ padding: 18, marginBottom: 20, display: "flex", gap: 12, alignItems: "center", borderColor: "color-mix(in srgb,var(--accent) 40%,var(--border))" }}
        >
          <Check size={20} strokeWidth={2.6} style={{ color: "var(--accent-ink)", flexShrink: 0 }} aria-hidden="true" />
          <div style={{ flex: 1 }}>
            <strong>Pagamento recebido!</strong>{" "}
            <span className="muted small">
              Obrigado. Seu acesso ao plano será liberado em instantes. Qualquer coisa, fale com{" "}
              <a className="link" href="mailto:contato@fontebrasil.online">contato@fontebrasil.online</a>.
            </span>
          </div>
          <button className="btn btn--icon btn--ghost btn--sm" type="button" onClick={() => setPaid(false)} aria-label="Fechar">
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      )}
      {chosen && (
        <div
          className="panel elevated"
          role="status"
          style={{ padding: 18, marginBottom: 20, display: "flex", gap: 12, alignItems: "center" }}
        >
          <ShieldCheck size={20} style={{ color: "var(--accent-ink)", flexShrink: 0 }} aria-hidden="true" />
          <div style={{ flex: 1 }}>
            <strong>Plano {chosen} selecionado.</strong>{" "}
            <span className="muted small">
              Para concluir, fale com <a className="link" href="mailto:contato@fontebrasil.online">contato@fontebrasil.online</a> — o
              checkout automatico entra no ar assim que o link do Stripe for conectado.
            </span>
          </div>
          <button className="btn btn--icon btn--ghost btn--sm" type="button" onClick={() => setChosen(null)} aria-label="Fechar">
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      )}

      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <span className="eyebrow">Planos</span>
        <h2 className="h1" style={{ marginTop: 8 }}>Escolha seu plano. Cancele quando quiser.</h2>
        <p className="muted" style={{ maxWidth: 560, margin: "10px auto 0", lineHeight: 1.6 }}>
          Acesso completo aos leilões da Receita Federal: Raio-X com IA, análise do edital, alertas por e-mail
          e relatório PDF com rastreabilidade de fonte. Tudo pago, sem plano grátis.
          Comece com 7 dias grátis — só cobramos depois, cancele antes e não paga nada.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(264px,1fr))", gap: 16, alignItems: "start" }}>
        {PLANOS.map((plano) => {
          const isFeatured = plano.destaque;
          return (
            <article
              key={plano.id}
              className={isFeatured ? "card card--pad glow-accent" : "card card--pad"}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 14,
                position: "relative",
                borderColor: isFeatured ? "color-mix(in srgb,var(--accent) 40%,var(--border))" : undefined,
              }}
            >
              {isFeatured && (
                <span className="badge badge--accent" style={{ position: "absolute", top: 16, right: 16 }}>
                  Mais escolhido
                </span>
              )}
              <div>
                <div className="eyebrow" style={{ color: isFeatured ? "var(--accent-ink)" : "var(--brand-ink)" }}>
                  {plano.nome}
                </div>
                <div className="muted small" style={{ marginTop: 4 }}>{plano.tagline}</div>
              </div>
              <div className="row" style={{ alignItems: "baseline", gap: 6 }}>
                <span className="display num" style={{ fontSize: 40 }}>{precoLabel(plano.preco, "")}</span>
                {plano.periodo && <span className="muted" style={{ fontWeight: 600 }}>{plano.periodo}</span>}
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 9, flex: 1 }}>
                {plano.feats.map((feat) => (
                  <li key={feat} className="row" style={{ gap: 9, alignItems: "flex-start" }}>
                    <Check size={16} strokeWidth={2.6} style={{ color: "var(--accent-ink)", flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
                    <span className="small" style={{ lineHeight: 1.4 }}>{feat}</span>
                  </li>
                ))}
              </ul>
              <button
                className={isFeatured ? "btn btn--accent btn--block" : "btn btn--ghost btn--block"}
                type="button"
                onClick={() => handleChoose(plano.id, plano.nome)}
              >
                {plano.id !== "free" && <Zap size={15} fill="currentColor" aria-hidden="true" />}
                {plano.cta}
              </button>
            </article>
          );
        })}
      </div>

      <div style={{ maxWidth: 460, margin: "22px auto 0" }}>
        <CouponRedeem />
      </div>

      <div className="inset" style={{ marginTop: 16, padding: 14, display: "flex", gap: 10, alignItems: "center", justifyContent: "center" }}>
        <ShieldCheck size={17} style={{ color: "var(--accent-ink)" }} aria-hidden="true" />
        <span className="small muted">
          <strong className="t-hi">7 dias grátis.</strong> Você só é cobrado após o período de teste; cancele antes e não paga nada. Pagamento seguro via Stripe (cartão e Pix).
          Não prometemos arremates ou lucro — entregamos informação rastreável para você decidir melhor.
        </span>
      </div>
    </section>
  );
}
