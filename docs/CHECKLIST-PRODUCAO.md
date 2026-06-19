# Checklist de Produção — Fonte.ia

> Antes de cada entrega relevante, passe por esta lista. Não é burocracia — é a diferença entre "funciona no meu localhost" e "funciona no celular do cliente às 23h".

**Stack real:** React 19 + Vite 7 · Cloudflare Pages/Workers · Supabase Postgres + pgvector + Auth · Supabase Edge Functions (Deno) · Stripe Billing · Cloudflare D1 (bulk)

---

## 1. Pré-entrega (código)

### Qualidade de código
- [ ] `pnpm --filter @fonteia/web... build` passa sem erros (o único build que vai para produção)
- [ ] `pnpm typecheck` no pacote alterado — sem erros de tipo novos
- [ ] `pnpm test` — 85+ testes passando; nenhum novo teste em `skip`/`todo`
- [ ] `deno check` nas Edge Functions alteradas (`supabase/functions/<fn>/index.ts`)
- [ ] Nenhum `console.error` expondo detalhes internos em rotas públicas (mensagem genérica + log server-side)
- [ ] Nenhum `TODO`, `FIXME` ou `XXX` em código novo de caminho crítico

### Segredos e variáveis de ambiente
- [ ] Nenhum token, chave ou segredo hardcoded no diff (buscar `cfut_`, `eyJhbGci`, `sk_live_`, `INFOSIMPLES`)
- [ ] `.env*` não commitado (confirmar no `git status`)
- [ ] Novas variáveis `VITE_*` adicionadas ao Cloudflare Pages → Build Env (não apenas ao `.env.local`)
- [ ] Novos Edge Secrets adicionados via Supabase Dashboard → Edge Functions → Secrets
- [ ] Novos segredos de APIs pagas adicionados ao **Supabase Vault** (não como env do Edge Function)

### Banco de dados
- [ ] Nova migration criada em `infra/migrations/` se houver mudança de schema (numeração sequencial: `0015_...`)
- [ ] Migration testada localmente (ou via Supabase staging) antes de aplicar em produção
- [ ] RLS ativado em todas as novas tabelas públicas (`public.*`) — o event trigger `ensure_rls` cobre novos `CREATE TABLE`, mas verificar manualmente
- [ ] Novas fontes de dados adicionadas à tabela `sources` (necessário para FK dos ingestores)
- [ ] `collected_at` preservado em re-ingestão (não usar `NOW()` no upsert — usar o timestamp da coleta original)

---

## 2. Pré-entrega (infra e deploy)

### Cloudflare
- [ ] `wrangler.jsonc` apontando para `apps/web/dist` com `not_found_handling: single-page-application`
- [ ] Build output em `apps/web/dist` (confirmar antes do deploy)
- [ ] Workers Secrets configurados: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `INGEST_CRON_SECRET`, `ALERTS_CRON_SECRET`, `MIGRATE_SECRET`, `SUPABASE_PUBLISHABLE_KEY` (para `services/api`)
- [ ] Domínios `fontebrasil.online` e `fonte.sbs` apontando para o projeto Cloudflare correto

### Supabase
- [ ] `supabase/config.toml` com `verify_jwt` correto por função (deployado junto com as Edge Functions)
- [ ] Edge Functions alteradas redeployadas (Dashboard → Edge Functions → Deploy)
- [ ] Migrations novas aplicadas em produção (Dashboard → SQL Editor ou CLI `supabase db push`)
- [ ] Vault contém: `portal_transparencia_token`, `datajud_api_key` (e `infosimples_token` só quando ativado)
- [ ] URL de redirect do OAuth aponta para `https://pwiuiihsyazghdsrpshg.supabase.co/auth/v1/callback` (não para o domínio do site)

### Stripe
- [ ] Webhook do Stripe aponta para o Worker `services/stripe-webhook` na URL de produção
- [ ] `STRIPE_WEBHOOK_SECRET` configurado no Worker (diferente do secret de desenvolvimento)
- [ ] Planos canônicos: `free | pro (R$197) | corporativo (R$597)` — conferir no Dashboard Stripe que os Price IDs correspondem

---

## 3. Fluxos críticos (testar antes de entregar)

