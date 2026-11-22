# Ambiente de producción

Guía para desplegar el Sistema CAL en producción, cumpliendo RNF-07 (TLS 1.2+), RNF-17 (disponibilidad) y RNF-28 (sin sincronización de esquema).

## Dónde está desplegado

El sistema corre en una máquina virtual de **Azure for Students** (crédito de USD 100 por 12 meses, sin tarjeta):

| Recurso | Valor |
|---------|-------|
| Grupo de recursos | `rg-sistema-cal` |
| Máquina | `vm-sistema-cal`, Ubuntu 24.04, tamaño B2ats v2 (2 vCPU, 1 GB de RAM, incluido en las 750 h gratis al mes) |
| Región | West US 2 (la suscripción de estudiante no permite el tamaño gratuito en East US, Central US ni Brazil South) |
| Disco | 64 GB Premium SSD (P6, incluido en el plan gratuito) más 2 GB de swap |
| Dirección | `https://sistema-cal.westus2.cloudapp.azure.com` (IP pública fija, unos USD 3 a 4 al mes del crédito) |
| Puertos abiertos | 22 (SSH), 80 y 443 |

En la máquina corren tres contenedores con Docker Compose ([`despliegue/docker-compose.yml`](../despliegue/docker-compose.yml)):

- `web`: Caddy. Sirve el cliente React compilado, reenvía `/api` a la API y obtiene y renueva solo el certificado de Let's Encrypt (TLS 1.2 o superior).
- `app`: esta API NestJS. Aplica las migraciones pendientes al arrancar.
- `db`: PostgreSQL 15 con un volumen persistente. No expone puertos fuera de la máquina.

Como el cliente y la API comparten dominio, el cliente se compila con `VITE_API_URL=/api` y no hay peticiones entre orígenes. La API confía en `X-Forwarded-For` solo cuando viene de una red privada (el proxy), así el límite de peticiones cuenta por cliente.

### Estructura en el servidor

```
/opt/sistema-cal/
├── .env          variables de producción (permisos 600, nunca en el repositorio)
├── servidor/     clon de proyectoGrado-server
└── cliente/      clon de proyectoGrado-client (incluye Dockerfile y Caddyfile)
```

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
| `GEMINI_API_KEY` | Clave de API de Gemini para validación semántica (formato `AIza`; las claves `AQ.` dan 401) |
| `GEMINI_MODEL` | Modelo de Gemini. En producción: `gemini-3.5-flash` |

## Sincronización de esquema

TypeORM **nunca** sincroniza automáticamente el esquema en producción:

```typescript
synchronize: config.get<string>('NODE_ENV') === 'development',
```

Con `NODE_ENV=production` el servidor aplica las migraciones pendientes al iniciar (`migrationsRun`). Ver [migraciones.md](migraciones.md).

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

### Opción 2: Reverse proxy (en uso)

Si hay un reverse proxy (Nginx, Caddy) delante del servidor, dejar `TLS_CERT_PATH` y `TLS_KEY_PATH` vacías. El proxy termina TLS y reenvía tráfico HTTP al puerto de Node.js.

Es la opción en uso: Caddy termina TLS con el certificado de Let's Encrypt para el dominio de Azure. Su configuración está en el `Caddyfile` de proyectoGrado-client.

## Actualizar la versión desplegada

Con cada push a `main`, el workflow CD publica la imagen en GHCR y, si la variable del repositorio `DEPLOY_HABILITADO` vale `true`, entra por SSH y ejecuta [`despliegue/actualizar.sh`](../despliegue/actualizar.sh). El script descarga `main` de los dos repositorios, reconstruye las imágenes, levanta los servicios y espera a que `/api/salud` responda.

Secretos del repositorio que usa el job `deploy`:

| Secreto | Valor |
|---------|-------|
| `DEPLOY_HOST` | `sistema-cal.westus2.cloudapp.azure.com` |
| `DEPLOY_USER` | `azureuser` |
| `DEPLOY_KEY` | Clave privada SSH de despliegue (su clave pública está en `~/.ssh/authorized_keys` del servidor) |

