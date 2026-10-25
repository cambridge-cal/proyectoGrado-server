import { Curso } from './curso.entity.js';
import { NivelIdioma } from './nivel-idioma.entity.js';
import { PeriodoAcademico } from './periodo-academico.entity.js';

export { Curso, NivelIdioma, PeriodoAcademico };

/** Entidades del módulo de Horarios (Figuras 6.8 y 6.9). */
export const ENTIDADES_HORARIOS = [PeriodoAcademico, NivelIdioma, Curso];
