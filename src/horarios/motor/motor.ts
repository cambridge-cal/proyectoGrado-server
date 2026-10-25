import { Aleatorio } from './aleatorio.js';
import { ejecutarAlgoritmoGenetico } from './algoritmo-genetico.js';
import { ejecutarBusquedaTabu } from './busqueda-tabu.js';
import { Problema } from './problema.js';
import type {
  Cromosoma,
  Evaluacion,
  InstanciaMotor,
  ParametrosMotor,
  TipoViolacion,
} from './tipos.js';

export interface IntentoMotor {
  intento: number;
  parametros: Pick<
    ParametrosMotor,
    'poblacion' | 'generaciones' | 'tasaMutacion'
  >;
  aptitudAG: number;
  aptitudTabu: number;
  violacionesDuras: number;
  generaciones: number;
  iteracionesTabu: number;
}

export interface ResultadoMotor {
  /** true si el horario cumple todas las restricciones duras (RF-18). */
  factible: boolean;
  asignaciones: Cromosoma;
  evaluacion: Evaluacion;
  /** Generaciones del AG en el intento que produjo el horario. */
  generaciones: number;
  tiempoEjecucionMs: number;
  intentos: IntentoMotor[];
  /** Cuántas violaciones quedan de cada tipo, para informar al Administrador (Figura 6.4). */
  restriccionesNoSatisfechas: Partial<Record<TipoViolacion, number>>;
}

/**
 * Motor híbrido (sección 6.3.1 y Figura 6.4): AG y luego Búsqueda Tabú. Si el mejor
 * horario incumple alguna restricción dura, ajusta los parámetros (más generaciones,
 * más mutación y más población) y repite hasta `maxIntentos`. Si se agotan los intentos,
 * devuelve el mejor horario encontrado con `factible = false` y las restricciones no satisfechas.
 */
export function generarHorario(
  instancia: InstanciaMotor,
  parametros: ParametrosMotor,
): ResultadoMotor {
  const inicio = performance.now();
  const problema = new Problema(instancia);
  const aleatorio = new Aleatorio(parametros.semilla ?? Date.now());
  const intentos: IntentoMotor[] = [];
  let mejor: {
    asignaciones: Cromosoma;
    evaluacion: Evaluacion;
    generaciones: number;
  } | null = null;
  let actuales = {
    poblacion: parametros.poblacion,
    generaciones: parametros.generaciones,
    tasaMutacion: parametros.tasaMutacion,
  };

  for (let intento = 1; intento <= parametros.maxIntentos; intento++) {
    const ag = ejecutarAlgoritmoGenetico(
      problema,
      { ...parametros, ...actuales },
      aleatorio,
    );
    const tabu = ejecutarBusquedaTabu(
      problema,
      ag.mejor,
      parametros,
      aleatorio,
    );

    intentos.push({
      intento,
      parametros: { ...actuales },
      aptitudAG: ag.evaluacion.aptitud,
      aptitudTabu: tabu.evaluacion.aptitud,
      violacionesDuras: tabu.evaluacion.violacionesDuras,
      generaciones: ag.generaciones,
      iteracionesTabu: tabu.iteraciones,
    });
    if (!mejor || tabu.evaluacion.aptitud > mejor.evaluacion.aptitud) {
      mejor = {
        asignaciones: tabu.mejor,
        evaluacion: tabu.evaluacion,
        generaciones: ag.generaciones,
      };
    }
    if (mejor.evaluacion.violacionesDuras === 0) break;

    // Ajuste de parámetros para el siguiente intento.
    actuales = {
      poblacion: Math.round(actuales.poblacion * 1.2),
      generaciones: Math.round(actuales.generaciones * 1.5),
      tasaMutacion: Math.min(0.5, actuales.tasaMutacion + 0.1),
    };
  }

  const resultado = mejor!;
  const restriccionesNoSatisfechas: Partial<Record<TipoViolacion, number>> = {};
  for (const violacion of resultado.evaluacion.violaciones) {
    restriccionesNoSatisfechas[violacion.tipo] =
      (restriccionesNoSatisfechas[violacion.tipo] ?? 0) + 1;
  }
  return {
    factible: resultado.evaluacion.violacionesDuras === 0,
    asignaciones: resultado.asignaciones,
    evaluacion: resultado.evaluacion,
    generaciones: resultado.generaciones,
    tiempoEjecucionMs: Math.round(performance.now() - inicio),
    intentos,
    restriccionesNoSatisfechas,
  };
}
