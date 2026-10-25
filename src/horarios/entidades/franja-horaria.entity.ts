import { Check, Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { DiaSemana } from './enums.js';
import { horaCorta } from './transformadores.js';

/** FRANJAHORARIA (Figura 6.9, RF-14). Un bloque institucional de tiempo. */
@Entity('franja_horaria')
@Unique('UQ_franja_dia_bloque', ['diaSemana', 'bloque'])
@Check('hora_fin > hora_inicio')
@Check('bloque > 0')
export class FranjaHoraria {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    name: 'dia_semana',
    type: 'enum',
    enum: DiaSemana,
    enumName: 'dia_semana',
  })
  diaSemana: DiaSemana;

  @Column({ name: 'hora_inicio', type: 'time', transformer: horaCorta })
  horaInicio: string;

  @Column({ name: 'hora_fin', type: 'time', transformer: horaCorta })
  horaFin: string;

  /** Número del bloque dentro del día (1, 2, 3...). */
  @Column({ type: 'int' })
  bloque: number;
}

/** Duración de la franja en horas, para descontar la intensidad horaria y la carga docente. */
export function horasDeFranja(
  franja: Pick<FranjaHoraria, 'horaInicio' | 'horaFin'>,
): number {
  const minutos = (hora: string) =>
    Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));
  return (minutos(franja.horaFin) - minutos(franja.horaInicio)) / 60;
}
