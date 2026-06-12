# ============================================================
# Fonte.ia — Deploy Script
# Executa: pnpm install + build + Cloudflare Pages deploy
# ============================================================

# ---------- CREDENCIAIS (preenchidas automaticamente) ----------

$env:CLOUDFLARE_API_TOKEN  = "cfut_PlhVlrkt2dpSeD02PAiG0yJmO9EVyhI1hGhFv0Fmd7ba52f2"
$env:VITE_SUPABASE_URL     = "https://pwiuiihsyazghdsrpshg.supabase.co"
$env:VITE_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_uojihld8t92MQXo7gXrR3w_WPVn4RkZ"
$env:VITE_API_URL          = ""   # Deixar vazio: web cai para Supabase REST no alpha

# ---------- INGEST WORKER (preencher manualmente) ----------
# Copie a service_role key em:
# https://supabase.com/dashboard/project/pwiuiihsyazghdsrpshg/settings/api-keys/legacy
# Clique em "Reveal" na linha service_role e depois "Copy"
$SUPABASE_SERVICE_ROLE_KEY = "COLE_AQUI_A_SERVICE_ROLE_KEY"

# ============================================================

$ErrorActionPreference = "Stop"
$ROOT = $PSScriptRoot

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

# 4. Ingest worker (só roda se a service_role key foi preenchida)
Write-Host ""
if ($SUPABASE_SERVICE_ROLE_KEY -ne "COLE_AQUI_A_SERVICE_ROLE_KEY") {
    Write-Host "[4/4] Deploy do Ingest Worker..." -ForegroundColor Yellow

    # Criar KV namespace se ainda nao existir
    $kvOutput = corepack pnpm wrangler kv namespace create RECEITA_CACHE --config services/ingest/wrangler.jsonc 2>&1
    Write-Host $kvOutput

    # Setar secrets do worker
    echo $env:VITE_SUPABASE_URL     | corepack pnpm wrangler secret put SUPABASE_URL            --config services/ingest/wrangler.jsonc
    echo $SUPABASE_SERVICE_ROLE_KEY | corepack pnpm wrangler secret put SUPABASE_SERVICE_ROLE_KEY --config services/ingest/wrangler.jsonc

    # Deploy do worker
    corepack pnpm --filter @fonteia/ingest deploy
    Write-Host "OK - Ingest Worker no ar!" -ForegroundColor Green
} else {
    Write-Host "[4/4] Ingest Worker pulado." -ForegroundColor DarkGray
    Write-Host "      Para ativar: preencha SUPABASE_SERVICE_ROLE_KEY neste script" -ForegroundColor DarkGray
    Write-Host "      e rode novamente." -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  DONE" -ForegroundColor Green
Write-Host "  Frontend: https://fonteia.pages.dev" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
