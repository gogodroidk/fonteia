# SAAS_PRODUCTION_AUDIT — Fonte.ia by Olli

**Data:** 2026-06-20 · **Branch:** `claude/dreamy-einstein-oe67qu` · **Projeto Supabase:** `pwiuiihsyazghdsrpshg` (org OLLI)
**Método:** auditoria viva — código do repositório **+ estado real de produção** (Supabase Advisors, tabelas, Edge Functions deployadas, Workers Cloudflare). Não é só leitura de código: é o que está **no ar**.

> **Veredito de uma linha:** isto não é um SaaS quebrado — é um SaaS **bom** que precisa de **consolidação e rastreabilidade**, não de resgate. O build passa, a RLS existe, o gating funciona. Os riscos reais estão no **caminho do dinheiro** e em **código de produção que não está no git**.

---

## 1. Resumo do projeto

Fonte.ia é uma plataforma SaaS B2B de inteligência de dados públicos brasileiros. Transforma fontes oficiais (Receita, PNCP, CNPJ, IBGE, Câmara/Senado, IBAMA, CNJ, INPI) em decisões rastreáveis com IA. Está **no ar** em `fontebrasil.online` com ~217 mil registros e 8+ módulos. Monetização: `free` · `pro R$197/mês` · `corporativo R$597/mês`. Estado comercial: **pré-receita** — 4 usuários cadastrados (1 admin), **0 assinaturas** ainda.

## 2. Arquitetura atual (a real, confirmada em produção)

| Camada | O que roda de verdade |
|---|---|
| **Frontend** | `apps/web` — Vite + React 19 + TS, design system próprio (CSS vars). Deploy: **Cloudflare Pages** (Worker `fonteia`, auto-deploy no push). |
| **Backend** | **Supabase Edge Functions (Deno)** — 30+ funções deployadas: `fonteia` (IA), `d1-bridge`, `empresas-cnpj`, `edital-pdf`, `lote-detalhe`, `infosimples-proxy`, `stripe-portal`, `stripe-webhook`, `send-alerts`, `ingest-*`. |
| **Dados** | **Supabase Postgres** (leilões `entities` kind=auction_lot, ~50k linhas, embeddings pgvector 768d) + **Cloudflare D1** (bulk ~217k, via `d1-bridge`). |
| **Billing** | Stripe **Payment Links** (não Checkout Sessions) + webhook que escreve `subscriptions`; gating no app via RPC `my_plan()` (correlação por e-mail). |
| **Auth** | Supabase Auth (e-mail/senha + Google OAuth). Trigger `on_auth_user_created` → cria `profiles` (role `user`; admin manual). |

**Descoberta-chave:** a Cloudflare tem **3 Workers** (`olli-site`, `olli-diagnostico`, `fonteia`) — **nenhum** de API/Stripe/ingest. Portanto **toda** a camada `apps/api` + `services/*` (api, billing, alerting, ingest, stripe-webhook) está **NÃO-DEPLOYADA / legada**. O backend vivo é 100% Edge Functions, exatamente como o `CLAUDE.md` diz.

## 3. Problemas encontrados (priorizados)

**🔴 P0 — confiança no billing / rastreabilidade**
1. **Código-fantasma em produção.** O `stripe-webhook` que processa pagamento é uma Edge Function (1,17 MB) **sem fonte no git**; idem `stripe-setup`, `stripe-worker`. Não dá pra revisar/testar/recuperar. (Ver `supabase/functions/stripe-webhook/README.md`.)
2. **Portal do cliente Stripe desligado** — `STRIPE_CUSTOMER_PORTAL_URL = ""` em `apps/web/src/config/stripe.ts`. Cliente pago não cancela/gerencia sozinho.
3. **Liberação de plano só por e-mail** — webhook grava `subscriptions.email`; `my_plan()` casa `auth.email()`. Se o checkout usar e-mail ≠ login, **paga e não libera**. Mitigado por `prefilled_email`, mas editável.

