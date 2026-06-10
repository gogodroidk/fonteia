# Fonte.ia - Supabase Status

Data: 2026-06-10
Projeto: `FONTE.IA`
Project ref: `pwiuiihsyazghdsrpshg`

## Aplicado

- Migration inicial executada no Supabase remoto via conector Supabase com role `postgres`.
- Tabelas centrais criadas: `sources`, `source_runs`, `raw_records`, `documents`, `entities`, `entity_links`, `evidence`, `claims`, `dossiers`, `modules`, `entitlements`, `usage_events`, `alerts`, `alert_events`.
- RLS habilitado nas tabelas do Fonte.ia.
- Policies publicas criadas apenas para leitura de `sources` e `modules`.
- Policies publicas alpha adicionadas para leitura de lotes da Receita em `entities` e evidencias publicas da Receita em `evidence`.
- Indices principais e indices de foreign keys adicionados.
- PostGIS e pgvector instalados.
- Seeds aplicados: 9 modulos e 10 fontes iniciais.
- Ingestao inicial real da Receita Leiloes: 5 lotes gravados em `raw_records`, `entities` e `evidence`.

## Validacao Remota

Consulta de contagem depois da ingestao:

- `source_runs`: 1
- `raw_records`: 5
- `entities where kind = 'auction_lot'`: 5
- `evidence`: 5
- ultimo `source_runs.records_inserted`: 5
- REST publica validada com chave publishable em 2026-06-10 para `entities?kind=eq.auction_lot`, retornando lotes reais sem expor `raw_records`.

Amostra de lotes gravados:

- `900100-7-2026-123` - Curitiba
- `200100-1-2026-142` - Belem
- `200100-1-2026-143` - Belem
- `317900-2-2026-154` - Fortaleza
- `600100-2-2026-37` - Belo Horizonte

## Advisors Pendentes

O advisor de seguranca ainda aponta itens ligados a PostGIS/pgvector:

- `public.spatial_ref_sys` com RLS desabilitado.
- Extensoes `postgis` e `vector` instaladas em `public`.
- Funcoes `st_estimatedextent` de PostGIS expostas como security definer.

Esses avisos devem ser avaliados com cuidado antes de aplicar remediation automatica, porque `spatial_ref_sys` e funcoes PostGIS pertencem a extensao. A documentacao do Supabase recomenda RLS em schemas expostos, mas o proprio advisor alerta para nao aplicar remediation de `spatial_ref_sys` sem decidir policy/acesso.

As tabelas operacionais privadas (`raw_records`, `source_runs`, `documents`, `claims`, `dossiers`, `alerts`, `usage_events` etc.) aparecem como RLS habilitado sem policy publica. Isso e intencional no alpha: elas devem ser acessadas por API server-side/service role, nao por cliente anonimo.

## Proximo Passo Tecnico

1. Obter uma `DATABASE_URL` server-side segura para rodar `services/ingest` diretamente.
2. Rodar `corepack pnpm --filter @fonteia/ingest exec tsx src/jobs/ingest-receita-leiloes.ts` com `DATABASE_URL` e `DATABASE_SSL=true`.
3. Ligar `apps/api` no Supabase via `DATABASE_URL` para `/leiloes/lotes` servir dados reais em producao.
4. Manter `apps/web` usando a ordem `API -> Supabase REST -> amostra` ate o backend estar implantado com segredo server-side.
