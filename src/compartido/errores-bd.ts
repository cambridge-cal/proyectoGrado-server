import { ConflictException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

export const VIOLACION_UNICA = '23505';
export const VIOLACION_LLAVE_FORANEA = '23503';

export function codigoPg(error: unknown): string | undefined {
  return error instanceof QueryFailedError
    ? (error.driverError as { code?: string }).code
    : undefined;
}

/**
 * Ejecuta una operación y traduce las violaciones de UNIQUE y de llave foránea
 * (RNF-19, ON DELETE RESTRICT) a 409 Conflict con un mensaje claro.
 */
export async function conRestricciones<T>(
  operacion: () => Promise<T>,
  mensajes: { unico?: string; enUso?: string },
): Promise<T> {
  try {
    return await operacion();
  } catch (error) {
    const codigo = codigoPg(error);
    if (codigo === VIOLACION_UNICA && mensajes.unico) {
      throw new ConflictException(mensajes.unico);
    }
    if (codigo === VIOLACION_LLAVE_FORANEA && mensajes.enUso) {
      throw new ConflictException(mensajes.enUso);
    }
    throw error;
  }
}

/** Escapa los comodines de ILIKE en un texto de búsqueda. */
export function patronBusqueda(texto: string): string {
  return `%${texto.replace(/[\\%_]/g, '\\$&')}%`;
}
