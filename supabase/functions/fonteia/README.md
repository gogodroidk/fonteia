# Edge Function `fonteia`

Backend público (somente leitura) do app Fonte.ia, rodando **no Supabase** —
o mesmo projeto onde você já guardou a chave `ANTHROPIC_API_KEY`.

| Método | Rota (após `/functions/v1/fonteia`) | O que faz | Precisa de segredo? |
|---|---|---|---|
| GET | `/health` | Status + se a IA está ligada | não |
| GET | `/leiloes/lotes` | Lotes ao vivo da Receita (cache 15 min) | não |
| GET | `/leiloes/lotes/:id` | Um lote específico | não |
| POST | `/ia/raio-x` | Raio-X do lote por IA (Claude) | sim (`ANTHROPIC_API_KEY`) |

URL final: `https://pwiuiihsyazghdsrpshg.supabase.co/functions/v1/fonteia`
(o app web já aponta para cá por padrão).

## Deploy pelo painel do Supabase (sem terminal)

1. No painel do projeto **OLLI / FONTE.IA**, menu **Edge Functions → Functions**.
2. **Create a new function** (ou “Deploy a new function” → “Via editor”).
3. Nome: **`fonteia`** (exatamente isso — o app espera esse nome).
4. Apague o exemplo e **cole todo o conteúdo de `index.ts`** (este diretório).
5. **Deploy**.
6. Abra a função → **Settings** → desligue **“Verify JWT”** (ou
   “Enforce JWT verification”). Isso torna as rotas públicas, como o app precisa.

A chave `ANTHROPIC_API_KEY` já está em **Edge Functions → Secrets**, então a IA
liga sozinha. Para gastar menos, adicione lá o secret `ANTHROPIC_MODEL` com
`claude-haiku-4-5` (padrão é `claude-opus-4-8`).

## Deploy pela CLI (alternativa)

```bash
supabase functions deploy fonteia --no-verify-jwt --project-ref pwiuiihsyazghdsrpshg
```

## Testar depois do deploy

```bash
curl https://pwiuiihsyazghdsrpshg.supabase.co/functions/v1/fonteia/health
# -> {"service":"fonteia","status":"ok","iaEnabled":true,...}
curl https://pwiuiihsyazghdsrpshg.supabase.co/functions/v1/fonteia/leiloes/lotes
# -> {"count":26,"lots":[...]}  (dados reais da Receita)
```

Se `iaEnabled` vier `true`, a IA está pronta. Se vier `false`, a função não está
lendo o secret — confira o nome exato `ANTHROPIC_API_KEY` em Secrets.

## Observação de custo/abuso

Com “Verify JWT” desligado, a rota `/ia/raio-x` fica pública e usa sua chave da
Anthropic. Para o lançamento está ok; quando crescer, vale colocar um limite de
uso (rate limit) ou exigir login antes de chamar a IA.
