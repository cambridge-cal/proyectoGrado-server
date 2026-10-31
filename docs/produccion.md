# Ambiente de producción

Guía para desplegar el Sistema CAL en producción, cumpliendo RNF-07 (TLS 1.2+), RNF-17 (disponibilidad) y RNF-28 (sin sincronización de esquema).

## Variables de entorno obligatorias

En producción (`NODE_ENV=production`) el servidor valida al arrancar:

| Variable | Descripción |
|----------|-------------|
| `NODE_ENV` | `production` |
| `DB_HOST` | Host de PostgreSQL |
| `DB_PORT` | Puerto de PostgreSQL |
| `DB_USER` | Usuario de PostgreSQL |
| `DB_PASSWORD` | Contraseña de PostgreSQL |
| `DB_NAME` | Nombre de la base de datos |
| `CORS_ORIGINS` | Orígenes permitidos, separados por coma |
| `JWT_SECRET` | Secreto para Access Token (≥ 32 caracteres) |
| `JWT_REFRESH_SECRET` | Secreto para Refresh Token (≥ 32 caracteres, distinto al anterior) |
| `SMTP_USER` | Correo de Gmail para envío SMTP |
| `SMTP_PASS` | Contraseña de aplicación de Gmail |
| `URL_CLIENTE` | URL del frontend (para enlace de recuperación de contraseña) |
| `GEMINI_API_KEY` | Clave de API de Gemini para validación semántica |

## Sincronización de esquema

TypeORM **nunca** sincroniza automáticamente el esquema en producción:

```typescript
synchronize: config.get<string>('NODE_ENV') === 'development',
```

Las migraciones en producción deben ejecutarse manualmente con TypeORM CLI.

## TLS 1.2 o superior (RNF-07)

### Opción 1: TLS directo en Node.js

Cuando el servidor atiende HTTPS directamente (sin reverse proxy), se definen:

| Variable | Descripción |
|----------|-------------|
| `TLS_CERT_PATH` | Ruta al archivo PEM del certificado (fullchain) |
| `TLS_KEY_PATH` | Ruta al archivo PEM de la clave privada |

El servidor arranca con HTTPS y `minVersion: 'TLSv1.2'`. Ambas variables deben definirse juntas o ninguna.

```bash
# Ejemplo con Let's Encrypt
TLS_CERT_PATH=/etc/letsencrypt/live/cal.cambridge.edu.co/fullchain.pem
TLS_KEY_PATH=/etc/letsencrypt/live/cal.cambridge.edu.co/privkey.pem
```

### Opción 2: Reverse proxy (recomendado)

Si hay un reverse proxy (Nginx, Caddy) delante del servidor, dejar `TLS_CERT_PATH` y `TLS_KEY_PATH` vacías. El proxy termina TLS y reenvía tráfico HTTP al puerto de Node.js.

Ejemplo mínimo de Nginx:

```nginx
server {
    listen 443 ssl;
    server_name cal.cambridge.edu.co;

    ssl_certificate     /etc/letsencrypt/live/cal.cambridge.edu.co/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/cal.cambridge.edu.co/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Docker Compose de producción

```yaml
# docker-compose.prod.yml — ejecutar con: docker compose -f docker-compose.prod.yml up -d
services:
  app:
    image: ghcr.io/cambridge-cal/proyectogrado-server:latest
    restart: unless-stopped
    env_file: .env
    ports:
      - "${PORT:-3000}:3000"
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:15-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: ${DB_NAME}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
```

## Checklist de despliegue

1. Clonar el repositorio o descargar la imagen Docker de GHCR.
2. Copiar `.env.example` como `.env` y completar **todas** las variables obligatorias con `NODE_ENV=production`.
3. Generar los secretos JWT:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```
4. Configurar TLS (opción 1 o 2 según la infraestructura).
5. Levantar los servicios: `docker compose -f docker-compose.prod.yml up -d`.
6. Ejecutar las migraciones de base de datos (cuando se implementen).
7. Verificar que `/api/salud` responde `{"estado":"ok"}` por HTTPS.
