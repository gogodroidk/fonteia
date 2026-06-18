#!/usr/bin/env bash
# Backfill de embeddings (embed-entities) respeitando a cota free do Gemini.
# Cota free do gemini-embedding-001: ~100 requests/min E ~1000 requests/DIA.
# Cada item embeddado = 1 request. Uma invocacao processa <=100 itens; espacamos
# ~62s. Quando a cota diaria (1000) estoura, todas as passes viram 429 - pare e
# retome no dia seguinte (a funcao e idempotente: so preenche embedding IS NULL).
#
# SEGREDOS: nada de token hardcoded. Defina no ambiente antes de rodar:
#   export SUPABASE_ANON_KEY="<chave anon publica do projeto>"
#   export SUPABASE_FUNCTIONS_URL="https://<ref>.supabase.co/functions/v1"
#
# Uso: backfill_embeddings.sh <kind> <max_passes>
# Ex.: backfill_embeddings.sh auction_lot 12
#      backfill_embeddings.sh bidding_opportunity 12
# Para subir TUDO sem se preocupar com kind, rode sem ?kind= (processa qualquer
# entity sem embedding): curl ".../embed-entities?limit=100".

set -uo pipefail

: "${SUPABASE_ANON_KEY:?defina SUPABASE_ANON_KEY (chave anon publica do projeto)}"
: "${SUPABASE_FUNCTIONS_URL:?defina SUPABASE_FUNCTIONS_URL ex: https://<ref>.supabase.co/functions/v1}"

TOKEN="$SUPABASE_ANON_KEY"
URL="${SUPABASE_FUNCTIONS_URL%/}/embed-entities"
KIND="${1:?kind required}"
MAXP="${2:-40}"

for ((i=1; i<=MAXP; i++)); do
  if ! RESP=$(curl -sS -X POST "$URL?kind=$KIND&limit=100" \
    -H "Authorization: Bearer $TOKEN" -H "apikey: $TOKEN" \
    -H "content-type: application/json" --max-time 280); then
    echo "[$KIND pass $i] ERRO de rede (curl). Aguardando e tentando a proxima pass." >&2
    sleep 62
    continue
  fi
  echo "[$KIND pass $i] $RESP"
  EMB=$(printf '%s' "$RESP" | grep -o '"embedded":[0-9]*' | grep -o '[0-9]*' || true)
  MORE=$(printf '%s' "$RESP" | grep -o '"more":[a-z]*' | grep -o 'true\|false' || true)
  RL=$(printf '%s' "$RESP" | grep -o '"rate_limited":[a-z]*' | grep -o 'true\|false' || true)
  # Terminou: nada embeddado e sem rate limit e sem "more".
  if [ "${EMB:-0}" = "0" ] && [ "${RL:-false}" != "true" ] && [ "${MORE:-false}" != "true" ]; then
    echo "[$KIND] CONCLUIDO na pass $i"
    break
  fi
  sleep 62
done
echo "[$KIND] fim do loop"
