import type { ParametrosMotor } from './tipos.js';

/** Valores de la sección 6.3.1 y RF-17. */
export const PARAMETROS_POR_DEFECTO: ParametrosMotor = {
  poblacion: 50,
  generaciones: 100,
  tasaCruce: 0.8,
  tasaMutacion: 0.1,
  iteracionesTabu: 50,
  tamanoTabu: 20,
  vecinosPorIteracion: 200,
  maxIntentos: 3,
};

/** Variable de entorno de cada parámetro (RNF-30: se ajustan sin recompilar). */
export const VARIABLES_MOTOR: Record<
  keyof Omit<ParametrosMotor, 'semilla'>,
  string
> = {
  poblacion: 'MOTOR_POBLACION',
  generaciones: 'MOTOR_GENERACIONES',
  tasaCruce: 'MOTOR_TASA_CRUCE',
  tasaMutacion: 'MOTOR_TASA_MUTACION',
  iteracionesTabu: 'MOTOR_ITERACIONES_TABU',
  tamanoTabu: 'MOTOR_TAMANO_TABU',
  vecinosPorIteracion: 'MOTOR_VECINOS_TABU',
  maxIntentos: 'MOTOR_MAX_INTENTOS',
};

const LIMITES: Record<keyof typeof VARIABLES_MOTOR, [number, number, boolean]> =
  {
    // [mínimo, máximo, debe ser entero]
    poblacion: [4, 1000, true],
    generaciones: [1, 10000, true],
    tasaCruce: [0, 1, false],
    tasaMutacion: [0, 1, false],
    iteracionesTabu: [0, 10000, true],
    tamanoTabu: [1, 1000, true],
    vecinosPorIteracion: [1, 10000, true],
    maxIntentos: [1, 20, true],
  };

/**
 * Lee los parámetros del motor de las variables de entorno. Las que no estén
 * definidas toman el valor por defecto; las inválidas detienen el arranque con un mensaje claro.
 */
export function leerParametros(
  leer: (clave: string) => string | undefined,
): ParametrosMotor {
  const parametros = { ...PARAMETROS_POR_DEFECTO };
  for (const [campo, variable] of Object.entries(VARIABLES_MOTOR) as [
    keyof typeof VARIABLES_MOTOR,
    string,
  ][]) {
    const texto = leer(variable);
    if (texto === undefined || texto.trim() === '') continue;
    const valor = Number(texto);
    const [minimo, maximo, entero] = LIMITES[campo];
    if (
      !Number.isFinite(valor) ||
      valor < minimo ||
      valor > maximo ||
      (entero && !Number.isInteger(valor))
    ) {
      throw new Error(
        `${variable} debe ser ${entero ? 'un entero' : 'un número'} entre ${minimo} y ${maximo}.`,
      );
    }
    parametros[campo] = valor;
  }
  const semilla = leer('MOTOR_SEMILLA');
  if (semilla) parametros.semilla = Number(semilla);
  return parametros;
}
