import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Estudiante } from '../../seguridad/entidades/estudiante.entity.js';
import type { Grupo } from './grupo.entity.js';

/**
 * ESTUDIANTE_GRUPO (Figura 6.8, RF-26, RF-27). Las bajas no borran la fila: se marca
 * activo = false con su fecha, así queda el historial de inscripciones.
 */
@Entity('estudiante_grupo')
// Un estudiante no puede tener dos inscripciones activas en el mismo grupo.
@Index('UQ_estudiante_grupo_activo', ['estudiante', 'grupo'], {
  unique: true,
  where: 'activo = true',
})
export class EstudianteGrupo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @ManyToOne('Estudiante', { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'estudiante_id' })
  estudiante: Estudiante;

  @Index()
  @ManyToOne('Grupo', { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'grupo_id' })
  grupo: Grupo;

  @Column({ default: true })
  activo: boolean;

  @Column({
    name: 'fecha_inscripcion',
    type: 'date',
    default: () => 'CURRENT_DATE',
  })
  fechaInscripcion: string;

  @Column({ name: 'fecha_baja', type: 'date', nullable: true })
  fechaBaja: string | null;
}
