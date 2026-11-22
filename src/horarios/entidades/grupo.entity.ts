import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Curso } from './curso.entity.js';
import { Jornada } from './enums.js';

/** GRUPO (Figura 6.8, RF-12). */
@Entity('grupo')
@Check('cupo_maximo > 0')
@Check('intensidad_horaria IS NULL OR intensidad_horaria > 0')
export class Grupo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @ManyToOne('Curso', { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'curso_id' })
  curso: Curso;

  @Column({ length: 30, unique: true })
  codigo: string;

  @Column({ name: 'cupo_maximo', type: 'int' })
  cupoMaximo: number;

  @Column({ type: 'enum', enum: Jornada, enumName: 'jornada_grupo' })
  jornada: Jornada;

  /** Código que el estudiante escribe para inscribirse (RF-26). */
  @Column({ name: 'codigo_acceso', length: 12, unique: true })
  codigoAcceso: string;

  /**
   * Horas por semana del grupo cuando difieren de las del curso: un mismo curso se dicta en
   * modalidad intensiva (unas 6 h) o regular (3 a 3,5 h). Vacío = la intensidad del curso.
   */
  @Column({ name: 'intensidad_horaria', type: 'int', nullable: true })
  intensidadHoraria: number | null;
}
