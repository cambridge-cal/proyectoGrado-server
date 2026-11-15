# Sistema CAL · Servidor

API REST del Sistema CAL, el software de generación automática de horarios con inteligencia artificial y evaluación docente para Cambridge Academy of Languages. Es parte del proyecto de grado del programa de Ingeniería de Software de la Universidad Cooperativa de Colombia, sede San Juan de Pasto.

## Tecnologías

- Node.js 24 LTS y NestJS
- PostgreSQL 15 en Docker, con TypeORM
- JWT y bcrypt para autenticación
- Algoritmo Genético y Búsqueda Tabú para la optimización de horarios
- API de Gemini 2.5 Flash (`@google/genai`) para la validación semántica

## Requisitos

- Node.js 24 o superior (`node -v`)
- Docker Desktop

## Puesta en marcha

1. Instala las dependencias:

   ```bash
   npm install
   ```

2. Crea tu archivo de variables de entorno a partir del ejemplo:

   ```bash
   cp .env.example .env
   ```

   En PowerShell: `Copy-Item .env.example .env`

   Completa como mínimo `DB_PASSWORD`, `JWT_SECRET`, `JWT_REFRESH_SECRET` y `SEMILLA_CONTRASENA`. Los dos secretos JWT deben ser distintos y tener al menos 32 caracteres; genera cada uno con:

   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```

3. Levanta PostgreSQL en Docker:

   ```bash
   docker compose up -d
   ```

4. Crea los usuarios de prueba (administrador, docente y estudiante, todos con la contraseña `SEMILLA_CONTRASENA`):

   ```bash
   npm run semilla
   ```

   | Rol | Email |
   |---|---|
   | Administrador | admin@cambridge.edu.co |
   | Docente | docente@cambridge.edu.co |
   | Estudiante | estudiante@cambridge.edu.co |

5. Inicia el servidor:

   ```bash
   npm run start:dev
   ```

6. Verifica:
   - Estado del servidor: <http://localhost:3000/api/salud>
   - Documentación Swagger: <http://localhost:3000/api/docs>

### Validación con Gemini

Para que los horarios pasen por la validación semántica, pon en `.env` la clave en `GEMINI_API_KEY` (se obtiene en <https://aistudio.google.com/apikey>). El modelo por defecto es `gemini-2.5-flash`, que funciona en el plan gratuito. Sin clave el sistema funciona igual y guarda los horarios como no validados (RNF-18).

### Correo de recuperación de contraseña

El enlace de "¿Olvidaste tu contraseña?" (RF-04) se envía por el SMTP de Gmail. Para activarlo, en `.env` pon el correo de la cuenta en `SMTP_USER` y en `SMTP_PASS` una contraseña de aplicación de Google (<https://myaccount.google.com/apppasswords>, requiere la verificación en dos pasos). Mientras `SMTP_USER` esté vacío, en desarrollo el enlace aparece en la consola del servidor.

En desarrollo (`NODE_ENV=development`) TypeORM sincroniza el esquema automáticamente. En producción la sincronización está desactivada.

## Estructura

```
src/
├── configuracion/   Validación de variables de entorno
├── seguridad/       Autenticación JWT, roles y auditoría (RF-01 a RF-08)
├── horarios/        Datos académicos, motor de IA e inscripción (RF-09 a RF-27)
├── evaluacion/      Formularios, evaluaciones, KDD y alertas (RF-28 a RF-44)
├── app.module.ts
└── main.ts
docs/diagramas/      Código fuente de las 17 figuras de la tesis
```

## Scripts

| Comando | Uso |
|---|---|
| `npm run start:dev` | Servidor en modo desarrollo con recarga automática |
| `npm run build` | Compila a `dist/` |
| `npm run semilla` | Crea los usuarios de prueba (solo en desarrollo) |
| `npm run test` | Pruebas unitarias |
| `npm run test:cov` | Pruebas unitarias con cobertura |
| `npm run test:cov:total` | Unitarias y e2e juntas con cobertura; es lo que mide el CI |
| `npm run test:e2e` | Pruebas de extremo a extremo (requieren la base de datos) |
| `npm run lint` | Análisis estático |

## Documentación

- API: Swagger en <http://localhost:3000/api/docs>, con todos los endpoints descritos (RNF-22)
- Guía de uso para el Administrador: [`docs/guia-administrador.md`](docs/guia-administrador.md)
- Despliegue en producción: [`docs/produccion.md`](docs/produccion.md)
- Integración y despliegue continuos: [`docs/ci-cd.md`](docs/ci-cd.md)
- Protección de datos personales: [`docs/cumplimiento-datos-personales.md`](docs/cumplimiento-datos-personales.md)
- QA de regresión: [`docs/qa-regresion.md`](docs/qa-regresion.md)
- Rendimiento del motor de IA: [`docs/rendimiento-motor.md`](docs/rendimiento-motor.md)
- Diagramas del sistema: [`docs/diagramas`](docs/diagramas/README.md)
- Forma de trabajo, ramas y commits: [`CONTRIBUTING.md`](CONTRIBUTING.md)

## Autores

- Danilo Andrés Montezuma Ibarra
- Juan José Burbano Bolaños
