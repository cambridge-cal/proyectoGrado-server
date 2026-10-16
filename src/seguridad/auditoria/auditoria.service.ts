import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../entidades/audit-log.entity.js';

export interface EventoAuditoria {
  /** Usuario que realiza la operación (obligatorio, Figura 6.8). */
  usuarioId: string;
  modulo: string;
  accion: string;
  detalle?: string | null;
  ip?: string | null;
}

/**
 * Registro de auditoría (RNF-11). Solo inserta: no existe operación para
 * modificar ni eliminar registros. El listado y filtros llegan con TKT-011.
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
}
