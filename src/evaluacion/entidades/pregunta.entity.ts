import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Dimension } from './dimension.entity.js';

/** PREGUNTA (Figura 6.10). Pregunta de escala de 1 a 5 dentro de una dimensión (RF-30). */
@Entity('pregunta')
@Check('orden > 0')
export class Pregunta {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 500 })
  texto: string;

  @Index()
  @ManyToOne('Dimension', (dimension: Dimension) => dimension.preguntas, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'dimension_id' })
  dimension: Dimension;

  @Column({ type: 'int' })
  orden: number;
}
