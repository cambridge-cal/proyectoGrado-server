import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';
import type { AuditoriaService } from '../../seguridad/auditoria/auditoria.service.js';
import { Docente } from '../../seguridad/entidades/docente.entity.js';
import { Estudiante } from '../../seguridad/entidades/estudiante.entity.js';
import { Rol } from '../../seguridad/entidades/rol.enum.js';
import { Aula } from '../entidades/aula.entity.js';
import { Disponibilidad } from '../entidades/disponibilidad.entity.js';
import { DiaSemana, Jornada, TipoAula } from '../entidades/enums.js';
import { EstudianteGrupo } from '../entidades/estudiante-grupo.entity.js';
import { FranjaHoraria } from '../entidades/franja-horaria.entity.js';
import { Grupo } from '../entidades/grupo.entity.js';
import { Horario } from '../entidades/horario.entity.js';
import { PeriodoAcademico } from '../entidades/periodo-academico.entity.js';
import type { ClienteGemini } from '../gemini/cliente-gemini.js';
import { ValidacionSemanticaService } from '../gemini/validacion-semantica.service.js';
import { MotorService } from '../motor/motor.service.js';
import {
  duracionTipica,
  HorariosService,
  sesionesSemanales,
} from './horarios.service.js';

const config = (valores: Record<string, string>) =>
  ({ get: (clave: string) => valores[clave] }) as unknown as ConfigService;
const actor = { id: 'admin-1', rol: Rol.ADMIN, ip: '127.0.0.1' };

const periodo = {
  id: 'p1',
  nombre: '2026-2',
  activo: true,
} as PeriodoAcademico;
const franjas = [DiaSemana.LUN, DiaSemana.MAR, DiaSemana.MIE].flatMap(
  (dia, d) =>
    ['07:00', '09:00'].map(
      (inicio, b) =>
        ({
          id: `f-${dia}-${b}`,
          diaSemana: dia,
          horaInicio: inicio,
          horaFin: b === 0 ? '09:00' : '11:00',
          bloque: d * 2 + b + 1,
        }) as FranjaHoraria,
    ),
);
const grupo = (id: string, idioma: string, cupo: number) =>
  ({
    id,
    codigo: id.toUpperCase(),
    cupoMaximo: cupo,
    jornada: Jornada.MANANA,
    codigoAcceso: `ACC${id}`,
    curso: {
      id: `c-${id}`,
      nombre: `${idioma} A1`,
      intensidadHoraria: 4,
      nivelIdioma: {
        id: `n-${id}`,
        codigo: `${idioma.slice(0, 3)}-A1`,
        nombre: 'A1',
        idioma,
      },
    },
  }) as Grupo;
const docente = (id: string, nombre: string, especialidad: string) =>
  ({
    id,
    especialidad,
    cargaMaximaSemanal: 20,
    usuario: { id: `u-${id}`, nombre, activo: true },
  }) as unknown as Docente;

interface Escenario {
  periodos: PeriodoAcademico[];
  grupos: Grupo[];
  docentes: Docente[];
  aulas: Aula[];
  disponibilidades: Disponibilidad[];
}

function escenario(cambios: Partial<Escenario> = {}): Escenario {
  const docentes = [
    docente('d1', 'Laura Gómez', 'Inglés'),
    docente('d2', 'Pierre Martin', 'Francés'),
  ];
  return {
    periodos: [periodo],
    grupos: [grupo('g-ing', 'Inglés', 15), grupo('g-fra', 'Francés', 12)],
    docentes,
    aulas: [
      {
        id: 'a1',
        codigo: 'A101',
        capacidad: 20,
        tipo: TipoAula.SALON,
        activa: true,
      },
      {
        id: 'a2',
        codigo: 'A102',
        capacidad: 20,
        tipo: TipoAula.SALON,
        activa: true,
      },
      {
        id: 'v1',
        codigo: 'VIR1',
        capacidad: 40,
        tipo: TipoAula.VIRTUAL,
        activa: true,
      },
    ] as Aula[],
    disponibilidades: docentes.flatMap((d) =>
      franjas.map(
        (f) =>
          ({
            id: `${d.id}${f.id}`,
            docente: d,
            franjaHoraria: f,
          }) as Disponibilidad,
      ),
    ),
    ...cambios,
  };
}

