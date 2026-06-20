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