### Autenticação
- [ ] Cadastro com e-mail + senha → e-mail de confirmação chega → link funciona → redireciona para onboarding
- [ ] Login com Google → callback para Supabase → redireciona para `/app` (não para localhost)
- [ ] Recuperação de senha → e-mail chega → link funciona → nova senha aceita
- [ ] Logout → sessão encerrada → redirect para landing

### Módulo Leilões (módulo ativo)
- [ ] Cockpit carrega lotes reais (não apenas os 5 de amostra, se houver ingestão recente)
- [ ] Busca de leilões retorna resultados e não quebra com query vazia
- [ ] Detalhe do lote abre (`/app/lote/:id`) com score, edital e informações corretas
- [ ] Botão "Ver edital" chama `edital-pdf` Edge Function → PDF abre (não 401/500)
- [ ] Raio-X com IA chama a Edge Function `fonteia` → resposta inclui fonte e data (não inventa)
- [ ] Rate limit de IA: após o limite, a tela mostra mensagem de limite atingido (não erro genérico)

### Billing e planos
- [ ] Usuário free vê módulos travados como "em breve" (cadeado visível)
- [ ] Checkout Stripe abre e aceita cartão de teste em ambiente de staging
- [ ] Após pagamento confirmado, `subscriptions` é atualizado e `my_plan()` retorna `pro` ou `corporativo`
- [ ] Portal do cliente (stripe-portal) abre e permite cancelar/mudar plano
- [ ] Cupom `TESTE1` é aplicável apenas dentro do limite `max_redemptions` e antes de `expires_at`

### Busca semântica e IA
- [ ] Busca semântica via `match_entities(query_embedding::vector(768), ...)` retorna resultados (768 dimensões — não 1536)
- [ ] `similar_entities` retorna entidades parecidas sem erro
- [ ] InfoSimples Proxy: sem `INFOSIMPLES_TOKEN` → retorna `{ configured: false }` sem cobrar (dormente)
- [ ] InfoSimples Proxy: com token → cache-first (não chama API se resultado existe em `external_lookups`)

### D1 Bridge (dados bulk)
- [ ] `/query` responde com dados e não retorna `cpf_hash` ou outros campos PII
- [ ] `/stats` responde com contagem de entidades por kind
- [ ] `/migrate` retorna 401 sem `Authorization: Bearer <service_role>`
- [ ] `apikey` inválida → 401 (não 200 com corpo vazio)

### Mobile e PWA
- [ ] App abre e funciona no Chrome Mobile (Android) e Safari (iOS)
- [ ] Bottom navigation não fica embaixo do safe-area do notch
- [ ] PWA instalável: prompt de instalação aparece no Chrome Android
- [ ] Service worker não cacheia respostas de API autenticadas (logout não fica "preso" no cache)
- [ ] Modo demonstração funciona sem backend: busca retorna amostra, login não trava

### LGPD e legal
- [ ] Banner de cookies aparece no primeiro acesso e não reaparece após aceite
- [ ] Links de Privacidade, Cookies e Termos no rodapé abrem as páginas corretas
- [ ] Formulários com dados pessoais têm aviso de finalidade conforme política

---

## 4. Disaster Recovery — conferência rápida

- [ ] Migrations `0001–0014 + 0099` estão em `infra/migrations/` e foram aplicadas em produção
- [ ] `entities.embedding` é `vector(768)` em produção (não 1536 — verificar com `\d entities` no SQL Editor)
- [ ] Índice de vetor em `entities.embedding` existe (busca semântica lenta sem ele — verificar com `pg_indexes`)
- [ ] `pg_cron` configurado para `prune_ai_rate_limits()` (limpeza de entradas > 1h)
- [ ] Trigger `on_auth_user_created` ativo em `auth.users` (re-verificar após upgrade de Supabase Auth)

---

## 5. Observações rápidas

- **Build do site:** `pnpm --filter @fonteia/web... build` — só o site. Use `pnpm build:all` para todos os pacotes (tem erros esperados nos serviços de backend).
- **Deploy automático:** push na branch configurada no Cloudflare Pages → build e publicação automáticos.
- **Banco de produção:** projeto Supabase `pwiuiihsyazghdsrpshg` (org OLLI). SQL Editor para queries manuais.
- **D1 banco:** `fonteia-data` (ID: `417caa83-86dc-463e-8682-656cf938cd24`).
- **Domínio:** `fontebrasil.online` (principal), `fonte.sbs` (alias). DNS na Cloudflare.