/** DataSource simulado: lo justo para la carga de datos, el guardado y el detalle. */
function fuenteFalsa(datos: Escenario) {
  const guardados: Horario[] = [];
  const filtrarAulas = (opciones: {
    where?: { tipo?: { _value?: { _value?: string[] } } };
  }) => {
    const excluidos = opciones?.where?.tipo?._value?._value ?? [];
    return datos.aulas.filter((a) => a.activa && !excluidos.includes(a.tipo));
  };
  const porIds =
    <T extends { id: string }>(lista: T[]) =>
    (opciones: unknown) => {
      const o = opciones as {
        where?: { id?: { _value?: string[] } };
        id?: { _value?: string[] };
      };
      const ids = o?.where?.id?._value ?? o?.id?._value ?? [];
      return lista.filter((x) => ids.includes(x.id));
    };
  // El estudiante u-e1 está inscrito solo en el grupo de inglés.
  const estudiantes = [{ id: 'e1', usuario: { id: 'u-e1' } }];
  const repos = new Map<unknown, object>([
    [
      Estudiante,
      {
        findOneBy: async (w: { usuario: { id: string } }) =>
          estudiantes.find((e) => e.usuario.id === w.usuario.id) ?? null,
      },
    ],
    [
      EstudianteGrupo,
      {
        find: async (o: { where: { estudiante: { id: string } } }) =>
          o.where.estudiante.id === 'e1'
            ? [{ grupo: datos.grupos.find((g) => g.id === 'g-ing') }]
            : [],
      },
    ],
    [
      PeriodoAcademico,
      {
        findOneBy: async (w: Partial<PeriodoAcademico>) =>
          datos.periodos.find((p) =>
            w.id ? p.id === w.id : p.activo === w.activo,
          ) ?? null,
      },
    ],
    [
      Grupo,
      {
        find: async (o: object) =>
          o && 'where' in o ? porIds(datos.grupos)(o) : datos.grupos,
      },
    ],
    [
      Docente,
      {
        createQueryBuilder: () => {
          const qb = {
            innerJoinAndSelect: () => qb,
            where: () => qb,
            orderBy: () => qb,
            getMany: async () => datos.docentes,
          };
          return qb;
        },
        find: async (o: object) => porIds(datos.docentes)(o),
        findOneBy: async (w: { usuario: { id: string } }) =>
          datos.docentes.find((d) => d.usuario.id === w.usuario.id) ?? null,
      },
    ],
    [
      Aula,
      {
        find: async (o: object) => filtrarAulas(o),
        findBy: async (o: object) => porIds(datos.aulas)(o),
      },
    ],
    [
      FranjaHoraria,
      {
        find: async () => franjas,
        findBy: async (o: object) => porIds(franjas)(o),
      },
    ],
    [Disponibilidad, { find: async () => datos.disponibilidades }],
    [
      Horario,
      {
        create: (h: Partial<Horario>) => h,
        save: async (h: Horario) => {
          const guardado = { ...h, id: 'h1', creadoEn: new Date() };
          guardados.push(guardado);
          return guardado;
        },
        findOne: async () => guardados.at(-1) ?? null,
      },
    ],
  ]);
  const fuente = {
    getRepository: (e: unknown) => repos.get(e),
  } as unknown as DataSource;
  return { fuente, guardados };
}

