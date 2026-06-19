# ADR 0002 — Split de dados: Cloudflare D1 (bulk) × Supabase Postgres (leilões + pgvector)

**Data:** 2026-06  
**Status:** Aceita  
**Autores:** Igor/Olli  

---

## Contexto

O Fonte.ia ingere dados de múltiplas fontes oficiais brasileiras. O volume e o perfil de acesso são heterogêneos:

- **Leilões judiciais (auction_lot):** primeiro módulo vendável, lidos frequentemente pelo SPA, precisam de pgvector para busca semântica e de RLS para multi-tenancy. Volume moderado (~5 lotes reais no momento, escalará para dezenas de milhares).
- **Dados bulk (~200k entidades):** contratos PNCP, municípios IBGE, políticos Câmara/Senado, infrações IBAMA, sanções CEIS/CNEP, empresas (receita), jurídico (CNJ/proposições), marcas INPI. Leitura intensiva, sem RLS por linha, sem necessidade de pgvector por entidade — só consulta e JOIN.

Manter tudo no Supabase Postgres iria: (a) explodir o plano Pro por número de linhas/storage; (b) impor latência de round-trip Supabase→cliente para consultas que não precisam de auth por linha; (c) misturar dados transacionais com dados de referência.

---

## Decisão

**Cloudflare D1** guarda o bulk (~200k entidades): contratos/PNCP, municípios/IBGE, políticos Câmara/Senado, ambiental/IBAMA, sanções CEIS/CNEP, empresas, jurídico, marcas/INPI.

**Supabase Postgres** guarda exclusivamente: tabela `entities` (com `kind=auction_lot` e embedding pgvector 768d), `evidence`, `raw_records`, e todas as tabelas de usuário/billing (`profiles`, `subscriptions`, `user_alerts`, `coupon_redemptions`, etc.).

A ponte entre os dois sistemas é a **Edge Function `d1-bridge`** (Supabase Deno), que:
1. Lê o Postgres em lotes com keyset pagination (sem embedding nem geometria).
2. Grava no D1 via Cloudflare REST API (autenticada com `CF_API_TOKEN` do Vault).
3. Expõe `/query` e `/stats` como API de leitura para o SPA (somente leitura, autenticada por `apikey`).
4. Rota `/migrate` é admin-only (`Authorization: Bearer <service_role_key>`).

**Embeddings:** coluna `entities.embedding vector(768)` no Postgres. Modelo: Gemini `text-embedding-004` (768 dimensões). Funções RPC: `match_entities(query_embedding, match_kind, match_count)`, `similar_entities(entity_id, count)`, `similar_entities_by_external(kind, external_key, external_id, count)` — todas usam distância cosseno (`<=>`). 

> **Atenção:** a migration `0001_core_schema.sql` declara `VECTOR(1536)` (legado OpenAI ada-002), mas o banco de produção foi alterado para `VECTOR(768)`. O código e o banco estão alinhados. A migration precisa ser corrigida antes de recriar o banco do zero (ver HARDENING.md, seção 3).

---

## Alternativas consideradas

| Alternativa | Por que foi descartada |
|---|---|
| Tudo no Supabase Postgres | Volume de dados bulk ultrapassa limites práticos do plano Pro; custo de storage e egress; latência maior para consultas simples de referência |
| Tudo no D1 | D1 não tem pgvector, não tem RLS, não tem triggers — inviável para leilões + auth + billing |
| ElasticSearch / Typesense | Custo adicional; complexidade de infra; pgvector é suficiente para o volume atual |
| Supabase + particionamento | Não resolve a separação de perfil de acesso (dados de referência vs transacional) |
| Redis/KV para cache do bulk | KV é para pares chave-valor simples; D1 permite SQL com JOIN, que é necessário para cruzar CNPJ, IBGE, etc. |

---

## Motivo da escolha

1. **D1 é serverless e cobrado por query** — sem custo fixo para dados que não mudam diariamente.
2. **d1-bridge como proxy controlado** — o SPA nunca fala diretamente com o D1; a edge function valida a `apikey` e impede acesso a colunas sensíveis (ex: `cpf_hash` foi removido do SELECT após auditoria de junho/2026).
3. **pgvector 768d no Supabase** é a escolha natural: já existe no plano Pro, sem infra extra, integrado com o mesmo Postgres que tem as linhas de leilão.
4. **Separação clara de responsabilidade:** D1 = dados públicos de referência (read-heavy, bulk); Postgres = dados transacionais + semânticos (auth, billing, embeddings).

---

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| migration 0001 com `VECTOR(1536)` em vez de `VECTOR(768)` | Documentado em HARDENING.md; corrigir antes de qualquer recriação de banco |
| Índice de vetor não versionado em nenhuma migration | Pendente: criar migration 0015+ com `CREATE INDEX ... USING hnsw` em `entities.embedding`; busca semântica funciona sem índice mas em full scan |
| `cpf_hash` gravado em D1 antes da auditoria de junho/2026 | Requer drop/recreate da tabela `entities` no D1 para zerar o histórico; a escrita foi removida |
| Sources `ibge-localidades` e `orgaos-publicos` não existem na tabela `sources` da migration 0001 | Ingestores falhariam em banco zerado; adicionar em migration complementar |
| D1 sem RLS | A bridge valida apikey + restringe colunas no SELECT; dados do D1 são todos públicos por natureza |

---

## Próximos passos

- Corrigir `entities.embedding` na migration 0001 para `VECTOR(768)`.
- Criar migration para o índice HNSW em `entities.embedding` (preservar parâmetros do índice atual).
- Adicionar `ibge-localidades` e `orgaos-publicos` à tabela `sources` em migration complementar.
- Documentar o ID do banco D1 (`417caa83-86dc-463e-8682-656cf938cd24`) e o processo de recriação no DR checklist (HARDENING.md).
