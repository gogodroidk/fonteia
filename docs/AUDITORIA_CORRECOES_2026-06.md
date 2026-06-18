# Auditoria completa + correções — Fonte.ia (junho/2026)

Auditoria de **100% do código** (~67,5k linhas) por agentes paralelos, seguida da correção
dos achados. Estado final **verificado e verde**: `typecheck` (11 pacotes), **85 testes**,
`build`/SSG e `deno check` (todas as edge functions).

> ⚠️ **Há ações manuais que SÓ você pode executar** (revogar credencial, setar secrets,
> deployar migrations/config). Veja a seção **"Ações manuais obrigatórias"** no fim.

---

## 1. Segurança (corrigido no código)

| # | Problema | Correção |
|---|---|---|
| 1 | **Cloudflare API token real commitado** (`scripts/deploy.ps1`) | Removido; script lê de env. **Token precisa ser REVOGADO** (já está no histórico git). |
| 2 | JWT anon + URL hardcoded (`scripts/backfill_embeddings.sh`) | Removidos; lê de `SUPABASE_ANON_KEY`/`SUPABASE_FUNCTIONS_URL`; `set -uo pipefail`. |
| 3 | **PII pública**: `d1-bridge /query` expunha `cpf_hash` de ~169k entidades (D1 sem RLS) | `cpf_hash`/PII removidos do SELECT, do schema espelhado, do `COLUMNS`/`rowToParams`. |
| 4 | Edge functions aceitavam **qualquer** `apikey` não-vazio | `fonteia`/`empresas-cnpj`/`edital-pdf`/`lote-detalhe` exigem `apikey` válida (constant-time). |
| 5 | Postura de `verify_jwt` não versionada (sem `config.toml`) | Criado `supabase/config.toml` com `verify_jwt` por função (deploy-as-code). |
| 6 | SSRF/path-traversal via `edle`/refs nas URLs do SLE | Validação `/^\d+$/` em cada componente antes de interpolar. |
| 7 | `services/api /d1/*` sem auth/rate-limit, CORS `*`, com PII | Gate de apikey + CORS allowlist + rate limit; `cpf_hash` removido. |
| 8 | `apps/api` sem autenticação; entitlements auto-declaráveis por query | Auth bearer (env `API_TOKEN`), CORS allowlist, uso do cliente marcado não-autoritativo. |
| 9 | Chave de rate-limit (`fonteia`) baseada em JWT não-verificado (envenenável) | Derivada de usuário verificado (`getVerifiedUserId`), senão `ip:`. |
| 10 | Vazamento de erro interno (`detail: String(error)`) em rotas públicas | Mensagem genérica + `console.error` server-side. |
| 11 | Key publishable hardcoded no bundle web + env nunca lida (bracket-notation) | `import.meta.env` estático; sem env → modo demo (sem segredo no bundle). |

## 2. Billing / dinheiro (corrigido)

- **`@fonteia/billing` falava outro "idioma" de planos** (`individual/pro/business/enterprise`,
  `pro`=R$597) vs. produção (`free/pro/corporativo`, `pro`=R$197). Unificado ao **canônico**
  `free | pro | corporativo` (pro=R$197, corporativo=R$597), alinhado a Stripe/`my_plan`/web.
- **Webhook do Stripe não rebaixa mais plano ativo** em `checkout.session.completed` nem
  `invoice.payment_failed`; escrita não-regressiva; **503 em falha transitória** (Stripe re-tenta);
  `event.id` pronto para dedup quando houver storage.
- Cupom `TESTE1` ganhou `max_redemptions`/`expires_at` (migration 0008).

## 3. Robustez / correção (corrigido)

- **Timeout + retry/backoff em TODOS os `fetch`** (conectores `packages/sources` e edge functions).
- IBAMA: guarda ZIP64, regex de ano ancorada, datas em BRT, zero monetário explícito.
- `packages/ai`: trata `stop_reason:"refusal"` e `finishReason`; **denylist** de thinking
  (modelos novos recebem por padrão); IDs Gemini atualizados para `gemini-2.5-*`; provider
  correto no fallback.
- SQL: RLS policies para `entitlements/usage_events/alerts/alert_events/dossiers` (0007);
  SHA-256 em vez de MD5 e `collected_at` preservado em re-ingestão (0009).
- Service Worker não cacheia respostas autenticadas/de API.
- Validação de borda (`Array.isArray`) em respostas de APIs externas; dedup de
  `parseDate`/headers/`sanitizeCnpj`; a11y (`role=switch`→`button`); navegação SPA sem reload;
  guards de SSR.

## 4. Verificação

```
typecheck : 11 pacotes — OK
test      : 85 testes — OK (eram 71; +cobertura de recusa/thinking/fallback e auth/paginação/billing)
build     : web + SSG — OK
deno check: _shared + todas as functions — OK
segredos  : token CF / JWT anon / publishable — ausentes do tree e do bundle
```

---

## 5. ⚠️ Ações manuais obrigatórias (só você pode fazer)

1. **REVOGAR AGORA** o token Cloudflare `cfut_Plh…` (Dashboard → API Tokens → Delete) e gerar novo.
   Ele está no histórico git — remover do código **não** basta.
2. **Setar variáveis de ambiente** (build/deploy), pois os fallbacks hardcoded foram removidos:
   - Build web (Cloudflare Pages): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.
   - Deploy script: `CLOUDFLARE_API_TOKEN` (novo).
   - `services/api` (Worker): `SUPABASE_PUBLISHABLE_KEY` (mesmo valor publishable do front) — senão `/d1/*` responde 401.
   - `apps/api`: `API_TOKEN`, `ALLOWED_ORIGINS`, e `DATABASE_CA` (TLS agora verifica certificado).
   - Edge functions: `DATAJUD_API_KEY` (secret), e opcionalmente `INGEST_CRON_SECRET` / `ALERTS_CRON_SECRET` (ativam o gate de cron).
3. **Aplicar as migrations** novas no Supabase: `0007_rls_policies`, `0008_coupon_limits`, `0009_evidence_integrity`.
   Garantir que o código de aplicação sempre popule `created_by`/`account_id` = `auth.uid()::text` (necessário para as policies).
4. **Deploy do `supabase/config.toml`** (aplica `verify_jwt` por função) e **redeploy das edge functions** alteradas.
5. **Purga única de PII no D1**: linhas já gravadas com `cpf_hash` não são limpas por re-`/migrate` (a coluna apenas deixou de ser escrita) — drop/recreate da tabela `entities` no D1 se quiser zerar o histórico.
6. **Follow-up recomendado** (fora do escopo desta rodada, exige mudança de schema): vincular
   `subscriptions` por `user_id` (em vez de e-mail) no `stripe-portal` e no webhook.
