import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import type { Actor } from '../../compartido/actor.js';
import { AuditoriaService } from '../../seguridad/auditoria/auditoria.service.js';
import { Estudiante } from '../../seguridad/entidades/estudiante.entity.js';
import { EstudianteGrupo } from '../entidades/estudiante-grupo.entity.js';
import { Grupo } from '../entidades/grupo.entity.js';
import { normalizar } from '../motor/problema.js';
import { FiltrosInscripcionesDto, UnirseGrupoDto } from './inscripcion.dto.js';

export interface InscripcionRespuesta {
  id: string;
  activo: boolean;
  fechaInscripcion: string;
  fechaBaja: string | null;
  grupo: {
    id: string;
    codigo: string;
    jornada: string;
    curso: string;
    idioma: string;
    nivel: string;
  };
}

function respuesta(i: EstudianteGrupo): InscripcionRespuesta {
  return {
    id: i.id,
    activo: i.activo,
    fechaInscripcion: i.fechaInscripcion,
    fechaBaja: i.fechaBaja,
    grupo: {
      id: i.grupo.id,
      codigo: i.grupo.codigo,
      jornada: i.grupo.jornada,
      curso: i.grupo.curso.nombre,
      idioma: i.grupo.curso.nivelIdioma.idioma,
      nivel: i.grupo.curso.nivelIdioma.codigo,
    },
  };
}

const CON_GRUPO = { grupo: { curso: { nivelIdioma: true } } } as const;

/**
 * Inscripción y baja de estudiantes en grupos (RF-26, RF-27, Figura 6.17). Un estudiante
 * puede tener varios grupos activos, como máximo uno por idioma.
 */
@Injectable()
export class InscripcionesService {
  constructor(
    @InjectDataSource() private readonly fuente: DataSource,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** Traduce "yo" o un id al estudiante del usuario autenticado; nadie actúa por otro. */
  async estudianteDe(actor: Actor, id: string): Promise<string> {
    const estudiante = await this.fuente
      .getRepository(Estudiante)
      .findOneBy({ usuario: { id: actor.id } });
    if (!estudiante) {
      throw new ForbiddenException(
        'Tu cuenta no tiene perfil de estudiante. Pídelo al Administrador.',
      );
    }
    if (id !== 'yo' && id !== estudiante.id) {
      throw new ForbiddenException(
        'Solo puedes gestionar tus propias inscripciones.',
      );
    }
    return estudiante.id;
  }

  async listar(
    estudianteId: string,
    filtros: FiltrosInscripcionesDto,
  ): Promise<InscripcionRespuesta[]> {
    const inscripciones = await this.fuente
      .getRepository(EstudianteGrupo)
      .find({
        where: {
          estudiante: { id: estudianteId },
          ...(filtros.historial ? {} : { activo: true }),
        },
        relations: CON_GRUPO,
        order: { activo: 'DESC', fechaInscripcion: 'DESC' },
      });
    return inscripciones.map(respuesta);
  }

  /** RF-26: tres validaciones sucesivas de la Figura 6.17: código, cupo e idioma. */
  async unirse(
    estudianteId: string,
    dto: UnirseGrupoDto,
    actor: Actor,
  ): Promise<InscripcionRespuesta> {
    const inscripcion = await this.fuente.transaction(async (tx) => {
      // Bloquea al estudiante para que dos solicitudes simultáneas no salten la regla del idioma.
      await tx
        .getRepository(Estudiante)
        .createQueryBuilder('e')
        .setLock('pessimistic_write')
        .where('e.id = :id', { id: estudianteId })
        .getOne();

      const grupo = await tx
        .getRepository(Grupo)
        .createQueryBuilder('g')
        .setLock('pessimistic_write')
        .where('g.codigo_acceso = :codigo', { codigo: dto.codigoAcceso })
        .getOne();
      if (!grupo) {
        throw new NotFoundException(
          'El código de acceso no corresponde a ningún grupo.',
        );
      }
      const completo = await tx.findOne(Grupo, {
        where: { id: grupo.id },
        relations: { curso: { nivelIdioma: true } },
      });

      const inscritos = await tx.countBy(EstudianteGrupo, {
        grupo: { id: grupo.id },
        activo: true,
      });
      if (inscritos >= grupo.cupoMaximo) {
        throw new ConflictException(
          `El grupo ${grupo.codigo} no tiene cupo disponible.`,
        );
      }

      const idioma = completo!.curso.nivelIdioma.idioma;
      const mismoIdioma = (await this.activas(tx, estudianteId)).find(
        (i) =>
          normalizar(i.grupo.curso.nivelIdioma.idioma) === normalizar(idioma),
      );
      if (mismoIdioma) {
        throw new ConflictException(
          mismoIdioma.grupo.id === grupo.id
            ? `Ya estás inscrito en el grupo ${grupo.codigo}.`
            : `Ya estás inscrito en el grupo ${mismoIdioma.grupo.codigo} de ${idioma}. Date de baja de ese grupo para cambiarte.`,
        );
      }

      const nueva = await tx.save(
        tx.create(EstudianteGrupo, {
          estudiante: { id: estudianteId },
          grupo: { id: grupo.id },
          activo: true,
        }),
      );
      return tx.findOneOrFail(EstudianteGrupo, {
        where: { id: nueva.id },
        relations: CON_GRUPO,
      });
    });
    await this.registrar(actor, 'INSCRIBIR_GRUPO', {
      estudianteId,
      grupoId: inscripcion.grupo.id,
    });
    return respuesta(inscripcion);
  }

  /** RF-27: marca la inscripción como inactiva sin borrarla. */
  async darDeBaja(
    estudianteId: string,
    grupoId: string,
    actor: Actor,
  ): Promise<InscripcionRespuesta> {
    const repositorio = this.fuente.getRepository(EstudianteGrupo);
    const inscripcion = await repositorio.findOne({
      where: {
        estudiante: { id: estudianteId },
        grupo: { id: grupoId },
        activo: true,
      },
      relations: CON_GRUPO,
    });
    if (!inscripcion) {
      throw new NotFoundException('No estás inscrito en ese grupo.');
    }
    inscripcion.activo = false;
    inscripcion.fechaBaja = new Date().toISOString().slice(0, 10);
    await repositorio.save(inscripcion);
    await this.registrar(actor, 'BAJA_GRUPO', { estudianteId, grupoId });
    return respuesta(inscripcion);
  }

  private activas(tx: EntityManager, estudianteId: string) {
    return tx.find(EstudianteGrupo, {
      where: { estudiante: { id: estudianteId }, activo: true },
      relations: CON_GRUPO,
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
