# ingest-cnj

Ingestão de processos judiciais da API Pública do DataJud/CNJ.

## Secrets obrigatórios

| Secret | Descrição |
|---|---|
| `DATAJUD_API_KEY` | Chave de acesso à API do DataJud/CNJ. Obtida em https://datajud-wiki.cnj.jus.br/api-publica/acesso. Deve ser definida como secret no Supabase (`supabase secrets set DATAJUD_API_KEY=<valor>`). |
| `SUPABASE_URL` | Injetado automaticamente pelo Supabase. |
| `SUPABASE_SERVICE_ROLE_KEY` | Injetado automaticamente pelo Supabase. |
| `INGEST_CRON_SECRET` | Opcional. Se definido, a função exige `Authorization: Bearer <secret>` em todas as chamadas (defense-in-depth). |

## Atualizar a chave DataJud

Se a função retornar 401, a chave pode ter sido trocada pelo CNJ. Consulte a página oficial e atualize:

```bash
supabase secrets set DATAJUD_API_KEY=<nova_chave>
```
