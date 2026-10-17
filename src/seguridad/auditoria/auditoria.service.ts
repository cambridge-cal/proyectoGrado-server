import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { desplazamiento, Pagina } from '../../compartido/paginacion.js';
import { AuditLog } from '../entidades/audit-log.entity.js';
import type {
  FiltrosAuditoriaDto,
  OpcionesAuditoriaDto,
  RegistroAuditoriaDto,
} from './dto/auditoria.dto.js';

/** Módulos del sistema que dejan huella en el Audit Log (Figura 6.2). */
export const MODULOS_AUDITORIA = [
  'SEGURIDAD',
  'USUARIOS',
  'HORARIOS',
  'EVALUACION',
] as const;
export type ModuloAuditoria = (typeof MODULOS_AUDITORIA)[number];

export interface EventoAuditoria {
  /** Usuario que realiza la operación (obligatorio, Figura 6.8). */
  usuarioId: string;
  modulo: ModuloAuditoria;
  accion: string;
  detalle?: string | null;
  ip?: string | null;
}

/**
 * Registro de auditoría (RF-08, RNF-11, RNF-33).
 * Solo inserta y consulta: no existe ninguna operación para modificar ni eliminar
 * registros, y la API no expone PUT, PATCH ni DELETE sobre el Audit Log.
 */
@Injectable()
export class AuditoriaService {
  private readonly logger = new Logger(AuditoriaService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly registros: Repository<AuditLog>,
  ) {}

  async registrar(evento: EventoAuditoria): Promise<void> {
    try {
      await this.registros.insert({
        usuario: { id: evento.usuarioId },
        modulo: evento.modulo,
        accion: evento.accion,
        detalle: evento.detalle ?? null,
        ip: evento.ip ?? null,
      });
    } catch (error) {
      // La auditoría nunca debe tumbar la operación principal, pero sí debe quedar en el log del servidor.
      this.logger.error(
        `No se pudo registrar ${evento.modulo}/${evento.accion}`,
        error as Error,
      );
    }
  }

  /** RF-08: historial paginado, del más reciente al más antiguo. */
  async listar(
    filtros: FiltrosAuditoriaDto,
  ): Promise<Pagina<RegistroAuditoriaDto>> {
    const consulta = this.registros
      .createQueryBuilder('registro')
      .innerJoin('registro.usuario', 'usuario')
      .addSelect([
        'usuario.id',
        'usuario.nombre',
        'usuario.email',
        'usuario.rol',
      ])
      .orderBy('registro.fechaHora', 'DESC');

    if (filtros.modulo)
      consulta.andWhere('registro.modulo = :modulo', {
        modulo: filtros.modulo,
      });
    if (filtros.accion)
      consulta.andWhere('registro.accion = :accion', {
        accion: filtros.accion,
      });
    if (filtros.usuarioId)
      consulta.andWhere('usuario.id = :usuarioId', {
        usuarioId: filtros.usuarioId,
      });
    // Las fechas se toman en la zona horaria de Colombia, la de la institución.
    if (filtros.desde) {
      consulta.andWhere(
        "registro.fechaHora >= (CAST(:desde AS date) AT TIME ZONE 'America/Bogota')",
        {
          desde: filtros.desde.slice(0, 10),
        },
      );
    }
    if (filtros.hasta) {
      consulta.andWhere(
        "registro.fechaHora < ((CAST(:hasta AS date) + 1) AT TIME ZONE 'America/Bogota')",
        { hasta: filtros.hasta.slice(0, 10) },
      );
    }

    const { skip, take } = desplazamiento(filtros);
    const [registros, total] = await consulta
      .skip(skip)
      .take(take)
      .getManyAndCount();
    return {
      datos: registros.map((r) => ({
        id: r.id,
        fechaHora: r.fechaHora,
        modulo: r.modulo,
        accion: r.accion,
        detalle: r.detalle,
        ip: r.ip,
        usuario: {
          id: r.usuario.id,
          nombre: r.usuario.nombre,
          email: r.usuario.email,
          rol: r.usuario.rol,
        },
      })),
      total,
      page: filtros.page,
      size: filtros.size,
    };
  }

  /** Valores para los filtros del cliente. */
  async opciones(): Promise<OpcionesAuditoriaDto> {
    const acciones = await this.registros
      .createQueryBuilder('registro')
      .select('DISTINCT registro.accion', 'accion')
      .orderBy('accion', 'ASC')
      .getRawMany<{ accion: string }>();
    return {
      modulos: [...MODULOS_AUDITORIA],
      acciones: acciones.map((a) => a.accion),
    };
  }
}
