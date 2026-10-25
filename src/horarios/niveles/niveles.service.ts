import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, ILike } from 'typeorm';
import type { Actor } from '../../compartido/actor.js';
import { conRestricciones } from '../../compartido/errores-bd.js';
import { desplazamiento, Pagina } from '../../compartido/paginacion.js';
import { AuditoriaService } from '../../seguridad/auditoria/auditoria.service.js';
import { NivelIdioma } from '../entidades/nivel-idioma.entity.js';
import {
  ActualizarNivelDto,
  CrearNivelDto,
  FiltrosNivelesDto,
} from './nivel.dto.js';

const MENSAJES = {
  unico: 'Ya existe un nivel con ese código.',
  enUso: 'El nivel tiene cursos asociados y no se puede eliminar.',
};

/** Niveles de idioma (RF-10). */
@Injectable()
export class NivelesService {
  constructor(
    @InjectDataSource() private readonly fuente: DataSource,
    private readonly auditoria: AuditoriaService,
  ) {}

  private get repo() {
    return this.fuente.getRepository(NivelIdioma);
  }

  async listar(filtros: FiltrosNivelesDto): Promise<Pagina<NivelIdioma>> {
    const { skip, take } = desplazamiento(filtros);
    const [datos, total] = await this.repo.findAndCount({
      where: filtros.idioma ? { idioma: ILike(filtros.idioma) } : {},
      order: { idioma: 'ASC', codigo: 'ASC' },
      skip,
      take,
    });
    return { datos, total, page: filtros.page, size: filtros.size };
  }

  async obtener(id: string): Promise<NivelIdioma> {
    const nivel = await this.repo.findOneBy({ id });
    if (!nivel) throw new NotFoundException('El nivel de idioma no existe.');
    return nivel;
  }

  async crear(datos: CrearNivelDto, actor: Actor): Promise<NivelIdioma> {
    const nivel = await conRestricciones(
      () => this.repo.save(this.repo.create(datos)),
      MENSAJES,
    );
    await this.registrar(actor, 'CREAR_NIVEL', {
      nivelId: nivel.id,
      codigo: nivel.codigo,
    });
    return nivel;
  }

  async actualizar(
    id: string,
    datos: ActualizarNivelDto,
    actor: Actor,
  ): Promise<NivelIdioma> {
    const nivel = await this.obtener(id);
    Object.assign(nivel, datos);
    const guardado = await conRestricciones(
      () => this.repo.save(nivel),
      MENSAJES,
    );
    await this.registrar(actor, 'ACTUALIZAR_NIVEL', {
      nivelId: id,
      campos: Object.keys(datos),
    });
    return guardado;
  }

  async eliminar(id: string, actor: Actor): Promise<void> {
    const nivel = await this.obtener(id);
    await conRestricciones(() => this.repo.delete({ id }), MENSAJES);
    await this.registrar(actor, 'ELIMINAR_NIVEL', {
      nivelId: id,
      codigo: nivel.codigo,
    });
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
