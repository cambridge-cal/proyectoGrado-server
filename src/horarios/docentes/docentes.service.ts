import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import type { Actor } from '../../compartido/actor.js';
import {
  conRestricciones,
  patronBusqueda,
} from '../../compartido/errores-bd.js';
import { desplazamiento, Pagina } from '../../compartido/paginacion.js';
import { AuditoriaService } from '../../seguridad/auditoria/auditoria.service.js';
import { Docente } from '../../seguridad/entidades/docente.entity.js';
import { Rol } from '../../seguridad/entidades/rol.enum.js';
import { Usuario } from '../../seguridad/entidades/usuario.entity.js';
import { CARGA_MAXIMA_POR_DEFECTO } from '../../seguridad/usuarios/usuarios.service.js';
import { Disponibilidad } from '../entidades/disponibilidad.entity.js';
import { FranjaHoraria } from '../entidades/franja-horaria.entity.js';
import {
  ActualizarDocenteDto,
  CrearDocenteDto,
  DocenteRespuestaDto,
  FiltrosDocentesDto,
} from './docente.dto.js';

/** Docentes (RF-15) y sus disponibilidades (RF-16). */
@Injectable()
export class DocentesService {
  constructor(
    @InjectDataSource() private readonly fuente: DataSource,
    private readonly auditoria: AuditoriaService,
  ) {}

  async listar(
    filtros: FiltrosDocentesDto,
  ): Promise<Pagina<DocenteRespuestaDto>> {
    const consulta = this.fuente
      .getRepository(Docente)
      .createQueryBuilder('docente')
      .innerJoinAndSelect('docente.usuario', 'usuario')
      .orderBy('usuario.nombre', 'ASC');
    if (filtros.busqueda) {
      consulta.andWhere(
        '(usuario.nombre ILIKE :t OR usuario.email ILIKE :t OR docente.especialidad ILIKE :t)',
        {
          t: patronBusqueda(filtros.busqueda),
        },
      );
    }
    const { skip, take } = desplazamiento(filtros);
    const [docentes, total] = await consulta
      .skip(skip)
      .take(take)
      .getManyAndCount();
    const conteos = await this.conteoDisponibilidad(docentes.map((d) => d.id));
    return {
      datos: docentes.map((d) => aRespuesta(d, conteos.get(d.id) ?? 0)),
      total,
      page: filtros.page,
      size: filtros.size,
    };
  }

  async obtener(id: string): Promise<DocenteRespuestaDto> {
    const docente = await this.buscar(this.fuente.manager, id);
    const conteos = await this.conteoDisponibilidad([id]);
    return aRespuesta(docente, conteos.get(id) ?? 0);
  }

  async crear(
    datos: CrearDocenteDto,
    actor: Actor,
  ): Promise<DocenteRespuestaDto> {
    const usuario = await this.fuente.getRepository(Usuario).findOne({
      where: { id: datos.usuarioId },
      relations: { docente: true },
    });
    if (!usuario) throw new NotFoundException('El usuario no existe.');
    if (usuario.rol !== Rol.DOCENTE)
      throw new BadRequestException(
        'Solo un usuario con rol DOCENTE puede tener perfil de docente.',
      );
    if (usuario.docente)
      throw new ConflictException('Ese usuario ya tiene perfil de docente.');

    const docente = await conRestricciones(
      () =>
        this.fuente.getRepository(Docente).save({
          usuario,
          especialidad: datos.especialidad,
          cargaMaximaSemanal:
            datos.cargaMaximaSemanal ?? CARGA_MAXIMA_POR_DEFECTO,
        }),
      { unico: 'Ese usuario ya tiene perfil de docente.' },
    );
    await this.registrar(actor, 'CREAR_DOCENTE', {
      docenteId: docente.id,
      usuarioId: usuario.id,
    });
    return aRespuesta({ ...docente, usuario } as Docente, 0);
  }

  async actualizar(
    id: string,
    datos: ActualizarDocenteDto,
    actor: Actor,
  ): Promise<DocenteRespuestaDto> {
    const docente = await this.buscar(this.fuente.manager, id);
    Object.assign(docente, datos);
    await this.fuente.getRepository(Docente).save(docente);
    await this.registrar(actor, 'ACTUALIZAR_DOCENTE', {
      docenteId: id,
      campos: Object.keys(datos),
    });
    return this.obtener(id);
  }

