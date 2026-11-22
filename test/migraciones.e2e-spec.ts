import { INestApplication } from '@nestjs/common';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { ENTIDADES_EVALUACION } from '../src/evaluacion/entidades/index.js';
import { ENTIDADES_HORARIOS } from '../src/horarios/entidades/index.js';
import { MIGRACIONES } from '../src/migraciones/index.js';
import { ENTIDADES_SEGURIDAD } from '../src/seguridad/entidades/index.js';
import { crearApp } from './utilidades.js';

// Requiere la base de datos de docker compose en ejecución y un archivo .env.
// Usa una base de datos temporal en el mismo servidor, que crea y elimina la propia suite.
describe('Migraciones del esquema (e2e)', () => {
  let app: INestApplication;
  let fuente: DataSource;
  let temporal: DataSource | undefined;
  const nombre = `cal_migraciones_${Date.now()}`;

  beforeAll(async () => {
    ({ app, fuente } = await crearApp());
    await fuente.query(`CREATE DATABASE "${nombre}"`);
    temporal = await new DataSource({
      ...fuente.options,
      database: nombre,
      entities: [
        ...ENTIDADES_SEGURIDAD,
        ...ENTIDADES_HORARIOS,
        ...ENTIDADES_EVALUACION,
      ],
      migrations: MIGRACIONES,
      migrationsRun: false,
      synchronize: false,
    } as DataSourceOptions).initialize();
  });

  afterAll(async () => {
    if (temporal?.isInitialized) await temporal.destroy();
    await fuente.query(`DROP DATABASE IF EXISTS "${nombre}"`);
    await app.close();
  });

  it('crean en una base vacía el mismo esquema que definen las entidades', async () => {
    const aplicadas = await temporal!.runMigrations();
    expect(aplicadas).toHaveLength(MIGRACIONES.length);

    const pendiente = await temporal!.driver.createSchemaBuilder().log();
    expect(
      pendiente.upQueries.map((consulta) => consulta.query),
      'Las entidades cambiaron sin migración: npm run migracion:generar -- src/migraciones/Nombre',
    ).toEqual([]);
  });

  it('se revierten sin dejar tablas ni tipos', async () => {
    for (let i = 0; i < MIGRACIONES.length; i++) {
      await temporal!.undoLastMigration();
    }
    const tablas = await temporal!.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name <> 'migrations'`,
    );
    expect(tablas).toEqual([]);
    const tipos = await temporal!.query(
      `SELECT t.typname FROM pg_type t
       JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = 'public' AND t.typtype = 'e'`,
    );
    expect(tipos).toEqual([]);
  });
});
