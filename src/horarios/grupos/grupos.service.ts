import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomInt } from 'node:crypto';
import { DataSource } from 'typeorm';
import type { Actor } from '../../compartido/actor.js';
import {
  codigoPg,
  conRestricciones,
  patronBusqueda,
  VIOLACION_UNICA,
} from '../../compartido/errores-bd.js';
import { desplazamiento, Pagina } from '../../compartido/paginacion.js';
import { AuditoriaService } from '../../seguridad/auditoria/auditoria.service.js';
import { Curso } from '../entidades/curso.entity.js';
import { Grupo } from '../entidades/grupo.entity.js';
import {
  ActualizarGrupoDto,
  CrearGrupoDto,
  FiltrosGruposDto,
} from './grupo.dto.js';

/** Sin 0/O ni 1/I/L, para que el código se pueda dictar sin confusiones. */
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LARGO_CODIGO = 8;

export function generarCodigoAcceso(): string {
  return Array.from(
    { length: LARGO_CODIGO },
    () => ALFABETO[randomInt(ALFABETO.length)],
  ).join('');
}

const MENSAJES = {
  unico: 'Ya existe un grupo con ese código.',
  enUso:
    'El grupo tiene estudiantes inscritos o evaluaciones y no se puede eliminar.',
};

/** Grupos (RF-12). El código de acceso se genera solo y se puede regenerar. */
@Injectable()
export class GruposService {
  constructor(
    @InjectDataSource() private readonly fuente: DataSource,
    private readonly auditoria: AuditoriaService,
  ) {}

  private get repo() {
    return this.fuente.getRepository(Grupo);
  }

  async listar(filtros: FiltrosGruposDto): Promise<Pagina<Grupo>> {
    const consulta = this.repo
      .createQueryBuilder('grupo')
      .innerJoinAndSelect('grupo.curso', 'curso')
      .innerJoinAndSelect('curso.nivelIdioma', 'nivel')
      .orderBy('grupo.codigo', 'ASC');
    if (filtros.cursoId)
      consulta.andWhere('curso.id = :curso', { curso: filtros.cursoId });
    if (filtros.jornada)
      consulta.andWhere('grupo.jornada = :jornada', {
        jornada: filtros.jornada,
      });
    if (filtros.busqueda) {
      consulta.andWhere(
        '(grupo.codigo ILIKE :texto OR curso.nombre ILIKE :texto)',
        {
          texto: patronBusqueda(filtros.busqueda),
        },
      );
    }
    const { skip, take } = desplazamiento(filtros);
    const [datos, total] = await consulta
      .skip(skip)
      .take(take)
      .getManyAndCount();
    return { datos, total, page: filtros.page, size: filtros.size };
  }

  async obtener(id: string): Promise<Grupo> {
    const grupo = await this.repo.findOne({
      where: { id },
      relations: { curso: { nivelIdioma: true } },
    });
    if (!grupo) throw new NotFoundException('El grupo no existe.');
    return grupo;
  }

  async crear(datos: CrearGrupoDto, actor: Actor): Promise<Grupo> {
    const curso = await this.curso(datos.cursoId);
    const grupo = await conRestricciones(
      () =>
        this.conCodigoUnico((codigoAcceso) =>
          this.repo.save(
            this.repo.create({
              codigo: datos.codigo,
              cupoMaximo: datos.cupoMaximo,
              jornada: datos.jornada,
              curso,
              codigoAcceso,
            }),
          ),
        ),
      MENSAJES,
    );
    await this.registrar(actor, 'CREAR_GRUPO', {
      grupoId: grupo.id,
      codigo: grupo.codigo,
    });
    return grupo;
  }

  async actualizar(
    id: string,
    datos: ActualizarGrupoDto,
    actor: Actor,
  ): Promise<Grupo> {
    const grupo = await this.obtener(id);
    if (datos.cursoId) grupo.curso = await this.curso(datos.cursoId);
    if (datos.codigo !== undefined) grupo.codigo = datos.codigo;
    if (datos.cupoMaximo !== undefined) grupo.cupoMaximo = datos.cupoMaximo;
    if (datos.jornada !== undefined) grupo.jornada = datos.jornada;
    const guardado = await conRestricciones(
      () => this.repo.save(grupo),
      MENSAJES,
    );
    await this.registrar(actor, 'ACTUALIZAR_GRUPO', {
      grupoId: id,
      campos: Object.keys(datos),
    });
    return guardado;
  }

  /** Genera un código de acceso nuevo; el anterior deja de servir. */
  async regenerarCodigo(id: string, actor: Actor): Promise<Grupo> {
    const grupo = await this.obtener(id);
    const guardado = await this.conCodigoUnico((codigoAcceso) => {
      grupo.codigoAcceso = codigoAcceso;
      return this.repo.save(grupo);
    });
    await this.registrar(actor, 'REGENERAR_CODIGO_GRUPO', { grupoId: id });
    return guardado;
  }

  async eliminar(id: string, actor: Actor): Promise<void> {
    const grupo = await this.obtener(id);
    await conRestricciones(() => this.repo.delete({ id }), MENSAJES);
    await this.registrar(actor, 'ELIMINAR_GRUPO', {
      grupoId: id,
      codigo: grupo.codigo,
    });
  }

  /** Reintenta si el código aleatorio choca con otro (muy improbable con 31^8 combinaciones). */
  private async conCodigoUnico(
    guardar: (codigo: string) => Promise<Grupo>,
  ): Promise<Grupo> {
    for (let intento = 0; intento < 5; intento++) {
      try {
        return await guardar(generarCodigoAcceso());
      } catch (error) {
        const detalle = String(
          (error as { driverError?: { detail?: string } }).driverError
            ?.detail ?? '',
        );
        if (
          codigoPg(error) !== VIOLACION_UNICA ||
          !detalle.includes('codigo_acceso')
        )
          throw error;
      }
    }
    throw new ConflictException(
      'No se pudo generar un código de acceso único. Intenta de nuevo.',
    );
  }

  private async curso(id: string): Promise<Curso> {
    const curso = await this.fuente
      .getRepository(Curso)
      .findOne({ where: { id }, relations: { nivelIdioma: true } });
    if (!curso) throw new NotFoundException('El curso no existe.');
    return curso;
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
