import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { NivelIdioma } from './nivel-idioma.entity.js';

/** CURSO (Figura 6.8). Pertenece a un único nivel de idioma (RF-11). */
@Entity('curso')
@Check('intensidad_horaria > 0')
export class Curso {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @ManyToOne('NivelIdioma', (nivel: NivelIdioma) => nivel.cursos, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'nivel_idioma_id' })
  nivelIdioma: NivelIdioma;

  @Column({ length: 120 })
  nombre: string;

  /** Horas de clase por semana. El motor de horarios la reparte en franjas. */
  @Column({ name: 'intensidad_horaria', type: 'int' })
  intensidadHoraria: number;
}
