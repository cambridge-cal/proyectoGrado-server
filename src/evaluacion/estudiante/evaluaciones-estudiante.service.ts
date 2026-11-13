import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Not } from 'typeorm';
import type { Actor } from '../../compartido/actor.js';
import {
  EstudianteGrupo,
  Grupo,
  Horario,
} from '../../horarios/entidades/index.js';
import { Estudiante } from '../../seguridad/entidades/index.js';
import { EstadoEvaluacion } from '../entidades/estado-evaluacion.enum.js';
import { Evaluacion } from '../entidades/evaluacion.entity.js';

export interface EvaluacionEstudiante {
  id: string;
  formulario: { id: string; nombre: string };
  docente: { id: string; nombre: string };
  /** Grupos del estudiante en los que ese docente le dicta clase. */
  grupos: Array<{ id: string; codigo: string; curso: string }>;
  totalPreguntas: number;
}

export interface EvaluacionParaResponder extends EvaluacionEstudiante {
  dimensiones: Array<{
    id: string;
    nombre: string;
    orden: number;
    preguntas: Array<{ id: string; texto: string; orden: number }>;
  }>;
}

/** Lo que el horario activo dice de un estudiante: con qué docentes tiene clase y en qué grupos. */
export interface ContextoEstudiante {
  estudianteId: string;
  periodoId: string | null;
  /** docenteId -> grupos del estudiante que dicta ese docente. */
  gruposPorDocente: Map<string, Grupo[]>;
}

const CON_FORMULARIO = {
  formulario: { dimensiones: { preguntas: true } },
  docente: { usuario: true },
} as const;

/**
 * Evaluaciones que ve el estudiante (RF-33): solo las de los docentes que le dictan clase
 * en el horario activo de sus grupos.
 */
@Injectable()
export class EvaluacionesEstudianteService {
  constructor(@InjectDataSource() protected readonly fuente: DataSource) {}

  /** RF-33: evaluaciones abiertas de los docentes de sus grupos. */
  async listar(actor: Actor): Promise<EvaluacionEstudiante[]> {
    const contexto = await this.contexto(actor);
    const evaluaciones = await this.visibles(this.fuente.manager, contexto);
    return evaluaciones.map((e) => this.resumir(e, contexto));
  }

  /** Formulario completo de una evaluación visible, listo para responder (RF-34). */
  async obtener(actor: Actor, id: string): Promise<EvaluacionParaResponder> {
    const contexto = await this.contexto(actor);
    const evaluacion = await this.visible(this.fuente.manager, contexto, id);
    return {
      ...this.resumir(evaluacion, contexto),
      dimensiones: ordenar(evaluacion.formulario.dimensiones ?? []).map(
        (dimension) => ({
          id: dimension.id,
          nombre: dimension.nombre,
          orden: dimension.orden,
          preguntas: ordenar(dimension.preguntas ?? []).map((pregunta) => ({
            id: pregunta.id,
            texto: pregunta.texto,
            orden: pregunta.orden,
          })),
        }),
      ),
    };
  }

  /** Perfil del estudiante y los docentes que le dictan clase según el horario activo. */
  async contexto(
    actor: Actor,
    tx: EntityManager = this.fuente.manager,
  ): Promise<ContextoEstudiante> {
    const estudiante = await tx
      .getRepository(Estudiante)
      .findOneBy({ usuario: { id: actor.id } });
    if (!estudiante) {
      throw new ForbiddenException(
        'Tu cuenta no tiene perfil de estudiante. Pídelo al Administrador.',
      );
    }
    const gruposPorDocente = new Map<string, Grupo[]>();
    const inscripciones = await tx.getRepository(EstudianteGrupo).find({
      where: { estudiante: { id: estudiante.id }, activo: true },
      relations: { grupo: { curso: true } },
    });
    const horario = await tx.getRepository(Horario).findOne({
      where: { archivado: false, periodo: { activo: true } },
      relations: { periodo: true },
      order: { creadoEn: 'DESC' },
    });
    if (horario) {
      const grupos = new Map(inscripciones.map((i) => [i.grupo.id, i.grupo]));
      for (const asignacion of horario.asignaciones) {
        const grupo = grupos.get(asignacion.grupoId);
        if (!grupo) continue;
        const lista = gruposPorDocente.get(asignacion.docenteId) ?? [];
        if (!lista.includes(grupo)) lista.push(grupo);
        gruposPorDocente.set(asignacion.docenteId, lista);
      }
    }
    return {
      estudianteId: estudiante.id,
      periodoId: horario?.periodo.id ?? null,
      gruposPorDocente,
    };
  }

  private condiciones(contexto: ContextoEstudiante) {
    return {
      docente: { id: In([...contexto.gruposPorDocente.keys()]) },
      formulario: {
        activo: true,
        periodoAcademico: { id: contexto.periodoId! },
      },
      estado: Not(EstadoEvaluacion.CERRADA),
    };
  }

  protected async visibles(
    tx: EntityManager,
    contexto: ContextoEstudiante,
  ): Promise<Evaluacion[]> {
    if (!contexto.periodoId || contexto.gruposPorDocente.size === 0) return [];
    return tx.getRepository(Evaluacion).find({
      where: this.condiciones(contexto),
      relations: CON_FORMULARIO,
      order: { creadoEn: 'ASC' },
    });
  }

  /** La evaluación si el estudiante puede verla; si no, 404 para no revelar que existe. */
  protected async visible(
    tx: EntityManager,
    contexto: ContextoEstudiante,
    id: string,
  ): Promise<Evaluacion> {
    const evaluacion =
      contexto.periodoId && contexto.gruposPorDocente.size > 0
        ? await tx.getRepository(Evaluacion).findOne({
            where: { ...this.condiciones(contexto), id },
            relations: CON_FORMULARIO,
          })
        : null;
    if (!evaluacion) {
      throw new NotFoundException(
        'La evaluación no existe o no corresponde a tus docentes.',
      );
    }
    return evaluacion;
  }

  protected resumir(
    evaluacion: Evaluacion,
    contexto: ContextoEstudiante,
  ): EvaluacionEstudiante {
    const grupos = contexto.gruposPorDocente.get(evaluacion.docente.id) ?? [];
    return {
      id: evaluacion.id,
      formulario: {
        id: evaluacion.formulario.id,
        nombre: evaluacion.formulario.nombre,
      },
      docente: {
        id: evaluacion.docente.id,
        nombre: evaluacion.docente.usuario.nombre,
      },
      grupos: grupos.map((grupo) => ({
        id: grupo.id,
        codigo: grupo.codigo,
        curso: grupo.curso.nombre,
      })),
      totalPreguntas: (evaluacion.formulario.dimensiones ?? []).reduce(
        (total, dimension) => total + (dimension.preguntas?.length ?? 0),
        0,
      ),
    };
  }
}

function ordenar<T extends { orden: number }>(elementos: T[]): T[] {
  return [...elementos].sort((a, b) => a.orden - b.orden);
}
