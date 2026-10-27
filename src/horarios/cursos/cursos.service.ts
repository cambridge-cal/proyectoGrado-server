import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { Actor } from '../../compartido/actor.js';
import {
  conRestricciones,
  patronBusqueda,
} from '../../compartido/errores-bd.js';
import { desplazamiento, Pagina } from '../../compartido/paginacion.js';
import { AuditoriaService } from '../../seguridad/auditoria/auditoria.service.js';
import { Curso } from '../entidades/curso.entity.js';
import { NivelIdioma } from '../entidades/nivel-idioma.entity.js';
import {
  ActualizarCursoDto,
  CrearCursoDto,
  FiltrosCursosDto,
} from './curso.dto.js';

const MENSAJES = {
  enUso: 'El curso tiene grupos asociados y no se puede eliminar.',
};

/** Cursos (RF-11). Cada curso pertenece a un único nivel de idioma. */
@Injectable()
export class CursosService {
  constructor(
    @InjectDataSource() private readonly fuente: DataSource,
    private readonly auditoria: AuditoriaService,
  ) {}

  private get repo() {
    return this.fuente.getRepository(Curso);
  }

  async listar(filtros: FiltrosCursosDto): Promise<Pagina<Curso>> {
    const consulta = this.repo
      .createQueryBuilder('curso')
      .innerJoinAndSelect('curso.nivelIdioma', 'nivel')
      .orderBy('nivel.idioma', 'ASC')
      .addOrderBy('nivel.codigo', 'ASC')
      .addOrderBy('curso.nombre', 'ASC');
    if (filtros.nivelIdiomaId)
      consulta.andWhere('nivel.id = :nivel', { nivel: filtros.nivelIdiomaId });
    if (filtros.busqueda)
      consulta.andWhere('curso.nombre ILIKE :texto', {
        texto: patronBusqueda(filtros.busqueda),
      });
    const { skip, take } = desplazamiento(filtros);
    const [datos, total] = await consulta
      .skip(skip)
      .take(take)
      .getManyAndCount();
    return { datos, total, page: filtros.page, size: filtros.size };
  }

  async obtener(id: string): Promise<Curso> {
    const curso = await this.repo.findOne({
      where: { id },
      relations: { nivelIdioma: true },
    });
    if (!curso) throw new NotFoundException('El curso no existe.');
    return curso;
  }

  async crear(datos: CrearCursoDto, actor: Actor): Promise<Curso> {
    const nivelIdioma = await this.nivel(datos.nivelIdiomaId);
    const curso = await this.repo.save(
      this.repo.create({
        nombre: datos.nombre,
        intensidadHoraria: datos.intensidadHoraria,
        nivelIdioma,
      }),
    );
    await this.registrar(actor, 'CREAR_CURSO', {
      cursoId: curso.id,
      nombre: curso.nombre,
    });
    return curso;
  }

  async actualizar(
    id: string,
    datos: ActualizarCursoDto,
    actor: Actor,
  ): Promise<Curso> {
    const curso = await this.obtener(id);
    if (datos.nivelIdiomaId)
      curso.nivelIdioma = await this.nivel(datos.nivelIdiomaId);
    if (datos.nombre !== undefined) curso.nombre = datos.nombre;
    if (datos.intensidadHoraria !== undefined)
      curso.intensidadHoraria = datos.intensidadHoraria;
    const guardado = await this.repo.save(curso);
    await this.registrar(actor, 'ACTUALIZAR_CURSO', {
      cursoId: id,
      campos: Object.keys(datos),
    });
    return guardado;
  }

  async eliminar(id: string, actor: Actor): Promise<void> {
    const curso = await this.obtener(id);
    await conRestricciones(() => this.repo.delete({ id }), MENSAJES);
    await this.registrar(actor, 'ELIMINAR_CURSO', {
      cursoId: id,
      nombre: curso.nombre,
    });
  }

  private async nivel(id: string): Promise<NivelIdioma> {
    const nivel = await this.fuente
      .getRepository(NivelIdioma)
      .findOneBy({ id });
    if (!nivel) throw new NotFoundException('El nivel de idioma no existe.');
    return nivel;
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
