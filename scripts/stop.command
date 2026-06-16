#!/bin/bash
# ProspectAI — detiene el servidor de la app (el contenedor del scraper se deja
# corriendo; para pararlo: docker compose stop). Doble clic o: bash scripts/stop.command
set -u

cd "$(dirname "$0")/.." || exit 1

echo "Deteniendo ProspectAI..."

# 1) Matar el supervisor (bucle de auto-reinicio) para que no reviva el server.
if [ -f logs/app.pid ]; then
  kill "$(cat logs/app.pid)" 2>/dev/null
  rm -f logs/app.pid
fi

# 2) Matar el server de Next y liberar el puerto 3000.
pkill -f "next dev" 2>/dev/null
pkill -f "next-server" 2>/dev/null
# shellcheck disable=SC2046
lsof -ti:3000 2>/dev/null | xargs kill 2>/dev/null

sleep 1
if lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "⚠ Algo sigue en :3000. Reintenta o reinicia la terminal."
else
  echo "✓ App detenida."
fi
echo "(El scraper de Google Maps sigue activo. Para pararlo: docker compose stop)"
