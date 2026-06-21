# ⚠️ stripe-webhook — função de produção SEM fonte versionada

**Status (2026-06-20):** a Edge Function `stripe-webhook` está **ATIVA em produção**
(projeto `pwiuiihsyazghdsrpshg`, `verify_jwt=false`, ~1,17 MB, bundle), mas **o
código-fonte dela NÃO está neste repositório**. O mesmo vale para `stripe-setup` e
`stripe-worker` (deployadas, fora do git).

Isto é um risco de billing: o caminho do dinheiro **não pode ser revisado, testado
nem recuperado pelo git**. Se o projeto Supabase for resetado/migrado, essas funções
se perdem.

## Qual webhook está mesmo no ar?

A Cloudflare tem apenas 3 Workers deployados (`olli-site`, `olli-diagnostico`,
`fonteia`) — **nenhum** é de Stripe. Logo o Worker limpo `services/stripe-webhook/`
(que existe no repo) **não está deployado**. O webhook que o Stripe chama é esta
Edge Function da Supabase.

> **Confirme** em Stripe Dashboard → Developers → Webhooks qual URL está registrada e
> se o `STRIPE_WEBHOOK_SECRET` bate com o secret da Edge Function.

## Plano de consolidação (decisão do dono — NÃO automatizado)

O objetivo é ter **um único** webhook, revisável e versionado. A lógica de
referência, limpa e já testada (validação HMAC manual, escrita não-regressiva,
idempotência), está em **`services/stripe-webhook/src/worker.ts`**.

Passos sugeridos (fazer em **Stripe test mode** primeiro):

1. Portar a lógica de `services/stripe-webhook/src/worker.ts` para
   `supabase/functions/stripe-webhook/index.ts` com entrypoint Deno
   (`Deno.serve(handler.fetch)`), mantendo `verify_jwt=false` (a assinatura do
   Stripe é a autenticação).
2. Em **test mode**, apontar o webhook do Stripe para a função, fazer um checkout
   de teste (cartão `4242 4242 4242 4242`) e confirmar que aparece linha em
   `public.subscriptions` e que `select public.my_plan()` (autenticado com o mesmo
   e-mail do checkout) retorna `pro`.
3. Promover para live: trocar a URL do webhook e o `STRIPE_WEBHOOK_SECRET` (live).
4. Remover as funções órfãs `stripe-setup` e `stripe-worker` se não forem usadas, e
   marcar `services/stripe-webhook/` como legado (não-deployado).

Enquanto isso não acontece, **não apague** a função atual: ela é a única cópia do
que está processando pagamentos.

## 🔗 Correlação por `user_id` — o que o webhook precisa passar a ler

> Adicionado junto da Edge Function **`stripe-checkout`** (checkout amarrado ao
> usuário). Aplica-se ao webhook de produção (não-versionado) E à lógica de
> referência em `services/stripe-webhook/src/worker.ts`.

**Problema atual:** o webhook correlaciona assinatura↔usuário **só por e-mail**
(`subscriptions.email`) e **nunca grava `subscriptions.user_id`** — porque o Payment
Link cru não carregava a identidade Supabase. E-mail divergente/compartilhado/caixa
diferente ⇒ o pagante pode não receber o plano. (Detalhes e o fix da RPC em
`infra/migrations/0026_subscriptions_correlate_by_user_id.sql`.)

**O que mudou na origem:** a função `stripe-checkout` cria a Checkout Session com a
identidade Supabase embutida. O webhook agora **pode e deve** lê-la:

No evento **`checkout.session.completed`** (objeto = Checkout Session):

| Campo do Stripe                         | Uso no webhook                                  |
|-----------------------------------------|-------------------------------------------------|
| `session.client_reference_id`           | **uuid do usuário Supabase** → grava `user_id`  |
| `session.metadata.supabase_user_id`     | redundância do `client_reference_id`            |
| `session.metadata.email` / `.plan_id`   | rastreabilidade                                 |

Nos eventos **`customer.subscription.created` / `.updated`** (objeto = Subscription),
a `stripe-checkout` propaga a identidade via `subscription_data[metadata]`:

| Campo do Stripe                          | Uso no webhook                                 |
|------------------------------------------|------------------------------------------------|
| `subscription.metadata.supabase_user_id` | **uuid do usuário Supabase** → grava `user_id` |

Isto é defesa em profundidade: como o Stripe não garante ordem nem entrega única,
o `user_id` chega tanto pela sessão quanto pela subscription.

**Regras (mantêm o padrão não-regressivo já existente no `worker.ts`):**
- A escrita de `user_id` deve ser **não-regressiva**: só preenche/atualiza, **nunca
  apaga** um `user_id` já gravado por outro evento (igual ao tratamento de plan/status).
- O `UNIQUE` continua sendo `stripe_subscription_id`: o upsert casa por ele.
- Manter a gravação de `email` (fallback para compras legadas via Payment Link).

Depois que o webhook estiver gravando `user_id`, aplicar a migration `0026` para que
`my_plan()` passe a **preferir `user_id`** (e-mail vira fallback). Backfill das linhas
antigas é opcional (correlacionar `subscriptions.email` ↔ `auth.users.email`).
