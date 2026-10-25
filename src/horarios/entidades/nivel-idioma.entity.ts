import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import type { Curso } from './curso.entity.js';

/** NIVELIDIOMA (Figura 6.8). El código es único (RF-10). */
@Entity('nivel_idioma')
export class NivelIdioma {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Por ejemplo ING-A1 o FRA-B2: único en todo el sistema. */
  @Column({ length: 20, unique: true })
  codigo: string;

  @Column({ length: 80 })
  nombre: string;

  @Column({ length: 40 })
  idioma: string;

  @OneToMany('Curso', (curso: Curso) => curso.nivelIdioma)
  cursos?: Curso[];
}
