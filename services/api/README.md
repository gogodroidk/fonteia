# fonteia-api

> **Nota:** o caminho padrão do produto agora é a **Supabase Edge Function**
> (`supabase/functions/fonteia`), porque é lá que a chave da Anthropic está
> guardada. Este Worker Cloudflare é uma **alternativa** equivalente (mesmas
> rotas) — útil se você preferir rodar o backend na Cloudflare. Para usá-lo,
> defina `VITE_API_URL` para a URL deste Worker no build do front.

Backend público (somente leitura) do app Fonte.ia. Entrega os dados **reais** dos
leilões da Receita Federal e a análise por IA de cada lote.

## Rotas

| Método | Rota | Descrição | Segredo? |
|---|---|---|---|
| GET | `/health` | Status do serviço | não |
| GET | `/leiloes/lotes` | Lotes em destaque, ao vivo da Receita (cache de 15 min na borda) | não |
| GET | `/leiloes/lotes/:id` | Um lote específico | não |
| POST | `/ia/raio-x` | Análise em linguagem simples de um lote (Claude) | sim (`ANTHROPIC_API_KEY`) |

`POST /ia/raio-x` recebe `{ "lot": <objeto do lote>, "question"?: "texto" }`.

## Deploy (uma vez)

```bash
pnpm --filter @fonteia/api-worker run deploy
```

> Use o comando acima (ou `cd services/api && wrangler deploy --config wrangler.toml`).
> O `--config` é obrigatório: sem ele, o wrangler pega o `wrangler.jsonc` da raiz
> (o app web) em vez deste Worker.

A URL de produção fica `https://fonteia-api.<sua-conta>.workers.dev`.
O app web já aponta para `https://fonteia-api.igoreluisa.workers.dev` por padrão
(pode ser sobrescrito com a variável de build `VITE_API_URL`).

## Ligar a IA (opcional)

Os lotes funcionam **sem nenhum segredo**. A rota de IA só liga quando você
configura a chave da Anthropic:

```bash
wrangler secret put ANTHROPIC_API_KEY    # cole a chave sk-ant-...
```

Modelo padrão: `claude-opus-4-8`. Para reduzir custo, defina a variável
`ANTHROPIC_MODEL` (ex.: `claude-haiku-4-5`) no dashboard ou em `[vars]` no
`wrangler.toml`. Enquanto a chave não estiver configurada, a rota responde
`503` de forma honesta — o app mostra "assistente em ativação", nunca uma
resposta falsa.

## Notas

- Os dados dos lotes vêm do endpoint público oficial da Receita
  (Sistema de Leilão Eletrônico). Cache de 15 min via Cloudflare Cache API.
- Worker autocontido: só Web APIs, sem dependências de workspace.
- A chave `ANTHROPIC_API_KEY` **nunca** vai para o código nem para o bundle do
  front — fica apenas como secret do Worker.
