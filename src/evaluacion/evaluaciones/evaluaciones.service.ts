import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import type { Actor } from '../../compartido/actor.js';
import { patronBusqueda } from '../../compartido/errores-bd.js';
import { desplazamiento, Pagina } from '../../compartido/paginacion.js';
import { AuditoriaService } from '../../seguridad/auditoria/auditoria.service.js';
import { Docente } from '../../seguridad/entidades/docente.entity.js';
import { EstadoEvaluacion } from '../entidades/estado-evaluacion.enum.js';
import { Evaluacion } from '../entidades/evaluacion.entity.js';
import { Formulario } from '../entidades/formulario.entity.js';
import {
  AsignacionMasivaDto,
  AsignarEvaluacionDto,
  CambiarEstadoDto,
  FiltrosEvaluacionesDto,
} from './evaluacion.dto.js';

/** Evaluación tal como la ve el docente evaluado: sin respuestas ni estudiantes (RF-37, RNF-10). */
export interface EvaluacionDocente {
  id: string;
  estado: EstadoEvaluacion;
  creadoEn: Date;
  formulario: {
    id: string;
    nombre: string;
    periodo: { id: string; nombre: string };
  };
  /** Cuántos estudiantes la han respondido. */
  respondieron: number;
}

/** Asignación, consulta y eliminación de evaluaciones (RF-31, RF-32, RF-37, RF-38). */
@Injectable()
export class EvaluacionesService {
  constructor(
    @InjectDataSource() private readonly fuente: DataSource,
    private readonly auditoria: AuditoriaService,
  ) {}

  private get repo() {
    return this.fuente.getRepository(Evaluacion);
  }

  async listar(filtros: FiltrosEvaluacionesDto): Promise<Pagina<Evaluacion>> {
    const consulta = this.repo
      .createQueryBuilder('evaluacion')
      .innerJoinAndSelect('evaluacion.formulario', 'formulario')
      .innerJoinAndSelect('evaluacion.docente', 'docente')
      .innerJoinAndSelect('docente.usuario', 'usuario')
      .orderBy('evaluacion.creadoEn', 'DESC');

    if (filtros.formularioId)
      consulta.andWhere('formulario.id = :formulario', {
        formulario: filtros.formularioId,
      });
    if (filtros.docenteId)
      consulta.andWhere('docente.id = :docente', {
        docente: filtros.docenteId,
      });
    if (filtros.estado)
      consulta.andWhere('evaluacion.estado = :estado', {
        estado: filtros.estado,
      });
    if (filtros.busqueda)
      consulta.andWhere('usuario.nombre ILIKE :texto', {
        texto: patronBusqueda(filtros.busqueda),
      });

    const { skip, take } = desplazamiento(filtros);
    const [datos, total] = await consulta
      .skip(skip)
      .take(take)
      .getManyAndCount();
    return { datos, total, page: filtros.page, size: filtros.size };
  }

  async obtener(id: string): Promise<Evaluacion> {
    const evaluacion = await this.repo.findOne({
      where: { id },
      relations: {
        formulario: { periodoAcademico: true, dimensiones: { preguntas: true } },
        docente: { usuario: true },
      },
    });
    if (!evaluacion) throw new NotFoundException('La evaluación no existe.');
    return evaluacion;
  }

  /** RF-37: historial de evaluaciones del docente autenticado, de la más reciente a la más antigua. */
  async delDocente(actor: Actor): Promise<EvaluacionDocente[]> {
    const evaluaciones = await this.repo
      .createQueryBuilder('evaluacion')
      .innerJoinAndSelect('evaluacion.formulario', 'formulario')
      .innerJoinAndSelect('formulario.periodoAcademico', 'periodo')
      .innerJoin('evaluacion.docente', 'docente')
      .innerJoin('docente.usuario', 'usuario')
      .addSelect('evaluacion.estudiantesCompletaron')
      .where('usuario.id = :usuarioId', { usuarioId: actor.id })
      .orderBy('evaluacion.creadoEn', 'DESC')
      .getMany();
    return evaluaciones.map((evaluacion) => ({
      id: evaluacion.id,
      estado: evaluacion.estado,
      creadoEn: evaluacion.creadoEn,
      formulario: {
        id: evaluacion.formulario.id,
        nombre: evaluacion.formulario.nombre,
        periodo: {
          id: evaluacion.formulario.periodoAcademico.id,
          nombre: evaluacion.formulario.periodoAcademico.nombre,
        },
      },
      respondieron: evaluacion.estudiantesCompletaron.length,
    }));
  }

