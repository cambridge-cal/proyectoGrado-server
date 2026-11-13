import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { Actor } from '../../compartido/actor.js';
import { desplazamiento, Pagina } from '../../compartido/paginacion.js';
import { AuditoriaService } from '../../seguridad/auditoria/auditoria.service.js';
import { Alerta, TipoAlerta } from '../entidades/alerta.entity.js';
import { EstadoEvaluacion } from '../entidades/estado-evaluacion.enum.js';
import { Evaluacion } from '../entidades/evaluacion.entity.js';
import { FiltrosAlertasDto } from './kdd.dto.js';

export interface AlertaRespuesta {
  id: string;
  tipo: TipoAlerta;
  mensaje: string;
  leida: boolean;
  creadaEn: Date;
  docente: { id: string; nombre: string };
  periodo: { id: string; nombre: string };
  puntajeGlobal: number | null;
  evaluacionId: string | null;
}

/** Consulta y revisión de las alertas del KDD (RF-44). */
@Injectable()
export class AlertasService {
  constructor(
    @InjectDataSource() private readonly fuente: DataSource,
    private readonly auditoria: AuditoriaService,
  ) {}

  private consulta() {
    return this.fuente
      .getRepository(Alerta)
      .createQueryBuilder('alerta')
      .innerJoinAndSelect('alerta.docente', 'docente')
      .innerJoinAndSelect('docente.usuario', 'usuario')
      .innerJoinAndSelect('alerta.periodoAcademico', 'periodo')
      .leftJoinAndSelect('alerta.resultadoKdd', 'resultado')
      .leftJoinAndSelect('resultado.evaluacion', 'evaluacion');
  }

  async listar(filtros: FiltrosAlertasDto): Promise<Pagina<AlertaRespuesta>> {
    const consulta = this.consulta()
      .orderBy('alerta.leida', 'ASC')
      .addOrderBy('alerta.creadaEn', 'DESC');
    if (filtros.periodoId)
      consulta.andWhere('periodo.id = :periodo', {
        periodo: filtros.periodoId,
      });
    if (filtros.tipo)
      consulta.andWhere('alerta.tipo = :tipo', { tipo: filtros.tipo });
    if (filtros.leida !== undefined)
      consulta.andWhere('alerta.leida = :leida', { leida: filtros.leida });
    const { skip, take } = desplazamiento(filtros);
    const [datos, total] = await consulta
      .skip(skip)
      .take(take)
      .getManyAndCount();
    return {
      datos: datos.map((alerta) => this.aRespuesta(alerta)),
      total,
      page: filtros.page,
      size: filtros.size,
    };
  }

  /**
   * RF-44: marca la alerta como leída. Si era la última sin leer de una evaluación en
   * ALERTA, la evaluación pasa a CERRADA (Figura 6.15).
   */
  async marcarLeida(id: string, actor: Actor): Promise<AlertaRespuesta> {
    const alerta = await this.consulta()
      .where('alerta.id = :id', { id })
      .getOne();
    if (!alerta) throw new NotFoundException('La alerta no existe.');
    if (!alerta.leida) {
      await this.fuente.transaction(async (tx) => {
        await tx.getRepository(Alerta).update({ id }, { leida: true });
        const evaluacion = alerta.resultadoKdd?.evaluacion;
        if (!evaluacion) return;
        const pendientes = await tx.getRepository(Alerta).countBy({
          resultadoKdd: { id: alerta.resultadoKdd!.id },
          leida: false,
        });
        if (pendientes === 0)
          await tx
            .getRepository(Evaluacion)
            .update(
              { id: evaluacion.id, estado: EstadoEvaluacion.ALERTA },
              { estado: EstadoEvaluacion.CERRADA },
            );
      });
      alerta.leida = true;
      await this.auditoria.registrar({
        usuarioId: actor.id,
        modulo: 'EVALUACION',
        accion: 'MARCAR_ALERTA_LEIDA',
        detalle: JSON.stringify({ alertaId: id, tipo: alerta.tipo }),
        ip: actor.ip,
      });
    }
    return this.aRespuesta(alerta);
  }

  private aRespuesta(alerta: Alerta): AlertaRespuesta {
    return {
      id: alerta.id,
      tipo: alerta.tipo,
      mensaje: alerta.mensaje,
      leida: alerta.leida,
      creadaEn: alerta.creadaEn,
      docente: {
        id: alerta.docente.id,
        nombre: alerta.docente.usuario.nombre,
      },
      periodo: {
        id: alerta.periodoAcademico.id,
        nombre: alerta.periodoAcademico.nombre,
      },
      puntajeGlobal: alerta.resultadoKdd?.puntajeGlobal ?? null,
      evaluacionId: alerta.resultadoKdd?.evaluacion?.id ?? null,
    };
  }
}
