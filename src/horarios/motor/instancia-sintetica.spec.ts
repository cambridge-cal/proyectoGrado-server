import { generarInstancia } from './instancia-sintetica.js';

describe('generarInstancia (instancia sintética para pruebas)', () => {
  it('genera la cantidad solicitada de docentes, grupos, aulas y franjas', () => {
    const inst = generarInstancia({
      docentes: 10,
      grupos: 5,
      aulas: 3,
      semilla: 1,
    });
    expect(inst.docentes).toHaveLength(10);
    expect(inst.grupos).toHaveLength(5);
    expect(inst.aulas).toHaveLength(3);
    expect(inst.franjas.length).toBeGreaterThan(0);
  });

  it('genera franjas según días y bloques por día', () => {
    const inst = generarInstancia({
      docentes: 2,
      grupos: 1,
      aulas: 1,
      dias: ['LUN', 'MAR'],
      bloquesPorDia: 3,
      semilla: 1,
    });
    expect(inst.franjas).toHaveLength(6);
    expect(inst.franjas[0].dia).toBe('LUN');
    expect(inst.franjas[3].dia).toBe('MAR');
  });

  it('la misma semilla produce la misma instancia', () => {
    const a = generarInstancia({ docentes: 5, grupos: 3, aulas: 2, semilla: 42 });
    const b = generarInstancia({ docentes: 5, grupos: 3, aulas: 2, semilla: 42 });
    expect(a.docentes.map((d) => d.id)).toEqual(b.docentes.map((d) => d.id));
    expect(a.docentes.map((d) => d.cargaMaximaHoras)).toEqual(
      b.docentes.map((d) => d.cargaMaximaHoras),
    );
  });

  it('la disponibilidad controla cuántas franjas tiene cada docente', () => {
    const alta = generarInstancia({
      docentes: 1,
      grupos: 1,
      aulas: 1,
      disponibilidad: 1.0,
      semilla: 1,
    });
    const baja = generarInstancia({
      docentes: 1,
      grupos: 1,
      aulas: 1,
      disponibilidad: 0.0,
      semilla: 1,
    });
    expect(alta.docentes[0].franjasDisponibles.size).toBeGreaterThan(
      baja.docentes[0].franjasDisponibles.size,
    );
  });

  it('los ids son únicos dentro de cada tipo', () => {
    const inst = generarInstancia({
      docentes: 20,
      grupos: 15,
      aulas: 8,
      semilla: 3,
    });
    expect(new Set(inst.docentes.map((d) => d.id)).size).toBe(20);
    expect(new Set(inst.grupos.map((g) => g.id)).size).toBe(15);
    expect(new Set(inst.aulas.map((a) => a.id)).size).toBe(8);
    expect(new Set(inst.franjas.map((f) => f.id)).size).toBe(inst.franjas.length);
  });
});
