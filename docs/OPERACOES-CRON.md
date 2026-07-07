# Operações — pg_cron de produção

> **Resgatado em 2026-07-07 (Onda 1).** Estes jobs vivem em `cron.job` no
> Postgres do projeto Supabase de produção (`pwiuiihsyazghdsrpshg`) — **não
> estavam versionados em nenhum lugar do repositório**. Este arquivo é o
> baseline documentado; não é executável (não é SQL/migration) e não substitui
> a fonte real, que continua sendo o `cron.job` de produção. Se este documento
> divergir do banco no futuro, o banco é a verdade — atualize este arquivo para
> bater com ele.
>
> Lido via `select jobid, jobname, schedule, command, active from cron.job`.
> Todos os tokens/JWT presentes nos comandos originais foram **mascarados**
> abaixo — nenhum segredo real está neste arquivo.

## Como ler a tabela

- **schedule**: sintaxe cron padrão (`min hora dia mes dia-semana`).
- **command**: o que o pg_cron executa — na maioria dos casos, uma chamada
  `net.http_post` para uma Supabase Edge Function (`https://pwiuiihsyazghdsrpshg
  .supabase.co/functions/v1/<slug>`), autenticada com um JWT anon fixo (agora
  `<ANON_KEY>` abaixo) ou, em 2 casos, um secret guardado no Vault.
- **ativo**: `active=false` significa o job existe mas está **desagendado/pausado**
  no pg_cron (não roda), sem precisar ser removido.

## Jobs

| jobid | jobname | schedule | ativo | o que faz |
|---|---|---|---|---|
| 1 | `ingest-receita-leiloes-6h` | `0 */6 * * *` | **não** | POST em `ingest-receita-leiloes` (coleta leilões judiciais da Receita Federal). Desativado — provavelmente substituído por `ingest-receita-catalog`/`ingest-receita-historico`/`ingest-receita-atas`. |
| 2 | `catalogo-2x-dia` | `0 */6 * * *` | sim | POST em `ingest-receita-catalog` (catálogo de leilões da Receita, a cada 6h apesar do nome "2x-dia"). |
| 3 | `stripe-sync-worker` | `*/1 * * * *` | sim | POST em `stripe-worker` (Stripe Sync Engine oficial — ver `supabase/functions/stripe-worker/index.ts`), a cada minuto. Autenticado com o secret do Vault `stripe_sync_worker_secret` (não o JWT anon). Só dispara se não houver uma janela de "skip" ativa no Vault (`stripe_sync_skip_until`). |
| 4 | `licitacoes-pncp-2x-dia` | `0 9,21 * * *` | sim | POST em `ingest-pncp?dias=2&maxPaginas=10` (licitações do PNCP, 2x/dia às 9h e 21h). |
| 5 | `embed-entities-backfill` | `*/3 * * * *` | sim | POST em `embed-entities?limit=100` a cada 3 min — gera embeddings pgvector (768d/Gemini) para entidades pendentes (busca semântica). |
| 6 | `prune-ai-rate-limits` | `7 * * * *` | sim | `select public.prune_ai_rate_limits();` direto (sem HTTP) — limpeza horária da tabela de rate limit da IA, aos minutos 7 de cada hora. |
| 7 | `ingest-cnj-datajud-2x-dia` | `0 6,18 * * *` | **não** | POST em `ingest-cnj?dias=90&tribunais=tjsp,tjdft&maxPaginas=5&size=100` (dados jurídicos via DataJud/CNJ). Desativado. |
| 8 | `sancoes-portal-transparencia-1x-dia` | `0 3 * * *` | **não** | POST em `ingest-portal-transparencia?maxPaginas=30` (sanções do Portal da Transparência). Desativado. |
| 9 | `ingest-pncp-contratos-1x-dia` | `0 5 * * *` | sim | POST em `ingest-pncp-contratos?dias=7&maxPaginas=10` (contratos do PNCP, diário às 5h). |
| 14 | `driver-transferegov` | `*/2 * * * *` | sim | `select public.ingest_driver_step('transferegov');` a cada 2 min — driver de paginação/cursor para o ingest do TransfereGov (ver `infra/migrations/0039_prod_rescue_ingest_driver.sql`). |
| 15 | `driver-inpe-queimadas` | `*/3 * * * *` | sim | `select public.ingest_driver_step('inpe-queimadas');` a cada 3 min — driver do ingest de focos de queimada do INPE. |
| 16 | `driver-tesouro-siconfi` | `*/3 * * * *` | sim | `select public.ingest_driver_step('tesouro-siconfi');` a cada 3 min — driver do ingest SICONFI (Tesouro Nacional). |
| 17 | `driver-migrate` | `*/5 * * * *` | sim | `select public.ingest_driver_step('migrate');` a cada 5 min — dispara `d1-bridge/migrate`, o sync bulk Supabase→Cloudflare D1 (autenticado com o secret do Vault `MIGRATE_SECRET`, não o JWT anon). |
| 18 | `ingest-receita-historico-6h` | `15 */6 * * *` | sim | POST em `ingest-receita-historico?limit=200`, a cada 6h (minuto 15). Sem header `Authorization` no comando (a função deve ser pública/verify_jwt=false). |
| 19 | `ingest-receita-atas-6h` | `45 */6 * * *` | sim | POST em `ingest-receita-atas?limit=80`, a cada 6h (minuto 45). Também sem `Authorization` no comando. |
| 20 | `send-alerts-daily` | `0 11 * * *` | sim | POST em `send-alerts` (e-mail diário de alertas de prazo via Resend), 11h. |
| 21 | `ingest-querido-diario-daily` | `0 4 * * *` | sim | POST em `ingest-querido-diario` com janela `dataInicial` = hoje-3d, `dataFinal` = hoje (calculada dinamicamente no próprio SQL do cron), diário às 4h. |

