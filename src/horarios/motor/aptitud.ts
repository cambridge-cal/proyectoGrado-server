import type {
  Cromosoma,
  Evaluacion,
  InstanciaMotor,
  TipoViolacion,
  Violacion,
} from './tipos.js';

/** Pesos de la función de aptitud (sección 6.3.1). */
export const PENALIZACION_DURA = 100;
export const PENALIZACION_HORA_SOBRECARGA = 50;
export const BONO_ASIGNACION_VALIDA = 10;

/** Índices de la instancia para evaluar en tiempo lineal. */
export interface Indices {
  docentes: Map<string, InstanciaMotor['docentes'][number]>;
  aulas: Map<string, InstanciaMotor['aulas'][number]>;
  franjas: Map<string, InstanciaMotor['franjas'][number]>;
  grupos: Map<string, InstanciaMotor['grupos'][number]>;
}

export function indexar(instancia: InstanciaMotor): Indices {
  return {
    docentes: new Map(instancia.docentes.map((d) => [d.id, d])),
    aulas: new Map(instancia.aulas.map((a) => [a.id, a])),
    franjas: new Map(instancia.franjas.map((f) => [f.id, f])),
    grupos: new Map(instancia.grupos.map((g) => [g.id, g])),
  };
}

/**
 * Función de aptitud (sección 6.3.1):
 *   +10 por cada asignación que no participa en ninguna violación dura,
 *   -100 por cada violación de una restricción dura (RF-18),
 *   -50 por cada hora que supera la carga máxima semanal de un docente (restricción blanda).
 *
 * Restricciones duras: docente en dos asignaciones de la misma franja, aula con dos grupos
 * en la misma franja, docente sin disponibilidad en la franja, grupo que excede la capacidad
 * del aula y, además, un mismo grupo programado dos veces en la misma franja.
 */
export function evaluar(cromosoma: Cromosoma, indices: Indices): Evaluacion {
  const violaciones: Violacion[] = [];
  const conflictivas = new Set<number>();
  const porDocente = new Map<string, number[]>();
  const porAula = new Map<string, number[]>();
  const porGrupo = new Map<string, number[]>();
  const horasDocente = new Map<string, number>();

  const agregar = (mapa: Map<string, number[]>, clave: string, i: number) => {
    const lista = mapa.get(clave);
    if (lista) lista.push(i);
    else mapa.set(clave, [i]);
  };
  const violar = (tipo: TipoViolacion, asignaciones: number[]) => {
    violaciones.push({ tipo, asignaciones });
    for (const i of asignaciones) conflictivas.add(i);
  };

  cromosoma.forEach((gen, i) => {
    agregar(porDocente, `${gen.docenteId}|${gen.franjaId}`, i);
    agregar(porAula, `${gen.aulaId}|${gen.franjaId}`, i);
    agregar(porGrupo, `${gen.grupoId}|${gen.franjaId}`, i);

    const docente = indices.docentes.get(gen.docenteId);
    const franja = indices.franjas.get(gen.franjaId);
    const aula = indices.aulas.get(gen.aulaId);
    const grupo = indices.grupos.get(gen.grupoId);

    if (!docente?.franjasDisponibles.has(gen.franjaId))
      violar('SIN_DISPONIBILIDAD', [i]);
    if (!aula || !grupo || grupo.estudiantes > aula.capacidad)
      violar('CAPACIDAD_AULA', [i]);
    horasDocente.set(
      gen.docenteId,
      (horasDocente.get(gen.docenteId) ?? 0) + (franja?.horas ?? 0),
    );
  });

  // Cada asignación de más en la misma franja cuenta como una violación.
  const cruces = (mapa: Map<string, number[]>, tipo: TipoViolacion) => {
    for (const lista of mapa.values()) {
      for (let k = 1; k < lista.length; k++) violar(tipo, [lista[0], lista[k]]);
    }
  };
  cruces(porDocente, 'CRUCE_DOCENTE');
  cruces(porAula, 'CRUCE_AULA');
  cruces(porGrupo, 'CRUCE_GRUPO');

  let horasSobrecarga = 0;
  for (const [docenteId, horas] of horasDocente) {
    const carga = indices.docentes.get(docenteId)?.cargaMaximaHoras ?? 0;
    horasSobrecarga += Math.max(0, horas - carga);
  }

  const asignacionesValidas = cromosoma.length - conflictivas.size;
  return {
    aptitud:
      BONO_ASIGNACION_VALIDA * asignacionesValidas -
      PENALIZACION_DURA * violaciones.length -
      PENALIZACION_HORA_SOBRECARGA * horasSobrecarga,
    violacionesDuras: violaciones.length,
    horasSobrecarga,
    asignacionesValidas,
    violaciones,
  };
}

/** Aptitud máxima posible: todas las asignaciones válidas y sin sobrecarga. */
export function aptitudMaxima(cromosoma: Cromosoma): number {
  return BONO_ASIGNACION_VALIDA * cromosoma.length;
}
