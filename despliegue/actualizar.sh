#!/usr/bin/env bash
# Descarga la última versión de los dos repositorios, reconstruye las imágenes y
# levanta los servicios. Lo usa el job "deploy" de .github/workflows/cd.yml y
# también se puede correr a mano en el servidor.
#   RAMA_SERVIDOR y RAMA_CLIENTE eligen la rama de cada repositorio (main por defecto).
#   SIN_DESCARGAR=1 reconstruye con el código que ya está en el servidor.
set -euo pipefail

# Todo va dentro de una función: git puede reemplazar este archivo mientras corre y
# bash ya tiene la función completa en memoria.
principal() {
  BASE="${BASE:-/opt/sistema-cal}"
  RAMA_SERVIDOR="${RAMA_SERVIDOR:-main}"
  RAMA_CLIENTE="${RAMA_CLIENTE:-main}"

  # Los workflows de los dos repositorios pueden llegar a la vez: uno espera al otro.
  exec 9> /tmp/sistema-cal-despliegue.lock
  flock 9

  traer() {
    local carpeta="$1" rama="$2"
    git -C "$carpeta" fetch --quiet origin "$rama"
    git -C "$carpeta" checkout --quiet --force --detach "origin/$rama"
    echo "$(basename "$carpeta"): $(git -C "$carpeta" log --oneline -1)"
  }

  if [ "${SIN_DESCARGAR:-0}" != 1 ]; then
    traer "$BASE/servidor" "$RAMA_SERVIDOR"
    traer "$BASE/cliente" "$RAMA_CLIENTE"
  fi

  compose() {
    docker compose --env-file "$BASE/.env" -f "$BASE/servidor/despliegue/docker-compose.yml" "$@"
  }

  compose build
  compose up -d --remove-orphans
  docker image prune -f > /dev/null

  # La API tarda unos segundos en correr migraciones y arrancar.
  for _ in $(seq 1 30); do
    if compose exec -T app wget -qO- http://localhost:3000/api/salud > /dev/null 2>&1; then
      echo "API en línea"
      exit 0
    fi
    sleep 2
  done
  echo "La API no respondió. Revisa: docker compose logs app" >&2
  compose logs --tail 50 app >&2
  exit 1
}

principal "$@"
exit $?
