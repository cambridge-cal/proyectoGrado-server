import type { Aleatorio } from './aleatorio.js';
import { aptitudMaxima, evaluar } from './aptitud.js';
import type { Problema } from './problema.js';
import type { Cromosoma, Evaluacion, ParametrosMotor } from './tipos.js';

export interface ResultadoTabu {
  mejor: Cromosoma;
  evaluacion: Evaluacion;
  iteraciones: number;
  historial: number[];
}

interface Movimiento {
  vecino: Cromosoma;
  evaluacion: Evaluacion;
  /** Atributo del movimiento que se consulta en la lista tabú. */
  clave: string;
  /** Atributo que desharía el movimiento; es lo que entra a la lista tabú. */
  regreso: string;
}

/** Intercambio: el par de asignaciones, sin importar el orden. */
const claveIntercambio = (i: number, j: number) =>
  i < j ? `${i}-${j}` : `${j}-${i}`;
/** Reubicación: la asignación y la franja a la que llega. */
const claveReubicacion = (i: number, franjaId: string) => `${i}@${franjaId}`;

const copiar = (cromosoma: Cromosoma) => cromosoma.map((gen) => ({ ...gen }));

/**
 * Segunda fase del motor (sección 6.3.1): Búsqueda Tabú sobre el mejor cromosoma del AG.
 * 50 iteraciones; en cada una se genera una vecindad con dos tipos de movimiento:
 *   - intercambio de la franja y el aula entre un par de asignaciones;
 *   - reubicación de una asignación en conflicto en otra franja disponible del docente y otra aula.
 * Se toma el mejor vecino que no esté en la lista tabú de 20 movimientos (Glover, 1989),
 * aunque sea peor que el actual, para salir de óptimos locales. Un movimiento tabú se acepta
 * solo si mejora la mejor solución encontrada (criterio de aspiración).
 */
export function ejecutarBusquedaTabu(
  problema: Problema,
  inicial: Cromosoma,
  parametros: Pick<
    ParametrosMotor,
    'iteracionesTabu' | 'tamanoTabu' | 'vecinosPorIteracion'
  >,
  aleatorio: Aleatorio,
): ResultadoTabu {
  let actual = inicial;
  let evaluacionActual = evaluar(actual, problema.indices);
  let mejor = actual;
  let evaluacionMejor = evaluacionActual;
  const tabu: string[] = [];
  const historial = [evaluacionMejor.aptitud];
  const maxima = aptitudMaxima(inicial);
  let iteracion = 0;

  for (
    ;
    iteracion < parametros.iteracionesTabu && evaluacionMejor.aptitud < maxima;
    iteracion++
  ) {
    // Se privilegian los movimientos que tocan una asignación en conflicto.
    const conflictivas = [
      ...new Set(evaluacionActual.violaciones.flatMap((v) => v.asignaciones)),
    ];
    let elegido: Movimiento | null = null;

    for (let k = 0; k < parametros.vecinosPorIteracion; k++) {
      const movimiento = generarMovimiento(
        problema,
        actual,
        conflictivas,
        aleatorio,
      );
      if (!movimiento) continue;
      const evaluacion = evaluar(movimiento.vecino, problema.indices);
      const permitido =
        !tabu.includes(movimiento.clave) ||
        evaluacion.aptitud > evaluacionMejor.aptitud;
      if (
        permitido &&
        (!elegido || evaluacion.aptitud > elegido.evaluacion.aptitud)
      ) {
        elegido = { ...movimiento, evaluacion };
      }
    }
    if (!elegido) break;

    actual = elegido.vecino;
    evaluacionActual = elegido.evaluacion;
    tabu.push(elegido.regreso);
    if (tabu.length > parametros.tamanoTabu) tabu.shift();

    if (evaluacionActual.aptitud > evaluacionMejor.aptitud) {
      mejor = actual;
      evaluacionMejor = evaluacionActual;
    }
    historial.push(evaluacionMejor.aptitud);
  }

  return {
    mejor,
    evaluacion: evaluacionMejor,
    iteraciones: iteracion,
    historial,
  };
}

function generarMovimiento(
  problema: Problema,
  actual: Cromosoma,
  conflictivas: number[],
  aleatorio: Aleatorio,
): Omit<Movimiento, 'evaluacion'> | null {
  const enConflicto = conflictivas.length > 0 && aleatorio.probabilidad(0.8);
  const i = enConflicto
    ? aleatorio.elegir(conflictivas)
    : aleatorio.entero(actual.length);

  if (enConflicto && aleatorio.probabilidad(0.5)) {
    const gen = actual[i];
    const bloque = problema.bloquePorGrupo.get(gen.grupoId)!;
    const disponibles = [
      ...(problema.indices.docentes.get(gen.docenteId)?.franjasDisponibles ??
        []),
    ];
    const franjaId = disponibles.length
      ? aleatorio.elegir(disponibles)
      : aleatorio.elegir(problema.franjas);
    const vecino = copiar(actual);
    vecino[i].franjaId = franjaId;
    vecino[i].aulaId = aleatorio.elegir(bloque.aulas);
    return {
      vecino,
      clave: claveReubicacion(i, franjaId),
      regreso: claveReubicacion(i, gen.franjaId),
    };
  }

  const j = aleatorio.entero(actual.length);
  if (i === j) return null;
  const vecino = copiar(actual);
  [vecino[i].franjaId, vecino[j].franjaId] = [
    vecino[j].franjaId,
    vecino[i].franjaId,
  ];
  [vecino[i].aulaId, vecino[j].aulaId] = [vecino[j].aulaId, vecino[i].aulaId];
  const clave = claveIntercambio(i, j);
  return { vecino, clave, regreso: clave };
}