A mano, desde el servidor:

```bash
/opt/sistema-cal/servidor/despliegue/actualizar.sh
# Otra rama, por ejemplo para probar un PR:
RAMA_SERVIDOR=feature/TKT-052-franjas-por-bloques /opt/sistema-cal/servidor/despliegue/actualizar.sh
```

## Primer Administrador

La semilla solo corre en desarrollo. En producción el primer Administrador se crea en el servidor con:

```bash
/opt/sistema-cal/servidor/despliegue/crear-admin.sh
```

El script pide nombre, correo y contraseña (la contraseña no se muestra), calcula el hash con bcrypt igual que la API y crea el usuario. Desde ahí, el Administrador crea a los demás usuarios en la aplicación.

## Operación

```bash
cd /opt/sistema-cal
alias cal='docker compose --env-file .env -f servidor/despliegue/docker-compose.yml'
cal ps                 # estado de los contenedores
cal logs -f app        # log de la API
cal restart app        # reiniciar la API tras cambiar .env
# Copia de seguridad de la base de datos
cal exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > respaldo-$(date +%F).sql.gz
```

Para apagar la máquina sin gastar horas (por ejemplo en vacaciones): `az vm deallocate -g rg-sistema-cal -n vm-sistema-cal`, y para encenderla `az vm start`. La IP fija y el dominio se conservan.

## Instalación desde cero

1. Crear la máquina (desde Azure Cloud Shell):
   ```bash
   az group create -n rg-sistema-cal -l westus2
   az vm create -g rg-sistema-cal -n vm-sistema-cal --image Ubuntu2404 --size Standard_B2ats_v2 \
     --admin-username azureuser --generate-ssh-keys --os-disk-size-gb 64 --storage-sku Premium_LRS \
     --public-ip-sku Standard --public-ip-address-dns-name sistema-cal --security-type TrustedLaunch
   az vm open-port -g rg-sistema-cal -n vm-sistema-cal --port 80,443 --priority 900
   ```
2. En la máquina, agregar swap de 2 GB e instalar Docker (`curl -fsSL https://get.docker.com | sh`), y agregar `azureuser` al grupo `docker`.
3. Clonar los dos repositorios en `/opt/sistema-cal/servidor` y `/opt/sistema-cal/cliente`.
4. Crear `/opt/sistema-cal/.env` con permisos 600: las variables obligatorias de arriba más `DOMINIO`. `DB_HOST`, `DB_PORT` y `NODE_ENV` los fija el compose. Los secretos JWT y la contraseña de la base se generan con `openssl rand -base64 48`.
5. Ejecutar `despliegue/actualizar.sh` y luego `despliegue/crear-admin.sh`.
6. Verificar que `https://<dominio>/api/salud` responde `{"estado":"ok"}`.

## Prueba de humo en producción (TKT-048)

Resultado del 22 de noviembre de 2026, con los datos de la academia cargados por API (8 franjas, 18 niveles, 55 cursos, 70 aulas, 32 docentes y 39 grupos):

| Comprobación | Resultado |
|--------------|-----------|
| `GET /api/salud` por HTTPS | 200 `{"estado":"ok"}` en 143 ms |
| Certificado | Let's Encrypt emitido y renovado por Caddy |
| Cabeceras | HSTS, `X-Content-Type-Options: nosniff`, CSP y `X-Frame-Options` de Helmet; sin cabecera `Server` |
| Rutas del cliente | Una ruta inexistente devuelve `index.html` (200) y React Router la resuelve |
| Documentación de la API | `/api/docs` responde 200 |
| Migraciones | Se aplicaron solas al primer arranque (`migrationsRun`) |
| Carga de datos | 35 de 35 comprobaciones de las reglas de la academia |
| Generación de horario | 39 de 39 grupos, aptitud 1,00, 24 s en total con la validación de Gemini (`gemini-3.5-flash`), estado "Validado por Gemini" |
| Auditoría | Registra la generación con la IP pública del cliente (el proxy la reenvía bien) |
| Pantallas del Administrador | Dashboard, Horarios, Usuarios y Auditoría cargan con los datos reales |
