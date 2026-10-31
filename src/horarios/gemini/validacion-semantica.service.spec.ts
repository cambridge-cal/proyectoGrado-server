import { ConfigService } from '@nestjs/config';
import { DiaSemana, Jornada } from '../entidades/enums.js';
import {
  type ClienteGemini,
  MODELO_POR_DEFECTO,
  presupuestoRazonamiento,
  type SolicitudGemini,
} from './cliente-gemini.js';
import type { RespuestaGemini } from './prompt.js';
import {
  type DatosValidacion,
  ValidacionSemanticaService,
} from './validacion-semantica.service.js';

const config = (valores: Record<string, string> = {}) =>
  ({ get: (clave: string) => valores[clave] }) as unknown as ConfigService;

/** Cliente simulado: responde lo que cada prueba le indique. */
function cliente(
  responder: (s: SolicitudGemini) => Promise<string> | string,
  configurado = true,
) {
  const solicitudes: SolicitudGemini[] = [];
  const falso: ClienteGemini = {
    configurado,
    modelo: 'gemini-prueba',
    generar: async (s) => {
      solicitudes.push(s);
      return responder(s);
    },
  };
  return { falso, solicitudes };
}
const json = (r: RespuestaGemini) => JSON.stringify(r);

const franjas = [
  {
    id: 'f-lun-7',
    diaSemana: DiaSemana.LUN,
    horaInicio: '07:00',
    horaFin: '09:00',
  },
  {
    id: 'f-lun-9',
    diaSemana: DiaSemana.LUN,
    horaInicio: '09:00',
    horaFin: '11:00',
  },
  {
    id: 'f-mar-7',
    diaSemana: DiaSemana.MAR,
    horaInicio: '07:00',
    horaFin: '09:00',
  },
];
const datos: DatosValidacion = {
  periodo: '2026-2',
  docentes: [
    {
      id: 'uuid-laura',
      nombre: 'Laura Gómez',
      especialidad: 'Inglés',
      cargaMaximaSemanal: 20,
    },
    {
      id: 'uuid-pierre',
      nombre: 'Pierre Martin',
      especialidad: 'Francés',
      cargaMaximaSemanal: 20,
    },
  ],
  aulas: [
    { id: 'uuid-a101', codigo: 'A101', capacidad: 20, tipo: 'SALON' },
    { id: 'uuid-a102', codigo: 'A102', capacidad: 20, tipo: 'SALON' },
  ],
  grupos: [
    {
      id: 'uuid-g1',
      codigo: 'ING-A1-01',
      curso: 'Inglés A1',
      idioma: 'Inglés',
      nivel: 'A1',
      jornada: Jornada.MANANA,
      cupoMaximo: 15,
      intensidadHoraria: 4,
    },
  ],
  franjas,
  instancia: {
    docentes: [
      {
        id: 'uuid-laura',
        especialidad: 'Inglés',
        cargaMaximaHoras: 20,
        franjasDisponibles: new Set(['f-lun-7', 'f-lun-9', 'f-mar-7']),
      },
      {
        id: 'uuid-pierre',
        especialidad: 'Francés',
        cargaMaximaHoras: 20,
        franjasDisponibles: new Set(['f-lun-7']),
      },
    ],
    aulas: [
      { id: 'uuid-a101', capacidad: 20, tipo: 'SALON' },
      { id: 'uuid-a102', capacidad: 20, tipo: 'SALON' },
    ],
    franjas: franjas.map((f) => ({
      id: f.id,
      dia: f.diaSemana,
      horaInicio: f.horaInicio,
      horaFin: f.horaFin,
      horas: 2,
    })),
    grupos: [{ id: 'uuid-g1', idioma: 'Inglés', estudiantes: 15, sesiones: 2 }],
  },
  asignaciones: [
    {
      grupoId: 'uuid-g1',
      docenteId: 'uuid-laura',
      aulaId: 'uuid-a101',
      franjaId: 'f-lun-7',
    },
    {
      grupoId: 'uuid-g1',
      docenteId: 'uuid-laura',
      aulaId: 'uuid-a101',
      franjaId: 'f-lun-9',
    },
  ],
};

