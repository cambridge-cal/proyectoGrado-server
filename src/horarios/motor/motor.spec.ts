import { generarInstancia } from './instancia-sintetica.js';
import { generarHorario } from './motor.js';
import { PARAMETROS_POR_DEFECTO } from './parametros.js';

describe('Motor híbrido AG + Búsqueda Tabú (RF-17, RF-18, Figura 6.4)', () => {
  it('genera un horario factible con 50 docentes y 30 grupos (RNF-02)', () => {
    const r = generarHorario(
      generarInstancia({ docentes: 50, grupos: 30, aulas: 12, semilla: 5 }),
      {
        ...PARAMETROS_POR_DEFECTO,
        semilla: 1,
      },
    );
    expect(r.factible).toBe(true);
    expect(r.evaluacion.violacionesDuras).toBe(0);
    expect(r.asignaciones).toHaveLength(60);
    expect(r.intentos).toHaveLength(1);
    expect(r.restriccionesNoSatisfechas).toEqual({});
    expect(r.tiempoEjecucionMs).toBeLessThan(180_000);
  });

  it('si no logra cumplir las restricciones duras, reintenta con parámetros ajustados e informa cuáles faltan', () => {
    // Imposible: 10 grupos de dos sesiones para un único docente disponible en solo 4 franjas.
    const instancia = generarInstancia({
      docentes: 1,
      grupos: 10,
      aulas: 2,
      bloquesPorDia: 2,
      dias: ['LUN', 'MAR'],
      semilla: 2,
    });
    instancia.docentes[0].franjasDisponibles = new Set(
      instancia.franjas.map((f) => f.id),
    );
    const r = generarHorario(instancia, {
      ...PARAMETROS_POR_DEFECTO,
      generaciones: 10,
      iteracionesTabu: 5,
      maxIntentos: 3,
      semilla: 3,
    });

    expect(r.factible).toBe(false);
    expect(r.intentos).toHaveLength(3);
    expect(r.intentos[1].parametros.generaciones).toBe(15);
    expect(r.intentos[2].parametros.tasaMutacion).toBeCloseTo(0.3);
    expect(r.restriccionesNoSatisfechas.CRUCE_DOCENTE).toBeGreaterThan(0);
  });

  it('con la misma semilla produce el mismo horario', () => {
    const instancia = generarInstancia({
      docentes: 20,
      grupos: 12,
      aulas: 6,
      semilla: 8,
    });
    const a = generarHorario(instancia, {
      ...PARAMETROS_POR_DEFECTO,
      semilla: 99,
    });
    const b = generarHorario(instancia, {
      ...PARAMETROS_POR_DEFECTO,
      semilla: 99,
    });
    expect(a.asignaciones).toEqual(b.asignaciones);
  });
});
