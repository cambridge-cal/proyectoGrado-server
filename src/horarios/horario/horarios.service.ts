import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In, Not } from 'typeorm';
import type { Actor } from '../../compartido/actor.js';
import { desplazamiento, Pagina } from '../../compartido/paginacion.js';
import { AuditoriaService } from '../../seguridad/auditoria/auditoria.service.js';
import { Docente } from '../../seguridad/entidades/docente.entity.js';
import { Estudiante } from '../../seguridad/entidades/estudiante.entity.js';
import { Rol } from '../../seguridad/entidades/rol.enum.js';
import { Aula } from '../entidades/aula.entity.js';
import { Disponibilidad } from '../entidades/disponibilidad.entity.js';
import { EstudianteGrupo } from '../entidades/estudiante-grupo.entity.js';
import { TipoAula } from '../entidades/enums.js';
import {
  FranjaHoraria,
  horasDeFranja,
} from '../entidades/franja-horaria.entity.js';
import { Grupo } from '../entidades/grupo.entity.js';
import { Horario } from '../entidades/horario.entity.js';
import { PeriodoAcademico } from '../entidades/periodo-academico.entity.js';
import type { DatosValidacion } from '../gemini/validacion-semantica.service.js';
import { ValidacionSemanticaService } from '../gemini/validacion-semantica.service.js';
import { MotorService } from '../motor/motor.service.js';
import type { InstanciaMotor, TipoViolacion } from '../motor/tipos.js';
import {
  type AsignacionDetalle,
  detallar,
  type HorarioDetalle,
  type HorarioResumen,
  resumir,
} from './detalle.js';
import {
  FiltrosHorariosDto,
  GenerarHorarioDto,
  PeriodoHorariosDto,
} from './horario.dto.js';

/** Texto de cada restricción dura de RF-18, para informar al Administrador (Figura 6.4). */
export const DESCRIPCION_RESTRICCION: Record<TipoViolacion, string> = {
  CRUCE_DOCENTE: 'Docente asignado dos veces en la misma franja',
  CRUCE_AULA: 'Aula ocupada por dos grupos en la misma franja',
  CRUCE_GRUPO: 'Grupo con dos sesiones en la misma franja',
  SIN_DISPONIBILIDAD: 'Docente asignado en una franja sin disponibilidad',
  CAPACIDAD_AULA: 'Grupo que excede la capacidad del aula',
};

/**
 * Generación de horarios (RF-17, RF-19, Figuras 6.4 y 6.5): carga los datos, ejecuta el
 * motor de IA, valida con Gemini y guarda el horario con sus metadatos.
 * Consulta, archivo y eliminación según el ciclo de vida de la Figura 6.16 (RF-20 a RF-24).
 */
