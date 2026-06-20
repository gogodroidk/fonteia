# Fonte.ia — Manual de Produção

> Leitura rápida para o dono do projeto lembrar como tudo funciona.
> Linguagem simples, sem jargão desnecessário. Última atualização: 2026-06-20.

---

## 1. O que é o projeto

Fonte.ia (marca Olli) é uma plataforma SaaS de inteligência de dados públicos brasileiros. Transforma licitações, leilões, empresas, política e outras fontes oficiais em dashboards e análises com IA. O modelo de negócio é assinatura mensal (R$ 197 individual, R$ 597 escritório). O site está no ar em **fontebrasil.online**.

---

## 2. Como rodar local

**Pré-requisito:** Node.js instalado, pnpm 9.15.4 (`npm i -g pnpm@9.15.4`).

```bash
# 1. Instalar dependências (sempre fazer isso antes de qualquer comando)
pnpm install

# 2. Copiar o arquivo de variáveis de ambiente e preencher as chaves
cp .env.example .env.local
# Edite .env.local e coloque os valores reais (ver seção 4)

# 3. Rodar o site em modo desenvolvimento (hot reload)
pnpm dev

# 4. Abrir no navegador: http://localhost:3000
```

---

## 3. Comandos principais

| Comando | O que faz |
|---|---|
| `pnpm install` | Instala todas as dependências do monorepo |
| `pnpm dev` | Sobe o site localmente em modo desenvolvimento |
| `pnpm --filter @fonteia/web build` | Gera o build de produção do site (o único que vai para o Cloudflare) |
| `pnpm --filter @fonteia/web typecheck` | Verifica erros de TypeScript no site |
| `pnpm --filter @fonteia/web test` | Roda os testes do site (deve passar 85+ testes) |
| `pnpm lint` | Verifica qualidade de código no monorepo inteiro |
| `pnpm format` | Formata o código com Prettier |
| `pnpm deploy:cloudflare:web` | Deploy manual do site para o Cloudflare Pages (normalmente desnecessário — o push já faz isso automático) |

---

## 4. Variáveis de ambiente — tabela completa

> Regra de ouro: variáveis `VITE_*` são públicas (vão para o navegador). Tudo que começa com `SUPABASE_SERVICE_ROLE`, `sk_live`, `whsec`, tokens de APIs pagas — são **secretos** e nunca entram no código nem no bundle do site.

| Variável | Onde fica em produção | Segredo? | Exemplo / Observação |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Cloudflare Pages → Build Env | **NÃO** (pública por design) | `https://pwiuiihsyazghdsrpshg.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Cloudflare Pages → Build Env | **NÃO** (pública por design) | `sb_publishable_uojihld8t92M...` |
| `VITE_API_URL` | Cloudflare Pages → Build Env | Não | URL do Worker de API (se usado) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Edge Secrets | **SIM** — nunca no frontend | `eyJh...` (JWT longo) |
| `GEMINI_API_KEY` | Supabase Edge Secrets | **SIM** | `AIza...` (Google AI) |
| `ANTHROPIC_API_KEY` | Supabase Edge Secrets | **SIM** | `sk-ant-...` (Claude) |
| `STRIPE_SECRET_KEY` | Supabase Edge Secrets | **SIM** — nunca no frontend | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | Supabase Edge Secrets | **SIM** | `whsec_...` (gerado no Stripe Dashboard) |
| `INGEST_CRON_SECRET` | Supabase Edge Secrets | SIM | `openssl rand -hex 32` |
| `ALERTS_CRON_SECRET` | Supabase Edge Secrets | SIM | `openssl rand -hex 32` |
| `MIGRATE_SECRET` | Supabase Edge Secrets | SIM | `openssl rand -hex 32` |
| `PORTAL_TRANSPARENCIA_TOKEN` | Supabase Vault | SIM | Token da API Portal da Transparência |
| `DATAJUD_API_KEY` | Supabase Vault | SIM | Chave da API DataJud/CNJ |
| `INFOSIMPLES_TOKEN` | Supabase Vault | SIM | Token pago — só ativar quando usar |
| `CF_API_TOKEN` | GitHub Actions Secrets (CI) | SIM | Token Cloudflare com permissão Pages+Workers |
| `CF_ACCOUNT_ID` | GitHub Actions Secrets (CI) | SIM | ID da conta no painel Cloudflare |
| `DATABASE_URL` | Apenas local (`.env.local`) | SIM | Nunca vai para produção |

**Resumo visual:**

```
PUBLICO (pode ir no bundle do site):
  VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_API_URL
  STRIPE_PUBLISHABLE_KEY (pk_live_...) — já está hardcoded em apps/web/src/config/stripe.ts

