import type { ValueTransformer } from 'typeorm';

/** PostgreSQL devuelve las horas como HH:mm:ss; la API trabaja con HH:mm. */
export const horaCorta: ValueTransformer = {
  to: (valor: string | undefined) => valor,
  from: (valor: string | null) =>
    typeof valor === 'string' ? valor.slice(0, 5) : valor,
};
