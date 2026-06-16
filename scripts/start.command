#!/bin/bash
# ProspectAI — levanta todos los servicios y deja el servidor corriendo en
# segundo plano (independiente de la app de Claude). Doble clic desde Finder
# o ejecútalo con:  bash scripts/start.command
set -u

cd "$(dirname "$0")/.." || exit 1
PROJECT="$(pwd)"
mkdir -p logs

echo "──────────────────────────────────────────────"
echo "  ProspectAI · iniciando servicios"
echo "  $PROJECT"
echo "──────────────────────────────────────────────"

# 1) Docker + scraper de Google Maps ───────────────────────────────
if command -v docker >/dev/null 2>&1; then
  if ! docker info >/dev/null 2>&1; then
    echo "▸ Arrancando Docker Desktop (espera unos segundos)..."
    open -a Docker 2>/dev/null
    for _ in $(seq 1 60); do docker info >/dev/null 2>&1 && break; sleep 2; done
  fi
  if docker info >/dev/null 2>&1; then
    echo "▸ Levantando scraper (docker compose up -d)..."
    if docker compose up -d >/dev/null 2>&1; then
      echo "  ✓ scraper en http://localhost:8081"
    else
      echo "  ⚠ no se pudo levantar el scraper (la búsqueda de leads no funcionará)"
    fi
  else
    echo "  ⚠ Docker no respondió; el scraper no estará disponible"
  fi
else
  echo "  ⚠ Docker no está instalado; el scraper no estará disponible"
fi

# 2) Servidor de la app (auto-reinicio, en segundo plano) ──────────
if lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "▸ La app ya está corriendo en http://localhost:3000"
else
  echo "▸ Iniciando servidor en segundo plano..."
  # nohup + disown + stdin cerrado => sobrevive al cierre de la terminal/Claude.
  # El bucle reinicia el server si se cae. predev recompila better-sqlite3 solo.
  nohup bash -c '
    cd "'"$PROJECT"'"
    echo $$ > logs/app.pid
    while true; do
      echo "[$(date "+%Y-%m-%d %H:%M:%S")] starting next dev" >> logs/app.log
      npm run dev >> logs/app.log 2>&1
      echo "[$(date "+%Y-%m-%d %H:%M:%S")] server exited; restarting in 3s" >> logs/app.log
      sleep 3
    done
  ' </dev/null >/dev/null 2>&1 &
  disown
  printf "  compilando"
  for _ in $(seq 1 45); do
    curl -s -o /dev/null http://localhost:3000/login 2>/dev/null && break
    printf "."; sleep 1
  done
  echo ""
  if curl -s -o /dev/null http://localhost:3000/login 2>/dev/null; then
    echo "  ✓ app lista"
  else
    echo "  ⚠ tarda más de lo normal; revisa logs/app.log"
  fi
fi

echo "──────────────────────────────────────────────"
echo "  Abre:        http://localhost:3000"
echo "  Logs:        logs/app.log   (tail -f logs/app.log)"
echo "  Para parar:  scripts/stop.command"
echo "──────────────────────────────────────────────"
