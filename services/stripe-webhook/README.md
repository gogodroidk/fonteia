# fonteia-stripe-webhook

Worker isolado da Cloudflare que **libera o plano do cliente automaticamente** assim que o
pagamento entra no Stripe (modo **LIVE**). Ele recebe os eventos do Stripe por webhook, confere
a assinatura e grava o plano na tabela `subscriptions` do Supabase.

Este Worker é **independente** do site (`apps/web`). Fazer deploy dele **não** afeta o site.

- Nome do Worker: `fonteia-stripe-webhook`
- Eventos tratados: `checkout.session.completed`, `customer.subscription.created`,
  `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`,
  `invoice.payment_failed`
- Mapeamento de plano (price → plano):
  - `price_1ThjWB4zjAI9pGd7GOAfQwBT` → **pro**
  - `price_1ThjhR4zjAI9pGd7UyBOlctV` → **corporativo**
  - qualquer outro → `free`

> ⚠️ **Nenhuma senha/chave fica no código.** As 3 chaves abaixo são configuradas como *secrets*
> do Worker. Elas nunca são versionadas no Git.

---

## Pré-requisitos (uma única vez)

1. Ter o `wrangler` disponível (já vem no monorepo). Os comandos abaixo rodam de dentro da
   pasta `services/stripe-webhook`:
   ```bash
   cd services/stripe-webhook
   ```
2. Estar logado na Cloudflare:
   ```bash
   npx wrangler login
   ```

---

## Passo a passo (do zero ao ar)

### (a) Cadastrar as 3 secrets do Worker

Rode um comando de cada vez. O terminal vai pedir o valor — cole e aperte Enter.

```bash
npx wrangler secret put STRIPE_WEBHOOK_SECRET
# cole o valor que começa com:  whsec_...
# (você vai obter esse valor no passo (d) — pode rodar este comando depois também)

npx wrangler secret put SUPABASE_URL
# cole:  https://pwiuiihsyazghdsrpshg.supabase.co

npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
# cole a "service_role key" do Supabase
# (Supabase → Project Settings → API → Project API keys → service_role → Reveal/Copy)
```

> A `service_role key` é uma chave de administrador do banco. Trate como senha: não cole em
> chat, e-mail, commit ou print.

### (b) Aplicar a migration no Supabase

Cria a tabela `subscriptions` (com índices, RLS e permissões). Arquivo:
`infra/migrations/0002_stripe_subscriptions.sql`.

Maneira mais simples (sem instalar nada):

1. Abra o **Supabase Dashboard** → projeto `pwiuiihsyazghdsrpshg`.
2. Menu lateral **SQL Editor** → **New query**.
3. Abra o arquivo `infra/migrations/0002_stripe_subscriptions.sql`, copie **todo** o conteúdo,
   cole no editor e clique em **Run**.
4. Confirme em **Table Editor** que a tabela `subscriptions` apareceu.

(Alternativa por CLI, se você usa o Supabase CLI: `supabase db push` ou
`psql "$DATABASE_URL" -f infra/migrations/0002_stripe_subscriptions.sql`.)

### (c) Fazer o deploy do Worker

```bash
npx wrangler deploy
```

No final, o `wrangler` imprime a URL pública do Worker. Ela tem o formato:

```
https://fonteia-stripe-webhook.<seu-subdominio>.workers.dev
```

> O `<seu-subdominio>` é fixo da sua conta Cloudflare (o mesmo para todos os seus Workers).
> **Copie a URL exata que apareceu no terminal** — é ela que vai no Stripe.

### (d) Cadastrar o webhook no painel do Stripe (modo LIVE)

1. Acesse o **Stripe Dashboard** e confirme no topo que está em **modo LIVE** (não em Test).
2. Vá em **Developers → Webhooks → Add endpoint**.
3. Em **Endpoint URL**, cole a URL do passo (c):
   `https://fonteia-stripe-webhook.<seu-subdominio>.workers.dev`
4. Em **Select events**, adicione exatamente estes **6 eventos**:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
5. Clique em **Add endpoint**.
6. Na tela do endpoint criado, em **Signing secret**, clique em **Reveal** e copie o valor que
   começa com `whsec_...`.
