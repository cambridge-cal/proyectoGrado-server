import {
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import type { Docente } from '../../seguridad/entidades/docente.entity.js';
import type { FranjaHoraria } from './franja-horaria.entity.js';

/** DISPONIBILIDAD (Figura 6.9, RF-16). Franja en la que un docente puede ser asignado. */
@Entity('disponibilidad')
@Unique('UQ_disponibilidad_docente_franja', ['docente', 'franjaHoraria'])
export class Disponibilidad {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @ManyToOne('Docente', { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'docente_id' })
  docente: Docente;

  @ManyToOne('FranjaHoraria', { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'franja_horaria_id' })
  franjaHoraria: FranjaHoraria;
}
