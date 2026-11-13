import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Formulario } from './formulario.entity.js';
import type { Pregunta } from './pregunta.entity.js';

/** DIMENSION (Figura 6.10). Categoría de evaluación dentro de un formulario (RF-29). */
@Entity('dimension')
@Check('orden > 0')
export class Dimension {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 120 })
  nombre: string;

  @Index()
  @ManyToOne('Formulario', (formulario: Formulario) => formulario.dimensiones, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'formulario_id' })
  formulario: Formulario;

  @Column({ type: 'int' })
  orden: number;

  /** Peso porcentual en el puntaje global (RF-29). Los pesos de un formulario suman 100. */
  @Column({ type: 'int', default: 0 })
  peso: number;

  @OneToMany('Pregunta', (pregunta: Pregunta) => pregunta.dimension, {
    cascade: true,
  })
  preguntas?: Pregunta[];
}
