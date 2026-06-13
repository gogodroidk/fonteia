# ingest-receita-catalog — catálogo COMPLETO da Receita (todos os editais/lotes)

Hoje o app mostra só os ~26 **destaques** (função `ingest-receita-leiloes`, cron de 6 em 6h).
Esta função traz **todos os lotes** de **todos os editais** (centenas), com **valor de
avaliação, categoria, fotos e situação** — o que liga a economia real, o "o que é o lote"
e a base para análise (médias, histórico).

## Como funciona
`GET api/editais-disponiveis` → achata os editais → por edital, `GET api/edital/{edle}`
(traz `listaLotes[]`) → normaliza cada lote (id = `edle-nrAtribuido`, **mesmo esquema do
destaque**, sem duplicar) → grava via a RPC `public.ingest_receita_catalog` em lotes de 200.

- **Padrão:** só editais **abertos/próximos** (situação 2,3,5,6,7) — lista limpa do que dá pra arrematar.
- `?all=1`: inclui **encerrados/cancelados** (histórico para análise).
- `?maxEditais=N`: limita (útil para testar).

## Deploy (pelo dono — sem terminal)

**1. Função do banco** — Supabase → **SQL Editor** → cole e rode o conteúdo de
`infra/migrations/0004_ingest_receita_catalog.sql` (cria a RPC `ingest_receita_catalog`).

**2. Edge Function** — Supabase → **Edge Functions** → **Create function**, nome
**`ingest-receita-catalog`**, cole `supabase/functions/ingest-receita-catalog/index.ts`,
**Deploy**. (Pode deixar **Verify JWT ligado** — o cron já manda Authorization, igual à `ingest-receita-leiloes`.
Os secrets `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` são automáticos — não precisa configurar nada.)

**3. Testar** — no painel da função, **Invoke** com query `?maxEditais=2` → deve voltar
`{ ok: true, editais: 2, lots: N, ingested: N }`. Confira no app: já aparecem mais lotes (com categoria/economia).

**4. Agendar 2x/dia** (6h e 18h BRT = 9h e 21h UTC). Mais fácil: **duplicar o cron atual**
e trocar 2 coisas (URL e horário). No SQL Editor:

```sql
-- Reaproveita o MESMO Authorization do seu cron atual.
-- Veja o token com:  select command from cron.job where jobid = 1;
select cron.schedule(
  'ingest-receita-catalog-2x',
  '0 9,21 * * *',
  $$
  select net.http_post(
    url := 'https://pwiuiihsyazghdsrpshg.supabase.co/functions/v1/ingest-receita-catalog',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer <COLE_O_MESMO_TOKEN_DO_JOB_1>'
    )
  );
  $$
);
```

## Custo / educação
Zero IA. Uma varredura ≈ 1 requisição por edital (cada uma traz todos os lotes), com pausa
de 800 ms entre elas (educado com o servidor da Receita). 2x/dia é folgado — os prazos são
de dias/semanas. Idempotente por hash: re-rodar não duplica, só atualiza o que mudou.

## Próximo passo no app (frontend)
Os lotes passam a carregar `situacao`/`lotSituacao`. Um filtro de status (aberto/encerrado)
no Lotes/Painel deixa a lista impecável — follow-up rápido depois que isto estiver no ar.