SECRETO (nunca no frontend, nunca no git):
  SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY (sk_live_...), STRIPE_WEBHOOK_SECRET (whsec_...)
  GEMINI_API_KEY, ANTHROPIC_API_KEY, todos os *_TOKEN e *_SECRET acima
```

---

## 5. Onde colocar as chaves do Supabase

O Supabase tem dois tipos de chave com finalidades completamente diferentes:

**URL + Chave Publishable** (públicas — vão para o navegador):
- Onde ficam em produção: **Cloudflare Pages → Settings → Environment Variables → Build variables**
- Variáveis: `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`
- URL do projeto: `https://pwiuiihsyazghdsrpshg.supabase.co`
- Publishable key: `sb_publishable_uojihld8t92MQXo7gXrR3w_WPVn4RkZ` (já tem fallback no código, mas coloque no Pages também para garantir)

**Service Role Key** (secreta — só vai para as Edge Functions):
- Onde fica em produção: **Supabase Dashboard → Project Settings → Edge Functions → Secrets**
- Variável: `SUPABASE_SERVICE_ROLE_KEY`
- **Nunca coloque esta chave no frontend, no .env commitado ou no Cloudflare Pages Build Env.**

---

## 6. Onde colocar as chaves do Stripe

O Stripe também tem dois tipos de chave:

**Chave pública** (`pk_live_...`): já está embutida diretamente em `apps/web/src/config/stripe.ts`. É seguro assim — chave publishable é pública por design do Stripe.

**Chave secreta** (`sk_live_...`) e **Webhook Secret** (`whsec_...`): ficam nos **Supabase Edge Secrets** (Dashboard → Edge Functions → Secrets). Variáveis: `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET`.

**Atenção:** Nunca coloque `sk_live_...` no frontend nem no Cloudflare Pages Build Env.

**Customer Portal:** O campo `STRIPE_CUSTOMER_PORTAL_URL` em `apps/web/src/config/stripe.ts` está **vazio**. Enquanto vazio, o botão "Gerenciar assinatura" fica oculto e o cancelamento é por contato@olli.com.br. Para ativar o auto-cancelamento:
1. Acesse Stripe Dashboard → Settings → Billing → Customer portal
2. Ative o portal e configure as opções
3. Copie o "Share link" gerado
4. Cole esse link como valor de `STRIPE_CUSTOMER_PORTAL_URL` no arquivo `apps/web/src/config/stripe.ts`

---

## 7. Onde configurar o webhook do Stripe

O webhook do Stripe é uma **Supabase Edge Function** chamada `stripe-webhook` (não o Worker do Cloudflare — ele existe no código mas não está deployado em produção).

**Passo a passo para configurar:**

