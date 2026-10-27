import { Aleatorio } from './aleatorio.js';
import type { InstanciaMotor } from './tipos.js';

export interface OpcionesInstancia {
  docentes: number;
  grupos: number;
  aulas: number;
  dias?: string[];
  bloquesPorDia?: number;
  /** Horas de cada franja. */
  horasFranja?: number;
  /** Fracción de franjas en las que cada docente está disponible. */
  disponibilidad?: number;
  /** Horas semanales de cada grupo. */
  intensidadHoraria?: number;
  semilla?: number;
}

const IDIOMAS = ['Inglés', 'Francés', 'Portugués', 'Alemán'];

/**
 * Genera una institución ficticia para probar el motor y medir su rendimiento
 * (RNF-02: hasta 50 docentes y 30 grupos). No se usa en producción.
 */
export function generarInstancia(opciones: OpcionesInstancia): InstanciaMotor {
  const aleatorio = new Aleatorio(opciones.semilla ?? 1);
  const dias = opciones.dias ?? ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'];
  const bloques = opciones.bloquesPorDia ?? 7;
  const horas = opciones.horasFranja ?? 2;
  const disponibilidad = opciones.disponibilidad ?? 0.6;
  const intensidad = opciones.intensidadHoraria ?? 4;

  const franjas = dias.flatMap((dia) =>
    Array.from({ length: bloques }, (_, b) => {
      const inicio = 7 + b * horas;
      return {
        id: `${dia}-${b + 1}`,
        dia,
        horaInicio: `${String(inicio).padStart(2, '0')}:00`,
        horaFin: `${String(inicio + horas).padStart(2, '0')}:00`,
        horas,
      };
    }),
  );

  const docentes = Array.from({ length: opciones.docentes }, (_, i) => ({
    id: `D${i + 1}`,
    // 70 % inglés, el resto repartido entre los demás idiomas, como un instituto real.
    especialidad: i % 10 < 7 ? 'Inglés' : IDIOMAS[1 + (i % 3)],
    cargaMaximaHoras: 20 + aleatorio.entero(21),
    franjasDisponibles: new Set(
      franjas
        .filter(() => aleatorio.probabilidad(disponibilidad))
        .map((f) => f.id),
    ),
  }));

  const aulas = Array.from({ length: opciones.aulas }, (_, i) => ({
    id: `A${i + 1}`,
    capacidad: 15 + aleatorio.entero(21),
    tipo: i % 6 === 5 ? 'LAB' : 'SALON',
  }));

  const grupos = Array.from({ length: opciones.grupos }, (_, i) => ({
    id: `G${i + 1}`,
    idioma: i % 10 < 7 ? 'Inglés' : IDIOMAS[1 + (i % 3)],
    estudiantes: 10 + aleatorio.entero(16),
    sesiones: Math.ceil(intensidad / horas),
  }));

  return { docentes, aulas, franjas, grupos };
}
