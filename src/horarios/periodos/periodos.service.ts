import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import type { Actor } from '../../compartido/actor.js';
import { conRestricciones } from '../../compartido/errores-bd.js';
import { desplazamiento, Pagina } from '../../compartido/paginacion.js';
import { AuditoriaService } from '../../seguridad/auditoria/auditoria.service.js';
import { PeriodoAcademico } from '../entidades/periodo-academico.entity.js';
import {
  ActualizarPeriodoDto,
  CrearPeriodoDto,
  FiltrosPeriodosDto,
} from './periodo.dto.js';

const MENSAJES = {
  unico: 'Ya existe un período con ese nombre.',
  enUso:
    'El período tiene horarios o evaluaciones asociados y no se puede eliminar.',
};

/** Períodos académicos (RF-09). Solo uno activo a la vez. */
@Injectable()
export class PeriodosService {
  constructor(
    @InjectDataSource() private readonly fuente: DataSource,
    private readonly auditoria: AuditoriaService,
  ) {}

  async listar(filtros: FiltrosPeriodosDto): Promise<Pagina<PeriodoAcademico>> {
    const { skip, take } = desplazamiento(filtros);
    const [datos, total] = await this.fuente
      .getRepository(PeriodoAcademico)
      .findAndCount({
        where: filtros.activo === undefined ? {} : { activo: filtros.activo },
        order: { fechaInicio: 'DESC' },
        skip,
        take,
      });
    return { datos, total, page: filtros.page, size: filtros.size };
  }

  /** El período activo, que usan el motor de horarios y las evaluaciones. */
  async activo(): Promise<PeriodoAcademico | null> {
    return this.fuente
      .getRepository(PeriodoAcademico)
      .findOneBy({ activo: true });
  }

  async obtener(id: string): Promise<PeriodoAcademico> {
    return this.buscar(this.fuente.manager, id);
  }

  async crear(datos: CrearPeriodoDto, actor: Actor): Promise<PeriodoAcademico> {
    validarFechas(datos.fechaInicio, datos.fechaFin);
    const periodo = await conRestricciones(
      () =>
        this.fuente.transaction(async (tx) => {
          if (datos.activo) await this.desactivarTodos(tx);
          return tx.save(
            tx.create(PeriodoAcademico, {
              ...datos,
              activo: datos.activo ?? false,
            }),
          );
        }),
      MENSAJES,
    );
    await this.registrar(actor, 'CREAR_PERIODO', {
      periodoId: periodo.id,
      nombre: periodo.nombre,
      activo: periodo.activo,
    });
    return periodo;
  }

  async actualizar(
    id: string,
    datos: ActualizarPeriodoDto,
    actor: Actor,
  ): Promise<PeriodoAcademico> {
    const periodo = await conRestricciones(
      () =>
        this.fuente.transaction(async (tx) => {
          const actual = await this.buscar(tx, id);
          validarFechas(
            datos.fechaInicio ?? actual.fechaInicio,
            datos.fechaFin ?? actual.fechaFin,
          );
          if (datos.activo && !actual.activo) await this.desactivarTodos(tx);
          Object.assign(actual, datos);
          return tx.save(actual);
        }),
      MENSAJES,
    );
    await this.registrar(actor, 'ACTUALIZAR_PERIODO', {
      periodoId: id,
      campos: Object.keys(datos),
    });
    return periodo;
  }

  async eliminar(id: string, actor: Actor): Promise<void> {
    const periodo = await this.buscar(this.fuente.manager, id);
    await conRestricciones(
      () => this.fuente.getRepository(PeriodoAcademico).delete({ id }),
      MENSAJES,
    );
    await this.registrar(actor, 'ELIMINAR_PERIODO', {
      periodoId: id,
      nombre: periodo.nombre,
    });
  }

  private async buscar(
    manager: EntityManager,
    id: string,
  ): Promise<PeriodoAcademico> {
    const periodo = await manager.findOneBy(PeriodoAcademico, { id });
    if (!periodo) throw new NotFoundException('El período no existe.');
    return periodo;
  }

  private desactivarTodos(tx: EntityManager) {
    return tx.update(PeriodoAcademico, { activo: true }, { activo: false });
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

function validarFechas(inicio: string, fin: string): void {
  if (fin.slice(0, 10) <= inicio.slice(0, 10)) {
    throw new BadRequestException(
      'La fecha de fin debe ser posterior a la de inicio.',
    );
  }
}