  /** Quita el perfil de docente y sus disponibilidades; la cuenta de usuario se conserva. */
  async eliminar(id: string, actor: Actor): Promise<void> {
    await this.buscar(this.fuente.manager, id);
    await conRestricciones(
      () =>
        this.fuente.transaction(async (tx) => {
          await tx.delete(Disponibilidad, { docente: { id } });
          await tx.delete(Docente, { id });
        }),
      {
        enUso:
          'El docente tiene horarios o evaluaciones asociados y no se puede eliminar.',
      },
    );
    await this.registrar(actor, 'ELIMINAR_DOCENTE', { docenteId: id });
  }

  /** Id del perfil de docente del usuario que inició sesión. */
  async idDelUsuario(usuarioId: string): Promise<string> {
    const docente = await this.fuente
      .getRepository(Docente)
      .findOneBy({ usuario: { id: usuarioId } });
    if (!docente)
      throw new ForbiddenException(
        'Tu cuenta no tiene perfil de docente. Pídelo al Administrador.',
      );
    return docente.id;
  }

  /** Franjas en las que el docente está disponible, en orden de la semana. */
  async disponibilidad(docenteId: string): Promise<FranjaHoraria[]> {
    await this.buscar(this.fuente.manager, docenteId);
    const filas = await this.fuente.getRepository(Disponibilidad).find({
      where: { docente: { id: docenteId } },
      relations: { franjaHoraria: true },
      order: { franjaHoraria: { diaSemana: 'ASC', horaInicio: 'ASC' } },
    });
    return filas.map((fila) => fila.franjaHoraria);
  }

  /** RF-16: reemplaza las franjas disponibles del docente por las recibidas. */
  async reemplazarDisponibilidad(
    docenteId: string,
    franjaIds: string[],
    actor: Actor,
  ): Promise<FranjaHoraria[]> {
    await this.fuente.transaction(async (tx) => {
      const docente = await this.buscar(tx, docenteId);
      const franjas = franjaIds.length
        ? await tx.findBy(FranjaHoraria, { id: In(franjaIds) })
        : [];
      if (franjas.length !== franjaIds.length)
        throw new BadRequestException('Alguna de las franjas no existe.');
      await tx.delete(Disponibilidad, { docente: { id: docenteId } });
      if (franjas.length) {
        await tx.insert(
          Disponibilidad,
          franjas.map((franjaHoraria) => ({ docente, franjaHoraria })),
        );
      }
    });
    await this.registrar(actor, 'ACTUALIZAR_DISPONIBILIDAD', {
      docenteId,
      franjas: franjaIds.length,
    });
    return this.disponibilidad(docenteId);
  }

  private async buscar(manager: EntityManager, id: string): Promise<Docente> {
    const docente = await manager.findOne(Docente, {
      where: { id },
      relations: { usuario: true },
    });
    if (!docente) throw new NotFoundException('El docente no existe.');
    return docente;
  }

  private async conteoDisponibilidad(
    ids: string[],
  ): Promise<Map<string, number>> {
    if (!ids.length) return new Map();
    const filas = await this.fuente
      .getRepository(Disponibilidad)
      .createQueryBuilder('d')
      .select('d.docente_id', 'docenteId')
      .addSelect('COUNT(*)::int', 'total')
      .where('d.docente_id IN (:...ids)', { ids })
      .groupBy('d.docente_id')
      .getRawMany<{ docenteId: string; total: number }>();
    return new Map(filas.map((f) => [f.docenteId, Number(f.total)]));
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

function aRespuesta(
  docente: Docente,
  franjasDisponibles: number,
): DocenteRespuestaDto {
  return {
    id: docente.id,
    usuarioId: docente.usuario.id,
    nombre: docente.usuario.nombre,
    email: docente.usuario.email,
    activo: docente.usuario.activo,
    especialidad: docente.especialidad,
    cargaMaximaSemanal: docente.cargaMaximaSemanal,
    franjasDisponibles,
  };
}
