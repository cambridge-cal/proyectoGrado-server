/**
 * Validación de variables de entorno al arrancar (RNF-23 y RNF-28).
 * Si falta una variable obligatoria el servidor no inicia y lo indica.
 */
const OBLIGATORIAS = [
  'DB_HOST',
  'DB_PORT',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
  'CORS_ORIGINS',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
] as const;

/** Longitud mínima de los secretos JWT: 32 caracteres, 256 bits para HMAC-SHA256 (RNF-06). */
const LONGITUD_MINIMA_SECRETO = 32;

const ENTORNOS = ['development', 'production', 'test'] as const;

export function validarEntorno(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const faltantes = OBLIGATORIAS.filter((clave) => {
    const valor = config[clave];
    return valor === undefined || valor === null || String(valor).trim() === '';
  });
  if (faltantes.length > 0) {
    throw new Error(
      `Faltan variables de entorno obligatorias: ${faltantes.join(', ')}. Copia .env.example como .env y complétalo.`,
    );
  }

  const nodeEnv = String(config.NODE_ENV ?? 'development');
  if (!(ENTORNOS as readonly string[]).includes(nodeEnv)) {
    throw new Error(`NODE_ENV debe ser uno de: ${ENTORNOS.join(', ')}.`);
  }

  for (const clave of ['JWT_SECRET', 'JWT_REFRESH_SECRET'] as const) {
    if (String(config[clave]).length < LONGITUD_MINIMA_SECRETO) {
      throw new Error(
        `${clave} debe tener al menos ${LONGITUD_MINIMA_SECRETO} caracteres.`,
      );
    }
  }
  if (config.JWT_SECRET === config.JWT_REFRESH_SECRET) {
    throw new Error('JWT_SECRET y JWT_REFRESH_SECRET deben ser distintos.');
  }

  const puertoBd = Number(config.DB_PORT);
  if (!Number.isInteger(puertoBd) || puertoBd <= 0) {
    throw new Error('DB_PORT debe ser un número entero positivo.');
  }

  return {
    ...config,
    NODE_ENV: nodeEnv,
    DB_PORT: puertoBd,
    PORT: Number(config.PORT ?? 3000),
  };
}

/** Orígenes permitidos para CORS, separados por coma (RNF-09). */
export function origenesCors(valor: string | undefined): string[] {
  return (valor ?? '')
    .split(',')
    .map((origen) => origen.trim())
    .filter((origen) => origen.length > 0);
}
