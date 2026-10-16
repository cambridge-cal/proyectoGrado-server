import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Usuario } from './usuario.entity.js';

/**
 * AUDITLOG (Figura 6.8). Traza de operaciones críticas (RNF-11).
 * Solo se insertan registros: ningún rol puede modificarlos ni eliminarlos.
 */
@Entity('audit_log')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @ManyToOne('Usuario', (usuario: Usuario) => usuario.registrosAuditoria, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'usuario_id' })
  usuario: Usuario;

  @Column({ length: 40 })
  modulo: string;

  @Column({ length: 60 })
  accion: string;

  @Column({ type: 'text', nullable: true })
  detalle: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip: string | null;

  @Index()
  @CreateDateColumn({ name: 'fecha_hora', type: 'timestamptz' })
  fechaHora: Date;
}
