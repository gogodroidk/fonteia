# ADR 0006 — Ingestão do cadastro de CNPJ (`company` + QSA/sócios) direto no Cloudflare D1

**Data:** 2026-06-20
**Status:** Aceita
**Autores:** Igor/Olli (data-ingestion-engineer)

---

## Contexto

O Cérebro e o Dossiê leem entidades do **Cloudflare D1** (servido pela Edge Function
`d1-bridge /query`). O kind `company` — cadastro de CNPJ (razão social, nome fantasia,
situação, CNAE, capital e, principalmente, o **QSA / sócios**) — estava **VAZIO no D1
(0 linhas)**. Resultado: o Cérebro e o Dossiê nunca mostravam sócios, mesmo tendo o
caminho de código pronto para `company`/QSA (ver `cerebro-api.ts`, casos `company` e
`personLeaf` que deriva sócios de `attributes.qsa`).

A causa raiz: a Edge Function `ingest-brasilapi` só gravava no **Postgres** (via RPC
`ingest_brasilapi_cnpj`, migration 0013). Os dados `company` só chegariam ao D1 se
alguém rodasse o `d1-bridge /migrate` (varredura completa Postgres→D1) — o que não
acontece no fluxo on-demand. Não havia caminho que escrevesse `company` direto no D1.

### Limitação ESTRUTURAL da fonte (importante)

A **BrasilAPI** de CNPJ é **por-CNPJ**: `GET /api/cnpj/v1/{cnpj}` retorna UM CNPJ por
request. **Não existe dump/bulk** de "todos os CNPJs do Brasil" por ela. Logo, é
**impossível** popular `company` para todas as empresas do país por essa via. O cadastro
`company` cresce de duas formas, ambas bounded:

1. **Lazy / on-demand:** quando um CNPJ é consultado e ainda não há `company` no D1.
2. **Backfill bounded:** dos CNPJs que mais aparecem no D1 (top fornecedores por
   nº de contratos) + sementes conhecidas. Limitado para respeitar o rate limit.

Um dump completo só viria de uma fonte diferente (ex.: os arquivos abertos da Receita
Federal — dezenas de GB, ZIPs mensais), que é outro pipeline (`ingest-receita-*`) e está
fora do escopo desta mudança.

---

## Decisão

`ingest-brasilapi` passa a **persistir em DOIS destinos**, ambos idempotentes:

- **Destino A — Cloudflare D1** (`kind='company'`): o que o Cérebro/Dossiê leem.
  Escrito via novo módulo `supabase/functions/_shared/d1.ts` (cliente REST do D1
  reaproveitando o padrão do `d1-bridge`, sem tocar no `d1-bridge`). Mapeamento espelha
  EXATAMENTE a RPC do Postgres:
  - `id` = CNPJ (14 dígitos) · `cnpj` = idem · `kind` = `company`
  - `name` = razão social · `normalized_name` = `lower(razao+fantasia+municipio+uf)`
  - `external_ids` = `{ cnpj }` · `source_ids` = `['brasilapi']`
  - `attributes` = item normalizado completo, **incluindo `qsa[]`** com
    `{ nomeSocio, qualificacao, dataEntrada, nomeRepresentante, ... }` — o shape exato
    que `cerebro-api.ts` consome.
  - Idempotência: `INSERT OR REPLACE` por `id` (rodar 2x não duplica).
- **Destino B — Supabase Postgres** (RPC `ingest_brasilapi_cnpj`): inalterado. Mantém a
  **rastreabilidade** (`source_runs` + `raw_records` + `evidence`: link + data + hash).

`sourceUrl` rastreável: `https://brasilapi.com.br/api/cnpj/v1/{cnpj}` (derivado pelo
front a partir de `cnpj`/`kind`, e gravado na `evidence` do Postgres).

### Cache-first (lazy)

Antes de consultar a BrasilAPI, a função lê o D1 e **pula** os CNPJs que já existem como
`company` (a menos de `?force=true`). Assim, chamar `?cnpjs=X` é no-op se X já existe — é
o comportamento de enriquecimento lazy. Os já-presentes voltam em `skipped[]`.

### Backfill bounded de demonstração

