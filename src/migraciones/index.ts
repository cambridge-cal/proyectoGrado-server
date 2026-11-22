import type { MigrationInterface } from 'typeorm';
import { Inicial1794861475363 } from './1794861475363-Inicial.js';
import { AutorizacionDatos1794862430359 } from './1794862430359-AutorizacionDatos.js';
import { FranjasPorBloques1794900000000 } from './1794900000000-FranjasPorBloques.js';

/** Migraciones del esquema, en orden. En producción se aplican al arrancar el servidor. */
export const MIGRACIONES: Array<new () => MigrationInterface> = [
  Inicial1794861475363,
  AutorizacionDatos1794862430359,
  FranjasPorBloques1794900000000,
];
