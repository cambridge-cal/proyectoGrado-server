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
}
