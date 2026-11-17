import type { MigrationInterface } from 'typeorm';
import { Inicial1794861475363 } from './1794861475363-Inicial.js';

/** Migraciones del esquema, en orden. En producción se aplican al arrancar el servidor. */
export const MIGRACIONES: Array<new () => MigrationInterface> = [
  Inicial1794861475363,
];
