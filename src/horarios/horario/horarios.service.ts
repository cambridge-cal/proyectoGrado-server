import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Not, In } from 'typeorm';
import type { Actor } from '../../compartido/actor.js';
import { AuditoriaService } from '../../seguridad/auditoria/auditoria.service.js';
import { Docente } from '../../seguridad/entidades/docente.entity.js';
import { Aula } from '../entidades/aula.entity.js';
import { Disponibilidad } from '../entidades/disponibilidad.entity.js';
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
import { detallar, type HorarioDetalle } from './detalle.js';
import { GenerarHorarioDto } from './horario.dto.js';

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
