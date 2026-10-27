import { Check, Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { TipoAula } from './enums.js';

/** AULA (Figura 6.9, RF-13). */
@Entity('aula')
@Check('capacidad > 0')
export class Aula {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 30, unique: true })
  codigo: string;

  @Column({ type: 'int' })
  capacidad: number;

  @Column({ type: 'enum', enum: TipoAula, enumName: 'tipo_aula' })
  tipo: TipoAula;

  @Column({ default: true })
  activa: boolean;
}
