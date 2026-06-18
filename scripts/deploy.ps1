# ============================================================
# Fonte.ia - Deploy Script
# Executa: pnpm install + build + Cloudflare Pages deploy
# ============================================================
#
# SEGREDOS: este script NUNCA contem credenciais hardcoded.
# Defina as variaveis de ambiente no seu shell ANTES de rodar
# (ou use um arquivo .env que NAO seja versionado):
#
#   $env:CLOUDFLARE_API_TOKEN          = "<seu token Cloudflare>"
#   $env:VITE_SUPABASE_URL             = "https://<ref>.supabase.co"
#   $env:VITE_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_..."
#   (opcional) $env:VITE_API_URL       = ""   # vazio = web cai para Supabase REST
#   (opcional) $env:SUPABASE_SERVICE_ROLE_KEY = "<service role>"  # p/ deploy do ingest worker
#
# ============================================================

$ErrorActionPreference = "Stop"
$ROOT = $PSScriptRoot

function Require-Env([string]$name) {
    $val = [Environment]::GetEnvironmentVariable($name)
    if ([string]::IsNullOrWhiteSpace($val)) {
        Write-Host "ERRO: variavel de ambiente '$name' nao definida." -ForegroundColor Red
        Write-Host "      Veja o cabecalho deste script para a lista de variaveis." -ForegroundColor Red
        exit 1
    }
    return $val
}

# ---------- Validacao de credenciais (sem valores no codigo) ----------
[void](Require-Env "CLOUDFLARE_API_TOKEN")
[void](Require-Env "VITE_SUPABASE_URL")
[void](Require-Env "VITE_SUPABASE_PUBLISHABLE_KEY")
if ($null -eq $env:VITE_API_URL) { $env:VITE_API_URL = "" }
$SUPABASE_SERVICE_ROLE_KEY = [Environment]::GetEnvironmentVariable("SUPABASE_SERVICE_ROLE_KEY")

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Fonte.ia Deploy" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. pnpm install
Write-Host "[1/4] Instalando dependencias..." -ForegroundColor Yellow
Set-Location $ROOT
corepack pnpm install
Write-Host "OK" -ForegroundColor Green

# 2. Build do web
Write-Host ""
Write-Host "[2/4] Build do frontend (apps/web)..." -ForegroundColor Yellow
corepack pnpm --filter @fonteia/web build
Write-Host "OK" -ForegroundColor Green

# 3. Deploy Cloudflare Pages
Write-Host ""
Write-Host "[3/4] Deploy para Cloudflare Pages..." -ForegroundColor Yellow
corepack pnpm wrangler pages deploy apps/web/dist --project-name=fonteia --branch=main
Write-Host "OK - Frontend no ar!" -ForegroundColor Green

# 4. Ingest worker (so roda se a service_role key estiver no ambiente)
Write-Host ""
if (-not [string]::IsNullOrWhiteSpace($SUPABASE_SERVICE_ROLE_KEY)) {
    Write-Host "[4/4] Deploy do Ingest Worker..." -ForegroundColor Yellow

    # Criar KV namespace se ainda nao existir
    $kvOutput = corepack pnpm wrangler kv namespace create RECEITA_CACHE --config services/ingest/wrangler.jsonc 2>&1
    Write-Host $kvOutput

    # Setar secrets do worker
    $env:VITE_SUPABASE_URL          | corepack pnpm wrangler secret put SUPABASE_URL               --config services/ingest/wrangler.jsonc
    $SUPABASE_SERVICE_ROLE_KEY      | corepack pnpm wrangler secret put SUPABASE_SERVICE_ROLE_KEY  --config services/ingest/wrangler.jsonc

    # Deploy do worker
    corepack pnpm --filter @fonteia/ingest deploy
    Write-Host "OK - Ingest Worker no ar!" -ForegroundColor Green
} else {
    Write-Host "[4/4] Ingest Worker pulado." -ForegroundColor DarkGray
    Write-Host "      Para ativar: defina `$env:SUPABASE_SERVICE_ROLE_KEY e rode novamente." -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  DONE" -ForegroundColor Green
Write-Host "  Frontend: https://fonteia.pages.dev" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
