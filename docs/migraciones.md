# Migraciones de la base de datos

En desarrollo (`NODE_ENV=development`) TypeORM sincroniza el esquema con las entidades. En producción la sincronización está desactivada (RNF-28), así que las tablas se crean y se actualizan con migraciones.

## En producción

El servidor aplica las migraciones pendientes al arrancar (`migrationsRun`). Con una base de datos vacía, el primer arranque crea todas las tablas; los siguientes no hacen nada si no hay migraciones nuevas. No hay que ejecutar ningún comando en el servidor.

El usuario de la base de datos necesita permiso para crear la extensión `uuid-ossp`, o un administrador debe crearla antes del primer arranque.

## Cuando cambia una entidad

La base de datos de desarrollo no sirve para generar la migración, porque la sincronización ya le aplicó el cambio. Se usa una base de datos aparte, que solo tiene las migraciones:

```bash
docker compose exec db createdb -U "$DB_USER" cal_migraciones
DB_NAME=cal_migraciones npm run migracion:ejecutar
DB_NAME=cal_migraciones npm run migracion:generar -- src/migraciones/NombreDelCambio
```

Después agrega la clase nueva al final de la lista de [`src/migraciones/index.ts`](../src/migraciones/index.ts), revisa el SQL generado y súbelo en el mismo PR que la entidad.

La suite `test/migraciones.e2e-spec.ts` aplica todas las migraciones en una base de datos temporal y falla si el resultado no coincide con las entidades, así que un cambio de entidad sin migración no pasa el CI.

## Comandos

| Comando | Uso |
|---|---|
| `npm run migracion:generar -- src/migraciones/Nombre` | Genera una migración con la diferencia entre las entidades y la base de datos |
| `npm run migracion:ejecutar` | Aplica las migraciones pendientes |
| `npm run migracion:revertir` | Revierte la última migración aplicada |

Los tres usan las variables `DB_*` del archivo `.env`.
