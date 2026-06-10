# Fonte.ia - Cloudflare Deployment

Data: 2026-06-10
Alvo: Cloudflare Pages
Projeto sugerido: `fonteia`

## Decisao

O frontend web do Fonte.ia deve ir primeiro para Cloudflare Pages. A API continua separada por enquanto; no alpha, o dashboard web le dados publicos do Supabase REST quando `VITE_API_URL` nao estiver configurado.

## Custo Inicial

- Cloudflare Pages esta disponivel em todos os planos e serve bem o frontend estatico do Vite.
- O plano Free de Pages suporta ate 20.000 arquivos por site; nosso `apps/web/dist` fica muito abaixo disso.
- Workers Free tem 100.000 requests por dia, mas ainda nao precisamos de Worker para o frontend estatico.
- Custo esperado agora: R$ 0 por mes no Cloudflare, enquanto nao comprarmos dominio, nao ativarmos recursos pagos e nao passarmos de limites gratuitos.

Fontes oficiais consultadas:

- https://developers.cloudflare.com/pages/
- https://developers.cloudflare.com/pages/platform/limits/
- https://developers.cloudflare.com/workers/platform/pricing/

## Build De Producao

Como estamos usando Direct Upload, o build roda localmente e as variaveis `VITE_*` entram no bundle do Vite.

PowerShell:

```powershell
$env:VITE_SUPABASE_URL="https://pwiuiihsyazghdsrpshg.supabase.co"
$env:VITE_SUPABASE_PUBLISHABLE_KEY="<public-publishable-key>"
$env:VITE_API_URL=""
corepack pnpm --filter @fonteia/web build
```

Observacoes:

- `VITE_SUPABASE_PUBLISHABLE_KEY` e chave publica, mas ainda assim nao deve ser colada em documentos ou commits.
- Quando a API estiver hospedada, definir `VITE_API_URL` para a URL publica da API antes do build.
- Em producao, o frontend nao tenta `localhost:4000` se `VITE_API_URL` nao existir; ele cai direto para Supabase REST e depois amostras locais.

## Deploy

Verificar autenticacao:

```powershell
corepack pnpm cloudflare:whoami
```

Se precisar autenticar:

```powershell
corepack pnpm wrangler login
```

Em ambiente nao interativo, usar token:

```powershell
$env:CLOUDFLARE_API_TOKEN="<token-com-cloudflare-pages-edit>"
```

Permissao minima indicada pela documentacao do Cloudflare Pages para Direct Upload:

- Account -> Cloudflare Pages -> Edit

No teste de 2026-06-10, o token informado autenticou a conta, mas falhou ao criar o projeto Pages com `Authentication error [code: 10000]` e o Wrangler tambem avisou falta de permissao para ler memberships. Para evitar novo bloqueio, criar/ajustar o token com:

- Account -> Cloudflare Pages -> Edit
- User -> Memberships -> Read

Se a organizacao exigir escopo mais fechado, limitar o recurso ao account id mostrado pelo Wrangler.

Se o Wrangler tambem pedir account id:

```powershell
$env:CLOUDFLARE_ACCOUNT_ID="<account-id>"
```

Publicar:

```powershell
corepack pnpm deploy:cloudflare:web
```

Comando equivalente:

```powershell
corepack pnpm wrangler pages deploy apps/web/dist --project-name=fonteia --branch=main
```

## Proximo Passo Depois Do Primeiro Deploy

1. Apontar dominio proprio no Cloudflare quando definido.
2. Configurar Git integration ou CI para build automatico.
3. Hospedar API em Worker/Pages Functions ou outro backend quando o MVP precisar de API server-side.
4. Mover segredos server-side para Workers Secrets/Cloudflare Secrets Store; nunca embutir segredos no Vite.
