import { DataSource } from 'typeorm';
import { ENTIDADES_EVALUACION } from '../evaluacion/entidades/index.js';
import { ENTIDADES_HORARIOS } from '../horarios/entidades/index.js';
import { MIGRACIONES } from '../migraciones/index.js';
import { ENTIDADES_SEGURIDAD } from '../seguridad/entidades/index.js';

export const ENTIDADES = [
  ...ENTIDADES_SEGURIDAD,
  ...ENTIDADES_HORARIOS,
  ...ENTIDADES_EVALUACION,
];

try {
  process.loadEnvFile();
} catch {
  // Sin archivo .env las variables DB_* ya vienen del entorno (CI, producción).
}

/** Fuente de datos del CLI de TypeORM: la usan los comandos `npm run migracion:*`. */
export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: ENTIDADES,
  migrations: MIGRACIONES,
});