@Injectable()
export class HorariosService {
  constructor(
    @InjectDataSource() private readonly fuente: DataSource,
    private readonly motor: MotorService,
    private readonly gemini: ValidacionSemanticaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async generar(dto: GenerarHorarioDto, actor: Actor): Promise<HorarioDetalle> {
    const inicio = performance.now();
    const excluidos = dto.tiposAulaExcluidos ?? [];
    const periodo = await this.periodo(dto.periodoId);
    const datos = await this.cargar(periodo, excluidos);

    const resultado = this.motor.generar(datos.instancia);
    if (!resultado.factible) {
      const restricciones = Object.entries(
        resultado.restriccionesNoSatisfechas,
      ).map(([tipo, cantidad]) => ({
        tipo,
        descripcion: DESCRIPCION_RESTRICCION[tipo as TipoViolacion],
        cantidad,
      }));
      await this.registrar(actor, 'GENERAR_HORARIO_FALLIDO', {
        periodoId: periodo.id,
        intentos: resultado.intentos.length,
        restricciones,
      });
      throw new UnprocessableEntityException({
        statusCode: 422,
        error: 'Unprocessable Entity',
        message: `El motor no encontró un horario que cumpla todas las restricciones duras después de ${resultado.intentos.length} intentos.`,
        restriccionesNoSatisfechas: restricciones,
      });
    }

    const validacion = await this.gemini.validar({
      ...datos,
      asignaciones: resultado.asignaciones,
    });

    const horario = await this.fuente.getRepository(Horario).save(
      this.fuente.getRepository(Horario).create({
        periodo,
        asignaciones: validacion.asignaciones.map((a) => ({
          grupoId: a.grupoId,
          docenteId: a.docenteId,
          aulaId: a.aulaId,
          franjaId: a.franjaId,
        })),
        fitness: validacion.evaluacion.aptitud,
        generaciones: resultado.generaciones,
        intentos: resultado.intentos.length,
        tiempoEjecucionMs: Math.round(performance.now() - inicio),
        validadoGemini: validacion.validadoGemini,
        validacion: {
          estado: validacion.estado,
          modelo: validacion.modelo,
          tiempoMs: validacion.tiempoMs,
          detalle: validacion.detalle,
          observaciones: validacion.observaciones,
          ajustesAplicados: validacion.ajustesAplicados,
        },
        tiposAulaExcluidos: excluidos,
        archivado: false,
      }),
    );
    await this.registrar(actor, 'GENERAR_HORARIO', {
      horarioId: horario.id,
      periodoId: periodo.id,
      fitness: horario.fitness,
      validadoGemini: horario.validadoGemini,
      estadoValidacion: validacion.estado,
      tiposAulaExcluidos: excluidos,
    });
    return detallar(this.fuente, horario);
  }

  /** RF-20: listado paginado, filtrable por archivado y por período. */
  async listar(filtros: FiltrosHorariosDto): Promise<Pagina<HorarioResumen>> {
    const { skip, take } = desplazamiento(filtros);
    const [horarios, total] = await this.fuente
      .getRepository(Horario)
      .findAndCount({
        where: {
          ...(filtros.archivado === undefined
            ? {}
            : { archivado: filtros.archivado }),
          ...(filtros.periodoId ? { periodo: { id: filtros.periodoId } } : {}),
        },
        relations: { periodo: true },
        order: { creadoEn: 'DESC' },
        skip,
        take,
      });
    return {
      datos: horarios.map(resumir),
      total,
      page: filtros.page,
      size: filtros.size,
    };
  }

  /** RF-21: detalle con todas las asignaciones. */
  async obtener(id: string): Promise<HorarioDetalle> {
    return detallar(this.fuente, await this.buscar(id));
  }

  /**
   * RF-21 y RF-25: el horario activo más reciente del período en curso. El docente solo
   * ve sus clases, el estudiante solo las de sus grupos activos y el Administrador todo.
   */
  async actual(actor: Actor): Promise<HorarioDetalle> {
    const horario = await this.fuente.getRepository(Horario).findOne({
      where: { archivado: false, periodo: { activo: true } },
      relations: { periodo: true },
      order: { creadoEn: 'DESC' },
    });
    if (!horario) {
      throw new NotFoundException(
        'Todavía no hay un horario activo para el período en curso.',
      );
    }
    const detalle = await detallar(this.fuente, horario);
    const visible = await this.visibilidad(actor);
    return visible ? soloVisibles(detalle, visible) : detalle;
  }

  /** Qué asignaciones puede ver cada rol en su horario; null = todas. */
  private async visibilidad(
    actor: Actor,
  ): Promise<((a: AsignacionDetalle) => boolean) | null> {
    if (actor.rol === Rol.DOCENTE) {
      const docente = await this.fuente
        .getRepository(Docente)
        .findOneBy({ usuario: { id: actor.id } });
      return (a) => Boolean(docente) && a.docente?.id === docente!.id;
    }
    if (actor.rol === Rol.ESTUDIANTE) {
      const estudiante = await this.fuente
        .getRepository(Estudiante)
        .findOneBy({ usuario: { id: actor.id } });
      const inscripciones = estudiante
        ? await this.fuente.getRepository(EstudianteGrupo).find({
            where: { estudiante: { id: estudiante.id }, activo: true },
            relations: { grupo: true },
          })
        : [];
      const grupos = new Set(inscripciones.map((i) => i.grupo.id));
      return (a) => Boolean(a.grupo) && grupos.has(a.grupo!.id);
    }
    return null;
  }

  /** RF-22: archiva todos los horarios activos del período (ACTIVO -> ARCHIVADO). */
  async archivar(
    dto: PeriodoHorariosDto,
    actor: Actor,
  ): Promise<{ archivados: number }> {
    const periodo = await this.periodo(dto.periodoId);
    const resultado = await this.fuente
      .getRepository(Horario)
      .update(
        { periodo: { id: periodo.id }, archivado: false },
        { archivado: true },
      );
    const archivados = resultado.affected ?? 0;
    await this.registrar(actor, 'ARCHIVAR_HORARIOS', {
      periodoId: periodo.id,
      archivados,
    });
    return { archivados };
  }

  /**
   * RF-23: elimina de forma permanente el historial archivado del período, o de todos
   * los períodos si no se indica uno.
   */
  async eliminarArchivados(
    dto: PeriodoHorariosDto,
    actor: Actor,
  ): Promise<{ eliminados: number }> {
    if (dto.periodoId) await this.periodo(dto.periodoId);
    const resultado = await this.fuente.getRepository(Horario).delete({
      archivado: true,
      ...(dto.periodoId ? { periodo: { id: dto.periodoId } } : {}),
    });
    const eliminados = resultado.affected ?? 0;
    await this.registrar(actor, 'ELIMINAR_HISTORIAL_HORARIOS', {
      periodoId: dto.periodoId ?? null,
      eliminados,
    });
    return { eliminados };
  }

  /**
   * RF-24: elimina un horario. Las inscripciones de los estudiantes no cambian, porque
   * dependen del grupo y no del horario (Figura 6.16).
   */
  async eliminar(id: string, actor: Actor): Promise<void> {
    const horario = await this.buscar(id);
    await this.fuente.getRepository(Horario).delete({ id });
    await this.registrar(actor, 'ELIMINAR_HORARIO', {
      horarioId: id,
      periodoId: horario.periodo.id,
      archivado: horario.archivado,
    });
  }

  private async buscar(id: string): Promise<Horario> {
    const horario = await this.fuente
      .getRepository(Horario)
      .findOne({ where: { id }, relations: { periodo: true } });
    if (!horario) throw new NotFoundException('El horario no existe.');
    return horario;
  }

  private async periodo(id?: string): Promise<PeriodoAcademico> {
    const repositorio = this.fuente.getRepository(PeriodoAcademico);
    if (id) {
      const periodo = await repositorio.findOneBy({ id });
      if (!periodo) throw new NotFoundException('El período no existe.');
      return periodo;
    }
    const activo = await repositorio.findOneBy({ activo: true });
    if (!activo) {
      throw new UnprocessableEntityException(
        'No hay un período activo. Activa uno en Configuración > Períodos.',
      );
    }
    return activo;
  }

  /** Paso "Cargar" de la Figura 6.4: grupos, docentes, aulas, franjas y disponibilidades. */
  private async cargar(
    periodo: PeriodoAcademico,
    excluidos: TipoAula[],
  ): Promise<Omit<DatosValidacion, 'asignaciones'>> {
    const [grupos, docentes, aulas, franjas, disponibilidades] =
      await Promise.all([
        this.fuente.getRepository(Grupo).find({
          relations: { curso: { nivelIdioma: true } },
          order: { codigo: 'ASC' },
        }),
        this.fuente
          .getRepository(Docente)
          .createQueryBuilder('docente')
          .innerJoinAndSelect('docente.usuario', 'usuario')
          .where('usuario.activo = true')
          .orderBy('usuario.nombre', 'ASC')
          .getMany(),
        this.fuente.getRepository(Aula).find({
          where: {
            activa: true,
            ...(excluidos.length ? { tipo: Not(In(excluidos)) } : {}),
          },
          order: { codigo: 'ASC' },
        }),
        this.fuente.getRepository(FranjaHoraria).find({
          order: { diaSemana: 'ASC', horaInicio: 'ASC' },
        }),
        this.fuente.getRepository(Disponibilidad).find({
          relations: { docente: true, franjaHoraria: true },
        }),
      ]);

    const falta = (mensaje: string) => {
      throw new UnprocessableEntityException(mensaje);
    };
    if (!grupos.length) falta('No hay grupos registrados para programar.');
    if (!docentes.length) falta('No hay docentes activos.');
    if (!franjas.length) falta('No hay franjas horarias registradas.');
    if (!aulas.length) {
      falta(
        excluidos.length
          ? 'Con los tipos de aula excluidos no queda ninguna aula activa.'
          : 'No hay aulas activas.',
      );
    }
    if (!disponibilidades.length) {
      falta('Ningún docente tiene disponibilidad registrada.');
    }

    const porDocente = new Map<string, Set<string>>();
    for (const d of disponibilidades) {
      const conjunto = porDocente.get(d.docente.id) ?? new Set<string>();
      conjunto.add(d.franjaHoraria.id);
      porDocente.set(d.docente.id, conjunto);
    }
    const duracion = duracionTipica(franjas);

    const instancia: InstanciaMotor = {
      docentes: docentes.map((d) => ({
        id: d.id,
        especialidad: d.especialidad,
        cargaMaximaHoras: d.cargaMaximaSemanal,
        franjasDisponibles: porDocente.get(d.id) ?? new Set(),
      })),
      aulas: aulas.map((a) => ({
        id: a.id,
        capacidad: a.capacidad,
        tipo: a.tipo,
      })),
      franjas: franjas.map((f) => ({
        id: f.id,
        dia: f.diaSemana,
        horaInicio: f.horaInicio,
        horaFin: f.horaFin,
        horas: horasDeFranja(f),
      })),
      grupos: grupos.map((g) => ({
        id: g.id,
        idioma: g.curso.nivelIdioma.idioma,
        estudiantes: g.cupoMaximo,
        sesiones: sesionesSemanales(g.curso.intensidadHoraria, duracion),
      })),
    };

    return {
      periodo: periodo.nombre,
      instancia,
      docentes: docentes.map((d) => ({
        id: d.id,
        nombre: d.usuario.nombre,
        especialidad: d.especialidad,
        cargaMaximaSemanal: d.cargaMaximaSemanal,
      })),
      aulas: aulas.map((a) => ({
        id: a.id,
        codigo: a.codigo,
        capacidad: a.capacidad,
        tipo: a.tipo,
      })),
      grupos: grupos.map((g) => ({
        id: g.id,
        codigo: g.codigo,
        curso: g.curso.nombre,
        idioma: g.curso.nivelIdioma.idioma,
        nivel: g.curso.nivelIdioma.codigo,
        jornada: g.jornada,
        cupoMaximo: g.cupoMaximo,
        intensidadHoraria: g.curso.intensidadHoraria,
      })),
      franjas: franjas.map((f) => ({
        id: f.id,
        diaSemana: f.diaSemana,
        horaInicio: f.horaInicio,
        horaFin: f.horaFin,
      })),
    };
  }

  private registrar(actor: Actor, accion: string, detalle: object) {
    return this.auditoria.registrar({
      usuarioId: actor.id,
      modulo: 'HORARIOS',
      accion,
      detalle: JSON.stringify(detalle),
      ip: actor.ip,
    });
  }
}

/** Duración más común de las franjas, en horas. */
export function duracionTipica(
  franjas: Array<Pick<FranjaHoraria, 'horaInicio' | 'horaFin'>>,
): number {
  const conteo = new Map<number, number>();
  for (const f of franjas) {
    const horas = horasDeFranja(f);
    conteo.set(horas, (conteo.get(horas) ?? 0) + 1);
  }
  return [...conteo].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
}

/** Franjas por semana que necesita un grupo para cubrir la intensidad horaria del curso. */
export function sesionesSemanales(
  intensidad: number,
  duracion: number,
): number {
  return Math.max(1, Math.ceil(intensidad / duracion - 1e-9));
}

/** Deja solo las asignaciones visibles; conserva la posición original de cada una. */
export function soloVisibles(
  detalle: HorarioDetalle,
  visible: (a: AsignacionDetalle) => boolean,
): HorarioDetalle {
  const asignaciones = detalle.asignaciones.filter(visible);
  return { ...detalle, asignaciones, totalAsignaciones: asignaciones.length };
}
