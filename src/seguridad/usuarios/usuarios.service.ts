import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { desplazamiento, Pagina } from '../../compartido/paginacion.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { SALT_ROUNDS } from '../autenticacion/autenticacion.service.js';
import { Docente } from '../entidades/docente.entity.js';
import { Estudiante } from '../entidades/estudiante.entity.js';
import { Rol } from '../entidades/rol.enum.js';
import { Sesion } from '../entidades/sesion.entity.js';
import { Usuario } from '../entidades/usuario.entity.js';
import {
  ActualizarUsuarioDto,
  CrearUsuarioDto,
  FiltrosUsuariosDto,
  ResultadoEliminacionDto,
  UsuarioRespuestaDto,
} from './dto/usuario.dto.js';

/** Quién hace la operación, para validar reglas y para el Audit Log. */
export interface Actor {
  id: string;
  ip: string | null;
}

const VIOLACION_UNICA = '23505';
const VIOLACION_LLAVE_FORANEA = '23503';

function codigoPg(error: unknown): string | undefined {
  return error instanceof QueryFailedError
    ? (error.driverError as { code?: string }).code
    : undefined;
}

/** Gestión de usuarios para el Administrador (RF-06, RNF-29, RNF-32). */
@Injectable()
export class UsuariosService {
  constructor(
    @InjectDataSource() private readonly fuente: DataSource,
    private readonly auditoria: AuditoriaService,
  ) {}

  async listar(
    filtros: FiltrosUsuariosDto,
  ): Promise<Pagina<UsuarioRespuestaDto>> {
    const consulta = this.fuente
      .getRepository(Usuario)
      .createQueryBuilder('usuario')
      .leftJoinAndSelect('usuario.estudiante', 'estudiante')
      .leftJoinAndSelect('usuario.docente', 'docente')
      .orderBy('usuario.nombre', 'ASC')
      .addOrderBy('usuario.email', 'ASC');

    if (filtros.rol)
      consulta.andWhere('usuario.rol = :rol', { rol: filtros.rol });
    if (filtros.activo !== undefined) {
      consulta.andWhere('usuario.activo = :activo', { activo: filtros.activo });
    }
    if (filtros.busqueda) {
      consulta.andWhere(
        '(usuario.nombre ILIKE :texto OR usuario.email ILIKE :texto OR estudiante.codigo ILIKE :texto)',
        { texto: `%${filtros.busqueda.replace(/[\\%_]/g, '\\$&')}%` },
      );
    }

    const { skip, take } = desplazamiento(filtros);
    const [usuarios, total] = await consulta
      .skip(skip)
      .take(take)
      .getManyAndCount();
    return {
      datos: usuarios.map(aRespuesta),
      total,
      page: filtros.page,
      size: filtros.size,
    };
  }

  async obtener(id: string): Promise<UsuarioRespuestaDto> {
    return aRespuesta(await this.buscar(this.fuente.manager, id));
  }

  async crear(
    datos: CrearUsuarioDto,
    actor: Actor,
  ): Promise<UsuarioRespuestaDto> {
    this.validarPerfil(datos.rol, datos);

    const creado = await this.conUnicos(() =>
      this.fuente.transaction(async (tx) => {
        const usuario = await tx.save(
          tx.create(Usuario, {
            nombre: datos.nombre,
            email: datos.email,
            contrasenaHash: await bcrypt.hash(datos.contrasena, SALT_ROUNDS),
            rol: datos.rol,
            activo: datos.activo ?? true,
          }),
        );
        if (datos.rol === Rol.ESTUDIANTE) {
          usuario.estudiante = await tx.save(
            tx.create(Estudiante, { usuario, codigo: datos.codigo! }),
          );
        }
        if (datos.rol === Rol.DOCENTE) {
          usuario.docente = await tx.save(
            tx.create(Docente, {
              usuario,
              especialidad: datos.especialidad!,
              cargaMaximaSemanal: datos.cargaMaximaSemanal!,
            }),
          );
        }
        return usuario;
      }),
    );

    await this.auditoria.registrar({
      usuarioId: actor.id,
      modulo: 'USUARIOS',
      accion: 'CREAR',
      detalle: JSON.stringify({
        usuarioId: creado.id,
        email: creado.email,
        rol: creado.rol,
      }),
      ip: actor.ip,
    });
    return aRespuesta(creado);
  }

  async actualizar(
    id: string,
    datos: ActualizarUsuarioDto,
    actor: Actor,
  ): Promise<UsuarioRespuestaDto> {
    const cambios: string[] = [];

    const actualizado = await this.conUnicos(() =>
      this.fuente.transaction(async (tx) => {
        const usuario = await this.buscar(tx, id);
        this.validarPerfil(usuario.rol, datos, true);

        if (datos.activo === false && usuario.activo) {
          if (id === actor.id)
            throw new BadRequestException(
              'No puedes desactivar tu propia cuenta.',
            );
          await this.exigirOtroAdmin(tx, usuario);
        }

        for (const campo of ['nombre', 'email', 'activo'] as const) {
          if (datos[campo] !== undefined && datos[campo] !== usuario[campo]) {
            Object.assign(usuario, { [campo]: datos[campo] });
            cambios.push(campo);
          }
        }
        if (datos.contrasena) {
          usuario.contrasenaHash = await bcrypt.hash(
            datos.contrasena,
            SALT_ROUNDS,
          );
          cambios.push('contraseña');
        }
        await tx.save(Usuario, usuario);

        if (
          usuario.estudiante &&
          datos.codigo !== undefined &&
          datos.codigo !== usuario.estudiante.codigo
        ) {
          usuario.estudiante.codigo = datos.codigo;
          await tx.save(Estudiante, usuario.estudiante);
          cambios.push('codigo');
        }
        if (usuario.docente) {
          for (const campo of ['especialidad', 'cargaMaximaSemanal'] as const) {
            if (
              datos[campo] !== undefined &&
              datos[campo] !== usuario.docente[campo]
            ) {
              Object.assign(usuario.docente, { [campo]: datos[campo] });
              cambios.push(campo);
            }
          }
          await tx.save(Docente, usuario.docente);
        }

        // Una contraseña nueva o una cuenta desactivada cierran las sesiones abiertas.
        if (datos.contrasena || cambios.includes('activo')) {
          if (!usuario.activo || datos.contrasena) {
            await tx.delete(Sesion, { usuario: { id } });
          }
        }
        return usuario;
      }),
    );

    if (cambios.length > 0) {
      await this.auditoria.registrar({
        usuarioId: actor.id,
        modulo: 'USUARIOS',
        accion: 'ACTUALIZAR',
        detalle: JSON.stringify({ usuarioId: id, campos: cambios }),
        ip: actor.ip,
      });
    }
    return aRespuesta(actualizado);
  }

