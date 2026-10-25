import { Aula } from './aula.entity.js';
import { Curso } from './curso.entity.js';
import { FranjaHoraria } from './franja-horaria.entity.js';
import { Grupo } from './grupo.entity.js';
import { NivelIdioma } from './nivel-idioma.entity.js';
import { PeriodoAcademico } from './periodo-academico.entity.js';

export { Aula, Curso, FranjaHoraria, Grupo, NivelIdioma, PeriodoAcademico };
export { DiaSemana, Jornada, TipoAula } from './enums.js';

/** Entidades del módulo de Horarios (Figuras 6.8 y 6.9). */
export const ENTIDADES_HORARIOS = [
  PeriodoAcademico,
  NivelIdioma,
  Curso,
  Grupo,
  Aula,
  FranjaHoraria,
];
