import { Aleatorio } from './aleatorio.js';
import {
  cruzar,
  ejecutarAlgoritmoGenetico,
  mutar,
} from './algoritmo-genetico.js';
import { aptitudMaxima } from './aptitud.js';
import { generarInstancia } from './instancia-sintetica.js';
import { PARAMETROS_POR_DEFECTO } from './parametros.js';
import { Problema } from './problema.js';

const problema = new Problema(
  generarInstancia({ docentes: 12, grupos: 8, aulas: 5, semilla: 7 }),
);

const unDocentePorGrupo = (
  cromosoma: { grupoId: string; docenteId: string }[],
) => {
  const docentes = new Map<string, Set<string>>();
  for (const gen of cromosoma) {
    const set = docentes.get(gen.grupoId) ?? new Set();
    set.add(gen.docenteId);
    docentes.set(gen.grupoId, set);
  }
  return [...docentes.values()].every((s) => s.size === 1);
};

describe('Algoritmo Genético (RF-17, sección 6.3.1)', () => {
  it('encuentra un horario que cumple todas las restricciones duras', () => {
    const r = ejecutarAlgoritmoGenetico(
      problema,
      PARAMETROS_POR_DEFECTO,
      new Aleatorio(1),
    );
    expect(r.evaluacion.violacionesDuras).toBe(0);
    expect(r.mejor).toHaveLength(problema.largo);
    expect(r.generaciones).toBeLessThanOrEqual(100);
  });

  it('la mejor aptitud nunca empeora entre generaciones (elitismo)', () => {
    const r = ejecutarAlgoritmoGenetico(
      new Problema(
        generarInstancia({
          docentes: 10,
          grupos: 12,
          aulas: 3,
          disponibilidad: 0.3,
          semilla: 3,
        }),
      ),
      { ...PARAMETROS_POR_DEFECTO, generaciones: 40 },
      new Aleatorio(2),
    );
    for (let i = 1; i < r.historial.length; i++)
      expect(r.historial[i]).toBeGreaterThanOrEqual(r.historial[i - 1]);
  });

  it('con la misma semilla da el mismo resultado', () => {
    const a = ejecutarAlgoritmoGenetico(
      problema,
      { ...PARAMETROS_POR_DEFECTO, generaciones: 10 },
      new Aleatorio(42),
    );
    const b = ejecutarAlgoritmoGenetico(
      problema,
      { ...PARAMETROS_POR_DEFECTO, generaciones: 10 },
      new Aleatorio(42),
    );
    expect(a.mejor).toEqual(b.mejor);
  });

  it('cruce y mutación mantienen un solo docente por grupo', () => {
    const aleatorio = new Aleatorio(5);
    const padre = problema.construir(aleatorio);
    const madre = problema.construir(aleatorio);
    const hijo = cruzar(problema, padre, madre, aleatorio);
    mutar(problema, hijo, 0.5, aleatorio);
    expect(unDocentePorGrupo(hijo)).toBe(true);
    expect(hijo).toHaveLength(problema.largo);
  });

  it('asigna docentes de la especialidad del idioma del grupo cuando existen', () => {
    const r = ejecutarAlgoritmoGenetico(
      problema,
      PARAMETROS_POR_DEFECTO,
      new Aleatorio(9),
    );
    for (const gen of r.mejor) {
      const grupo = problema.indices.grupos.get(gen.grupoId)!;
      expect(problema.indices.docentes.get(gen.docenteId)!.especialidad).toBe(
        grupo.idioma,
      );
    }
    expect(r.evaluacion.aptitud).toBeLessThanOrEqual(aptitudMaxima(r.mejor));
  });

  it('rechaza una instancia sin datos', () => {
    expect(
      () => new Problema({ docentes: [], aulas: [], franjas: [], grupos: [] }),
    ).toThrow(/grupos/);
  });
});
