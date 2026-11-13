import {
  BadRequestException,
  ConflictException,
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
  type AsignacionHorario,
} from '../../horarios/entidades/index.js';
import { AuditoriaService } from '../../seguridad/auditoria/auditoria.service.js';
import { Estudiante } from '../../seguridad/entidades/index.js';
import {
  ESTADOS_ABIERTOS,
  EstadoEvaluacion,
} from '../entidades/estado-evaluacion.enum.js';
import { Evaluacion } from '../entidades/evaluacion.entity.js';
import { Respuesta } from '../entidades/respuesta.entity.js';
import { ResponderEvaluacionDto } from './respuesta.dto.js';

export interface EvaluacionEstudiante {
  id: string;
  formulario: { id: string; nombre: string };
  docente: { id: string; nombre: string };
  /** Grupos del estudiante en los que ese docente le dicta clase. */
  grupos: Array<{ id: string; codigo: string; curso: string }>;
  totalPreguntas: number;
  /** true si este estudiante ya la respondió (RF-36). */
  completada: boolean;
  /** true mientras la evaluación recibe respuestas. */
  abierta: boolean;
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
  /** Todas las asignaciones del horario activo. */
  asignaciones: AsignacionHorario[];
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
  constructor(
    @InjectDataSource() private readonly fuente: DataSource,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** RF-33: evaluaciones abiertas de los docentes de sus grupos. */
  async listar(actor: Actor): Promise<EvaluacionEstudiante[]> {
    const contexto = await this.contexto(actor);
    const tx = this.fuente.manager;
    const evaluaciones = await this.visibles(tx, contexto);
    const completadas = await this.completadas(
      tx,
      evaluaciones.map((e) => e.id),
      contexto.estudianteId,
    );
    return evaluaciones
      .map((e) => this.resumir(e, contexto, completadas.has(e.id)))
      .filter((e) => e.abierta || e.completada);
  }

  /** Formulario completo de una evaluación visible, listo para responder (RF-34). */
  async obtener(actor: Actor, id: string): Promise<EvaluacionParaResponder> {
    const contexto = await this.contexto(actor);
    const tx = this.fuente.manager;
    const evaluacion = await this.visible(tx, contexto, id);
    const completadas = await this.completadas(tx, [id], contexto.estudianteId);
    return {
      ...this.resumir(evaluacion, contexto, completadas.has(id)),
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
      asignaciones: horario?.asignaciones ?? [],
    };
  }

  /**
   * RF-34 a RF-36: guarda una respuesta por pregunta sin asociarla al estudiante, agrega el
   * comentario anónimo y marca la evaluación como completada por él. La fila de la evaluación
   * se bloquea para que dos envíos simultáneos no cuenten dos veces.
   */
  async responder(
    actor: Actor,
    id: string,
    dto: ResponderEvaluacionDto,
  ): Promise<{ id: string; completada: true }> {
    await this.fuente.transaction(async (tx) => {
      const contexto = await this.contexto(actor, tx);
      const evaluacion = await this.visible(tx, contexto, id);
      const bloqueada = await tx
        .getRepository(Evaluacion)
        .createQueryBuilder('evaluacion')
        .setLock('pessimistic_write')
        .addSelect([
          'evaluacion.estudiantesCompletaron',
          'evaluacion.comentariosAnonimos',
        ])
        .where('evaluacion.id = :id', { id })
        .getOneOrFail();
      if (bloqueada.estudiantesCompletaron.includes(contexto.estudianteId)) {
        throw new ConflictException('Ya respondiste esta evaluación.');
      }
      if (!ESTADOS_ABIERTOS.includes(bloqueada.estado)) {
        throw new ConflictException('Esta evaluación ya no recibe respuestas.');
      }

      const esperadas = new Set(
        (evaluacion.formulario.dimensiones ?? []).flatMap((dimension) =>
          (dimension.preguntas ?? []).map((pregunta) => pregunta.id),
        ),
      );
      const recibidas = new Set(dto.respuestas.map((r) => r.preguntaId));
      if (
        recibidas.size !== dto.respuestas.length ||
        recibidas.size !== esperadas.size ||
        [...recibidas].some((preguntaId) => !esperadas.has(preguntaId))
      ) {
        throw new BadRequestException(
          'Debes responder todas las preguntas del formulario, una sola vez cada una.',
        );
      }

      await tx.getRepository(Respuesta).insert(
        dto.respuestas.map((respuesta) => ({
          evaluacion: { id },
          pregunta: { id: respuesta.preguntaId },
          valorNumerico: respuesta.valor,
        })),
      );

      const completaron = [
        ...bloqueada.estudiantesCompletaron,
        contexto.estudianteId,
      ];
      const comentarios = [...bloqueada.comentariosAnonimos];
      if (dto.comentario) {
        // Posición al azar: el orden de llegada no permite deducir quién lo escribió.
        const posicion = Math.floor(Math.random() * (comentarios.length + 1));
        comentarios.splice(posicion, 0, dto.comentario);
      }
      const faltan = await this.faltantes(
        tx,
        contexto,
        evaluacion.docente.id,
        completaron,
      );
      await tx.getRepository(Evaluacion).update(id, {
        estudiantesCompletaron: completaron,
        comentariosAnonimos: comentarios,
        estado:
          faltan === 0
            ? EstadoEvaluacion.COMPLETADA
            : bloqueada.estado === EstadoEvaluacion.PENDIENTE
              ? EstadoEvaluacion.EN_PROGRESO
              : bloqueada.estado,
      });
    });
    // El Audit Log registra el envío (RNF-11), nunca las respuestas ni el comentario.
    await this.auditoria.registrar({
      usuarioId: actor.id,
      modulo: 'EVALUACION',
      accion: 'RESPONDER_EVALUACION',
      detalle: JSON.stringify({ evaluacionId: id }),
      ip: actor.ip,
    });
    return { id, completada: true };
  }

  /** Cuántos estudiantes de los grupos que dicta el docente faltan por responder. */
  private async faltantes(
    tx: EntityManager,
    contexto: ContextoEstudiante,
    docenteId: string,
    completaron: string[],
  ): Promise<number> {
    const grupos = [
      ...new Set(
        contexto.asignaciones
          .filter((asignacion) => asignacion.docenteId === docenteId)
          .map((asignacion) => asignacion.grupoId),
      ),
    ];
    if (grupos.length === 0) return 0;
    const inscripciones = await tx.getRepository(EstudianteGrupo).find({
      where: { grupo: { id: In(grupos) }, activo: true },
      relations: { estudiante: true },
    });
    const pendientes = new Set(inscripciones.map((i) => i.estudiante.id));
    for (const estudianteId of completaron) pendientes.delete(estudianteId);
    return pendientes.size;
  }

  /** De las evaluaciones dadas, cuáles ya respondió el estudiante. */
  private async completadas(
    tx: EntityManager,
    ids: string[],
    estudianteId: string,
  ): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const filas = await tx
      .getRepository(Evaluacion)
      .createQueryBuilder('evaluacion')
      .select('evaluacion.id')
      .where('evaluacion.id IN (:...ids)', { ids })
      .andWhere(':estudianteId = ANY(evaluacion.estudiantesCompletaron)', {
        estudianteId,
      })
      .getMany();
    return new Set(filas.map((fila) => fila.id));
  }

  private condiciones(contexto: ContextoEstudiante) {
    return {
      docente: { id: In([...contexto.gruposPorDocente.keys()]) },
      formulario: {
        activo: true,
        periodoAcademico: { id: contexto.periodoId! },
      },
      estado: Not(EstadoEvaluacion.ARCHIVADA),
    };
  }

  private async visibles(
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
  private async visible(
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

  private resumir(
    evaluacion: Evaluacion,
    contexto: ContextoEstudiante,
    completada: boolean,
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
      completada,
      abierta: ESTADOS_ABIERTOS.includes(evaluacion.estado),
    };
  }
}

function ordenar<T extends { orden: number }>(elementos: T[]): T[] {
  return [...elementos].sort((a, b) => a.orden - b.orden);
}
