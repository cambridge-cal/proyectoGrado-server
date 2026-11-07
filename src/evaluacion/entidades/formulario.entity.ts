import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PeriodoAcademico } from '../../horarios/entidades/periodo-academico.entity.js';
import type { Dimension } from './dimension.entity.js';

/** FORMULARIO (Figura 6.10). Plantilla de evaluación docente ligada a un período académico (RF-28). */
@Entity('formulario')
export class Formulario {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 160 })
  nombre: string;

  @Index()
  @ManyToOne(
    'PeriodoAcademico',
    { nullable: false, onDelete: 'RESTRICT' },
  )
  @JoinColumn({ name: 'periodo_academico_id' })
  periodoAcademico: PeriodoAcademico;

  @Column({ default: true })
  activo: boolean;

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn: Date;

  @OneToMany('Dimension', (dimension: Dimension) => dimension.formulario, {
    cascade: true,
  })
  dimensiones?: Dimension[];
}
