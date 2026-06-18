# HARDENING.md — Fonte.ia / Olli
**DBA Sênior / Engenharia de Plataforma**
Gerado em: 2026-06-18 | Projeto Supabase: `pwiuiihsyazghdsrpshg`

---

## 1. Situação antes deste hardening

O banco tinha ~30 funções/triggers criados manualmente no SQL Editor do Supabase que não existiam em nenhuma migration. Uma queda de banco, um reset de projeto ou uma migração para nova região resultaria em perda total desses objetos — sem como recriar.

As migrations 0001–0011 cobriam estrutura de tabelas, billing, alertas, coupons e dois ingestores (receita_lots, receita_catalog). Todo o restante estava apenas em produção.

---

## 2. O que foi versionado em `0099_baseline_existing_rpcs.sql`

Total: **30 objetos** (funções + triggers + event trigger).

### Seção A — Utilitários / Auth (10 objetos)

| Objeto | Tipo | Observação |
|---|---|---|
| `get_vault_secret(p_name)` | função | `search_path=''` para acesso seguro ao vault schema |
| `is_admin(uid)` | função | Consulta `profiles.role` |
| `handle_new_user()` | trigger function | Popula `profiles` após signup |
| `on_auth_user_created` | trigger | `AFTER INSERT ON auth.users` |
| `rls_auto_enable()` | event trigger function | Ativa RLS em todo `CREATE TABLE public.*` |
| `ensure_rls` | event trigger | `ON ddl_command_end` |
| `admin_entities_by_kind()` | função | Admin-only; valida via `is_admin()` |
| `check_ai_rate_limit(ip, limit, window)` | função | Grava em `ai_rate_limits` |
| `prune_ai_rate_limits()` | função | Limpa entradas > 1h; chamada por cron |
| `external_lookup_spend_count(provider)` | função | Trava de gasto mensal InfoSimples |
| `external_lookup_user_day_count(provider, user)` | função | Trava diária por usuário |

### Seção B — Busca Semântica / IA (3 funções)

| Objeto | Observação |
|---|---|
| `match_entities(query_embedding, match_kind, match_count)` | Busca cosine via `<=>` em `entities.embedding` |
| `similar_entities(p_entity_id, p_count)` | Similar por entity UUID |
| `similar_entities_by_external(p_kind, p_external_key, p_external_id, p_count)` | Wrapper com lookup por external_id |

### Seção C — Negócio / Plano / Cupons / Alertas (6 funções)

| Objeto | Observação |
|---|---|
| `my_plan()` | Plano do usuário (subscriptions + coupon_redemptions) |
| `my_trial()` | Data de expiração do trial |
| `redeem_coupon(p_code)` | Aplica cupom com `FOR UPDATE` para evitar race |
| `create_alert(...)` | Cria/atualiza alerta em `user_alerts` |
| `delete_alert(p_lot_id)` | Remove alerta do usuário |
| `list_my_alerts()` | Lista alertas do usuário autenticado |

### Seção D — Ingestores de Dados Públicos (14 funções `ingest_*`)

Todas têm assinatura `(p_payload jsonb) RETURNS integer`, `SECURITY DEFINER`, `search_path='public'`. O payload sempre tem `{ collectedAt, items: [...] }`.

| Função | Source ID | Kind de entity gerado |
|---|---|---|
| `ingest_ambiental` | `ibama-dados-abertos` | `environmental_infraction` |
| `ingest_cnj` | `cnj-datajud` | `legal_process` |
| `ingest_juridico` | `camara-dados-abertos` | `legal_proposition` |
| `ingest_municipios` | `ibge-localidades` | `municipality` |
| `ingest_orgaos` | `orgaos-publicos` | `organization` |
| `ingest_pncp` | `pncp-contratacoes` | `bidding_opportunity` |
| `ingest_pncp_contratos` | `pncp-contratacoes` | `public_contract` |
| `ingest_politica` | `camara-dados-abertos` | `politician` |
| `ingest_receita_catalog` | `receita-leiloes-sle` | `auction_lot` (**já em 0004**) |
| `ingest_receita_lots` | `receita-leiloes-sle` | `auction_lot` (**já em 0003**) |
| `ingest_sancoes` | detectado em produção | sanção CEIS/CNEP |
| `ingest_senado` | `senado-dados-abertos` | `politician` / senador |
| `ingest_sp_contratos` | SP Capital | `public_contract` |
| `ingest_tce_sp` | TCE-SP | `audit_finding` |

> `ingest_receita_lots` e `ingest_receita_catalog` estão incluídas no 0099 via `CREATE OR REPLACE` para garantir que a versão atual de produção seja preservada, mesmo já tendo versões parciais em 0003/0004.

---

## 3. Divergência de dimensão: `entities.embedding`

### Achado crítico

| Local | Declaração | Valor real |
|---|---|---|
| Migration `0001_core_schema.sql` (linha 80) | `VECTOR(1536)` | Definido no SQL de criação |
| Banco de produção (`pg_attribute.atttypmod`) | `vector(768)` | **768 dimensões** |
| Código `match_entities`, `similar_entities` | `vector(768)` | Correto para produção |
| Modelo de embedding usado | Gemini `text-embedding-004` | Saída: 768 dim |

**Conclusão:** A migration 0001 diz `VECTOR(1536)` (dimensão do OpenAI ada-002, removido), mas o banco foi criado com — ou alterado para — `VECTOR(768)`. O código e o banco estão alinhados em 768. O problema é que se alguém rodar a migration 0001 do zero em um banco vazio, a coluna será criada com 1536, e o índice HNSW/IVFFlat (se existir) e as funções (que declaram `vector(768)`) falharão.

