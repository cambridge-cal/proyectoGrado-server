import { DataSource, EntityManager, In } from 'typeorm';
import { EstudianteGrupo } from '../../horarios/entidades/estudiante-grupo.entity.js';
import { Horario } from '../../horarios/entidades/horario.entity.js';

type Conexion = DataSource | EntityManager;

/**
 * Grupos que dicta cada docente según el horario vigente (no archivado) más reciente del
 * período. Es la base de RF-33: un estudiante evalúa a los docentes de sus grupos.
 */
export async function gruposPorDocente(
  conexion: Conexion,
  periodoId: string,
): Promise<Map<string, Set<string>>> {
  const horario = await conexion.getRepository(Horario).findOne({
    where: { archivado: false, periodo: { id: periodoId } },
    order: { creadoEn: 'DESC' },
  });
  const mapa = new Map<string, Set<string>>();
  for (const asignacion of horario?.asignaciones ?? []) {
    const grupos = mapa.get(asignacion.docenteId) ?? new Set<string>();
    grupos.add(asignacion.grupoId);
    mapa.set(asignacion.docenteId, grupos);
  }
  return mapa;
}

/** Estudiantes con inscripción activa en cada grupo. */
export async function estudiantesPorGrupo(
  conexion: Conexion,
  grupoIds: string[],
): Promise<Map<string, Set<string>>> {
  const mapa = new Map<string, Set<string>>(
    grupoIds.map((id) => [id, new Set<string>()]),
  );
  if (grupoIds.length === 0) return mapa;
  const inscripciones = await conexion.getRepository(EstudianteGrupo).find({
    where: { grupo: { id: In(grupoIds) }, activo: true },
    relations: { grupo: true, estudiante: true },
  });
  for (const inscripcion of inscripciones)
    mapa.get(inscripcion.grupo.id)!.add(inscripcion.estudiante.id);
  return mapa;
}

export interface Participacion {
  /** Estudiantes que pueden responder: los de todos los grupos del docente. */
  elegibles: number;
  /** De ellos, cuántos ya respondieron. */
  completaron: number;
  /** Respondieron todos los elegibles (EN_PROGRESO -> COMPLETADA). */
  todos: boolean;
  /** Algún grupo terminó completo: dispara el KDD parcial (RF-39). */
  algunGrupoCompleto: boolean;
}

/** Función pura: participación de una evaluación a partir de los grupos del docente. */
export function calcularParticipacion(
  estudiantesDeGrupos: Iterable<Set<string>>,
  completaron: Iterable<string>,
): Participacion {
  const hechos = new Set(completaron);
  const elegibles = new Set<string>();
  let algunGrupoCompleto = false;
  for (const grupo of estudiantesDeGrupos) {
    let completo = grupo.size > 0;
    for (const estudiante of grupo) {
      elegibles.add(estudiante);
      if (!hechos.has(estudiante)) completo = false;
    }
    if (completo) algunGrupoCompleto = true;
  }
  let cuenta = 0;
  for (const estudiante of elegibles) if (hechos.has(estudiante)) cuenta++;
  return {
    elegibles: elegibles.size,
    completaron: cuenta,
    todos: elegibles.size > 0 && cuenta === elegibles.size,
    algunGrupoCompleto,
  };
}
