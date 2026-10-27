import type { Aleatorio } from './aleatorio.js';
import { aptitudMaxima, evaluar } from './aptitud.js';
import type { Problema } from './problema.js';
import type { Cromosoma, Evaluacion, ParametrosMotor } from './tipos.js';

export interface ResultadoAG {
  mejor: Cromosoma;
  evaluacion: Evaluacion;
  generaciones: number;
  /** Mejor aptitud de cada generación, para graficar la convergencia. */
  historial: number[];
}

interface Individuo {
  cromosoma: Cromosoma;
  evaluacion: Evaluacion;
}

/** Cuántos de los mejores pasan sin cambios a la siguiente generación. */
const ELITE = 2;

/**
 * Primera fase del motor (sección 6.3.1, RF-17): Algoritmo Genético con población 50,
 * 100 generaciones, selección por torneo binario, cruce del 80 % y mutación del 10 %.
 *
 * - El cruce es uniforme por grupo: el hijo toma todas las sesiones de un grupo de uno
 *   de los dos padres, así cada grupo conserva un solo docente.
 * - La mutación cambia, con la tasa indicada, la franja o el aula de cada sesión, o el
 *   docente de todo un grupo.
 */
export function ejecutarAlgoritmoGenetico(
  problema: Problema,
  parametros: Pick<
    ParametrosMotor,
    'poblacion' | 'generaciones' | 'tasaCruce' | 'tasaMutacion'
  >,
  aleatorio: Aleatorio,
): ResultadoAG {
  const evaluarIndividuo = (cromosoma: Cromosoma): Individuo => ({
    cromosoma,
    evaluacion: evaluar(cromosoma, problema.indices),
  });

  let poblacion = Array.from({ length: parametros.poblacion }, () =>
    evaluarIndividuo(problema.construir(aleatorio)),
  );
  const historial: number[] = [];
  const maxima = aptitudMaxima(poblacion[0].cromosoma);
  let generacion = 0;

  for (; generacion < parametros.generaciones; generacion++) {
    poblacion.sort((a, b) => b.evaluacion.aptitud - a.evaluacion.aptitud);
    historial.push(poblacion[0].evaluacion.aptitud);
    // Ya no se puede mejorar: todas las asignaciones válidas y sin sobrecarga.
    if (poblacion[0].evaluacion.aptitud >= maxima) break;

    const siguiente = poblacion.slice(0, ELITE);
    while (siguiente.length < parametros.poblacion) {
      const padre = torneoBinario(poblacion, aleatorio);
      const madre = torneoBinario(poblacion, aleatorio);
      const hijo = aleatorio.probabilidad(parametros.tasaCruce)
        ? cruzar(problema, padre.cromosoma, madre.cromosoma, aleatorio)
        : padre.cromosoma.map((gen) => ({ ...gen }));
      mutar(problema, hijo, parametros.tasaMutacion, aleatorio);
      siguiente.push(evaluarIndividuo(hijo));
    }
    poblacion = siguiente;
  }

  poblacion.sort((a, b) => b.evaluacion.aptitud - a.evaluacion.aptitud);
  if (historial.length === generacion)
    historial.push(poblacion[0].evaluacion.aptitud);
  return {
    mejor: poblacion[0].cromosoma,
    evaluacion: poblacion[0].evaluacion,
    generaciones: generacion,
    historial,
  };
}

export function torneoBinario<T extends { evaluacion: Evaluacion }>(
  poblacion: T[],
  aleatorio: Aleatorio,
): T {
  const a = aleatorio.elegir(poblacion);
  const b = aleatorio.elegir(poblacion);
  return a.evaluacion.aptitud >= b.evaluacion.aptitud ? a : b;
}

export function cruzar(
  problema: Problema,
  padre: Cromosoma,
  madre: Cromosoma,
  aleatorio: Aleatorio,
): Cromosoma {
  const hijo: Cromosoma = Array.from({ length: padre.length });
  for (const bloque of problema.bloques) {
    const origen = aleatorio.probabilidad(0.5) ? padre : madre;
    for (const posicion of bloque.posiciones)
      hijo[posicion] = { ...origen[posicion] };
  }
  return hijo;
}

export function mutar(
  problema: Problema,
  cromosoma: Cromosoma,
  tasa: number,
  aleatorio: Aleatorio,
): void {
  // Con probabilidad `tasa` el hijo recibe una mutación: cambia el docente de un grupo,
  // o la franja o el aula de una sesión.
  if (!aleatorio.probabilidad(tasa)) return;
  const bloque = aleatorio.elegir(problema.bloques);
  const tipo = aleatorio.entero(3);
  if (tipo === 0 && bloque.candidatos.length > 1) {
    const docenteId = aleatorio.elegir(bloque.candidatos);
    for (const posicion of bloque.posiciones)
      cromosoma[posicion].docenteId = docenteId;
    return;
  }
  const gen = cromosoma[aleatorio.elegir(bloque.posiciones)];
  if (tipo === 1) {
    const disponibles = [
      ...(problema.indices.docentes.get(gen.docenteId)?.franjasDisponibles ??
        []),
    ];
    gen.franjaId = disponibles.length
      ? aleatorio.elegir(disponibles)
      : aleatorio.elegir(problema.franjas);
  } else {
    gen.aulaId = aleatorio.elegir(bloque.aulas);
  }
}
