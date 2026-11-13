import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Todas las suites comparten una base de datos y cada una sincroniza el esquema al
    // arrancar: en paralelo chocan al crear las tablas (deadlock, tipos duplicados).
    fileParallelism: false,
  },
});