`?backfill=top&max=N` (admin): pega os top-N CNPJs por nº de contratos no D1
(`kind='public_contract'`, excluindo o placeholder `00000000000000`) + a semente
**Banco do Brasil `00000000000191`**, e enriquece o cadastro deles. `N` é limitado a
`MAX_CNPJS = 50` por invocação.

### Rate limit / honestidade

- Coleta **serial**, 1 request por CNPJ, com `RATE_MS = 800ms` entre eles.
- `429` → pausa extra de 2s + 1 retentativa (via `fetchWithRetry`).
- `404` → grava `situacao_cadastral = "NAO_ENCONTRADO"` (cache negativo: não rebusca).
- Se a BrasilAPI não retornar QSA, grava o que veio e segue (**não inventa dado**).
- Se faltarem `CF_API_TOKEN`/`CF_ACCOUNT_ID` no Vault: a escrita no D1 é pulada, a
  resposta traz `d1Indisponivel: { missing: [...] }` e `ok=false` se o D1 falhou de
  fato — nunca um 200 escondendo erro.

---

## Por que NÃO há migration Postgres nova

- O schema/RPC do Postgres já estão corretos (migration 0013 + índice parcial único
  `idx_entities_company_cnpj_unique`). Nada muda lá.
- O schema do D1 (`entities`) é garantido em **runtime** por `ensureD1EntitiesSchema`
  (`CREATE TABLE/INDEX IF NOT EXISTS`), espelhando o que o `d1-bridge` já cria. O D1 não
  usa as migrations versionadas de `infra/migrations/` (essas são Postgres). Portanto,
  **nenhuma migration nova** é necessária e nada precisa ser aplicado via MCP.

---

## Como operar (runbook)

Pré-requisito: `CF_API_TOKEN` e `CF_ACCOUNT_ID` no Vault do Supabase (já usados pelo
`d1-bridge`). Se `INGEST_CRON_SECRET` estiver definido (recomendado), o `Authorization:
Bearer <segredo>` é obrigatório — e o **backfill exige** esse segredo.

Backfill de demonstração (≤ 50 CNPJs: Banco do Brasil + top fornecedores):

```bash
curl -X POST \
  -H "apikey: <publishable_key>" \
  -H "Authorization: Bearer <INGEST_CRON_SECRET>" \
  "https://<ref>.supabase.co/functions/v1/ingest-brasilapi?backfill=top&max=50"
```

Enriquecer CNPJs específicos (lazy/cache-first — pula os que já existem):

```bash
curl -X POST -H "apikey: <publishable_key>" -H "Authorization: Bearer <segredo>" \
  "https://<ref>.supabase.co/functions/v1/ingest-brasilapi?cnpjs=00000000000191,57646374000104"
```

Forçar re-busca mesmo se já existir no D1: acrescente `&force=true`.

Resposta (exemplo): `{ ok, backfill, solicitados, skipped, coletados, d1Written,
ingested, errors }`.

---

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| BrasilAPI rate-limit (gratuita, sem SLA) | Serial + 800ms entre requests; backoff em 429; teto de 50/invocação; cache-first evita rebusca |
| BrasilAPI sem QSA para alguns CNPJs | Grava o que veio (`qsa: []`); não inventa sócios; rastreável pela evidência |
| `company` no D1 e no Postgres divergirem | O mapeamento D1 espelha a RPC do Postgres campo a campo; ambos idempotentes por CNPJ |
| Segredos do D1 ausentes | Degradação honesta: grava só no Postgres, sinaliza `d1Indisponivel`, `ok=false` se o D1 falhar |
| "Todos os CNPJs do Brasil" | **Impossível** pela BrasilAPI (por-CNPJ). Crescimento lazy + backfill bounded; dump completo seria outro pipeline (arquivos da Receita) |

---

## Próximos passos (fora deste PR)

- Wire do front (Cérebro/Dossiê) para disparar o enriquecimento lazy ao abrir um CNPJ
  sem `company` (escopo de `cerebro-api.ts` / PR #94 — não tocado aqui).
- Avaliar um `ingest-receita-cnpj` que consuma os arquivos abertos da Receita Federal
  para um cadastro `company` em massa (independe da BrasilAPI).
