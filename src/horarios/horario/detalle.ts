import { DataSource, In } from 'typeorm';
import { Docente } from '../../seguridad/entidades/docente.entity.js';
import { Aula } from '../entidades/aula.entity.js';
import { FranjaHoraria } from '../entidades/franja-horaria.entity.js';
import { Grupo } from '../entidades/grupo.entity.js';
import type {
  Horario,
  ValidacionHorario,
} from '../entidades/horario.entity.js';

/** Una asignación con los datos que necesita la grilla del horario (RF-21, RF-25). */
export interface AsignacionDetalle {
  posicion: number;
  grupo: {
    id: string;
    codigo: string;
    curso: string;
    idioma: string;
    /** Código del nivel (por ejemplo ING-A1), para el color de la grilla. */
    nivel: string;
    jornada: string;
  } | null;
  docente: { id: string; nombre: string } | null;
  aula: { id: string; codigo: string; tipo: string } | null;
  franja: {
    id: string;
    diaSemana: string;
    horaInicio: string;
    horaFin: string;
    bloque: number;
  } | null;
}

export interface HorarioResumen {
  id: string;
  periodo: { id: string; nombre: string };
  fitness: number;
  generaciones: number;
  tiempoEjecucionMs: number;
  intentos: number;
  validadoGemini: boolean;
  estadoValidacion: string;
  /** Motivo por el que quedó sin validar por Gemini (RNF-18), o null. */
  motivoValidacion: string | null;
  archivado: boolean;
  tiposAulaExcluidos: string[];
  totalAsignaciones: number;
  creadoEn: Date;
}

export interface HorarioDetalle extends HorarioResumen {
  validacion: ValidacionHorario;
  asignaciones: AsignacionDetalle[];
}

export function resumir(horario: Horario): HorarioResumen {
  return {
    id: horario.id,
    periodo: { id: horario.periodo.id, nombre: horario.periodo.nombre },
    fitness: horario.fitness,
    generaciones: horario.generaciones,
    tiempoEjecucionMs: horario.tiempoEjecucionMs,
    intentos: horario.intentos,
    validadoGemini: horario.validadoGemini,
    estadoValidacion: horario.validacion.estado,
    motivoValidacion: horario.validacion.detalle,
    archivado: horario.archivado,
    tiposAulaExcluidos: horario.tiposAulaExcluidos,
    totalAsignaciones: horario.asignaciones.length,
    creadoEn: horario.creadoEn,
  };
}

/**
 * Resuelve los ids del JSONB a los datos de grupo, docente, aula y franja. Si un recurso
 * se eliminó después de generar el horario, su campo llega en null.
 */
export async function detallar(
  fuente: DataSource,
  horario: Horario,
): Promise<HorarioDetalle> {
  const ids = (campo: keyof Horario['asignaciones'][number]) => [
    ...new Set(horario.asignaciones.map((a) => a[campo])),
  ];
  const [grupos, docentes, aulas, franjas] = await Promise.all([
    fuente.getRepository(Grupo).find({
      where: { id: In(ids('grupoId')) },
      relations: { curso: { nivelIdioma: true } },
    }),
    fuente.getRepository(Docente).find({
      where: { id: In(ids('docenteId')) },
      relations: { usuario: true },
    }),
    fuente.getRepository(Aula).findBy({ id: In(ids('aulaId')) }),
    fuente.getRepository(FranjaHoraria).findBy({ id: In(ids('franjaId')) }),
  ]);
  const porId = <T extends { id: string }>(lista: T[]) =>
    new Map(lista.map((x) => [x.id, x]));
  const g = porId(grupos);
  const d = porId(docentes);
  const a = porId(aulas);
  const f = porId(franjas);

  return {
    ...resumir(horario),
    validacion: horario.validacion,
    asignaciones: horario.asignaciones.map((asignacion, posicion) => {
      const grupo = g.get(asignacion.grupoId);
      const docente = d.get(asignacion.docenteId);
      const aula = a.get(asignacion.aulaId);
      const franja = f.get(asignacion.franjaId);
      return {
        posicion,
        grupo: grupo
          ? {
              id: grupo.id,
              codigo: grupo.codigo,
              curso: grupo.curso.nombre,
              idioma: grupo.curso.nivelIdioma.idioma,
              nivel: grupo.curso.nivelIdioma.codigo,
              jornada: grupo.jornada,
            }
          : null,
        docente: docente
          ? { id: docente.id, nombre: docente.usuario.nombre }
          : null,
        aula: aula
          ? { id: aula.id, codigo: aula.codigo, tipo: aula.tipo }
          : null,
        franja: franja
          ? {
              id: franja.id,
              diaSemana: franja.diaSemana,
              horaInicio: franja.horaInicio,
              horaFin: franja.horaFin,
              bloque: franja.bloque,
            }
          : null,
      };
    }),
  };
}
