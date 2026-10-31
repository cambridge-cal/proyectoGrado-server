import { Aula } from './aula.entity.js';
import { Curso } from './curso.entity.js';
import { Disponibilidad } from './disponibilidad.entity.js';
import { EstudianteGrupo } from './estudiante-grupo.entity.js';
import { FranjaHoraria } from './franja-horaria.entity.js';
import { Grupo } from './grupo.entity.js';
import { Horario } from './horario.entity.js';
import { NivelIdioma } from './nivel-idioma.entity.js';
import { PeriodoAcademico } from './periodo-academico.entity.js';

export {
  Aula,
  Curso,
  Disponibilidad,
  EstudianteGrupo,
  FranjaHoraria,
  Grupo,
  Horario,
  NivelIdioma,
  PeriodoAcademico,
};
export { DiaSemana, Jornada, TipoAula } from './enums.js';
export type { AsignacionHorario, ValidacionHorario } from './horario.entity.js';

/** Entidades del módulo de Horarios (Figuras 6.8 y 6.9). */
export const ENTIDADES_HORARIOS = [
  PeriodoAcademico,
  NivelIdioma,
  Curso,
  Grupo,
  Aula,
  FranjaHoraria,
  Disponibilidad,
  Horario,
  EstudianteGrupo,
];
