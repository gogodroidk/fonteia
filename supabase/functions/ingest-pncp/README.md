# ingest-pncp — licitações/contratações do PNCP (Portal Nacional de Contratações Públicas)

2º módulo (Licitações). Espelha a `ingest-receita-catalog`: busca a fonte oficial,
normaliza e chama uma RPC em lotes. Fonte: API pública de **consulta** do PNCP, aberta
e anônima (sem auth, sem chave).

## Como funciona

Para cada **modalidade** (default: licitações com disputa — 2..7), varre todas as páginas
da janela de datas:

```
GET https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao
    ?dataInicial=AAAAMMDD&dataFinal=AAAAMMDD
    &codigoModalidadeContratacao={1..14}&pagina={n}&tamanhoPagina=50
```

→ normaliza cada contratação (id = `numeroControlePNCP`) → grava via a RPC
`public.ingest_pncp` em lotes de 200. **Idempotente**: o id é único/perene no PNCP,
então re-rodar a mesma janela faz upsert (não duplica).

### Parâmetros de query (todos opcionais)
- `?dias=N` — janela = [hoje − N, hoje] (default **3**)
- `?dataInicial=AAAAMMDD` / `?dataFinal=AAAAMMDD` — sobrepõem `?dias`
- `?modalidades=6,8` — CSV de códigos 1..14 (default **2,3,4,5,6,7**)
- `?uf=SP` — filtra por UF
- `?maxPaginas=N` — teto de páginas por modalidade (0 = todas; default 0)

### Tabela de modalidade (codigoModalidadeContratacao)
1 Leilão-Eletrônico · 2 Diálogo Competitivo · 3 Concurso · 4 Concorrência-Eletrônica ·
5 Concorrência-Presencial · 6 Pregão-Eletrônico · 7 Pregão-Presencial · 8 Dispensa ·
9 Inexigibilidade · 10 Manifestação de Interesse · 11 Pré-qualificação · 12 Credenciamento ·
13 Leilão-Presencial · 14 Inaplicabilidade.

## kind / armazenamento

Grava em `public.entities` com **`kind = 'bidding_opportunity'`** (ENTITY_KINDS), uma
linha por licitação, payload em `attributes`. O front lê via PostgREST
(`entities?kind=eq.bidding_opportunity`) filtrando `attributes->>sourceId = 'pncp-contratacoes'`.

## Contrato da RPC `ingest_pncp` (a CRIAR pelo orquestrador)

A função chama exatamente:

```ts
supabase.rpc("ingest_pncp", { p_payload: { collectedAt, items: batch } })
```

- **Nome:** `public.ingest_pncp`
- **Argumento:** `p_payload jsonb` — objeto `{ collectedAt: string (ISO), items: object[] }`
- **Retorno:** `integer` (nº de linhas inseridas/atualizadas; a function soma).
  Se não retornar número, o código assume `batch.length`.
- **Comportamento esperado:** para cada item em `p_payload->'items'`, fazer **upsert**
  em `public.entities` por `kind='bidding_opportunity'` + `attributes->>'id'` (=
  `numeroControlePNCP`), com `attributes = <item>`, `name = item->>'objeto'`,
  `updated_at = now()`. (Mesma forma da `ingest_receita_catalog`, trocando `lots`→`items`,
  `kind`→`bidding_opportunity` e a chave de upsert para `numeroControlePNCP`.)

### Forma EXATA de cada item em `items[]` (campos normalizados)

Obrigatórios sempre presentes:
`id` (= numeroControlePNCP), `sourceId` ("pncp-contratacoes"), `numeroControlePNCP`,
`objeto`, `orgao`, `modalidade`, `valorEstimadoCents` (int, 0 se ausente),
`dataPublicacao`, `dataAbertura`, `dataEncerramento` (ISO BRT ou ""), `sourceUrl`,
`collectedAt`, `raw` (objeto cru do PNCP).

Opcionais (só presentes quando a fonte traz): `numeroCompra`, `anoCompra`, `processo`,
`orgaoCnpj`, `unidade`, `uf`, `ufNome`, `municipio`, `codigoIbge`, `esfera`, `poder`,
`modalidadeId`, `modoDisputa`, `situacaoId`, `situacao`, `instrumento`,
`valorHomologadoCents`, `srp`, `amparoLegal`.

Sugestão de SQL (espelhando `0004_ingest_receita_catalog.sql`):

```sql
create or replace function public.ingest_pncp(p_payload jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_count integer := 0;
begin
  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'items','[]'::jsonb))
  loop
    insert into public.entities (kind, name, attributes, created_at, updated_at)
    values (
      'bidding_opportunity',
      coalesce(v_item->>'objeto',''),
      v_item,
      now(),
      now()
    )
    on conflict (kind, (attributes->>'id'))
    do update set
      name = excluded.name,
      attributes = excluded.attributes,
      updated_at = now();
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
```

> O `on conflict` acima pressupõe um índice único `(kind, (attributes->>'id'))` em
> `entities` — confira se a `ingest_receita_catalog` já usa o mesmo (provável) e
> reaproveite; senão, crie: `create unique index if not exists entities_kind_attr_id_uidx on public.entities (kind, (attributes->>'id'));`

## Deploy (pelo orquestrador)
1. SQL Editor → criar a RPC `ingest_pncp` (acima).
2. Edge Functions → Create function **`ingest-pncp`** → colar `index.ts` → Deploy.
   (Verify JWT pode ficar ligado; secrets `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`
   são automáticos.)
3. Invoke de teste: `?dias=1&modalidades=6&maxPaginas=1` → deve voltar
   `{ ok: true, coletadas: N, ingested: N }`.
4. Agendar via cron (1–2x/dia; prazos de licitação são de dias/semanas).
5. Adicionar a rota `/licitacoes` no App (lazy-import de `./app/licitacoes/page` → `LicitacoesPage`)
   e marcar o módulo `licitacoes` como `active`.

## Custo
Zero IA. Requisições paginadas com pausa de 350 ms (educado). Idempotente por
`numeroControlePNCP`.
