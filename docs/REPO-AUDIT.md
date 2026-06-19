# Auditoria do Repositório — Fonte.ia

**Gerado em:** 2026-06-19  
**Baseado em:** código do repositório + docs/HARDENING.md + docs/AUDITORIA_CORRECOES_2026-06.md  
**Projeto Supabase:** `pwiuiihsyazghdsrpshg` (org OLLI)  

---

## 1. Stack detectada

| Camada | Tecnologia | Versão |
|---|---|---|
| Monorepo | pnpm + Turborepo | pnpm 9.15.4, turbo ^2.3.3 |
| Frontend | React 19 + Vite 7 | react ^19.2.7, vite ^7.2.7 |
| Linguagem | TypeScript | ^5.7.3 |
| Deploy frontend | Cloudflare Pages + Worker `fonteia` | wrangler 4.99.0 |
| Banco principal | Supabase Postgres + pgvector + Auth | @supabase/supabase-js ^2.49.4 |
| Banco bulk | Cloudflare D1 (`fonteia-data`) | ID: 417caa83-86dc-463e-8682-656cf938cd24 |
| Edge Functions | Supabase Deno | 20+ funções |
| IA / embeddings | Gemini `text-embedding-004` (768d) + Gemini Flash (respostas) | gemini-2.5-flash |
| Billing | Stripe | @stripe/stripe-js via Worker |
| Storage | Cloudflare R2 + KV (disponíveis, uso a definir) | — |
| PWA | vite-plugin-pwa | ^1.3.0 |
| Testes | Vitest | ^2.1.8 — 85 testes passando |
| Design system | CSS próprio (`styles.css` + tokens) | Sem shadcn/ui, sem Radix |
| Roteamento | History API nativa (SPA) | TanStack Router planejado |

---

## 2. Estrutura de pastas

```
fonteia/
├── apps/
│   ├── web/          ← SPA React+Vite (único app deployado)
│   │   └── src/
│   │       ├── features/
│   │       │   ├── leiloes/      ← módulo ativo (auction_lot)
│   │       │   ├── cerebro/      ← grafo de conhecimento (canvas próprio)
│   │       │   ├── ambiental/    ← IBAMA
│   │       │   ├── billing/      ← Stripe checkout/portal
│   │       │   ├── empresas/     ← CNPJ
│   │       │   ├── inpi/         ← marcas INPI
│   │       │   ├── juridico/     ← CNJ/proposições
│   │       │   ├── licitacoes/   ← PNCP contratos
│   │       │   ├── municipios/   ← IBGE
│   │       │   ├── politica/     ← Câmara/Senado
│   │       │   └── raio-x/       ← análise de risco com IA
│   │       ├── app/              ← layout, routing, auth context
│   │       ├── components/       ← componentes compartilhados
│   │       └── lib/              ← supabase-client, hooks utilitários
│   ├── api/          ← serviço auxiliar (autenticado por API_TOKEN)
│   └── mobile/       ← (estrutura inicial)
├── packages/
│   ├── ai/           ← answer-engine, tipos de IA, guardrails
│   ├── billing/      ← lógica de planos (free/pro/corporativo)
│   ├── cerebro/      ← motor de grafo (force-simulation pura)
│   ├── compliance/   ← LGPD helpers
│   ├── config/       ← configurações compartilhadas
│   ├── domain/       ← tipos de domínio (Entity, Evidence, etc.)
│   ├── scoring/      ← scoring de lotes/entidades
│   ├── sources/      ← conectores de fontes de dados
│   └── ui/           ← componentes de UI compartilhados
├── supabase/
│   ├── functions/    ← 20+ Edge Functions Deno
│   │   ├── _shared/  ← auth.ts, cors.ts, http.ts (helpers compartilhados)
│   │   ├── fonteia/  ← Raio-X + chat + busca (usa Gemini)
│   │   ├── d1-bridge/           ← ponte Postgres → D1
│   │   ├── infosimples-proxy/   ← proxy API paga (dormente)
│   │   ├── ingest-*/            ← 15+ ingestores de fontes públicas
│   │   ├── embed-entities/      ← geração de embeddings
│   │   ├── send-alerts/         ← alertas de usuário
│   │   └── stripe-portal/       ← portal Stripe self-service
│   ├── migrations/   ← apenas migration de ai_rate_limits (as demais estão em infra/)
│   └── config.toml   ← verify_jwt por função
├── infra/
│   └── migrations/   ← 0001–0014 + 0099 (schema completo)
├── services/
│   ├── api/          ← Worker Cloudflare com /d1/* proxy
│   └── stripe-webhook/ ← Worker Cloudflare para eventos Stripe
├── scripts/          ← deploy, backfill, geração de docs
├── wrangler.jsonc    ← config do Worker `fonteia` (SPA gateway)
├── turbo.json        ← pipeline Turborepo
└── pnpm-workspace.yaml
```