**🟠 P1 — produção limpa**
4. **Arquitetura legada inteira no repo** (não deployada): `apps/api`, `services/api|billing|alerting|ingest|stripe-webhook`. Modelo de planos **duplicado em 3 lugares** (`services/billing/plans.ts`, `config/stripe.ts`, `data/leiloes-seed.ts`) — hoje em sincronia, fadado a divergir.
5. **`supabase/config.toml` desalinhado do deploy** — diz `stripe-portal: verify_jwt=true`, no ar está `false`; `stripe-setup`/`stripe-worker` nem constam.
6. **Migration `0001` declarava `embedding VECTOR(1536)`** mas produção é `768` — recriar o banco quebraria a busca semântica. **(Corrigido — ver §4.)**
7. **Lacunas de DR** (do `HARDENING.md`): índice vetorial não versionado; `pg_cron` de `prune_ai_rate_limits()` ausente; sources `ibge-localidades`/`orgaos-publicos` faltando na 0001.

**🟡 P2 — endurecimento/polimento**
8. Advisors Supabase: proteção contra senha vazada **OFF**; `public.ingest_senado` sem `search_path` **(corrigido)**; PostGIS exposto ao `anon` (baixo risco). A maioria dos 30 alertas é **por design** (não mexer).
9. Edge Functions: rate-limit da `fonteia` **falha-aberto** se faltar service role; separação anti-prompt-injection pode ser mais estruturada (tags). Spend cap do InfoSimples **existe** (bom).
10. Mobile: alvo de toque de 32px (`ContextChat.tsx:273`) < 44px (WCAG); tabela `minWidth:560` em `page.tsx` (tem `overflowX:auto`, então rola — aceitável).
11. Segredo histórico: `HARDENING.md` cita token CF `cfut_…` no histórico do git → **revogar/rotacionar** se ainda não feito.

## 4. Correções feitas (nesta sessão)

| # | Correção | Arquivo / Onde | Risco |
|---|---|---|---|
| 1 | `embedding VECTOR(1536)` → `VECTOR(768)` (alinha migration ao banco; evita quebra em DR) | `infra/migrations/0001_core_schema.sql:80` | Nenhum (prod já é 768) |
| 2 | `search_path=public` em `public.ingest_senado` (advisor) — **aplicado em produção e verificado** | `infra/migrations/0018_*.sql` + banco | Nenhum |
| 3 | Migration de hardening idempotente e à prova de falha (DO-blocks) | `infra/migrations/0018_security_hardening.sql` | Nenhum |
| 4 | Nota de recuperação do webhook não-versionado + plano de consolidação | `supabase/functions/stripe-webhook/README.md` | Nenhum (doc) |
| 5 | Runbook de produção em PT-BR simples | `README_PRODUCAO.md` | Nenhum (doc) |
| 6 | Esta auditoria | `SAAS_PRODUCTION_AUDIT.md` | Nenhum (doc) |

**Tentado, mas não aplicável:** revogar `EXECUTE` do PostGIS `st_estimatedextent` do `anon` — as funções pertencem à extensão PostGIS (não ao role do projeto), então o `REVOKE` foi ignorado por `insufficient_privilege`. Risco aceito (estimam extensão de geometria sobre dados públicos; sem vazamento sensível).

## 5. Integrações revisadas

- **Supabase** (Auth, Postgres, RLS, Edge Functions, pgvector) — ✅ revisada.
- **Stripe** (Payment Links, webhook, portal, `subscriptions`, `my_plan`) — ✅ revisada; pendências em §7.
- **Cloudflare** (Pages/Worker `fonteia`, D1) — ✅ revisada; legado não-deployado identificado.
- **Gemini** (embeddings 768d + respostas) e **Anthropic** (Claude) — chaves em Edge Secrets ✅.
- **InfoSimples** (proxy pago) — dormente, com cache (`external_lookups`) + trava de gasto ✅.
- **Fontes públicas** (Receita/SLE, PNCP, CNPJ, IBGE, Câmara/Senado, IBAMA, CNJ, INPI) — via `ingest-*` ✅.

## 6. Supabase

