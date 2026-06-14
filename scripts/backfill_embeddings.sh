#!/usr/bin/env bash
# Backfill de embeddings (embed-entities) respeitando a cota free do Gemini.
# Cota free do gemini-embedding-001: ~100 requests/min E ~1000 requests/DIA.
# Cada item embeddado = 1 request. Uma invocação processa <=100 itens; espaçamos
# ~62s. Quando a cota diária (1000) estoura, todas as passes viram 429 — pare e
# retome no dia seguinte (a função é idempotente: só preenche embedding IS NULL).
#
# Uso: backfill_embeddings.sh <kind> <max_passes>
# Ex.: backfill_embeddings.sh auction_lot 12
#      backfill_embeddings.sh bidding_opportunity 12
# Para subir TUDO sem se preocupar com kind, rode sem ?kind= (processa qualquer
# entity sem embedding): curl ".../embed-entities?limit=100".
set -u
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3aXVpaWhzeWF6Z2hkc3Jwc2hnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwNTg4ODQsImV4cCI6MjA5NjYzNDg4NH0.x4ywII88iQXj8OxtT_MO_WkYKMiuelIh1qwUh5vzvY8"
URL="https://pwiuiihsyazghdsrpshg.supabase.co/functions/v1/embed-entities"
KIND="${1:?kind required}"
MAXP="${2:-40}"

for ((i=1; i<=MAXP; i++)); do
  RESP=$(curl -sS -X POST "$URL?kind=$KIND&limit=100" \
    -H "Authorization: Bearer $TOKEN" -H "apikey: $TOKEN" \
    -H "content-type: application/json" --max-time 280)
  echo "[$KIND pass $i] $RESP"
  EMB=$(printf '%s' "$RESP" | grep -o '"embedded":[0-9]*' | grep -o '[0-9]*')
  MORE=$(printf '%s' "$RESP" | grep -o '"more":[a-z]*' | grep -o 'true\|false')
  RL=$(printf '%s' "$RESP" | grep -o '"rate_limited":[a-z]*' | grep -o 'true\|false')
  # Terminou: nada embeddado e sem rate limit e sem "more".
  if [ "${EMB:-0}" = "0" ] && [ "${RL:-false}" != "true" ] && [ "${MORE:-false}" != "true" ]; then
    echo "[$KIND] CONCLUIDO na pass $i"
    break
  fi
  sleep 62
done
echo "[$KIND] fim do loop"