---

## 3. Estado dos módulos

| Módulo | Feature dir | Edge Function | Dados reais | Status |
|---|---|---|---|---|
| Leilões judiciais | `features/leiloes/` | `fonteia`, `edital-pdf`, `lote-detalhe`, `ingest-receita-catalog` | ~5 lotes (Receita/SLE) | **Ativo — módulo vendável** |
| Licitações (PNCP) | `features/licitacoes/` | `ingest-pncp`, `ingest-pncp-contratos` | Contratações PNCP | Ingerindo |
| Empresas (CNPJ) | `features/empresas/` | `empresas-cnpj`, `ingest-brasilapi` | CNPJ.ws + BrasilAPI | Parcial |
| Ambiental | `features/ambiental/` | `ingest-ambiental` | IBAMA | Ingerindo |
| Política | `features/politica/` | `ingest-politica`, `ingest-senado`, `ingest-camara-despesas`, `ingest-camara-votacoes` | Câmara + Senado | Ingerindo |
| Municípios | `features/municipios/` | `ingest-municipios` | IBGE | Ingerindo |
| Jurídico | `features/juridico/` | `ingest-cnj`, `ingest-juridico` | CNJ/DataJud + Câmara | Ingerindo |
| INPI/Marcas | `features/inpi/` | `ingest-inpi`, `infosimples-proxy` | 29,5k marcas (RPI grátis) | Ativo; InfoSimples dormente |
| Raio-X / IA | `features/raio-x/` | `fonteia` (Gemini Flash) | depende do módulo | Funcional com Gemini |
| Cérebro (grafo) | `features/cerebro/` | `d1-bridge` (leitura) | `entity_links` vazia | UI pronta; vínculos a popular |

---

## 4. Estado do banco Supabase

### Migrations aplicadas em produção (esperado)

| Migration | Conteúdo |
|---|---|
| 0001_core_schema | Schema base: `entities`, `evidence`, `raw_records`, `sources`, `profiles`. ATENÇÃO: `entities.embedding` declarada como `vector(1536)` mas banco real está em `vector(768)` |
| 0002_stripe_subscriptions | Tabelas `subscriptions`, `plans` |
| 0003_secure_ingest_receita_lots | Função `ingest_receita_lots` |
| 0004_ingest_receita_catalog | Função `ingest_receita_catalog` |
| 0005_coupons | Tabela `coupons`, `coupon_redemptions` |
| 0006_user_alerts | Tabela `user_alerts`, `alert_events` |
| 0007_rls_policies | RLS em `entitlements`, `usage_events`, `alerts`, `dossiers` |
| 0008_coupon_limits | `max_redemptions`, `expires_at` em coupons |
| 0009_evidence_integrity | SHA-256 em vez de MD5; `collected_at` preservado em re-ingestão |
| 0010_ingest_inpi | Ingestor INPI |
| 0011_external_lookups | Tabela `external_lookups` (cache InfoSimples) |
| 0012_ingest_camara_despesas | Ingestor despesas de deputados |
| 0013_ingest_brasilapi_cnpj | Ingestor BrasilAPI CNPJ |
| 0014_ingest_camara_votacoes | Ingestor votações Câmara |
| 0099_baseline_existing_rpcs | 30 objetos: RPCs, triggers, event trigger (baseline de produção) |

**Migration em supabase/migrations/ (separada):**
- `20260614233000_ai_rate_limits.sql` — tabela `ai_rate_limits` e funções de controle

### Divergência conhecida

`entities.embedding`: migration 0001 diz `VECTOR(1536)`, banco de produção está em `VECTOR(768)`. Código e banco alinhados em 768. A migration precisa ser corrigida antes de qualquer recriação de banco. Ver HARDENING.md seção 3.

### Pendências de banco

