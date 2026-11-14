import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource, In } from 'typeorm';
import {
  CLIENTE_GEMINI,
  type ClienteGemini,
  type SolicitudGemini,
} from '../src/horarios/gemini/cliente-gemini.js';
import type {
  ContextoGemini,
  RespuestaGemini,
} from '../src/horarios/gemini/prompt.js';
import {
  Aula,
  Curso,
  Disponibilidad,
  FranjaHoraria,
  Grupo,
  Horario,
  NivelIdioma,
  PeriodoAcademico,
} from '../src/horarios/entidades/index.js';
import type { HorarioDetalle } from '../src/horarios/horario/detalle.js';
import { Docente, Rol } from '../src/seguridad/entidades/index.js';
import {
  borrarUsuarios,
  CLAVE_PRUEBA,
  crearApp,
  usuarioConSesion,
} from './utilidades.js';

const SESIONES_POR_GRUPO = 2;
const CUPO = 20;
const ESPERA_GENERACION_MS = 60_000;

// Requiere la base de datos de docker compose en ejecución y un archivo .env.
// TKT-044: recorre de punta a punta el flujo de la Figura 6.4. Gemini se reemplaza por un
// cliente simulado: la prueba nunca llama a la API real.
describe('Regresión: generación de horario con IA (e2e, Figura 6.4)', () => {
  let app: INestApplication;
  let fuente: DataSource;
  const marca = `e2erh${Date.now()}`;
  const corta = Date.now().toString(36).slice(-5).toUpperCase();
  let admin: { id: string; token: string };
  let periodoId: string;
  let nivelId: string;
  let cursoId: string;
  const grupos: Array<{ id: string; codigo: string }> = [];
  const aulas: string[] = [];
  const franjas: string[] = [];
  const docentes: string[] = [];
  const usuariosDocentes: string[] = [];
  let generados = 0;

  let gemini: ClienteGemini;
  let llamadasGemini: SolicitudGemini[] = [];
  let responder: (contexto: ContextoGemini) => RespuestaGemini = aprobar;

  const http = () => request(app.getHttpServer());
  const post = (ruta: string, cuerpo: object = {}) =>
    http()
      .post(`/api${ruta}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send(cuerpo);
  const get = (ruta: string) =>
    http().get(`/api${ruta}`).set('Authorization', `Bearer ${admin.token}`);

  const simularGemini = (
    configurado: boolean,
    respuesta: (contexto: ContextoGemini) => RespuestaGemini = aprobar,
  ) => {
    (gemini as { configurado: boolean }).configurado = configurado;
    responder = respuesta;
    llamadasGemini = [];
  };

  const generar = async (cuerpo: object = {}): Promise<HorarioDetalle> => {
    const respuesta = await post('/horarios/generar', {
      periodoId,
      ...cuerpo,
    }).expect(201);
    generados++;
    return respuesta.body as HorarioDetalle;
  };

  /** Restricciones duras de RF-18, verificadas contra la base y no contra el motor. */
  const verificarRestriccionesDuras = async (horario: HorarioDetalle) => {
    const guardado = await fuente
      .getRepository(Horario)
      .findOneByOrFail({ id: horario.id });
    const asignaciones = guardado.asignaciones;
    for (const recurso of ['docenteId', 'aulaId', 'grupoId'] as const) {
      const ocupacion = asignaciones.map((a) => `${a[recurso]}@${a.franjaId}`);
      expect(new Set(ocupacion).size, `cruce de ${recurso}`).toBe(
        ocupacion.length,
      );
    }

    const disponibles = new Set(
      (
        await fuente.getRepository(Disponibilidad).find({
          where: {
            docente: { id: In(asignaciones.map((a) => a.docenteId)) },
          },
          relations: { docente: true, franjaHoraria: true },
        })
      ).map((d) => `${d.docente.id}@${d.franjaHoraria.id}`),
    );
    const capacidad = new Map(
      (
        await fuente
          .getRepository(Aula)
          .findBy({ id: In(asignaciones.map((a) => a.aulaId)) })
      ).map((a) => [a.id, a.capacidad]),
    );
    const cupo = new Map(
      (
        await fuente
          .getRepository(Grupo)
          .findBy({ id: In(asignaciones.map((a) => a.grupoId)) })
      ).map((g) => [g.id, g.cupoMaximo]),
    );
    for (const a of asignaciones) {
      expect(
        disponibles.has(`${a.docenteId}@${a.franjaId}`),
        'docente sin disponibilidad en la franja',
      ).toBe(true);
      expect(capacidad.get(a.aulaId)).toBeGreaterThanOrEqual(
        cupo.get(a.grupoId)!,
      );
    }

    for (const grupo of grupos) {
      expect(
        asignaciones.filter((a) => a.grupoId === grupo.id),
        `sesiones de ${grupo.codigo}`,
      ).toHaveLength(SESIONES_POR_GRUPO);
    }
  };

  beforeAll(async () => {
    ({ app, fuente } = await crearApp());
    admin = await usuarioConSesion(app, fuente, marca, Rol.ADMIN);

    gemini = app.get<ClienteGemini>(CLIENTE_GEMINI, { strict: false });
    vi.spyOn(gemini, 'generar').mockImplementation((solicitud) => {
      llamadasGemini.push(solicitud);
      const contexto = JSON.parse(
        solicitud.mensaje.split('\n\n')[1],
      ) as ContextoGemini;
      return Promise.resolve(JSON.stringify(responder(contexto)));
    });

    const periodo = await post('/periodos', {
      nombre: marca,
      fechaInicio: '2032-01-12',
      fechaFin: '2032-06-11',
    }).expect(201);
    periodoId = periodo.body.id;
    const nivel = await post('/niveles', {
      codigo: `${corta}-RH`,
      nombre: 'A1',
      idioma: 'Inglés',
    }).expect(201);
    nivelId = nivel.body.id;
    const curso = await post('/cursos', {
      nombre: `Inglés A1 ${corta}`,
      nivelIdiomaId: nivelId,
      intensidadHoraria: 4,
    }).expect(201);
    cursoId = curso.body.id;

    // La madrugada del jueves y del viernes no choca con franjas reales ni con otras suites.
    const lote = await post('/franjas-horarias/lote', {
      dias: ['JUE', 'VIE'],
      desde: '00:00',
      hasta: '06:00',
      duracionMinutos: 120,
      bloqueInicial: 21,
    }).expect(201);
    franjas.push(...lote.body.map((f: { id: string }) => f.id));

    for (const [sufijo, tipo] of [
      ['S1', 'SALON'],
      ['L1', 'LAB'],
      ['V1', 'VIRTUAL'],
    ]) {
      const aula = await post('/aulas', {
        codigo: `${corta}-RH-${sufijo}`,
        capacidad: 30,
        tipo,
      }).expect(201);
      aulas.push(aula.body.id);
    }

    for (const sufijo of ['d1', 'd2']) {
      const email = `${marca}.${sufijo}@cambridge.edu.co`;
      const usuario = await post('/usuarios', {
        nombre: `${marca} ${sufijo}`,
        email,
        contrasena: CLAVE_PRUEBA,
        rol: Rol.DOCENTE,
        especialidad: 'Inglés',
        cargaMaximaSemanal: 20,
      }).expect(201);
      usuariosDocentes.push(usuario.body.id);
      const perfil = await get('/docentes').query({ busqueda: email });
      const docenteId = perfil.body.datos[0].id as string;
      docentes.push(docenteId);
      await http()
        .put(`/api/docentes/${docenteId}/disponibilidad`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ franjaIds: franjas })
        .expect(200);
    }

    // El segundo grupo nace con un cupo que no cabe en ninguna aula.
    for (const [sufijo, cupoMaximo] of [
      ['G1', CUPO],
      ['G2', 100],
    ] as const) {
      const grupo = await post('/grupos', {
        codigo: `${corta}-RH-${sufijo}`,
        cursoId,
        cupoMaximo,
        jornada: 'MAÑANA',
      }).expect(201);
      grupos.push({ id: grupo.body.id, codigo: grupo.body.codigo });
    }
  }, 30_000);

  afterAll(async () => {
    if (periodoId) {
      await fuente
        .getRepository(Horario)
        .delete({ periodo: { id: periodoId } });
    }
    if (grupos.length) {
      await fuente
        .getRepository(Grupo)
        .delete({ id: In(grupos.map((g) => g.id)) });
    }
    if (cursoId) await fuente.getRepository(Curso).delete({ id: cursoId });
    if (nivelId)
      await fuente.getRepository(NivelIdioma).delete({ id: nivelId });
    if (docentes.length) {
      await fuente
        .getRepository(Disponibilidad)
        .delete({ docente: { id: In(docentes) } });
      await fuente.getRepository(Docente).delete({ id: In(docentes) });
    }
    if (aulas.length)
      await fuente.getRepository(Aula).delete({ id: In(aulas) });
    if (franjas.length) {
      await fuente.getRepository(FranjaHoraria).delete({ id: In(franjas) });
    }
    if (periodoId) {
      await fuente.getRepository(PeriodoAcademico).delete({ id: periodoId });
    }
    await borrarUsuarios(fuente, [admin.id, ...usuariosDocentes]);
    await app.close();
  });

  it(
    'sin horario factible informa las restricciones no satisfechas y no guarda nada',
    async () => {
      const mayorAula = await fuente
        .getRepository(Aula)
        .maximum('capacidad', { activa: true });
      expect(
        mayorAula,
        'ninguna aula debe alojar 100 estudiantes',
      ).toBeLessThan(100);
      simularGemini(true);

      const r = await post('/horarios/generar', { periodoId }).expect(422);

      expect(r.body.message).toMatch(/después de \d+ intentos/);
      expect(r.body.restriccionesNoSatisfechas).toContainEqual({
        tipo: 'CAPACIDAD_AULA',
        descripcion: 'Grupo que excede la capacidad del aula',
        cantidad: expect.any(Number),
      });
      expect(llamadasGemini).toHaveLength(0);
      const guardados = await get('/horarios').query({ periodoId }).expect(200);
      expect(guardados.body.total).toBe(0);
      const auditoria = await get('/audit-log')
        .query({ usuarioId: admin.id, accion: 'GENERAR_HORARIO_FALLIDO' })
        .expect(200);
      expect(auditoria.body.total).toBe(1);

      await http()
        .patch(`/api/grupos/${grupos[1].id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ cupoMaximo: CUPO })
        .expect(200);
    },
    ESPERA_GENERACION_MS,
  );

  it(
    'Gemini aprueba: el horario se guarda con validadoGemini = true',
    async () => {
      simularGemini(true);

      const horario = await generar();

      expect(horario).toMatchObject({
        periodo: { id: periodoId, nombre: marca },
        validadoGemini: true,
        estadoValidacion: 'APROBADO',
        motivoValidacion: null,
        archivado: false,
      });
      expect(llamadasGemini).toHaveLength(1);
      expect(llamadasGemini[0].mensaje).toContain(grupos[0].codigo);
      await verificarRestriccionesDuras(horario);

      const detalle = await get(`/horarios/${horario.id}`).expect(200);
      expect(detalle.body.asignaciones).toEqual(horario.asignaciones);
      const lista = await get('/horarios')
        .query({ periodoId, archivado: false })
        .expect(200);
      expect(lista.body.datos).toContainEqual(
        expect.objectContaining({
          id: horario.id,
          estadoValidacion: 'APROBADO',
          validadoGemini: true,
        }),
      );
    },
    ESPERA_GENERACION_MS,
  );

  it(
    'Gemini aprueba con ajustes que cumplen RF-18: se aplican',
    async () => {
      let ajuste: { posicion: number; aula: string } | null = null;
      simularGemini(true, (contexto) => {
        const sesion = contexto.asignaciones.find(
          (a) => a.grupo === grupos[0].codigo,
        )!;
        const libre = contexto.aulas.find(
          (aula) =>
            aula.capacidad >= CUPO &&
            !contexto.asignaciones.some(
              (a) =>
                a.aula === aula.id &&
                a.dia === sesion.dia &&
                a.inicio === sesion.inicio,
            ),
        )!;
        ajuste = {
          posicion: contexto.asignaciones.indexOf(sesion),
          aula: libre.id,
        };
        return {
          aprobado: true,
          observaciones: [
            {
              asignaciones: [sesion.id],
              tipo: 'OTRO',
              severidad: 'BAJA',
              descripcion: 'Conviene otra aula para esta sesión.',
            },
          ],
          ajustes: [
            { asignacion: sesion.id, aula: libre.id, motivo: 'Mejor aula.' },
          ],
        };
      });

      const horario = await generar();

      expect(horario).toMatchObject({
        validadoGemini: true,
        estadoValidacion: 'APROBADO_CON_AJUSTES',
      });
      expect(horario.validacion.ajustesAplicados).toEqual([
        { posicion: ajuste!.posicion, motivo: 'Mejor aula.' },
      ]);
      expect(horario.validacion.observaciones).toHaveLength(1);
      expect(horario.asignaciones[ajuste!.posicion].aula?.codigo).toBe(
        ajuste!.aula,
      );
      await verificarRestriccionesDuras(horario);
    },
    ESPERA_GENERACION_MS,
  );

  it(
    'los ajustes de Gemini que rompen RF-18 no se aplican ni tras la corrección',
    async () => {
      simularGemini(true, (contexto) => {
        const [sesion, otra] = contexto.asignaciones;
        return {
          aprobado: true,
          observaciones: [],
          ajustes: [
            {
              asignacion: sesion.id,
              aula: otra.aula,
              dia: otra.dia,
              inicio: otra.inicio,
              motivo: 'Juntar las dos sesiones.',
            },
          ],
        };
      });

      const horario = await generar();

      expect(horario).toMatchObject({
        validadoGemini: false,
        estadoValidacion: 'AJUSTES_INVALIDOS',
      });
      expect(horario.motivoValidacion).toContain('RF-18');
      expect(horario.validacion.ajustesAplicados).toEqual([]);
      expect(llamadasGemini).toHaveLength(2);
      expect(llamadasGemini[1].mensaje).toContain('rompen restricciones duras');
      await verificarRestriccionesDuras(horario);
    },
    ESPERA_GENERACION_MS,
  );

  it(
    'Gemini rechaza la propuesta: se conserva el horario del motor con validadoGemini = false',
    async () => {
      simularGemini(true, () => ({
        aprobado: false,
        observaciones: [
          {
            asignaciones: ['S1'],
            tipo: 'JORNADA',
            severidad: 'ALTA',
            descripcion: 'La sesión no respeta la jornada del grupo.',
          },
        ],
        ajustes: [],
      }));

      const horario = await generar();

      expect(horario).toMatchObject({
        validadoGemini: false,
        estadoValidacion: 'RECHAZADO',
      });
      expect(horario.validacion.observaciones).toHaveLength(1);
      await verificarRestriccionesDuras(horario);
    },
    ESPERA_GENERACION_MS,
  );

  it(
    'Gemini no responde: el horario se guarda sin validar (RNF-18)',
    async () => {
      simularGemini(true, () => {
        throw Object.assign(new Error('sin respuesta'), {
          name: 'TimeoutError',
        });
      });

      const horario = await generar();

      expect(horario).toMatchObject({
        validadoGemini: false,
        estadoValidacion: 'TIEMPO_AGOTADO',
      });
      expect(horario.motivoValidacion).toContain('no respondió');
      await verificarRestriccionesDuras(horario);
    },
    ESPERA_GENERACION_MS,
  );

  it(
    'sin Gemini configurado respeta los tipos de aula excluidos (RF-19)',
    async () => {
      simularGemini(false);

      const horario = await generar({ tiposAulaExcluidos: ['VIRTUAL'] });

      expect(horario).toMatchObject({
        validadoGemini: false,
        estadoValidacion: 'SIN_CONFIGURAR',
        tiposAulaExcluidos: ['VIRTUAL'],
      });
      expect(llamadasGemini).toHaveLength(0);
      expect(
        horario.asignaciones.filter((a) => a.aula?.tipo === 'VIRTUAL'),
      ).toEqual([]);
      await verificarRestriccionesDuras(horario);
    },
    ESPERA_GENERACION_MS,
  );

  it('cada horario generado queda guardado y auditado', async () => {
    const guardados = await get('/horarios').query({ periodoId }).expect(200);
    expect(guardados.body.total).toBe(generados);
    const auditoria = await get('/audit-log')
      .query({ usuarioId: admin.id, accion: 'GENERAR_HORARIO' })
      .expect(200);
    expect(auditoria.body.total).toBe(generados);
  });
});

function aprobar(): RespuestaGemini {
  return { aprobado: true, observaciones: [], ajustes: [] };
}
