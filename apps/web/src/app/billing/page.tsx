import { useEffect, useState } from "react";
import { Check, Mail, ShieldCheck, X, Zap } from "lucide-react";
import { PLANOS, formatBRL } from "../../data/leiloes-seed";
import {
  hasDirectCheckout,
  isCheckoutCanceled,
  isCheckoutSuccess,
  stripeLinkFor,
} from "../../config/stripe";
import { requestStripeCheckoutUrl } from "../../lib/stripe-checkout-client";
import { CouponRedeem } from "../../components/coupon-redeem";
import { useAuth } from "../../auth/auth-context";
import { usePlan } from "../../lib/use-plan";
import { TrialBadge, trialDaysLeft } from "../../components/ui/TrialBadge";

const SUPPORT_EMAIL = "contato@olli.com.br";

function precoLabel(preco: number, periodo: string): string {
  if (preco === 0) return "R$ 0";
  return `${formatBRL(preco)}${periodo}`;
}

/**
 * Redireciona para o Payment Link cru (fallback) com o e-mail pré-preenchido.
 * É a rede de segurança: se a Edge Function "stripe-checkout" estiver indisponível,
 * a venda ainda acontece — só perde a amarração por user_id (cai no e-mail).
 */
function goToPaymentLink(link: string, email: string | undefined): void {
  window.location.href = email
    ? `${link}?prefilled_email=${encodeURIComponent(email)}`
    : link;
}