- **Tabelas:** 25 no schema `public`, RLS **ativada em todas** menos `spatial_ref_sys` (tabela de sistema PostGIS — risco aceito). Volumes reais: `entities` 49.939, `evidence`/`raw_records` 1.965, `profiles` 4, `modules` 9, **`subscriptions` 0**.
- **Auth:** trigger `on_auth_user_created` → `handle_new_user()` cria `profiles` (role `user`). 4 usuários, 1 `admin` (`igoreluisa@…`). Sem escalonamento de privilégio no signup ✅.
- **RPCs:** `my_plan()` ✅ correto (casa `lower(email)`, considera trial por cupom). `match_entities`/`similar_entities` (768d) ✅.
- **Advisors (resumo):** 1 ERROR (`spatial_ref_sys` RLS — PostGIS, aceito), WARNs majoritariamente **por design**; ação real = ligar proteção de senha vazada (1 clique) e `search_path` (feito).
- **Config drift:** `config.toml` precisa refletir o deploy real (stripe-*).

## 7. Stripe

- **Modelo:** Payment Links. `pro` tem link; `corporativo` é "falar com vendas" (sem self-serve — decisão de produto consciente). `pk_live` no front é **público por design** ✅.
- **Webhook:** lógica de referência (`services/stripe-webhook/src/worker.ts`) é **bem escrita** — HMAC manual, comparação tempo-constante, escritas **não-regressivas**, raciocínio de idempotência. **Mas não é o que está deployado** (a Edge Function `stripe-webhook` é). → **consolidar** (P0 #1).
- **Pendências:** portal desligado (P0 #2); correlação por e-mail e não `user_id` (P0 #3); `past_due` mantém o plano (grace period — verificar se é intencional).
- **Não comprovado:** nenhuma transação real liberou plano de ponta a ponta (0 linhas em `subscriptions`). **Fazer 1 transação de teste** antes de divulgar checkout.

## 8. Cloudflare

- **Pages/Worker `fonteia`:** serve `apps/web/dist` como SPA ✅ (atualizado hoje). Auto-deploy no push.
- **D1 `fonteia-data`:** bulk ~217k via `d1-bridge` ✅.
- **Workers deployados:** só 3 (`olli-site`, `olli-diagnostico`, `fonteia`). **Confirmar** no painel Pages → projeto `fonteia` → Settings → Environment Variables que `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` existem no **Build Env** — senão o site cai em "modo demo" para o cliente.
- **Limpeza:** `services/*` e `apps/api` têm `wrangler.toml` mas **não estão no ar** — decidir apagar ou quarentenar para não confundir.

## 9. Segurança

- **Frontend:** nenhum segredo privado no bundle (só URL + publishable do Supabase e `pk_live` do Stripe — públicos por design) ✅.
- **RLS:** policies por dono (`auth.uid()::text` / `auth.email()`) em `subscriptions`, `entitlements`, `usage_events`, `alerts`, `dossiers` ✅ (migrations 0002/0007/0017).
- **Edge Functions `verify_jwt=false`:** autorizam por dentro (sessão + plano). `infosimples-proxy` exige plano pago + cache + spend cap ✅. **Atenção:** rate-limit da `fonteia` falha-aberto se faltar `SERVICE_ROLE_KEY` (revisar trade-off custo×disponibilidade).
- **Ações de segurança recomendadas (rápidas):** ligar **leaked password protection** (Auth → Settings); rotacionar token CF `cfut_…` do histórico; conferir que `INFOSIMPLES_TOKEN` só existe quando o proxy deve estar ativo.

## 10. Banco de dados

- Schema versionado em `infra/migrations/0001–0018` + `supabase/migrations/…ai_rate_limits`. **Corrigido** o dim do embedding (768). **Faltam versionar:** índice vetorial (`hnsw`/`ivfflat`) em `entities.embedding`; `pg_cron` de limpeza; sources `ibge-localidades`/`orgaos-publicos`. FKs sem índice: `user_module_access.module_id` (advisor performance) — `entitlements`/`user_module_access`/`usage_events` parecem **legadas** (0 linhas; gating real é por plano).

## 11. Frontend

- Build de produção (typecheck + Vite + SSG/prerender) **passa limpo** ✅. Auditoria dedicada: **nenhum P0**, nenhum botão morto, nenhuma página inalcançável, alt em imagens, demo-mode bem isolado. Itens P2: alvos de toque pequenos e polimento — em §12 e §17. Roteamento é History API nativa (TanStack Router está no roadmap).

## 12. Mobile

- Mobile-first respeitado no geral. Achados concretos: `ContextChat.tsx:273-274` botão 32×32 (< 44px WCAG) → subir para ≥44px; tabelas em `page.tsx:1414/1591` com `minWidth:560` já têm `overflowX:auto` (rolam — aceitável, mas considerar esconder colunas no mobile). Banner "modo demonstração" só aparece sem Supabase — garantir Build Env em produção.

## 13. Testes realizados

| Verificação | Resultado |
|---|---|
| `pnpm install` (monorepo) | ✅ exit 0 |
| `pnpm --filter @fonteia/web build` (typecheck + Vite + prerender) | ✅ exit 0 |
| `pnpm --filter @fonteia/web test` (Vitest) | ✅ exit 0 |
| Migration 0018 aplicada em produção + verificada | ✅ `ingest_senado` com `search_path=public` |
| Estado de billing | ⚠️ 0 assinaturas — **fluxo de pagamento não comprovado de ponta a ponta** |

Não executados (exigem ambiente vivo/credenciais): transação Stripe real em test mode; smoke E2E de login→dashboard→checkout no domínio de produção.

## 14. O que ainda falta

- **P0:** consolidar o webhook (1 fonte versionada) + **transação de teste**; ligar o Customer Portal; plano de correlação por `user_id`.
- **P1:** apagar/quarentenar a arquitetura legada; alinhar `config.toml`; versionar índice vetorial + `pg_cron` + sources faltantes.
- **P2:** ligar proteção de senha vazada; rotacionar token CF do histórico; polimento mobile; hardening anti-prompt-injection.

## 15. Checklist para PRODUÇÃO

- [ ] Cloudflare Pages → Build Env tem `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` (sem isso = modo demo p/ cliente)
- [ ] Stripe Dashboard → Webhooks aponta para a Edge Function `stripe-webhook` e o secret bate com `STRIPE_WEBHOOK_SECRET`
- [ ] **Transação de teste** (test mode, cartão 4242…) gera linha em `subscriptions` e `my_plan()` retorna `pro`
- [ ] `STRIPE_CUSTOMER_PORTAL_URL` preenchido (cancelamento self-serve)
- [ ] Webhook consolidado e **versionado no git** (sem código-fantasma)
- [ ] Edge Secrets presentes: `SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, crons
- [ ] Leaked password protection ligada (Auth → Settings)
- [ ] Token CF `cfut_…` do histórico revogado/rotacionado
- [ ] `config.toml` reflete o `verify_jwt` real das funções deployadas
- [ ] Smoke no celular: login, dashboard, checkout, logout sem tela quebrada

## 16. Checklist para VENDER

- [ ] Caminho do dinheiro **provado** (pagou → liberou → dá pra cancelar)
- [ ] Página de planos honesta e clara (✅ já está — 7 dias grátis, sem promessa de lucro)
- [ ] Recibo/confirmação por e-mail após pagamento (verificar se o Stripe envia)
- [ ] Suporte visível (`contato@olli.com.br` ✅) + política de reembolso/cancelamento
- [ ] Onboarding leva o usuário do cadastro ao primeiro "momento aha" (Raio-X de um lote)
- [ ] Termos, Privacidade e Cookies acessíveis (LGPD) ✅ presentes
- [ ] Pelo menos 1 caso de uso vendável redondo (módulo Leilões) — ✅ é o carro-chefe

## 17. Próximos passos recomendados (ordem)

1. **Provar o billing:** transação de teste ponta a ponta (test mode) e confirmar `subscriptions` + `my_plan()`.
2. **Consolidar o webhook** numa Edge Function versionada (lógica de `services/stripe-webhook/src/worker.ts`); apagar órfãs.
3. **Ligar o Customer Portal** (`STRIPE_CUSTOMER_PORTAL_URL`).
4. **Conferir o Build Env** do Cloudflare Pages (evita modo demo em produção).
5. **Ligar leaked-password protection** e **rotacionar** o token CF do histórico.
6. **Correlação por `user_id`** no webhook (além do e-mail).
7. **Versionar** índice vetorial + `pg_cron` + sources faltantes (migration 0019).
8. **Quarentenar/apagar** `apps/api` + `services/*` legados; unificar o modelo de planos numa fonte só.
9. **Alinhar `config.toml`** ao deploy real.
10. **Polir mobile** (alvos de toque) e endurecer anti-prompt-injection na `fonteia`.
