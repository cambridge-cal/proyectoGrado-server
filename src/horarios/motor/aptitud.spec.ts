import { evaluar, indexar } from './aptitud.js';
import type { InstanciaMotor } from './tipos.js';

const instancia: InstanciaMotor = {
  docentes: [
    {
      id: 'D1',
      especialidad: 'Inglés',
      cargaMaximaHoras: 4,
      franjasDisponibles: new Set(['F1', 'F2', 'F3']),
    },
    {
      id: 'D2',
      especialidad: 'Francés',
      cargaMaximaHoras: 10,
      franjasDisponibles: new Set(['F1']),
    },
  ],
  aulas: [
    { id: 'A1', capacidad: 20, tipo: 'SALON' },
    { id: 'A2', capacidad: 10, tipo: 'LAB' },
  ],
  franjas: [
    { id: 'F1', dia: 'LUN', horaInicio: '08:00', horaFin: '10:00', horas: 2 },
    { id: 'F2', dia: 'LUN', horaInicio: '10:00', horaFin: '12:00', horas: 2 },
    { id: 'F3', dia: 'MAR', horaInicio: '08:00', horaFin: '10:00', horas: 2 },
  ],
  grupos: [
    { id: 'G1', idioma: 'Inglés', estudiantes: 15, sesiones: 2 },
    { id: 'G2', idioma: 'Francés', estudiantes: 8, sesiones: 1 },
  ],
};
const indices = indexar(instancia);

describe('Función de aptitud (sección 6.3.1)', () => {
  it('un horario sin violaciones suma 10 por asignación', () => {
    const r = evaluar(
      [
        { grupoId: 'G1', docenteId: 'D1', aulaId: 'A1', franjaId: 'F1' },
        { grupoId: 'G1', docenteId: 'D1', aulaId: 'A1', franjaId: 'F3' },
        { grupoId: 'G2', docenteId: 'D2', aulaId: 'A2', franjaId: 'F1' },
      ],
      indices,
    );
    expect(r).toMatchObject({
      aptitud: 30,
      violacionesDuras: 0,
      horasSobrecarga: 0,
      asignacionesValidas: 3,
    });
  });

  it('resta 100 por cada restricción dura de RF-18', () => {
    const r = evaluar(
      [
        // D1 en F1 dos veces (cruce de docente) y A1 en F1 dos veces (cruce de aula).
        { grupoId: 'G1', docenteId: 'D1', aulaId: 'A1', franjaId: 'F1' },
        { grupoId: 'G2', docenteId: 'D1', aulaId: 'A1', franjaId: 'F1' },
      ],
      indices,
    );
    expect(r.violaciones.map((v) => v.tipo).sort()).toEqual([
      'CRUCE_AULA',
      'CRUCE_DOCENTE',
    ]);
    expect(r.aptitud).toBe(0 - 2 * 100);
  });

  it('detecta falta de disponibilidad, capacidad insuficiente y grupo repetido en la franja', () => {
    const r = evaluar(
      [
        { grupoId: 'G2', docenteId: 'D2', aulaId: 'A2', franjaId: 'F2' }, // D2 no está disponible en F2
        { grupoId: 'G1', docenteId: 'D1', aulaId: 'A2', franjaId: 'F3' }, // 15 estudiantes en un aula de 10
        { grupoId: 'G1', docenteId: 'D1', aulaId: 'A1', franjaId: 'F3' }, // G1 dos veces en F3 y D1 también
      ],
      indices,
    );
    const tipos = r.violaciones.map((v) => v.tipo);
    expect(tipos).toContain('SIN_DISPONIBILIDAD');
    expect(tipos).toContain('CAPACIDAD_AULA');
    expect(tipos).toContain('CRUCE_GRUPO');
    expect(r.asignacionesValidas).toBe(0);
  });

  it('resta 50 por cada hora por encima de la carga máxima (restricción blanda)', () => {
    const r = evaluar(
      [
        { grupoId: 'G1', docenteId: 'D1', aulaId: 'A1', franjaId: 'F1' },
        { grupoId: 'G1', docenteId: 'D1', aulaId: 'A1', franjaId: 'F2' },
        { grupoId: 'G1', docenteId: 'D1', aulaId: 'A1', franjaId: 'F3' },
      ],
      indices,
    );
    // D1 dicta 6 horas con carga máxima de 4.
    expect(r.horasSobrecarga).toBe(2);
    expect(r.aptitud).toBe(3 * 10 - 2 * 50);
  });
});