const servicio = (c: ClienteGemini, valores?: Record<string, string>) =>
  new ValidacionSemanticaService(c, config(valores));

describe('ValidacionSemanticaService (RF-17, RNF-18)', () => {
  it('sin GEMINI_API_KEY guarda el horario del AG + BT sin validar', async () => {
    const { falso, solicitudes } = cliente(() => '', false);
    const r = await servicio(falso).validar(datos);
    expect(r).toMatchObject({
      validadoGemini: false,
      estado: 'SIN_CONFIGURAR',
    });
    expect(r.asignaciones).toBe(datos.asignaciones);
    expect(solicitudes).toHaveLength(0);
  });

  it('envía ids cortos y legibles en lugar de UUID', async () => {
    const { falso, solicitudes } = cliente(() =>
      json({ aprobado: true, observaciones: [], ajustes: [] }),
    );
    await servicio(falso, { GEMINI_TIMEOUT_MS: '5000' }).validar(datos);
    const mensaje = solicitudes[0].mensaje;
    expect(mensaje).toContain('"id":"S1"');
    expect(mensaje).toContain('"grupo":"ING-A1-01"');
    expect(mensaje).toContain('"docente":"D1"');
    expect(mensaje).not.toContain('uuid-laura');
    expect(solicitudes[0].timeoutMs).toBe(5000);
  });

  it('aprobación sin ajustes: validadoGemini = true', async () => {
    const { falso } = cliente(() =>
      json({ aprobado: true, observaciones: [], ajustes: [] }),
    );
    const r = await servicio(falso).validar(datos);
    expect(r).toMatchObject({
      validadoGemini: true,
      estado: 'APROBADO',
      detalle: null,
    });
  });

  it('aprobación con ajustes: los aplica si siguen cumpliendo RF-18', async () => {
    const { falso } = cliente(() =>
      json({
        aprobado: true,
        observaciones: [
          {
            asignaciones: ['S1', 'S2'],
            tipo: 'DISTRIBUCION_SEMANAL',
            severidad: 'MEDIA',
            descripcion: 'Las dos sesiones están el mismo día.',
          },
        ],
        ajustes: [
          {
            asignacion: 'S2',
            dia: 'Martes',
            inicio: '07:00',
            motivo: 'Repartir la semana',
          },
        ],
      }),
    );
    const r = await servicio(falso).validar(datos);
    expect(r).toMatchObject({
      validadoGemini: true,
      estado: 'APROBADO_CON_AJUSTES',
    });
    expect(r.asignaciones[1].franjaId).toBe('f-mar-7');
    expect(datos.asignaciones[1].franjaId).toBe('f-lun-9');
    expect(r.observaciones[0].asignaciones).toEqual([0, 1]);
    expect(r.ajustesAplicados).toEqual([
      { posicion: 1, motivo: 'Repartir la semana' },
    ]);
    expect(r.evaluacion.violacionesDuras).toBe(0);
  });

  it('descarta ajustes que crean un cruce y conserva el horario original', async () => {
    const { falso } = cliente(() =>
      json({
        aprobado: true,
        observaciones: [],
        ajustes: [{ asignacion: 'S2', inicio: '07:00', motivo: 'Juntar' }],
      }),
    );
    const r = await servicio(falso).validar(datos);
    expect(r).toMatchObject({
      validadoGemini: false,
      estado: 'AJUSTES_INVALIDOS',
    });
    expect(r.asignaciones).toBe(datos.asignaciones);
  });

  it('descarta un cambio de docente a uno sin disponibilidad en la franja', async () => {
    const { falso } = cliente(() =>
      json({
        aprobado: true,
        observaciones: [],
        ajustes: [{ asignacion: 'S2', docente: 'D2', motivo: 'Otro docente' }],
      }),
    );
    const r = await servicio(falso).validar(datos);
    expect(r.estado).toBe('AJUSTES_INVALIDOS');
  });

  it('descarta un ajuste hacia una franja que no existe', async () => {
    const { falso } = cliente(() =>
      json({
        aprobado: true,
        observaciones: [],
        ajustes: [
          { asignacion: 'S2', dia: 'Martes', inicio: '15:00', motivo: 'Tarde' },
        ],
      }),
    );
    const r = await servicio(falso).validar(datos);
    expect(r).toMatchObject({
      estado: 'AJUSTES_INVALIDOS',
      validadoGemini: false,
    });
  });

  it('rechazo: conserva el AG + BT y guarda las observaciones', async () => {
    const { falso } = cliente(() =>
      json({
        aprobado: false,
        observaciones: [
          {
            asignaciones: ['S1'],
            tipo: 'JORNADA',
            severidad: 'ALTA',
            descripcion: 'No coincide.',
          },
        ],
        ajustes: [],
      }),
    );
    const r = await servicio(falso).validar(datos);
    expect(r).toMatchObject({ validadoGemini: false, estado: 'RECHAZADO' });
    expect(r.observaciones).toEqual([
      {
        tipo: 'JORNADA',
        severidad: 'ALTA',
        descripcion: 'No coincide.',
        asignaciones: [0],
      },
    ]);
  });

  it('tiempo agotado: respaldo de RNF-18', async () => {
    const { falso } = cliente(() => {
      throw Object.assign(new Error('timeout'), { name: 'TimeoutError' });
    });
    const r = await servicio(falso).validar(datos);
    expect(r).toMatchObject({
      validadoGemini: false,
      estado: 'TIEMPO_AGOTADO',
    });
  });

  it('cuota agotada (429): respaldo con su propio estado', async () => {
    const { falso } = cliente(() => {
      throw Object.assign(new Error('RESOURCE_EXHAUSTED'), { status: 429 });
    });
    const r = await servicio(falso).validar(datos);
    expect(r).toMatchObject({ validadoGemini: false, estado: 'CUOTA_AGOTADA' });
    expect(r.detalle).toContain('gemini-prueba');
  });

  it('espera 120 s por defecto (RNF-02)', () => {
    const { falso } = cliente(() => '');
    expect(servicio(falso).timeoutMs).toBe(120_000);
  });

  it('error de la API: respaldo sin exponer el mensaje original', async () => {
    const { falso } = cliente(() => {
      throw new Error('API key not valid: clave-secreta-123');
    });
    const r = await servicio(falso).validar(datos);
    expect(r.estado).toBe('ERROR');
    expect(r.detalle).not.toContain('clave-secreta-123');
  });

  it.each([
    ['texto que no es JSON', 'no es json'],
    ['falta un campo', JSON.stringify({ aprobado: true, ajustes: [] })],
    [
      'ajuste sobre una asignación inexistente',
      json({
        aprobado: true,
        observaciones: [],
        ajustes: [{ asignacion: 'S9', motivo: 'x' }],
      }),
    ],
    [
      'docente inexistente',
      json({
        aprobado: true,
        observaciones: [],
        ajustes: [{ asignacion: 'S1', docente: 'D7', motivo: 'x' }],
      }),
    ],
  ])('respuesta inválida (%s): respaldo de RNF-18', async (_caso, texto) => {
    const { falso } = cliente(() => texto);
    const r = await servicio(falso).validar(datos);
    expect(r).toMatchObject({
      validadoGemini: false,
      estado: 'RESPUESTA_INVALIDA',
    });
    expect(r.asignaciones).toBe(datos.asignaciones);
  });
});

describe('Configuración del cliente de Gemini (RNF-30)', () => {
  it('usa Gemini 2.5 Flash por defecto', () => {
    expect(MODELO_POR_DEFECTO).toBe('gemini-2.5-flash');
  });

  it.each([
    ['gemini-2.5-flash', undefined, 1024],
    ['gemini-2.5-flash', '0', 0],
    ['gemini-2.5-flash', '-1', -1],
    ['gemini-2.5-flash', 'mucho', 1024],
    ['gemini-3.1-pro-preview', undefined, undefined],
    ['gemini-3.1-pro-preview', '2048', 2048],
  ])(
    'presupuesto de razonamiento de %s con %s: %s',
    (modelo, valor, esperado) => {
      expect(presupuestoRazonamiento(modelo, valor)).toBe(esperado);
    },
  );
});
