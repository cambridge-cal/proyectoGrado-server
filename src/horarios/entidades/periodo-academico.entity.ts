import { Check, Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** PERIODOACADEMICO (Figura 6.9). Solo puede haber uno activo a la vez (RF-09). */
@Entity('periodo_academico')
@Check('fecha_fin > fecha_inicio')
// Índice único parcial: la base de datos impide dos períodos activos.
@Index('UQ_periodo_academico_activo', ['activo'], {
  unique: true,
  where: 'activo = true',
})
export class PeriodoAcademico {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 80, unique: true })
  nombre: string;

  @Column({ name: 'fecha_inicio', type: 'date' })
  fechaInicio: string;

  @Column({ name: 'fecha_fin', type: 'date' })
  fechaFin: string;

  @Column({ default: false })
  activo: boolean;
}