- Índice de vetor (`hnsw` ou `ivfflat`) em `entities.embedding` não está em nenhuma migration.
- Sources `ibge-localidades` e `orgaos-publicos` não existem em `sources` da 0001.
- `pg_cron` para `prune_ai_rate_limits()` não configurado.
- Tabelas `entity_links`, `events`, `reports`, `exports`, `ai_conversations` ainda vazias ou inexistentes.

---

## 5. Estado do Stripe

- Planos canônicos: `free | pro (R$ 197/mês) | corporativo (R$ 597/mês)`.
- Webhook ativo em `services/stripe-webhook` (Worker Cloudflare).
- Cupom `TESTE1` com `max_redemptions` e `expires_at` (migration 0008).
- Pedência: `subscriptions` vinculadas por e-mail (não `user_id`) — risco de dessincronização se usuário mudar e-mail.

---

## 6. Estado do Cloudflare

- Worker `fonteia`: gateway SPA (assets `apps/web/dist`).
- Worker `services/api`: proxy `/d1/*` com gate de `apikey` e CORS allowlist.
- Worker `services/stripe-webhook`: recebe eventos Stripe.
- D1 banco `fonteia-data`: ~200k entidades bulk; `cpf_hash` removido da escrita (auditoria jun/2026); registros históricos com PII precisam de drop/recreate manual se zero-PII for requisito.
- R2 e KV: disponíveis mas sem uso definido no código atual.

---

## 7. Riscos conhecidos e priorizados

| # | Risco | Severidade | Ação |
|---|---|---|---|
| 1 | **Token CF `cfut_Plh…` no histórico git** | CRÍTICA | Revogar no Dashboard Cloudflare → gerar novo → setar no CI. IMEDIATO. |
| 2 | `entities.embedding` declarada como `vector(1536)` na migration 0001 | Alta | Corrigir migration 0001 antes de qualquer recriação de banco |
| 3 | Índice de vetor em `entities.embedding` não versionado | Alta | Criar migration 0015+ com `CREATE INDEX USING hnsw` |
| 4 | `subscriptions` por e-mail (não `user_id`) | Média | Refatorar webhook + stripe-portal para usar `user_id` |
| 5 | Sources `ibge-localidades`/`orgaos-publicos` ausentes na tabela `sources` da 0001 | Média | Adicionar em migration complementar (ingestores falham em banco zerado) |
| 6 | `pg_cron` para `prune_ai_rate_limits()` não configurado | Média | Adicionar job em migration 0016+ ou como step manual de DR |
| 7 | PII (`cpf_hash`) em registros históricos do D1 | Média | Drop/recreate da tabela `entities` no D1 se zero-PII for requisito |
| 8 | `entity_links` vazia — Cérebro sem vínculos reais | Baixa/produto | Popular via pipeline de cruzamento CNPJ/IBGE |
| 9 | `apps/api` com `DATABASE_CA` para TLS verificado — requer variável de env | Baixa | Setar `DATABASE_CA`, `API_TOKEN`, `ALLOWED_ORIGINS` no Worker |

---

## 8. Próximas ações priorizadas

**P0 — Segurança (imediato):**
1. Revogar token CF `cfut_Plh…` e regenerar.
2. Confirmar que `INFOSIMPLES_TOKEN` NÃO está setado (manter proxy dormente).
3. Verificar que todas as Build Env do Cloudflare Pages estão corretas (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`).

**P1 — Banco (antes da próxima sessão de ingestão):**
4. Corrigir `VECTOR(1536)` → `VECTOR(768)` na migration 0001.
5. Criar migration com índice HNSW em `entities.embedding`.
6. Adicionar sources `ibge-localidades` e `orgaos-publicos` à migration de sources.

**P2 — Produto (próximas 2 semanas):**
7. Popular `entity_links` com vínculos CNPJ/IBGE para ativar o Cérebro.
8. Criar tabelas `events` e `reports` (roadmap cérebro-governamental.md).
9. Migrar `subscriptions` de e-mail para `user_id`.
10. Configurar `pg_cron` para `prune_ai_rate_limits()`.

**P3 — Frontend (Onda 2 do roadmap):**
11. Migrar roteamento para TanStack Router.
12. Adicionar TanStack Query para cache de dados autenticados.
13. Cloudflare Turnstile no login (anti-bot).