## Segredos referenciados (não estão neste arquivo, vivem no Vault/config)

- `<ANON_KEY>` — JWT anon do projeto (`role: anon`, mesmo valor em quase todos os
  jobs que chamam `net.http_post` com `Authorization: Bearer <ANON_KEY>`). É a
  publishable/anon key do projeto — pública por design, mas ainda assim mascarada
  aqui por princípio de não versionar tokens literais.
- `vault.decrypted_secrets` → `stripe_sync_worker_secret` — usado só pelo job 3.
- `vault.decrypted_secrets` → `stripe_sync_skip_until` — janela de pausa do sync
  Stripe, gerida pela própria função `stripe-worker` (não é um cron separado).
- `vault.decrypted_secrets` → `MIGRATE_SECRET` — usado só dentro de
  `public.ingest_driver_step('migrate')` (job 17), lido dinamicamente na função,
  não fica no comando do cron.

## Observações / achados desta Onda 1

- Os jobs `1` (`ingest-receita-leiloes-6h`), `7` (`ingest-cnj-datajud-2x-dia`) e
  `8` (`sancoes-portal-transparencia-1x-dia`) estão **desativados**. Isso é
  provavelmente intencional (substituídos por outros ingest ou pausados por
  custo/erro), mas não há registro do motivo — vale confirmar com o dono antes
  de reativar ou remover.
- Os jobs de "driver" (`14`-`17`, função `public.ingest_driver_step`) implementam
  um padrão de paginação assíncrona via `net.http_post` + `net._http_response`
  (fire-and-forget com polling no próximo tick) — ver
  `infra/migrations/0039_prod_rescue_ingest_driver.sql` para o código completo
  resgatado desta função.
- Nenhum destes crons toca `public.subscriptions` — reforça o achado do resgate
  de billing (`supabase/functions/stripe-webhook/README.md`): não há hoje
  nenhum job agendado que sincronize pagamento Stripe → acesso liberado.
