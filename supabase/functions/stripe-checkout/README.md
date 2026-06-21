# stripe-checkout — Checkout Session amarrada ao usuário

Cria uma **Stripe Checkout Session** (modo `subscription`) carregando a identidade
do usuário Supabase, substituindo o **Payment Link cru**. É a peça que **mata o bug
de correlação por e-mail**: a sessão leva `client_reference_id` = id do usuário, e o
webhook passa a gravar `subscriptions.user_id` (correlação por uuid, não só e-mail).

> **Status:** código versionado, **NÃO deployado** por esta entrega. Deploy é decisão
> do dono (ver abaixo). Enquanto não deployada, o front cai no **Payment Link**
> (fallback automático) — a venda não trava.

## Contrato

`POST /functions/v1/stripe-checkout`

**Headers (auth própria, igual a `fonteia`/`stripe-portal`):**
- `apikey: <publishable key do projeto>`
- `authorization: Bearer <access_token da sessão do usuário>`

**Body:** `{ "planId": "pro" }` (aceita também `{ "plan": "pro" }`).
Só planos com checkout direto. `corporativo` é "Falar com vendas" → `400`.

**Resposta:**
- `200 { "url": "https://checkout.stripe.com/..." }` → o front redireciona.
- `401 { error: "nao_autenticado" }` → sem/inválida sessão.
- `400 { error: "plano_invalido" }` → plano sem checkout direto.
- `502/503 { error: "checkout_indisponivel" | "stripe_nao_configurado" }` → o front
  cai no Payment Link (fallback).

Cliente no front: `apps/web/src/lib/stripe-checkout-client.ts`
(usado por `apps/web/src/app/billing/page.tsx`).

## O que a sessão carrega (a identidade que fecha a correlação)

- `client_reference_id` = **uuid do usuário Supabase** (fonte primária para o webhook)
- `metadata.supabase_user_id` / `metadata.email` / `metadata.plan_id`
- `subscription_data[metadata]` com os mesmos campos (propaga p/ a Subscription)
- `customer_email` = e-mail do usuário (pré-preenche e ajuda a casar o Customer)
- `subscription_data[trial_period_days]` = 7 (promessa "7 dias grátis"; `0` desliga)
- `allow_promotion_codes = true`

O webhook precisa ler `client_reference_id` (e os metadata) para gravar `user_id` —
ver `supabase/functions/stripe-webhook/README.md` e a migration
`infra/migrations/0026_subscriptions_correlate_by_user_id.sql`.

## Secrets (Supabase → Edge Functions → Secrets)

| Secret                        | Obrigatório | Default / Observação                                   |
|-------------------------------|-------------|--------------------------------------------------------|
| `STRIPE_SECRET_KEY`           | **sim**     | `sk_live_…` — a mesma do webhook/`stripe-portal`. NUNCA vai ao front. |
| `STRIPE_PRICE_PRO`            | não         | default `price_1ThjWB4zjAI9pGd7GOAfQwBT`               |
| `STRIPE_PRICE_CORPORATIVO`    | não         | default `price_1ThjhR4zjAI9pGd7UyBOlctV`               |
| `STRIPE_CHECKOUT_SUCCESS_URL` | não         | default `…/app/planos?checkout=sucesso&session_id={CHECKOUT_SESSION_ID}` |
| `STRIPE_CHECKOUT_CANCEL_URL`  | não         | default `…/app/planos?checkout=cancelado`              |
| `STRIPE_TRIAL_DAYS`           | não         | default `7` (use `0` para desligar o trial)            |
| `SUPABASE_URL`                | auto        | injetado pela plataforma                               |

`SUCCESS_URL` usa `?checkout=sucesso`, o **mesmo** param que `billing/page.tsx` e
`App.tsx` leem (via `isCheckoutSuccess` em `apps/web/src/config/stripe.ts`).

## Deploy (decisão do dono — NÃO automatizado aqui)

1. `STRIPE_SECRET_KEY` já existe nas Edge Secrets (usado por `stripe-portal`).
2. Deploy via Supabase MCP `deploy_edge_function` (name: `stripe-checkout`) ou
   `supabase functions deploy stripe-checkout`. `verify_jwt=false` já está em
   `supabase/config.toml` (auth é feita dentro da função).
3. Testar em **Stripe test mode** (cartão `4242 4242 4242 4242`): após o checkout,
   confirmar a linha em `public.subscriptions` e que `select public.my_plan()`
   (autenticado com o mesmo usuário) retorna `pro`.