  async asignar(datos: AsignarEvaluacionDto, actor: Actor): Promise<Evaluacion> {
    const formulario = await this.formulario(datos.formularioId);
    const docente = await this.docente(datos.docenteId);

    const existente = await this.repo.findOne({
      where: {
        formulario: { id: formulario.id },
        docente: { id: docente.id },
      },
    });
    if (existente)
      throw new ConflictException(
        'Ya existe una evaluación para este docente en este formulario.',
      );

    const evaluacion = await this.repo.save(
      this.repo.create({
        formulario,
        docente,
        estado: EstadoEvaluacion.PENDIENTE,
      }),
    );

    await this.registrar(actor, 'ASIGNAR_EVALUACION', {
      evaluacionId: evaluacion.id,
      formularioId: formulario.id,
      docenteId: docente.id,
    });

    return this.obtener(evaluacion.id);
  }

  async asignarMasivo(
    datos: AsignacionMasivaDto,
    actor: Actor,
  ): Promise<{ creadas: number; omitidas: number }> {
    const formulario = await this.formulario(datos.formularioId);

    const docentes = await this.fuente
      .getRepository(Docente)
      .find({ where: { id: In(datos.docenteIds) } });

    if (docentes.length === 0)
      throw new NotFoundException('No se encontraron docentes válidos.');

    const existentes = await this.repo.find({
      where: {
        formulario: { id: formulario.id },
        docente: { id: In(docentes.map((d) => d.id)) },
      },
      relations: { docente: true },
    });

    const idsExistentes = new Set(existentes.map((e) => e.docente.id));
    const nuevos = docentes.filter((d) => !idsExistentes.has(d.id));

    if (nuevos.length > 0) {
      const entidades = nuevos.map((docente) =>
        this.repo.create({
          formulario,
          docente,
          estado: EstadoEvaluacion.PENDIENTE,
        }),
      );
      await this.repo.save(entidades);
    }

    await this.registrar(actor, 'ASIGNAR_EVALUACION_MASIVA', {
      formularioId: formulario.id,
      totalDocentes: datos.docenteIds.length,
      creadas: nuevos.length,
      omitidas: idsExistentes.size,
    });

    return { creadas: nuevos.length, omitidas: idsExistentes.size };
  }

  async cambiarEstado(
    id: string,
    datos: CambiarEstadoDto,
    actor: Actor,
  ): Promise<Evaluacion> {
    const evaluacion = await this.obtener(id);
    evaluacion.estado = datos.estado;
    await this.repo.save(evaluacion);
    await this.registrar(actor, 'CAMBIAR_ESTADO_EVALUACION', {
      evaluacionId: id,
      estado: datos.estado,
    });
    return this.obtener(id);
  }

  /** RF-38: elimina la evaluación y, en cascada, todas sus respuestas. */
  async eliminar(id: string, actor: Actor): Promise<void> {
    const evaluacion = await this.obtener(id);
    await this.repo.delete({ id });
    await this.registrar(actor, 'ELIMINAR_EVALUACION', {
      evaluacionId: id,
      docenteId: evaluacion.docente.id,
    });
  }

  private async formulario(id: string): Promise<Formulario> {
    const formulario = await this.fuente
      .getRepository(Formulario)
      .findOneBy({ id });
    if (!formulario)
      throw new NotFoundException('El formulario no existe.');
    return formulario;
  }

  private async docente(id: string): Promise<Docente> {
    const docente = await this.fuente
      .getRepository(Docente)
      .findOneBy({ id });
    if (!docente)
      throw new NotFoundException('El docente no existe.');
    return docente;
  }

  private registrar(actor: Actor, accion: string, detalle: object) {
    return this.auditoria.registrar({
      usuarioId: actor.id,
      modulo: 'EVALUACION',
      accion,
      detalle: JSON.stringify(detalle),
      ip: actor.ip,
    });
  }
}