  /**
   * RF-06 y RNF-32 (supresión de datos). Si la cuenta no tiene historial se borra.
   * Si tiene registros que deben conservarse como evidencia (Audit Log, RNF-33, o su
   * perfil académico), se borran sus datos personales y queda desactivada.
   */
  async eliminar(id: string, actor: Actor): Promise<ResultadoEliminacionDto> {
    if (id === actor.id)
      throw new BadRequestException('No puedes eliminar tu propia cuenta.');

    const usuario = await this.buscar(this.fuente.manager, id);
    await this.exigirOtroAdmin(this.fuente.manager, usuario);

    let resultado: ResultadoEliminacionDto['resultado'] = 'ELIMINADO';
    try {
      await this.fuente.transaction(async (tx) => {
        await tx.delete(Sesion, { usuario: { id } });
        if (usuario.estudiante)
          await tx.delete(Estudiante, { id: usuario.estudiante.id });
        if (usuario.docente)
          await tx.delete(Docente, { id: usuario.docente.id });
        await tx.delete(Usuario, { id });
      });
    } catch (error) {
      if (codigoPg(error) !== VIOLACION_LLAVE_FORANEA) throw error;
      resultado = 'ANONIMIZADO';
      await this.fuente.transaction(async (tx) => {
        await tx.delete(Sesion, { usuario: { id } });
        await tx.update(
          Usuario,
          { id },
          {
            nombre: 'Usuario eliminado',
            email: `eliminado-${id}@cal.invalid`,
            contrasenaHash: await bcrypt.hash(
              randomBytes(32).toString('hex'),
              SALT_ROUNDS,
            ),
            activo: false,
          },
        );
      });
    }

    await this.auditoria.registrar({
      usuarioId: actor.id,
      modulo: 'USUARIOS',
      accion: 'ELIMINAR',
      detalle: JSON.stringify({ usuarioId: id, rol: usuario.rol, resultado }),
      ip: actor.ip,
    });
    return { resultado };
  }

  private async buscar(manager: EntityManager, id: string): Promise<Usuario> {
    const usuario = await manager.findOne(Usuario, {
      where: { id },
      relations: { estudiante: true, docente: true },
    });
    if (!usuario) throw new NotFoundException('El usuario no existe.');
    return usuario;
  }

  /** Los datos de perfil deben corresponder al rol de la cuenta. */
  private validarPerfil(
    rol: Rol,
    datos: {
      codigo?: string;
      especialidad?: string;
      cargaMaximaSemanal?: number;
    },
    edicion = false,
  ): void {
    if (rol !== Rol.ESTUDIANTE && datos.codigo !== undefined) {
      throw new BadRequestException('Solo los estudiantes tienen código.');
    }
    if (
      rol !== Rol.DOCENTE &&
      (datos.especialidad !== undefined ||
        datos.cargaMaximaSemanal !== undefined)
    ) {
      throw new BadRequestException(
        'Solo los docentes tienen especialidad y carga máxima semanal.',
      );
    }
    if (!edicion && rol === Rol.ESTUDIANTE && !datos.codigo) {
      throw new BadRequestException('El código de estudiante es obligatorio.');
    }
  }

  /** Siempre debe quedar al menos un Administrador activo. */
  private async exigirOtroAdmin(
    manager: EntityManager,
    usuario: Usuario,
  ): Promise<void> {
    if (usuario.rol !== Rol.ADMIN || !usuario.activo) return;
    const activos = await manager.countBy(Usuario, {
      rol: Rol.ADMIN,
      activo: true,
    });
    if (activos <= 1) {
      throw new BadRequestException(
        'Debe quedar al menos un Administrador activo.',
      );
    }
  }

  /** Traduce las violaciones de UNIQUE (email o código) a 409 Conflict. */
  private async conUnicos<T>(operacion: () => Promise<T>): Promise<T> {
    try {
      return await operacion();
    } catch (error) {
      if (codigoPg(error) === VIOLACION_UNICA) {
        const detalle = String(
          ((error as QueryFailedError).driverError as { detail?: string })
            .detail ?? '',
        );
        throw new ConflictException(
          detalle.includes('codigo')
            ? 'Ya existe un estudiante con ese código.'
            : 'Ya existe una cuenta con ese email.',
        );
      }
      throw error;
    }
  }
}

export function aRespuesta(usuario: Usuario): UsuarioRespuestaDto {
  return {
    id: usuario.id,
    nombre: usuario.nombre,
    email: usuario.email,
    rol: usuario.rol,
    activo: usuario.activo,
    codigo: usuario.estudiante?.codigo ?? null,
    especialidad: usuario.docente?.especialidad ?? null,
    cargaMaximaSemanal: usuario.docente?.cargaMaximaSemanal ?? null,
  };
}