1. Acesse Stripe Dashboard → Developers → Webhooks → Add endpoint
2. A URL do endpoint deve ser: `https://pwiuiihsyazghdsrpshg.supabase.co/functions/v1/stripe-webhook`
3. Selecione os eventos: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`
4. Após criar, o Stripe gera um "Signing secret" (`whsec_...`) — copie esse valor
5. Coloque esse valor na variável `STRIPE_WEBHOOK_SECRET` nos Supabase Edge Secrets

**Verificação:** Confirme no Stripe Dashboard → Developers → Webhooks que a URL registrada é a da Edge Function do Supabase (não um URL do Cloudflare). O secret registrado deve bater com o `STRIPE_WEBHOOK_SECRET` configurado nos Edge Secrets.

**Atenção crítica:** O e-mail usado no checkout do Stripe deve ser exatamente igual ao e-mail de login no site. A liberação do plano funciona assim: o webhook grava na tabela `subscriptions`, e a função `my_plan()` do banco busca o plano pelo e-mail (em minúsculas). Se os e-mails forem diferentes, o pagamento é processado mas o plano não libera.

---

## 8. Onde configurar o Cloudflare

**Para o site (Cloudflare Pages):**
1. Acesse dash.cloudflare.com → Workers & Pages → fonteia (projeto Pages)
2. Settings → Environment Variables → Production
3. Adicione as variáveis `VITE_*` conforme a tabela da seção 4
4. Após salvar, faça um novo deploy (push ou botão "Redeploy") para as variáveis entrarem em vigor

**Domínios:**
- `fontebrasil.online` — domínio principal (DNS gerenciado no Cloudflare)
- `fonte.sbs` — alias secundário

Para conectar um domínio ao projeto: Pages → fonteia → Custom domains → Add custom domain.

**Workers deployados no Cloudflare (apenas 3):**
- `olli-site` — site institucional
- `olli-diagnostico` — diagnóstico
- `fonteia` — Worker de API

O Worker `services/stripe-webhook` que existe no código **não está deployado** no Cloudflare — o webhook real fica na Supabase Edge Function.

---

## 9. Como fazer deploy

**Site (frontend):** Basta fazer `git push` na branch configurada. O Cloudflare Pages detecta o push automaticamente, roda `pnpm --filter @fonteia/web build` e publica. Não precisa fazer nada manualmente na maioria dos casos.

**Edge Functions (backend Supabase):** Quando editar arquivos em `supabase/functions/*`, é preciso deployar manualmente:
- Via Supabase Dashboard → Edge Functions → selecionar a função → Deploy
- Ou via CLI: `supabase functions deploy nome-da-funcao`

**Migrations (banco de dados):** Arquivos SQL em `infra/migrations/` (numeração sequencial: 0001, 0002, ...). Para aplicar uma migration nova em produção:
- Supabase Dashboard → SQL Editor → cole o conteúdo da migration e execute
- Ou via Supabase MCP `apply_migration`

**Nunca rodar `pnpm build:all` esperando deployar tudo** — esse comando tem erros esperados em serviços de backend e é apenas para desenvolvimento local.

---

## 10. Como testar pagamento

**Antes de testar, certifique-se de que o Stripe está em modo Test** (painel mostra "Test mode" no topo).

1. Crie ou use uma conta no site (e-mail qualquer, mas guarde qual foi)
2. Vá para a página de planos e clique em "Assinar Pro"
3. No checkout do Stripe, use o cartão de teste: **4242 4242 4242 4242**, data qualquer futura, CVV qualquer (ex.: 123), CEP qualquer (ex.: 01310-100)
4. Conclua o pagamento
5. Aguarde alguns segundos (o webhook processa de forma assíncrona)
6. Para confirmar que funcionou, acesse o Supabase Dashboard → SQL Editor e rode:

```sql
-- Substitua pelo e-mail que você usou
SELECT * FROM subscriptions WHERE email = 'seu@email.com';

-- Para verificar o plano do usuário logado (rode como service_role ou autenticado):
SELECT public.my_plan();
```

O resultado de `my_plan()` deve retornar `pro` após o pagamento.

---

## 11. Como testar usuário pago vs. usuário sem plano

**Usuário sem plano (free):**
1. Crie uma conta nova no site
2. Acesse o dashboard — módulos premium aparecem com cadeado ou botão de upgrade
3. Tente acessar um módulo pago — deve ser bloqueado ou mostrar preview limitado

**Usuário com plano:**
1. Assine usando o cartão de teste 4242 (modo test) ou um plano real (modo live)
2. Após o webhook processar, recarregue o site
3. Os módulos devem estar liberados sem cadeado

**Usando cupom:**
- Na tabela `coupon_redemptions` do Supabase, você pode criar um cupom para liberar acesso temporário sem passar pelo Stripe (útil para testar com clientes antes do billing estar 100% configurado)
- A função `redeem_coupon(p_code)` aplica o cupom para o usuário autenticado

---

## 12. Como saber se está tudo certo — checklist rápido

Rode este roteiro de fumaça após qualquer deploy relevante:

- [ ] **Site abre** em fontebrasil.online sem mostrar "modo demonstração" nem tela em branco
- [ ] **Login funciona** — criar conta ou entrar com uma existente e ser redirecionado para o dashboard
- [ ] **Dashboard carrega** com dados reais (não apenas placeholders ou 5 registros de amostra)
- [ ] **Módulos exibem dados** — abrir leilões, ver lista de lotes carregada
- [ ] **Checkout abre** — clicar em "Assinar Pro" abre a página do Stripe (não dá erro)
- [ ] **Webhook está funcionando** — após pagamento de teste, a tabela `subscriptions` no Supabase recebe uma linha nova
- [ ] **Plano libera** — após o webhook gravar, `my_plan()` retorna `pro` e os módulos premium ficam acessíveis
- [ ] **Mobile funciona** — abrir no celular, navegação inferior visível, app não quebra

---

## Sinais de problema — mini-troubleshooting

| O que está acontecendo | Causa provável | O que fazer |
|---|---|---|
| Site mostra "modo demonstração" ou "backend não configurado" | `VITE_SUPABASE_URL` ou `VITE_SUPABASE_PUBLISHABLE_KEY` não estão no Cloudflare Pages Build Env | Adicionar as variáveis em Pages → fonteia → Settings → Environment Variables → Production; fazer redeploy |
| Login dá erro ou não redireciona | URL de callback do OAuth errada | Verificar no Supabase Dashboard → Auth → URL Configuration que o site URL é `https://fontebrasil.online` |
| Pagou mas o plano não liberou | E-mail do checkout ≠ e-mail de login, ou webhook não está apontado para a Edge Function, ou `STRIPE_WEBHOOK_SECRET` errado | Confirmar no Stripe Dashboard → Webhooks que a URL é a da Edge Function do Supabase; confirmar que o secret bate; confirmar que os e-mails são idênticos (maiúsculas/minúsculas importam) |
| Módulo travado mesmo depois de assinar | `my_plan()` não retorna `pro` | Rodar `SELECT * FROM subscriptions WHERE email = 'seu@email.com'` no Supabase SQL Editor — se não tiver linha, o webhook não chegou |
| Busca semântica (IA) não retorna nada | Embeddings com dimensão errada (1536 vs 768) | Verificar com `SELECT vector_dims(embedding) FROM entities LIMIT 1` — deve retornar 768 |
| InfoSimples não responde / retorna erro | Token não configurado no Vault | Verificar no Supabase Vault se `infosimples_token` existe; sem token, a função retorna `{ configured: false }` sem cobrar |
| Edge Function dá erro 500 | Secret faltando | Supabase Dashboard → Project Settings → Edge Functions → Secrets — confirmar que todos os secrets da seção 4 estão presentes |
| Build do Cloudflare Pages falha | Erro de TypeScript ou dependência | Ver logs no Cloudflare Pages → fonteia → Deployments → último deploy com falha |
| Portal de cancelamento não abre | `STRIPE_CUSTOMER_PORTAL_URL` vazio em `stripe.ts` | Seguir instruções da seção 6 para ativar o Customer Portal no Stripe e colar o link no código |

---

## Referências rápidas

| O que | Onde |
|---|---|
| Projeto Supabase | `pwiuiihsyazghdsrpshg` — dashboard.supabase.com |
| Projeto Cloudflare Pages | dash.cloudflare.com → Workers & Pages → fonteia |
| Domínio principal | fontebrasil.online |
| Stripe (live) | dashboard.stripe.com (modo live) |
| Price ID Pro | `price_1ThjWB4zjAI9pGd7GOAfQwBT` (R$ 197/mês) |
| Price ID Corporativo | `price_1ThjhR4zjAI9pGd7UyBOlctV` (R$ 597/mês — sem checkout direto, só via contato comercial) |
| Payment Link Pro | `https://buy.stripe.com/dRm00c4NGgYPdpV8HHasg00` |
| Edge Function webhook | `https://pwiuiihsyazghdsrpshg.supabase.co/functions/v1/stripe-webhook` |
| Migrations SQL | `infra/migrations/` (0001, 0002, ... 0099) |
| Documentação hardening | `docs/HARDENING.md` |
| Checklist de produção | `docs/CHECKLIST-PRODUCAO.md` |
