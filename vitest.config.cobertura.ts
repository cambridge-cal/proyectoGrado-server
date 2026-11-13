import { defineConfig, mergeConfig } from 'vitest/config';
import base from './vitest.config.js';

/**
 * Cobertura de todo el servidor: pruebas unitarias y e2e juntas. Los servicios que hablan
 * con PostgreSQL se prueban sobre todo con e2e, así que medir solo las unitarias los
 * cuenta como sin cubrir. Requiere la base de datos, igual que `npm run test:e2e`.
 */
export default mergeConfig(
  base,
  defineConfig({
    test: {
      include: ['**/*.spec.ts', '**/*.e2e-spec.ts'],
      // Las suites e2e comparten una base de datos y sincronizan el esquema al arrancar.
      fileParallelism: false,
    },
  }),
);