7. Cadastre esse valor como secret do Worker (se ainda não tinha feito no passo (a)):
   ```bash
   npx wrangler secret put STRIPE_WEBHOOK_SECRET
   # cole o whsec_...
   ```
   Se você já tinha rodado o deploy, **não precisa** fazer deploy de novo só por causa da
   secret — ela é aplicada na hora. (Se preferir garantir, rode `npx wrangler deploy` de novo.)

### Testar

- No Stripe, na tela do endpoint, use **Send test event** com `invoice.paid` ou
  `customer.subscription.updated` e confira que a resposta foi **200**.
- No Supabase (Table Editor → `subscriptions`) confira que a linha foi criada/atualizada com o
  `plan_id` e `status` corretos.
- Logs em tempo real do Worker:
  ```bash
  npx wrangler tail
  ```

---

## Como o status vira liberação de plano

| Evento Stripe | status gravado | plan_id |
|---|---|---|
| `customer.subscription.created` / `updated` com status `active`/`trialing` | `active`/`trialing` | `pro` ou `corporativo` (pelo price) |
| `invoice.paid` | `active` | pelo price da fatura |
| `invoice.payment_failed` | `past_due` | mantém o plano (acesso em risco) |
| `customer.subscription.deleted` | `canceled` | `free` |
| `checkout.session.completed` | **não grava status** (só identidade) | **não grava plan_id** (os eventos de subscription/invoice definem) |

O front/back-end libera o acesso quando `status` é `active` ou `trialing`.

---

## Idempotência e ordem de eventos

O Stripe **não garante** a ordem de entrega nem a entrega única dos eventos — o mesmo evento
pode chegar mais de uma vez e fora de ordem.

- **Sem dedup por `event.id`.** Este Worker **não tem binding KV/D1** no `wrangler.toml`, logo
  não há storage durável para deduplicar por `event.id`. (O campo `event.id` já fica nos logs e
  está pronto para um dedup futuro quando existir um binding.)
- **Toda escrita é não-regressiva por design**, o que torna reprocessar um evento duplicado
  seguro:
  - `checkout.session.completed` grava **só identidade** (`stripe_subscription_id`,
    `stripe_customer_id`, `email`) — **nunca** `plan_id`/`status` — então nunca rebaixa uma linha
    já ativa para `free`/`incomplete`.
  - `invoice.payment_failed` grava **só** `status=past_due` e **preserva o plano** (não envia
    `plan_id`; o PostgREST mantém o valor existente).
  - `customer.subscription.*` e `invoice.paid` são a **fonte de verdade** de `plan_id`/`status`.
- **Falhas transitórias** de persistência (Supabase fora) respondem `5xx` para o Stripe
  **reenviar**; eventos ignorados/processados por design respondem `200`.

---

## Avisos importantes (modo LIVE)

- **É dinheiro real.** Em LIVE os webhooks refletem cobranças reais de clientes. Teste antes em
  modo Test (endpoint separado, com `whsec_` próprio de teste).
- **Secret de teste ≠ secret de produção.** O `whsec_` do endpoint de teste é diferente do de
  LIVE. Se trocar de ambiente, atualize `STRIPE_WEBHOOK_SECRET`.
- **Assinatura é obrigatória.** O Worker rejeita com `400` qualquer requisição sem assinatura
  válida ou fora da janela de 5 minutos (proteção contra replay). Falhas **transitórias de
  persistência** (Supabase fora / `5xx` no upsert) respondem `503` de propósito, para o Stripe
  **reenviar** o evento até a gravação voltar. Eventos ignorados/processados por design respondem
  `200` (não há retry). Os erros ficam nos logs (`wrangler tail`).
- **Nunca** coloque `sk_live_...`, `whsec_...` ou a `service_role key` em arquivos do repositório.
  Apenas via `wrangler secret put`.

---

## Checklist de ativação

- [ ] (a) `wrangler secret put SUPABASE_URL`
- [ ] (a) `wrangler secret put SUPABASE_SERVICE_ROLE_KEY`
- [ ] (b) Migration `0002_stripe_subscriptions.sql` aplicada no Supabase
- [ ] (c) `wrangler deploy` feito e URL copiada
- [ ] (d) Endpoint criado no Stripe (modo LIVE) com a URL + os 6 eventos
- [ ] (d) `whsec_` copiado e salvo via `wrangler secret put STRIPE_WEBHOOK_SECRET`
- [ ] Teste com **Send test event** retornando `200` e linha aparecendo em `subscriptions`
