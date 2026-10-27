import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, FindOptionsWhere } from 'typeorm';
import type { Actor } from '../../compartido/actor.js';
import { conRestricciones } from '../../compartido/errores-bd.js';
import { desplazamiento, Pagina } from '../../compartido/paginacion.js';
import { AuditoriaService } from '../../seguridad/auditoria/auditoria.service.js';
import { Aula } from '../entidades/aula.entity.js';
import {
  ActualizarAulaDto,
  CrearAulaDto,
  FiltrosAulasDto,
} from './aula.dto.js';

const MENSAJES = {
  unico: 'Ya existe un aula con ese código.',
  enUso: 'El aula está en uso y no se puede eliminar. Desactívala.',
};

/** Aulas (RF-13). Las inactivas no entran al motor de horarios. */
@Injectable()
export class AulasService {
  constructor(
    @InjectDataSource() private readonly fuente: DataSource,
    private readonly auditoria: AuditoriaService,
  ) {}

  private get repo() {
    return this.fuente.getRepository(Aula);
  }

  async listar(filtros: FiltrosAulasDto): Promise<Pagina<Aula>> {
    const where: FindOptionsWhere<Aula> = {};
    if (filtros.tipo) where.tipo = filtros.tipo;
    if (filtros.activa !== undefined) where.activa = filtros.activa;
    const { skip, take } = desplazamiento(filtros);
    const [datos, total] = await this.repo.findAndCount({
      where,
      order: { codigo: 'ASC' },
      skip,
      take,
    });
    return { datos, total, page: filtros.page, size: filtros.size };
  }

  async obtener(id: string): Promise<Aula> {
    const aula = await this.repo.findOneBy({ id });
    if (!aula) throw new NotFoundException('El aula no existe.');
    return aula;
  }

  async crear(datos: CrearAulaDto, actor: Actor): Promise<Aula> {
    const aula = await conRestricciones(
      () =>
        this.repo.save(
          this.repo.create({ ...datos, activa: datos.activa ?? true }),
        ),
      MENSAJES,
    );
    await this.registrar(actor, 'CREAR_AULA', {
      aulaId: aula.id,
      codigo: aula.codigo,
    });
    return aula;
  }

  async actualizar(
    id: string,
    datos: ActualizarAulaDto,
    actor: Actor,
  ): Promise<Aula> {
    const aula = Object.assign(await this.obtener(id), datos);
    const guardada = await conRestricciones(
      () => this.repo.save(aula),
      MENSAJES,
    );
    await this.registrar(actor, 'ACTUALIZAR_AULA', {
      aulaId: id,
      campos: Object.keys(datos),
    });
    return guardada;
  }

  async eliminar(id: string, actor: Actor): Promise<void> {
    const aula = await this.obtener(id);
    await conRestricciones(() => this.repo.delete({ id }), MENSAJES);
    await this.registrar(actor, 'ELIMINAR_AULA', {
      aulaId: id,
      codigo: aula.codigo,
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
