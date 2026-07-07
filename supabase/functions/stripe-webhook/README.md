# stripe-webhook, stripe-worker, stripe-setup — resgatados em 2026-07-07 (Onda 1)

**Atualização do diagnóstico anterior (2026-06-20 dizia "código NÃO está no repo,
plano de consolidação pendente"):** o código real das 3 funções foi lido de
produção via `mcp__supabase__get_edge_function` e agora está versionado em
`index.ts` em cada pasta (`stripe-webhook/`, `stripe-worker/`, `stripe-setup/`).
O que segue é o que aprendemos lendo esse código — é um diagnóstico diferente
(e mais grave) do que o suposto antes.

## O que essas 3 funções são de verdade

**Não é código customizado da Fonte.ia.** É o instalador oficial do pacote npm
`stripe-experiment-sync` v1.0.31 (nome antigo/deprecated do
`@supabase/stripe-sync-engine`, https://github.com/stripe/sync-engine) —
a integração "Stripe Sync Engine" de um clique do Supabase Dashboard
(Database → Integrations). O bundle publicado em cada função tem
~47-49 mil linhas; o `index.ts` versionado aqui contém só o entrypoint próprio
(a config específica deste deploy), com um cabeçalho explicando por que o
vendor bundle inteiro não foi duplicado no git.

Essas 3 funções sincronizam objetos Stripe **raw** para um schema Postgres
`stripe.*` (tabelas `stripe.subscriptions`, `stripe.customers`,
`stripe.checkout_sessions`, etc. — espelho 1:1 da API Stripe), geridas por:
- `stripe-setup`: instala/atualiza (roda migrations do pacote, registra o
  webhook no Stripe), consulta status, ou desinstala (drop schema CASCADE).
- `stripe-webhook`: recebe os eventos do Stripe, grava em `stripe.*`.
- `stripe-worker`: reconciliação periódica (chamada pelo cron
  `stripe-sync-worker`, a cada minuto — ver `docs/OPERACOES-CRON.md`).

## ACHADO CRÍTICO — o pagamento não libera acesso hoje

`public.my_plan()` e `public.admin_list_plans()` (as RPCs que decidem se um
usuário tem plano pago) leem `public.subscriptions` — uma tabela **diferente**,
no schema `public`, sem nenhuma relação com o schema `stripe.*` acima. Não
existe trigger nem função conectando os dois (confirmado via
`information_schema.triggers` em produção: os únicos triggers em `stripe.*`
são `handle_updated_at`, nada aponta para `public`).

Em produção, `public.subscriptions` tem **uma única linha** hoje
(2026-07-07): `stripe_subscription_id = 'manual-trial-igoreluisa'`,
`plan_id='pro'`, `status='trialing'`, criada manualmente em 2026-06-20.
**Nenhum pagamento real via Stripe jamais escreveu em `public.subscriptions`
em produção.** A tabela também não tem coluna `user_id`, apesar da migration
`infra/migrations/0027_subscriptions_correlate_by_user_id.sql` (anterior à
0037, que já está aplicada) adicionar essa coluna — ou seja, a 0027 não foi
aplicada em produção, ou foi revertida manualmente.

O código que faria a ponte certa (ler eventos Stripe reais e fazer upsert em
`public.subscriptions` com `plan_id`/`status`/`user_id`, não-regressivo) existe
só em `services/stripe-webhook/src/worker.ts` — um Cloudflare Worker limpo,
versionado, **nunca deployado** (confirmado: a conta Cloudflare só tem os
Workers `olli-site`, `olli-diagnostico`, `fonteia`; nenhum de Stripe).

**Conclusão prática: hoje não existe caminho automatizado pagamento→acesso em
produção.** Um cliente que pagasse via Stripe agora não teria o plano liberado
automaticamente — só o dono inserindo manualmente em `public.subscriptions`,
igual foi feito para o próprio Igor.

## stripe-portal — divergência oposta (repo à frente de produção)

Ao contrário das 3 funções acima, `supabase/functions/stripe-portal/index.ts`
**já estava no repo** e diverge da produção — mas nesse caso o repo é a versão
mais nova/segura: usa `_shared/auth.ts` (`getVerifiedUserId`, verificação extra
do token contra o Supabase Auth) e `_shared/http.ts` (`fetchWithTimeout`,
timeouts explícitos em todas as chamadas de rede), enquanto a versão deployada
em produção (version=1, a mesma desde a criação) usa `fetch` cru sem timeout e
sem essa camada extra. **Produção precisa de um redeploy de `stripe-portal`
para alcançar o que já está no repo** — isto NÃO foi sobrescrito nesta Onda 1
(ver regra de "não aplicar/deployar nada").

## Plano de consolidação (decisão do dono — ainda NÃO automatizado)

Continua válido o plano original, com um ajuste de prioridade: antes de portar
`worker.ts` para uma Edge Function, decidir se a Fonte.ia quer:
(a) manter o Stripe Sync Engine oficial rodando em paralelo (é útil para
    auditoria/dashboards, ele já sincroniza tudo) E adicionar uma função própria
    separada que faça a ponte para `public.subscriptions`/`my_plan()`; ou
(b) desligar o Sync Engine (ele cobra recursos de cron a cada minuto e schema
    inteiro replicado) e ter só a função própria enxuta.

Em qualquer caso, os passos técnicos seguem os mesmos de antes:
1. Portar a lógica de `services/stripe-webhook/src/worker.ts` para uma Edge
   Function que escreva em `public.subscriptions` (pode reusar o nome
   `stripe-webhook` SE o Sync Engine for descontinuado, ou usar outro nome tipo
   `stripe-webhook-billing` se ambos forem coexistir).
2. Em **test mode**, apontar o webhook do Stripe para a função nova, fazer um
   checkout de teste (cartão `4242 4242 4242 4242`) e confirmar que aparece
   linha em `public.subscriptions` e que `select public.my_plan()` (autenticado
   com o mesmo e-mail do checkout) retorna `pro`.
3. Promover para live: trocar a URL do webhook e o `STRIPE_WEBHOOK_SECRET` (live).
4. Reaplicar `infra/migrations/0027_subscriptions_correlate_by_user_id.sql` em
   produção (adiciona `user_id`) já que ela não está aplicada — confirmar antes
   com `list_migrations`/checagem de schema.
5. Fazer o redeploy de `stripe-portal` (repo já tem a versão hardened).

## 🔗 Correlação por `user_id` — contexto original (ainda relevante)

> Adicionado junto da Edge Function **`stripe-checkout`** (checkout amarrado ao
> usuário) — que, note-se, **não aparece na lista de Edge Functions ativas em
> produção** (`mcp__supabase__list_edge_functions` não a lista). Se ela existe,
> está em outro lugar; se não existe, o texto abaixo descreve um plano ainda
> não implementado.

**Problema atual:** o webhook correlacionaria assinatura↔usuário **só por
e-mail** (`subscriptions.email`) e nunca gravaria `subscriptions.user_id`.

**O que mudaria na origem:** a função `stripe-checkout` criaria a Checkout
Session com a identidade Supabase embutida. O webhook novo (item 1 do plano
acima) poderia ler:

No evento **`checkout.session.completed`** (objeto = Checkout Session):

| Campo do Stripe                         | Uso no webhook                                  |
|------------------------------------------|--------------------------------------------------|
| `session.client_reference_id`           | **uuid do usuário Supabase** → grava `user_id`  |
| `session.metadata.supabase_user_id`     | redundância do `client_reference_id`            |
| `session.metadata.email` / `.plan_id`   | rastreabilidade                                 |

Nos eventos **`customer.subscription.created` / `.updated`** (objeto = Subscription):

| Campo do Stripe                          | Uso no webhook                                 |
|--------------------------------------------|---------------------------------------------------|
| `subscription.metadata.supabase_user_id` | **uuid do usuário Supabase** → grava `user_id` |

**Regras (mantêm o padrão não-regressivo já existente no `worker.ts`):**
- A escrita de `user_id` deve ser **não-regressiva**: só preenche/atualiza, **nunca
  apaga** um `user_id` já gravado por outro evento (igual ao tratamento de plan/status).
- O `UNIQUE` continua sendo `stripe_subscription_id`: o upsert casa por ele.
- Manter a gravação de `email` (fallback para compras legadas via Payment Link).
