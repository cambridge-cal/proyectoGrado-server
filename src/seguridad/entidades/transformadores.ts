import type { ValueTransformer } from 'typeorm';

/** Guarda el email sin espacios y en minúsculas para que la restricción UNIQUE no dependa de mayúsculas. */
export const emailNormalizado: ValueTransformer = {
  to: (valor: string | null | undefined) =>
    typeof valor === 'string' ? valor.trim().toLowerCase() : valor,
  from: (valor: string | null) => valor,
};
