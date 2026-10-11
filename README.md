# Sistema CAL · Servidor

API REST del Sistema CAL, el software de generación automática de horarios con inteligencia artificial y evaluación docente para Cambridge Academy of Languages. Es parte del proyecto de grado del programa de Ingeniería de Software de la Universidad Cooperativa de Colombia, sede San Juan de Pasto.

## Tecnologías

- Node.js 24 LTS y NestJS
- PostgreSQL 15 en Docker, con TypeORM
- JWT y bcrypt para autenticación
- Algoritmo Genético y Búsqueda Tabú para la optimización de horarios
- API de Gemini 3.1 Pro (`@google/genai`) para la validación semántica

## Requisitos

- Node.js 24 o superior (`node -v`)
- Docker Desktop

## Puesta en marcha

1. Instala las dependencias:

   ```bash
   npm install
   ```

2. Crea tu archivo de variables de entorno a partir del ejemplo y completa al menos `DB_PASSWORD`:

   ```bash
   cp .env.example .env
   ```

   En PowerShell: `Copy-Item .env.example .env`

3. Levanta PostgreSQL en Docker:

   ```bash
   docker compose up -d
   ```

4. Inicia el servidor:

   ```bash
   npm run start:dev
   ```

5. Verifica:
   - Estado del servidor: <http://localhost:3000/api/salud>
   - Documentación Swagger: <http://localhost:3000/api/docs>

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
| `npm run test` | Pruebas unitarias |
| `npm run test:cov` | Pruebas con cobertura |
| `npm run test:e2e` | Pruebas de extremo a extremo (requieren la base de datos) |
| `npm run lint` | Análisis estático |

## Documentación

- Diagramas del sistema: [`docs/diagramas`](docs/diagramas/README.md)
- Forma de trabajo, ramas y commits: [`CONTRIBUTING.md`](CONTRIBUTING.md)

## Autores

- Danilo Andrés Montezuma Ibarra
- Juan José Burbano Bolaños