### Correção recomendada

**NÃO altere a coluna em produção** (pode haver dados de embedding). Em vez disso:

1. Corrija a migration 0001 (alterar `VECTOR(1536)` → `VECTOR(768)` na linha 80):
   ```sql
   -- Em 0001_core_schema.sql, substituir:
   embedding VECTOR(1536),
   -- Por:
   embedding VECTOR(768),
   ```

2. Verifique se existe índice de vetor na coluna. Se sim, documente o tipo (`hnsw` ou `ivfflat`) e os parâmetros para incluir no baseline.

3. Para verificar o índice atual:
   ```sql
   select indexname, indexdef
   from pg_indexes
   where tablename = 'entities' and indexdef ilike '%embedding%';
   ```

Este item foi deixado para o dono do repositório confirmar e aplicar a correção na migration 0001, pois afeta o contrato de recriação do banco.

---

## 4. Segredos por ambiente

### Mapa completo

| Variável | Ambiente dev | Produção — onde fica |
|---|---|---|
| `VITE_SUPABASE_URL` | `.env.local` | Cloudflare Pages → Build Env |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `.env.local` | Cloudflare Pages → Build Env |
| `VITE_API_URL` | `.env.local` | Cloudflare Pages → Build Env |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local` | Supabase Edge Secret / CF Worker Secret |
| `GEMINI_API_KEY` | `.env.local` | Supabase Edge Secret / CF Worker Secret |
| `ANTHROPIC_API_KEY` | `.env.local` | Supabase Edge Secret / CF Worker Secret |
| `STRIPE_SECRET_KEY` | `.env.local` | CF Worker Secret |
| `STRIPE_WEBHOOK_SECRET` | `.env.local` | CF Worker Secret |
| `INGEST_CRON_SECRET` | `.env.local` | CF Worker Secret |
| `ALERTS_CRON_SECRET` | `.env.local` | CF Worker Secret |
| `MIGRATE_SECRET` | `.env.local` | CF Worker Secret |
| `PORTAL_TRANSPARENCIA_TOKEN` | `.env.local` | Supabase Vault via `get_vault_secret('portal_transparencia_token')` |
| `DATAJUD_API_KEY` | `.env.local` | Supabase Vault via `get_vault_secret('datajud_api_key')` |
| `INFOSIMPLES_TOKEN` | `.env.local` | Supabase Vault via `get_vault_secret('infosimples_token')` |
| `CF_API_TOKEN` | nunca em .env | GitHub Actions Secret / CI |
| `CF_ACCOUNT_ID` | nunca em .env | GitHub Actions Secret / CI |

### Regra de ouro

- **Vault** → segredos lidos por RPCs/Edge Functions que precisam dos valores em tempo de execução SQL (tokens de APIs de dados públicos que variam por ambiente).
- **Edge Secrets** → segredos usados dentro de Edge Functions / Workers (chaves de API pagas, service_role).
- **Build Env** → variáveis que vão para o bundle do cliente (`VITE_*`). Só `SUPABASE_URL` e `PUBLISHABLE_KEY` pertencem aqui — nunca service_role ou chaves privadas.
- **CI Secrets** → credenciais de deploy (CF_API_TOKEN). Nunca no repo, nunca no Vault.

---

## 5. Checklist de DR (Disaster Recovery)

Passos para recriar o banco do zero a partir das migrations:

- [ ] Aplicar 0001–0011 em ordem (tabelas, billing, alertas, coupons, evidence integrity, external_lookups)
- [ ] **Corrigir `entities.embedding` na 0001** para `VECTOR(768)` antes de rodar em banco novo
- [ ] Aplicar 0099 (todas as RPCs, triggers, event trigger)
- [ ] Verificar e recriar índice de vetor em `entities.embedding` (não está em nenhuma migration ainda — veja seção 3)
- [ ] Recriar segredos no Vault: `portal_transparencia_token`, `datajud_api_key`, `infosimples_token`
- [ ] Configurar Edge Secrets no Supabase: `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `INGEST_CRON_SECRET`, `ALERTS_CRON_SECRET`
- [ ] Configurar CF Worker Secrets equivalentes
- [ ] Testar `select public.my_plan()` autenticado e `select public.match_entities('[...]'::vector)` com 768 dims
- [ ] Rodar `select public.admin_entities_by_kind()` com service_role para confirmar dados

---

## 6. Riscos remanescentes

1. **Índice de vetor não versionado.** Se existe um índice `hnsw` ou `ivfflat` em `entities.embedding`, ele não está em nenhuma migration. Uma recriação do banco ficaria sem o índice (busca semântica funciona, mas lenta — full scan). Verificar e adicionar em uma migration 0012+.

2. **Sources não padrão nos ingestores.** `ingest_municipios` usa `source_id = 'ibge-localidades'` e `ingest_orgaos` usa `source_id = 'orgaos-publicos'`, mas essas entradas não existem na tabela `sources` da migration 0001. Se o banco for recriado, os ingestores falharão por FK constraint. Adicionar essas sources ao INSERT da 0001 ou criar uma migration complementar.

3. **Migration 0001 vs. banco real (embedding dim).** Documentado na seção 3. Precisa de correção manual na migration antes de qualquer recriação.

4. **Sem pg_cron configurado.** `prune_ai_rate_limits()` precisa de um job `pg_cron`. Não está em nenhuma migration. Adicionar em 0012+ ou documentar como step manual de DR.

5. **Triggers de autenticação.** O trigger `on_auth_user_created` (auth schema) pode ser resetado por upgrades do Supabase Auth. A migration 0099 o recria, mas requer atenção em upgrades maiores de versão.
