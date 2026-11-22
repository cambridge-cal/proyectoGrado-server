import { Check, Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { DiaSemana, Jornada } from './enums.js';
import { horaCorta } from './transformadores.js';

/**
 * FRANJAHORARIA (Figura 6.9, RF-14). Bloque institucional de tiempo que se repite en uno o
 * varios días con la misma hora, por ejemplo "martes a jueves de 08:00 a 10:00". Un grupo
 * programado en la franja tiene clase todos esos días. Las franjas no se cruzan entre sí.
 */
@Entity('franja_horaria')
@Check('hora_fin > hora_inicio')
@Check('bloque > 0')
@Check('cardinality(dias) > 0')
export class FranjaHoraria {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Días de la semana en que se repite la franja, en el orden de la semana. */
  @Column({
    type: 'enum',
    enum: DiaSemana,
    enumName: 'dia_semana',
    array: true,
  })
  dias: DiaSemana[];

  @Column({ name: 'hora_inicio', type: 'time', transformer: horaCorta })
  horaInicio: string;

  @Column({ name: 'hora_fin', type: 'time', transformer: horaCorta })
  horaFin: string;

  /** Número para ordenar las franjas en las vistas. */
  @Column({ type: 'int' })
  bloque: number;
}

const aMinutos = (hora: string) =>
  Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));

/** Duración de cada sesión de la franja, en horas. */
export function horasPorSesion(
  franja: Pick<FranjaHoraria, 'horaInicio' | 'horaFin'>,
): number {
  return (aMinutos(franja.horaFin) - aMinutos(franja.horaInicio)) / 60;
}

/** Horas por semana de la franja: la duración de la sesión por el número de días (RF-15). */
export function horasDeFranja(
  franja: Pick<FranjaHoraria, 'horaInicio' | 'horaFin' | 'dias'>,
): number {
  return horasPorSesion(franja) * franja.dias.length;
}

/** Jornada a la que pertenece la franja según su hora de inicio (RF-12). */
export function jornadaDeFranja(
  franja: Pick<FranjaHoraria, 'horaInicio'>,
): Jornada {
  const inicio = aMinutos(franja.horaInicio);
  if (inicio < 12 * 60) return Jornada.MANANA;
  if (inicio < 18 * 60) return Jornada.TARDE;
  return Jornada.NOCHE;
}

/** Orden de la semana para mostrar y ordenar los días de una franja. */
export const ORDEN_DIAS: readonly DiaSemana[] = Object.values(DiaSemana);

export function ordenarDias(dias: readonly DiaSemana[]): DiaSemana[] {
  return [...new Set(dias)].sort(
    (a, b) => ORDEN_DIAS.indexOf(a) - ORDEN_DIAS.indexOf(b),
  );
}
