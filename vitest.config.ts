import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      // json-summary genera coverage/coverage-summary.json, que lee el umbral del CI.
      reporter: ['text', 'json-summary', 'html'],
      include: ['src/**/*.ts'],
      // Fuera: pruebas, arranque y scripts, y los archivos declarativos sin lógica
      // (módulos, entidades, DTO, enumeraciones e índices).
      exclude: [
        'src/**/*.spec.ts',
        'src/main.ts',
        'src/semilla.ts',
        'src/scripts/**',
        'src/**/*.module.ts',
        'src/**/*.entity.ts',
        'src/**/*.dto.ts',
        'src/**/*.enum.ts',
        'src/**/index.ts',
      ],
    },
  },
});
