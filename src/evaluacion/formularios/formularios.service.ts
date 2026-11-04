import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { Actor } from '../../compartido/actor.js';
import { patronBusqueda } from '../../compartido/errores-bd.js';
import { desplazamiento, Pagina } from '../../compartido/paginacion.js';
import { AuditoriaService } from '../../seguridad/auditoria/auditoria.service.js';
import { PeriodoAcademico } from '../../horarios/entidades/periodo-academico.entity.js';
import { Dimension } from '../entidades/dimension.entity.js';
import { Formulario } from '../entidades/formulario.entity.js';
import { Pregunta } from '../entidades/pregunta.entity.js';
import {
  ActualizarFormularioDto,
  CrearFormularioDto,
  FiltrosFormulariosDto,
} from './formulario.dto.js';

/** Formularios de evaluación docente (RF-28, RF-29, RF-30). */
@Injectable()
export class FormulariosService {
  constructor(
    @InjectDataSource() private readonly fuente: DataSource,
    private readonly auditoria: AuditoriaService,
  ) {}

  private get repo() {
    return this.fuente.getRepository(Formulario);
  }

  async listar(filtros: FiltrosFormulariosDto): Promise<Pagina<Formulario>> {
    const consulta = this.repo
      .createQueryBuilder('formulario')
      .innerJoinAndSelect('formulario.periodoAcademico', 'periodo')
      .leftJoinAndSelect('formulario.dimensiones', 'dimension')
      .leftJoinAndSelect('dimension.preguntas', 'pregunta')
      .orderBy('formulario.creadoEn', 'DESC')
      .addOrderBy('dimension.orden', 'ASC')
      .addOrderBy('pregunta.orden', 'ASC');

    if (filtros.periodoAcademicoId)
      consulta.andWhere('periodo.id = :periodo', {
        periodo: filtros.periodoAcademicoId,
      });
    if (filtros.busqueda)
      consulta.andWhere('formulario.nombre ILIKE :texto', {
        texto: patronBusqueda(filtros.busqueda),
      });

    const { skip, take } = desplazamiento(filtros);
    const [datos, total] = await consulta
      .skip(skip)
      .take(take)
      .getManyAndCount();
    return { datos, total, page: filtros.page, size: filtros.size };
  }

  async obtener(id: string): Promise<Formulario> {
    const formulario = await this.repo.findOne({
      where: { id },
      relations: {
        periodoAcademico: true,
        dimensiones: { preguntas: true },
      },
      order: {
        dimensiones: { orden: 'ASC', preguntas: { orden: 'ASC' } },
      },
    });
    if (!formulario) throw new NotFoundException('El formulario no existe.');
    return formulario;
  }

  async crear(datos: CrearFormularioDto, actor: Actor): Promise<Formulario> {
    const periodo = await this.periodo(datos.periodoAcademicoId);

    const formulario = this.repo.create({
      nombre: datos.nombre,
      periodoAcademico: periodo,
      dimensiones: datos.dimensiones.map((dim) => {
        const dimension = new Dimension();
        dimension.nombre = dim.nombre;
        dimension.orden = dim.orden;
        dimension.preguntas = dim.preguntas.map((preg) => {
          const pregunta = new Pregunta();
          pregunta.texto = preg.texto;
          pregunta.orden = preg.orden;
          return pregunta;
        });
        return dimension;
      }),
    });

    const guardado = await this.repo.save(formulario);
    await this.registrar(actor, 'CREAR_FORMULARIO', {
      formularioId: guardado.id,
      nombre: guardado.nombre,
    });
    return this.obtener(guardado.id);
  }

  async actualizar(
    id: string,
    datos: ActualizarFormularioDto,
    actor: Actor,
  ): Promise<Formulario> {
    const formulario = await this.obtener(id);

    if (datos.nombre !== undefined) formulario.nombre = datos.nombre;
    if (datos.activo !== undefined) formulario.activo = datos.activo;
    if (datos.periodoAcademicoId)
      formulario.periodoAcademico = await this.periodo(
        datos.periodoAcademicoId,
      );

    if (datos.dimensiones) {
      await this.fuente.getRepository(Dimension).delete({
        formulario: { id },
      });

      formulario.dimensiones = datos.dimensiones.map((dim) => {
        const dimension = new Dimension();
        dimension.nombre = dim.nombre;
        dimension.orden = dim.orden;
        dimension.preguntas = dim.preguntas.map((preg) => {
          const pregunta = new Pregunta();
          pregunta.texto = preg.texto;
          pregunta.orden = preg.orden;
          return pregunta;
        });
        return dimension;
      });
    }

    await this.repo.save(formulario);
    await this.registrar(actor, 'ACTUALIZAR_FORMULARIO', {
      formularioId: id,
      campos: Object.keys(datos),
    });
    return this.obtener(id);
  }

  async eliminar(id: string, actor: Actor): Promise<void> {
    const formulario = await this.obtener(id);
    await this.repo.delete({ id });
    await this.registrar(actor, 'ELIMINAR_FORMULARIO', {
      formularioId: id,
      nombre: formulario.nombre,
    });
  }

  private async periodo(id: string): Promise<PeriodoAcademico> {
    const periodo = await this.fuente
      .getRepository(PeriodoAcademico)
      .findOneBy({ id });
    if (!periodo)
      throw new NotFoundException('El período académico no existe.');
    return periodo;
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
