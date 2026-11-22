import { Aleatorio } from './aleatorio.js';
import { evaluar } from './aptitud.js';
import { generarInstancia } from './instancia-sintetica.js';
import { idiomasDe, normalizar, Problema } from './problema.js';
import type { InstanciaMotor } from './tipos.js';

describe('normalizar', () => {
  it('quita tildes y pasa a minúsculas', () => {
    expect(normalizar('Inglés')).toBe('ingles');
    expect(normalizar('FRANCÉS')).toBe('frances');
    expect(normalizar('Português')).toBe('portugues');
  });

  it('recorta espacios', () => {
    expect(normalizar('  Alemán  ')).toBe('aleman');
  });
});

describe('idiomasDe', () => {
  it('lee una o varias especialidades separadas por coma, guion, barra o "y"', () => {
    expect([...idiomasDe('Inglés')]).toEqual(['ingles']);
    expect([...idiomasDe('Inglés - Francés')]).toEqual(['ingles', 'frances']);
    expect([...idiomasDe('Inglés, Portugués')]).toEqual([
      'ingles',
      'portugues',
    ]);
    expect([...idiomasDe('Inglés / Francés y Portugués')]).toEqual([
      'ingles',
      'frances',
      'portugues',
    ]);
  });
});

describe('Problema', () => {
  const instanciaBase: InstanciaMotor = {
    docentes: [
      {
        id: 'D1',
        especialidad: 'Inglés',
        cargaMaximaHoras: 20,
        franjasDisponibles: new Set(['F1', 'F2']),
      },
    ],
    aulas: [{ id: 'A1', capacidad: 30, tipo: 'SALON' }],
    franjas: [
      {
        id: 'F1',
        dias: ['LUN'],
        horaInicio: '08:00',
        horaFin: '10:00',
        horas: 2,
      },
      {
        id: 'F2',
        dias: ['MAR'],
        horaInicio: '08:00',
        horaFin: '10:00',
        horas: 2,
      },
    ],
    grupos: [{ id: 'G1', idioma: 'Inglés', estudiantes: 15, sesiones: 2 }],
  };

  it('calcula bloques, largo y candidatos por especialidad', () => {
    const p = new Problema(instanciaBase);
    expect(p.largo).toBe(2);
    expect(p.bloques).toHaveLength(1);
    expect(p.bloques[0].candidatos).toEqual(['D1']);
    expect(p.bloques[0].aulas).toEqual(['A1']);
    expect(p.bloquePorGrupo.get('G1')).toBeDefined();
  });

  it('un docente con varias especialidades es candidato para cada idioma', () => {
    const p = new Problema({
      ...instanciaBase,
      docentes: [
        {
          id: 'D1',
          especialidad: 'Inglés',
          cargaMaximaHoras: 20,
          franjasDisponibles: new Set(['F1']),
        },
        {
          id: 'D2',
          especialidad: 'Inglés - Francés',
          cargaMaximaHoras: 20,
          franjasDisponibles: new Set(['F1']),
        },
      ],
      grupos: [
        { id: 'G1', idioma: 'Inglés', estudiantes: 10, sesiones: 1 },
        { id: 'G2', idioma: 'Francés', estudiantes: 10, sesiones: 1 },
      ],
    });
    expect(p.bloques[0].candidatos).toEqual(['D1', 'D2']);
    expect(p.bloques[1].candidatos).toEqual(['D2']);
  });

  it('el grupo solo se construye en sus franjas permitidas', () => {
    const p = new Problema({
      ...instanciaBase,
      grupos: [
        {
          id: 'G1',
          idioma: 'Inglés',
          estudiantes: 15,
          sesiones: 1,
          franjas: new Set(['F2']),
        },
      ],
    });
    expect(p.bloques[0].franjas).toEqual(['F2']);
    for (let semilla = 1; semilla <= 20; semilla++) {
      const cromosoma = p.construir(new Aleatorio(semilla));
      expect(cromosoma[0].franjaId).toBe('F2');
    }
  });

  it('usa todos los docentes si ninguno tiene la especialidad del idioma', () => {
    const instancia: InstanciaMotor = {
      ...instanciaBase,
      docentes: [
        {
          id: 'D1',
          especialidad: 'Francés',
          cargaMaximaHoras: 20,
          franjasDisponibles: new Set(['F1']),
        },
      ],
      grupos: [{ id: 'G1', idioma: 'Alemán', estudiantes: 10, sesiones: 1 }],
    };
    const p = new Problema(instancia);
    expect(p.bloques[0].candidatos).toEqual(['D1']);
  });

  it('usa todas las aulas si ninguna tiene capacidad suficiente', () => {
    const instancia: InstanciaMotor = {
      ...instanciaBase,
      aulas: [{ id: 'A1', capacidad: 5, tipo: 'SALON' }],
      grupos: [{ id: 'G1', idioma: 'Inglés', estudiantes: 20, sesiones: 1 }],
    };
    const p = new Problema(instancia);
    expect(p.bloques[0].aulas).toEqual(['A1']);
  });

  it('lanza error si faltan docentes', () => {
    expect(() => new Problema({ ...instanciaBase, docentes: [] })).toThrow(
      /docentes/,
    );
  });

  it('lanza error si faltan aulas', () => {
    expect(() => new Problema({ ...instanciaBase, aulas: [] })).toThrow(
      /aulas/,
    );
  });

  it('lanza error si faltan franjas', () => {
    expect(() => new Problema({ ...instanciaBase, franjas: [] })).toThrow(
      /franjas/,
    );
  });

  it('construir genera un cromosoma del largo esperado con un solo docente por grupo', () => {
    const p = new Problema(
      generarInstancia({ docentes: 10, grupos: 8, aulas: 5, semilla: 1 }),
    );
    const cromosoma = p.construir(new Aleatorio(1));
    expect(cromosoma).toHaveLength(p.largo);

    const docentesPorGrupo = new Map<string, Set<string>>();
    for (const gen of cromosoma) {
      const set = docentesPorGrupo.get(gen.grupoId) ?? new Set();
      set.add(gen.docenteId);
      docentesPorGrupo.set(gen.grupoId, set);
    }
    for (const set of docentesPorGrupo.values()) expect(set.size).toBe(1);
  });

  it('construir genera horarios con pocas violaciones (constructivo inteligente)', () => {
    const p = new Problema(
      generarInstancia({ docentes: 20, grupos: 10, aulas: 6, semilla: 2 }),
    );
    const cromosoma = p.construir(new Aleatorio(2));
    const ev = evaluar(cromosoma, p.indices);
    expect(ev.violacionesDuras).toBeLessThan(p.largo);
  });
});