export function BillingPage() {
  const { user } = useAuth();
  const { trial, status, until, loading: planLoading } = usePlan();
  const [chosen, setChosen] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);
  const [canceled, setCanceled] = useState(false);
  // Plano em processamento (id) — trava o botão clicado enquanto cria a sessão.
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  // Plano vindo do CTA da landing (?plano=pro): destaca o card e mostra um aviso.
  const [intentPlan, setIntentPlan] = useState<string | null>(null);

  useEffect(() => {
    // Lê o retorno do Stripe pelos helpers compartilhados (mesma fonte da verdade
    // do success_url da Edge Function): ?checkout=sucesso e ?checkout=cancelado.
    const search = window.location.search;
    if (isCheckoutSuccess(search)) setPaid(true);
    else if (isCheckoutCanceled(search)) setCanceled(true);

    // Consome o ?checkout= e o remove da URL: um refresh ou link compartilhado
    // não deve reabrir o aviso de sucesso/cancelamento (BILL-06). Preserva os
    // demais params (ex.: ?plano=), removendo só o checkout.
    if (isCheckoutSuccess(search) || isCheckoutCanceled(search)) {
      const url = new URL(window.location.href);
      url.searchParams.delete("checkout");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }

    // Intenção de assinatura vinda da landing: destaca o plano escolhido e leva
    // o card à vista. NÃO abre checkout sozinho — o usuário confirma clicando.
    try {
      const plano = new URLSearchParams(search).get("plano");
      if (plano && PLANOS.some((p) => p.id === plano)) {
        setIntentPlan(plano);
        window.requestAnimationFrame(() => {
          document.getElementById(`plano-${plano}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
      }
    } catch {
      // URL malformada — ignora e mostra a grade normal.
    }
  }, []);

  // Quando surge um erro de checkout, o alerta é inserido no topo da página —
  // longe do botão clicado. Rola o alerta à vista (mesmo padrão do intentPlan)
  // para o usuário ver a mensagem e o CTA de recuperação em telas longas.
  useEffect(() => {
    if (!checkoutError) return;
    window.requestAnimationFrame(() => {
      document
        .querySelector('[role="alert"]')
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [checkoutError]);

  // Inicia a assinatura: tenta a Checkout Session amarrada ao usuário (mata o bug de
  // correlação por e-mail). Cai no Payment Link se a função estiver indisponível, e
  // no painel de contato quando o plano não tem checkout direto (ex.: Corporativo).
  async function handleChoose(id: string, nome: string) {
    setCheckoutError(null);
    setCanceled(false);
    const link = stripeLinkFor(id);

    // Plano sem checkout direto (Corporativo "Falar com vendas"): painel de contato.
    if (!hasDirectCheckout(id) && !link) {
      setChosen(nome);
      return;
    }

    setPendingPlan(id);
    try {
      if (hasDirectCheckout(id)) {
        const result = await requestStripeCheckoutUrl(id);
        if (result.ok) {
          window.location.href = result.url; // navegação em curso; mantém o loading
          return;
        }
        // Falha recuperável → fallback no Payment Link (a venda não pode travar).
        if (result.reason === "indisponivel" && link) {
          goToPaymentLink(link, user?.email);
          return;
        }
        if (result.reason === "nao_autenticado") {
          setCheckoutError("Sua sessão expirou. Entre novamente para assinar.");
          return;
        }
        if (result.reason === "plano_invalido") {
          // Plano COM checkout direto que o backend recusou: é uma falha de
          // configuração, não o fluxo comercial do Corporativo. Mostra erro
          // honesto em vez do painel de contato de vendas (que confundiria
          // quem clicou "Assinar Profissional").
          setCheckoutError(
            `Não foi possível iniciar o checkout deste plano agora. Tente de novo ou fale com ${SUPPORT_EMAIL}.`,
          );
          return;
        }
        // Sem Payment Link de fallback: mensagem honesta com o contato.
        setCheckoutError(
          `Não foi possível iniciar o checkout agora. Tente de novo ou fale com ${SUPPORT_EMAIL}.`,
        );
        return;
      }

      // Sem checkout direto mas com Payment Link configurado: usa o link.
      if (link) {
        goToPaymentLink(link, user?.email);
        return;
      }
      setChosen(nome);
    } finally {
      setPendingPlan(null);
    }
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
              <a className="link" href="mailto:contato@olli.com.br">contato@olli.com.br</a>.
            </span>
          </div>
          <button className="btn btn--icon btn--ghost btn--sm" type="button" onClick={() => setPaid(false)} aria-label="Fechar">
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      )}
      {canceled && (
        <div
          className="panel elevated"
          role="status"
          style={{ padding: 18, marginBottom: 20, display: "flex", gap: 12, alignItems: "center" }}
        >
          <ShieldCheck size={20} style={{ color: "var(--t-mid)", flexShrink: 0 }} aria-hidden="true" />
          <div style={{ flex: 1 }}>
            <strong>Checkout não concluído.</strong>{" "}
            <span className="muted small">
              Tudo certo — você não foi cobrado. Quando quiser, é só escolher um plano de novo.
            </span>
          </div>
          <button className="btn btn--icon btn--ghost btn--sm" type="button" onClick={() => setCanceled(false)} aria-label="Fechar">
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      )}
      {checkoutError && (
        <div
          className="panel elevated"
          role="alert"
          style={{ padding: 18, marginBottom: 20, display: "flex", gap: 12, alignItems: "center", borderColor: "color-mix(in srgb,var(--danger) 30%,var(--border))" }}
        >
          <X size={20} style={{ color: "var(--danger,#b42318)", flexShrink: 0 }} aria-hidden="true" />
          <div style={{ flex: 1 }} className="small">{checkoutError}</div>
          <button className="btn btn--icon btn--ghost btn--sm" type="button" onClick={() => setCheckoutError(null)} aria-label="Fechar">
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
              Para times e escritórios, fale com{" "}
              <a className="link" href={`mailto:${SUPPORT_EMAIL}?subject=Plano%20Corporativo`}>{SUPPORT_EMAIL}</a> — nossa
              equipe ajuda no onboarding e na cobrança do Corporativo.
            </span>
          </div>
          <button className="btn btn--icon btn--ghost btn--sm" type="button" onClick={() => setChosen(null)} aria-label="Fechar">
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      )}

      {intentPlan && !paid && (
        <div
          className="panel"
          role="status"
          style={{ padding: 14, marginBottom: 20, display: "flex", gap: 10, alignItems: "center", borderColor: "color-mix(in srgb,var(--accent) 40%,var(--border))" }}
        >
          <Zap size={17} fill="currentColor" style={{ color: "var(--accent-ink)", flexShrink: 0 }} aria-hidden="true" />
          <span className="small">
            Você escolheu o plano{" "}
            <strong>{PLANOS.find((p) => p.id === intentPlan)?.nome ?? intentPlan}</strong>. Confirme abaixo
            para iniciar o checkout — são 7 dias grátis e você pode cancelar antes sem pagar nada.
          </span>
        </div>
      )}

      {/* Estado do teste de 7 dias: paywall honesto (expirado) ou contagem
          regressiva (trial vigente). Não renderiza nada para quem é pago ou
          nunca teve trial. Some enquanto o plano carrega e após pagar. */}
      {!planLoading && !paid && (status === "expired" || (trial && until !== undefined)) && (
        <div style={{ marginBottom: 20 }}>
          <TrialBadge
            trial={trial}
            status={status}
            until={until}
            size="md"
            {...(status === "expired"
              ? {
                  onUpgrade: () => {
                    document
                      .getElementById("plano-pro")
                      ?.scrollIntoView({ behavior: "smooth", block: "center" });
                  },
                }
              : {})}
          />
          {trial && until !== undefined && (
            <p className="small muted" style={{ margin: "8px 2px 0", lineHeight: 1.5 }}>
              {trialDaysLeft(until) <= 1
                ? "É o último dia do seu teste. Assine agora para não perder o acesso."
                : "Aproveite o teste. Assine quando quiser para manter o acesso sem interrupção."}
            </p>
          )}
        </div>
      )}

      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <span className="eyebrow">Planos</span>
        <h2 className="h1" style={{ marginTop: 8 }}>Escolha seu plano. Cancele quando quiser.</h2>
        <p className="muted" style={{ maxWidth: 560, margin: "10px auto 0", lineHeight: 1.6 }}>
          Acesso completo aos leilões da Receita Federal: Raio-X com IA, análise do edital, alertas por e-mail
          e relatório PDF com rastreabilidade de fonte. Todos os recursos inclusos, com 7 dias grátis para testar —
          só cobramos depois, cancele antes e não paga nada.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(264px,1fr))", gap: 16, alignItems: "start" }}>
        {PLANOS.map((plano) => {
          const isFeatured = plano.destaque;
          const isIntent = intentPlan === plano.id;
          return (
            <article
              key={plano.id}
              id={`plano-${plano.id}`}
              className={isFeatured ? "card card--pad glow-accent" : "card card--pad"}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 14,
                position: "relative",
                borderColor: isIntent
                  ? "var(--accent-ink)"
                  : isFeatured
                    ? "color-mix(in srgb,var(--accent) 40%,var(--border))"
                    : undefined,
                boxShadow: isIntent ? "0 0 0 2px color-mix(in srgb,var(--accent) 45%,transparent)" : undefined,
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
              {(() => {
                const direct = hasDirectCheckout(plano.id) || stripeLinkFor(plano.id) !== null;
                const isPending = pendingPlan === plano.id;
                return (
                  <button
                    className={isFeatured ? "btn btn--accent btn--block" : "btn btn--ghost btn--block"}
                    type="button"
                    onClick={() => void handleChoose(plano.id, plano.nome)}
                    disabled={isPending}
                    aria-busy={isPending}
                  >
                    {/* Ícone reflete a ação real: Zap = checkout direto; Mail = contato comercial */}
                    {direct ? (
                      <Zap size={15} fill="currentColor" aria-hidden="true" />
                    ) : plano.id !== "free" ? (
                      <Mail size={15} aria-hidden="true" />
                    ) : null}
                    {isPending ? "Abrindo checkout…" : plano.cta}
                  </button>
                );
              })()}
            </article>
          );
        })}
      </div>

      <div style={{ maxWidth: 460, margin: "22px auto 0" }}>
        {/* onRedeemed leva o usuário ao app já com o acesso ativo: usePlan só
            re-busca em onAuthStateChange e o resgate de cupom não dispara auth
            change, então sem esta navegação o app seguiria bloqueado até um
            reload manual. */}
        <CouponRedeem
          onRedeemed={() => {
            window.location.assign("/app");
          }}
        />
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
