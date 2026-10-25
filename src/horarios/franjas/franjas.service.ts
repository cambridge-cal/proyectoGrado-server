import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import type { Actor } from '../../compartido/actor.js';
import { conRestricciones } from '../../compartido/errores-bd.js';
import { desplazamiento, Pagina } from '../../compartido/paginacion.js';
import { AuditoriaService } from '../../seguridad/auditoria/auditoria.service.js';
import { DiaSemana } from '../entidades/enums.js';
import { FranjaHoraria } from '../entidades/franja-horaria.entity.js';
import {
  ActualizarFranjaDto,
  CrearFranjaDto,
  FiltrosFranjasDto,
  LoteFranjasDto,
} from './franja.dto.js';

const MENSAJES = {
  unico: 'Ya existe una franja con ese número de bloque en ese día.',
  enUso:
    'La franja tiene disponibilidades docentes asociadas y no se puede eliminar.',
};

const aMinutos = (hora: string) =>
  Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));
const aHora = (minutos: number) =>
  `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;

/** Franjas horarias institucionales (RF-14). No se permiten franjas que se crucen en el mismo día. */
@Injectable()
export class FranjasService {
  constructor(
    @InjectDataSource() private readonly fuente: DataSource,
    private readonly auditoria: AuditoriaService,
  ) {}

  private get repo() {
    return this.fuente.getRepository(FranjaHoraria);
  }

  async listar(filtros: FiltrosFranjasDto): Promise<Pagina<FranjaHoraria>> {
    const { skip, take } = desplazamiento(filtros);
    const [datos, total] = await this.repo.findAndCount({
      where: filtros.diaSemana ? { diaSemana: filtros.diaSemana } : {},
      // El enum de PostgreSQL ordena los días en el orden de la semana.
      order: { diaSemana: 'ASC', horaInicio: 'ASC' },
      skip,
      take,
    });
    return { datos, total, page: filtros.page, size: filtros.size };
  }

  async obtener(id: string): Promise<FranjaHoraria> {
    const franja = await this.repo.findOneBy({ id });
    if (!franja) throw new NotFoundException('La franja horaria no existe.');
    return franja;
  }

  async crear(datos: CrearFranjaDto, actor: Actor): Promise<FranjaHoraria> {
    const franja = await conRestricciones(
      () =>
        this.fuente.transaction(async (tx) => {
          await this.validar(tx, datos);
          return tx.save(tx.create(FranjaHoraria, datos));
        }),
      MENSAJES,
    );
    await this.registrar(actor, 'CREAR_FRANJA', {
      franjaId: franja.id,
      ...datos,
    });
    return franja;
  }

  /** Crea las franjas de varios días, de `desde` a `hasta`, numeradas desde `bloqueInicial` (1 por defecto). */
  async crearLote(
    datos: LoteFranjasDto,
    actor: Actor,
  ): Promise<FranjaHoraria[]> {
    const inicio = aMinutos(datos.desde);
    const fin = aMinutos(datos.hasta);
    if (fin - inicio < datos.duracionMinutos) {
      throw new BadRequestException(
        'El rango de horas no alcanza para una franja de esa duración.',
      );
    }
    const creadas = await conRestricciones(
      () =>
        this.fuente.transaction(async (tx) => {
          const nuevas: FranjaHoraria[] = [];
          for (const diaSemana of datos.dias) {
            let bloque = datos.bloqueInicial ?? 1;
            for (
              let m = inicio;
              m + datos.duracionMinutos <= fin;
              m += datos.duracionMinutos, bloque++
            ) {
              const franja = {
                diaSemana,
                horaInicio: aHora(m),
                horaFin: aHora(m + datos.duracionMinutos),
                bloque,
              };
              await this.validar(tx, franja);
              nuevas.push(await tx.save(tx.create(FranjaHoraria, franja)));
            }
          }
          return nuevas;
        }),
      MENSAJES,
    );
    await this.registrar(actor, 'CREAR_FRANJAS_LOTE', {
      cantidad: creadas.length,
      ...datos,
    });
    return creadas;
  }

  async actualizar(
    id: string,
    datos: ActualizarFranjaDto,
    actor: Actor,
  ): Promise<FranjaHoraria> {
    const franja = await conRestricciones(
      () =>
        this.fuente.transaction(async (tx) => {
          const actual = await tx.findOneBy(FranjaHoraria, { id });
          if (!actual)
            throw new NotFoundException('La franja horaria no existe.');
          Object.assign(actual, datos);
          await this.validar(tx, actual, id);
          return tx.save(actual);
        }),
      MENSAJES,
    );
    await this.registrar(actor, 'ACTUALIZAR_FRANJA', {
      franjaId: id,
      campos: Object.keys(datos),
    });
    return franja;
  }

  async eliminar(id: string, actor: Actor): Promise<void> {
    const franja = await this.obtener(id);
    await conRestricciones(() => this.repo.delete({ id }), MENSAJES);
    await this.registrar(actor, 'ELIMINAR_FRANJA', {
      franjaId: id,
      diaSemana: franja.diaSemana,
      bloque: franja.bloque,
    });
  }

  /** La hora de fin debe ser posterior y la franja no puede cruzarse con otra del mismo día. */
  private async validar(
    tx: EntityManager,
    franja: { diaSemana: DiaSemana; horaInicio: string; horaFin: string },
    excluirId?: string,
  ): Promise<void> {
    if (aMinutos(franja.horaFin) <= aMinutos(franja.horaInicio)) {
      throw new BadRequestException(
        'La hora de fin debe ser posterior a la hora de inicio.',
      );
    }
    const cruce = await tx
      .getRepository(FranjaHoraria)
      .createQueryBuilder('f')
      .where('f.diaSemana = :dia', { dia: franja.diaSemana })
      .andWhere('f.horaInicio < :fin AND f.horaFin > :inicio', {
        inicio: franja.horaInicio,
        fin: franja.horaFin,
      })
      .andWhere(excluirId ? 'f.id <> :id' : '1=1', { id: excluirId })
      .getOne();
    if (cruce) {
      throw new ConflictException(
        `La franja se cruza con el bloque ${cruce.bloque} del ${franja.diaSemana} (${cruce.horaInicio} a ${cruce.horaFin}).`,
      );
    }
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