function crear(datos: Escenario, gemini?: ClienteGemini) {
  const { fuente, guardados } = fuenteFalsa(datos);
  const auditoria = { registrar: vi.fn().mockResolvedValue(undefined) };
  const cliente: ClienteGemini = gemini ?? {
    configurado: false,
    modelo: 'gemini-prueba',
    generar: vi.fn(),
  };
  const servicio = new HorariosService(
    fuente,
    new MotorService(config({ MOTOR_SEMILLA: '7' })),
    new ValidacionSemanticaService(cliente, config({})),
    auditoria as unknown as AuditoriaService,
  );
  return { servicio, guardados, auditoria };
}

describe('HorariosService.generar (RF-17, RF-19, RNF-18)', () => {
  it('genera con el período activo y guarda los metadatos', async () => {
    const { servicio, guardados, auditoria } = crear(escenario());
    const horario = await servicio.generar({}, actor);

    expect(guardados).toHaveLength(1);
    const guardado = guardados[0];
    expect(guardado.periodo).toBe(periodo);
    // 4 horas semanales en franjas de 2 horas: 2 sesiones por grupo.
    expect(guardado.asignaciones).toHaveLength(4);
    expect(guardado.fitness).toBe(40);
    expect(guardado.generaciones).toBeGreaterThanOrEqual(0);
    expect(guardado.intentos).toBe(1);
    expect(guardado.tiempoEjecucionMs).toBeGreaterThanOrEqual(0);
    expect(guardado.validadoGemini).toBe(false);
    expect(guardado.validacion.estado).toBe('SIN_CONFIGURAR');
    expect(guardado.archivado).toBe(false);

    expect(horario.periodo).toEqual({ id: 'p1', nombre: '2026-2' });
    const ingles = horario.asignaciones.filter(
      (a) => a.grupo?.codigo === 'G-ING',
    );
    expect(ingles.map((a) => a.docente?.nombre)).toEqual([
      'Laura Gómez',
      'Laura Gómez',
    ]);
    expect(auditoria.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        modulo: 'HORARIOS',
        accion: 'GENERAR_HORARIO',
      }),
    );
  });

  it('no usa los tipos de aula excluidos (RF-19)', async () => {
    const datos = escenario({
      aulas: [
        {
          id: 'a1',
          codigo: 'A101',
          capacidad: 20,
          tipo: TipoAula.SALON,
          activa: true,
        },
        {
          id: 'v1',
          codigo: 'VIR1',
          capacidad: 40,
          tipo: TipoAula.VIRTUAL,
          activa: true,
        },
        {
          id: 'v2',
          codigo: 'VIR2',
          capacidad: 40,
          tipo: TipoAula.VIRTUAL,
          activa: true,
        },
      ] as Aula[],
    });
    const { servicio, guardados } = crear(datos);
    await servicio.generar({ tiposAulaExcluidos: [TipoAula.VIRTUAL] }, actor);
    expect(new Set(guardados[0].asignaciones.map((a) => a.aulaId))).toEqual(
      new Set(['a1']),
    );
    expect(guardados[0].tiposAulaExcluidos).toEqual([TipoAula.VIRTUAL]);
  });

  it('avisa si al excluir tipos de aula no queda ninguna', async () => {
    const datos = escenario({
      aulas: [
        {
          id: 'v1',
          codigo: 'VIR1',
          capacidad: 40,
          tipo: TipoAula.VIRTUAL,
          activa: true,
        },
      ] as Aula[],
    });
    const { servicio } = crear(datos);
    await expect(
      servicio.generar({ tiposAulaExcluidos: [TipoAula.VIRTUAL] }, actor),
    ).rejects.toThrow(/no queda ninguna aula/);
  });

  it('exige un período activo si no se indica uno', async () => {
    const { servicio } = crear(escenario({ periodos: [] }));
    await expect(servicio.generar({}, actor)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('responde 404 si el período indicado no existe', async () => {
    const { servicio } = crear(escenario());
    await expect(
      servicio.generar({ periodoId: 'otro' }, actor),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('avisa si ningún docente registró disponibilidad', async () => {
    const { servicio } = crear(escenario({ disponibilidades: [] }));
    await expect(servicio.generar({}, actor)).rejects.toThrow(/disponibilidad/);
  });

  it('sin solución informa las restricciones no satisfechas y no guarda nada (Figura 6.4)', async () => {
    const datos = escenario({ grupos: [grupo('g-ing', 'Inglés', 60)] });
    const { servicio, guardados, auditoria } = crear(datos);
    const error = await servicio.generar({}, actor).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    const cuerpo = (error as UnprocessableEntityException).getResponse() as {
      restriccionesNoSatisfechas: Array<{ tipo: string; cantidad: number }>;
    };
    expect(cuerpo.restriccionesNoSatisfechas).toContainEqual(
      expect.objectContaining({ tipo: 'CAPACIDAD_AULA' }),
    );
    expect(guardados).toHaveLength(0);
    expect(auditoria.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ accion: 'GENERAR_HORARIO_FALLIDO' }),
    );
  });

  it('guarda validadoGemini = true cuando Gemini aprueba', async () => {
    const gemini: ClienteGemini = {
      configurado: true,
      modelo: 'gemini-prueba',
      generar: async () =>
        JSON.stringify({ aprobado: true, observaciones: [], ajustes: [] }),
    };
    const { servicio, guardados } = crear(escenario(), gemini);
    const horario = await servicio.generar({}, actor);
    expect(guardados[0].validadoGemini).toBe(true);
    expect(horario.estadoValidacion).toBe('APROBADO');
  });
});

describe('Sesiones semanales de un grupo', () => {
  it('toma la duración más común de las franjas', () => {
    expect(
      duracionTipica([
        { horaInicio: '07:00', horaFin: '09:00' },
        { horaInicio: '09:00', horaFin: '11:00' },
        { horaInicio: '18:00', horaFin: '19:30' },
      ]),
    ).toBe(2);
  });

  it.each([
    [4, 2, 2],
    [5, 2, 3],
    [6, 1.5, 4],
    [1, 2, 1],
  ])(
    '%i horas en franjas de %i h son %i sesiones',
    (intensidad, duracion, sesiones) => {
      expect(sesionesSemanales(intensidad, duracion)).toBe(sesiones);
    },
  );
});

describe('HorariosService.actual (RF-21, RF-25)', () => {
  it('responde 404 si todavía no hay un horario activo', async () => {
    const { servicio } = crear(escenario());
    await expect(servicio.actual(actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('el Administrador ve todo y el docente solo sus clases', async () => {
    const { servicio } = crear(escenario());
    await servicio.generar({}, actor);
    const completo = await servicio.actual(actor);
    expect(completo.asignaciones).toHaveLength(4);

    const laura = { id: 'u-d1', rol: Rol.DOCENTE, ip: null };
    const propio = await servicio.actual(laura);
    expect(propio.asignaciones).toHaveLength(2);
    expect(propio.totalAsignaciones).toBe(2);
    expect(propio.asignaciones.every((a) => a.docente?.id === 'd1')).toBe(true);

    const sinPerfil = { id: 'u-otro', rol: Rol.DOCENTE, ip: null };
    expect((await servicio.actual(sinPerfil)).asignaciones).toHaveLength(0);
  });

  it('el estudiante solo ve las clases de sus grupos activos', async () => {
    const { servicio } = crear(escenario());
    await servicio.generar({}, actor);
    const ana = await servicio.actual({
      id: 'u-e1',
      rol: Rol.ESTUDIANTE,
      ip: null,
    });
    expect(ana.asignaciones.map((a) => a.grupo?.id)).toEqual([
      'g-ing',
      'g-ing',
    ]);
    const sinGrupos = await servicio.actual({
      id: 'u-x',
      rol: Rol.ESTUDIANTE,
      ip: null,
    });
    expect(sinGrupos.asignaciones).toHaveLength(0);
  });
});
