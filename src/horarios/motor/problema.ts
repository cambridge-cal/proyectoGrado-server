import type { Aleatorio } from './aleatorio.js';
import { indexar, type Indices } from './aptitud.js';
import type { Cromosoma, InstanciaMotor } from './tipos.js';

/** Quita tildes y mayúsculas para comparar la especialidad del docente con el idioma del grupo. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

/**
 * Idiomas que dicta un docente según su especialidad. Acepta varios separados por coma,
 * guion, barra o "y", por ejemplo "Inglés - Francés" o "Inglés, Portugués".
 */
export function idiomasDe(especialidad: string): Set<string> {
  return new Set(
    normalizar(especialidad)
      .split(/\s*(?:,|;|\/|-|–|\by\b)\s*/)
      .map((parte) => parte.trim())
      .filter(Boolean),
  );
}

/** Estructura fija del cromosoma: qué posiciones corresponden a cada grupo. */
export interface BloqueGrupo {
  grupoId: string;
  posiciones: number[];
  /** Docentes que pueden dictar el grupo: los de la misma especialidad que el idioma, o todos si no hay. */
  candidatos: string[];
  /** Aulas con capacidad suficiente para el grupo, o todas si ninguna alcanza. */
  aulas: string[];
  /** Franjas permitidas para el grupo (jornada e intensidad), o todas. */
  franjas: string[];
}

/** Datos precalculados que comparten el Algoritmo Genético y la Búsqueda Tabú. */
export class Problema {
  readonly indices: Indices;
  readonly bloques: BloqueGrupo[];
  readonly largo: number;
  readonly franjas: string[];
  readonly bloquePorGrupo: Map<string, BloqueGrupo>;

  constructor(readonly instancia: InstanciaMotor) {
    if (!instancia.grupos.length)
      throw new Error('No hay grupos para programar.');
    if (!instancia.docentes.length)
      throw new Error('No hay docentes registrados.');
    if (!instancia.aulas.length)
      throw new Error('No hay aulas activas disponibles.');
    if (!instancia.franjas.length)
      throw new Error('No hay franjas horarias registradas.');

    this.indices = indexar(instancia);
    this.franjas = instancia.franjas.map((f) => f.id);
    let posicion = 0;
    this.bloques = instancia.grupos.map((grupo) => {
      const idioma = normalizar(grupo.idioma);
      const afines = instancia.docentes
        .filter((d) => idiomasDe(d.especialidad).has(idioma))
        .map((d) => d.id);
      const franjas = grupo.franjas
        ? this.franjas.filter((f) => grupo.franjas!.has(f))
        : [];
      const aulas = instancia.aulas
        .filter((a) => a.capacidad >= grupo.estudiantes)
        .map((a) => a.id);
      const posiciones = Array.from(
        { length: grupo.sesiones },
        () => posicion++,
      );
      return {
        grupoId: grupo.id,
        posiciones,
        candidatos: afines.length
          ? afines
          : instancia.docentes.map((d) => d.id),
        aulas: aulas.length ? aulas : instancia.aulas.map((a) => a.id),
        franjas: franjas.length ? franjas : this.franjas,
      };
    });
    this.largo = posicion;
    this.bloquePorGrupo = new Map(this.bloques.map((b) => [b.grupoId, b]));
  }

  /**
   * Individuo inicial: constructivo aleatorio que intenta respetar disponibilidad,
   * cruces y carga desde el principio. La población arranca cerca de horarios factibles.
   */
  construir(aleatorio: Aleatorio): Cromosoma {
    const cromosoma: Cromosoma = Array.from({ length: this.largo });
    const ocupadoDocente = new Set<string>();
    const ocupadaAula = new Set<string>();
    const horas = new Map<string, number>();

    for (const bloque of aleatorio.barajar([...this.bloques])) {
      const docenteId = this.elegirDocente(bloque, horas, aleatorio);
      const docente = this.indices.docentes.get(docenteId)!;
      const usadasGrupo = new Set<string>();

      for (const posicion of bloque.posiciones) {
        const libres = bloque.franjas.filter(
          (f) =>
            docente.franjasDisponibles.has(f) &&
            !ocupadoDocente.has(`${docenteId}|${f}`) &&
            !usadasGrupo.has(f),
        );
        const franjaId = libres.length
          ? aleatorio.elegir(libres)
          : aleatorio.elegir(bloque.franjas);
        const aulasLibres = bloque.aulas.filter(
          (a) => !ocupadaAula.has(`${a}|${franjaId}`),
        );
        const aulaId = aulasLibres.length
          ? aleatorio.elegir(aulasLibres)
          : aleatorio.elegir(bloque.aulas);

        cromosoma[posicion] = {
          grupoId: bloque.grupoId,
          docenteId,
          aulaId,
          franjaId,
        };
        ocupadoDocente.add(`${docenteId}|${franjaId}`);
        ocupadaAula.add(`${aulaId}|${franjaId}`);
        usadasGrupo.add(franjaId);
        horas.set(
          docenteId,
          (horas.get(docenteId) ?? 0) +
            (this.indices.franjas.get(franjaId)?.horas ?? 0),
        );
      }
    }
    return cromosoma;
  }

  /** Prefiere al candidato con más horas libres; desempata al azar. */
  elegirDocente(
    bloque: BloqueGrupo,
    horas: Map<string, number>,
    aleatorio: Aleatorio,
  ): string {
    const libres = bloque.candidatos.map((id) => {
      const docente = this.indices.docentes.get(id)!;
      return {
        id,
        libre:
          docente.cargaMaximaHoras -
          (horas.get(id) ?? 0) +
          aleatorio.siguiente(),
      };
    });
    libres.sort((a, b) => b.libre - a.libre);
    // Torneo entre los tres con más holgura para no asignar siempre al mismo.
    return aleatorio.elegir(libres.slice(0, Math.min(3, libres.length))).id;
  }
}

/** Franjas permitidas para el grupo en las que el docente está disponible. */
export function franjasDisponibles(
  problema: Problema,
  bloque: BloqueGrupo,
  docenteId: string,
): string[] {
  const disponibles =
    problema.indices.docentes.get(docenteId)?.franjasDisponibles;
  return disponibles ? bloque.franjas.filter((f) => disponibles.has(f)) : [];
}
