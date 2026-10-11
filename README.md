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

```bash
npm install
npm run start:dev
```

## Scripts

| Comando | Uso |
|---|---|
| `npm run start:dev` | Servidor en modo desarrollo con recarga automática |
| `npm run build` | Compila a `dist/` |
| `npm run test` | Pruebas unitarias |
| `npm run test:cov` | Pruebas con cobertura |
| `npm run lint` | Análisis estático |

## Documentación

- Diagramas del sistema: [`docs/diagramas`](docs/diagramas/README.md)
- Forma de trabajo, ramas y commits: [`CONTRIBUTING.md`](CONTRIBUTING.md)

## Autores

- Danilo Andrés Montezuma Ibarra
- Juan José Burbano Bolaños
