#!/usr/bin/env bash
# Crea un Administrador en producción. La semilla (npm run semilla) solo corre en
# desarrollo, así que el primer Administrador se crea con este script en el servidor.
# Pide nombre, correo y contraseña; la contraseña no se muestra ni queda en el historial.
set -euo pipefail

BASE="${BASE:-/opt/sistema-cal}"
compose() {
  docker compose --env-file "$BASE/.env" -f "$BASE/servidor/despliegue/docker-compose.yml" "$@"
}
valor() { grep -E "^$1=" "$BASE/.env" | head -1 | cut -d= -f2-; }

read -rp "Nombre completo: " NOMBRE
read -rp "Correo: " CORREO
read -rsp "Contraseña (mínimo 8 caracteres): " CLAVE; echo
read -rsp "Repite la contraseña: " CLAVE2; echo
[ "$CLAVE" = "$CLAVE2" ] || { echo "Las contraseñas no coinciden." >&2; exit 1; }
[ "${#CLAVE}" -ge 8 ] || { echo "La contraseña debe tener al menos 8 caracteres." >&2; exit 1; }
CORREO="$(echo "$CORREO" | tr '[:upper:]' '[:lower:]' | xargs)"

# Mismo algoritmo y costo que la API (bcrypt, SALT_ROUNDS = 10).
HASH="$(compose exec -T -e CLAVE="$CLAVE" app node -e \
  "import('bcryptjs').then((b) => (b.hash ?? b.default.hash)(process.env.CLAVE, 10)).then((h) => console.log(h))")"

compose exec -T db psql -q -U "$(valor DB_USER)" -d "$(valor DB_NAME)" -v ON_ERROR_STOP=1 \
  -v nombre="$NOMBRE" -v email="$CORREO" -v hash="$HASH" <<'SQL'
INSERT INTO usuario (nombre, email, contrasena_hash, rol, activo)
VALUES (:'nombre', :'email', :'hash', 'ADMIN', true);
SQL
echo "Administrador $CORREO creado."
