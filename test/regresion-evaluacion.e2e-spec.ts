import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource, In } from 'typeorm';
import {
  Alerta,
  Formulario,
  Respuesta,
} from '../src/evaluacion/entidades/index.js';
import {
  Curso,
  Disponibilidad,
  EstudianteGrupo,
  Grupo,
  Horario,
  NivelIdioma,
  PeriodoAcademico,
} from '../src/horarios/entidades/index.js';
import { Docente, Estudiante, Rol } from '../src/seguridad/entidades/index.js';
import {
  borrarUsuarios,
  CLAVE_PRUEBA,
  crearApp,
  usuarioConSesion,
} from './utilidades.js';

const UUID_AULA = '00000000-0000-4000-8000-000000000003';
const UUID_FRANJA = '00000000-0000-4000-8000-000000000004';
const COMENTARIO_ANA = 'Explica con claridad y resuelve todas las dudas.';
const COMENTARIO_BETO = 'Llega tarde y no prepara las clases de la semana.';

// Requiere la base de datos de docker compose en ejecución y un archivo .env.
// TKT-044: recorre de punta a punta el flujo de la Figura 6.6, todo por la API.
describe('Regresión: evaluación docente (e2e, Figura 6.6)', () => {
  let app: INestApplication;
  let fuente: DataSource;
  const marca = `e2ere${Date.now()}`;
  const corta = Date.now().toString(36).slice(-5).toUpperCase();
  type Sesion = { id: string; token: string };
  let admin: Sesion;
  let ana: Sesion;
  let beto: Sesion;
  let tardio: Sesion;
  /** El docente bien evaluado dicta el grupo de Inglés; el mal evaluado, el de Francés. */
  let bueno: Sesion & { docenteId: string };
  let bajo: Sesion & { docenteId: string };
  let activoPrevio: string | null = null;
  let periodoId: string;
  const niveles: string[] = [];
  const cursos: string[] = [];
  const grupos: Array<{ id: string; codigo: string; codigoAcceso: string }> =
    [];
  let formularioId: string;
  let evaluacionBuena: string;
  let evaluacionBaja: string;
  let alertaId: string;

  const pedir = (
    metodo: 'get' | 'post' | 'patch',
    ruta: string,
    sesion: Sesion,
    cuerpo?: object,
  ) => {
    const peticion = request(app.getHttpServer())
      [metodo](`/api${ruta}`)
      .set('Authorization', `Bearer ${sesion.token}`);
    return cuerpo ? peticion.send(cuerpo) : peticion;
  };

  /** El Administrador crea la cuenta y la persona entra al sistema con ella. */
  const cuenta = async (
    sufijo: string,
    perfil:
      | { rol: Rol.ESTUDIANTE; codigo: string }
      | { rol: Rol.DOCENTE; especialidad: string },
  ): Promise<Sesion> => {
    const email = `${marca}.${sufijo}@cambridge.edu.co`;
    const usuario = await pedir('post', '/usuarios', admin, {
      nombre: `${marca} ${sufijo}`,
      email,
      contrasena: CLAVE_PRUEBA,
      ...perfil,
    }).expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, contrasena: CLAVE_PRUEBA })
      .expect(200);
    return { id: usuario.body.id, token: login.body.accessToken };
  };
  const docente = async (sufijo: string, especialidad: string) => {
    const sesion = await cuenta(sufijo, { rol: Rol.DOCENTE, especialidad });
    const perfil = await pedir('get', '/docentes', admin).query({
      busqueda: `${marca}.${sufijo}@`,
    });
    return { ...sesion, docenteId: perfil.body.datos[0].id as string };
  };

  /** Responde las preguntas en el orden del formulario, tantas como valores reciba. */
  const responder = async (
    estudiante: Sesion,
    evaluacionId: string,
    valores: number[],
    comentario?: string,
  ) => {
    const detalle = await pedir(
      'get',
      `/estudiantes/yo/evaluaciones/${evaluacionId}`,
      estudiante,
    ).expect(200);
    const preguntas = (
      detalle.body.dimensiones as Array<{ preguntas: Array<{ id: string }> }>
    ).flatMap((d) => d.preguntas.map((p) => p.id));
    return pedir(
      'post',
      `/estudiantes/yo/evaluaciones/${evaluacionId}/respuestas`,
      estudiante,
      {
        respuestas: valores.map((valor, i) => ({
          preguntaId: preguntas[i],
          valor,
        })),
        ...(comentario ? { comentario } : {}),
      },
    );
  };
  const estadoDe = async (evaluacionId: string) =>
    (await pedir('get', `/evaluaciones/${evaluacionId}`, admin).expect(200))
      .body.estado as string;
  const resultados = async () =>
    (
      await pedir(
        'get',
        `/kdd/resultados?periodoId=${periodoId}`,
        admin,
      ).expect(200)
    ).body as Array<{
      evaluacionId: string;
      puntajeGlobal: number;
      etiqueta: string;
      parcial: boolean;
      participantes: number;
      elegibles: number;
      puntajesPorDimension: Array<{ promedio: number }>;
    }>;
  const alertasCriticas = async (consulta = '') =>
    (
      await pedir(
        'get',
        `/alertas?periodoId=${periodoId}&tipo=CRITICO${consulta}`,
        admin,
      ).expect(200)
    ).body as {
      total: number;
      datos: Array<{ id: string; evaluacionId: string }>;
    };

  beforeAll(async () => {
    ({ app, fuente } = await crearApp());
    admin = await usuarioConSesion(app, fuente, marca, Rol.ADMIN);
    activoPrevio =
      (await fuente.getRepository(PeriodoAcademico).findOneBy({ activo: true }))
        ?.id ?? null;

    // Período propio y activo: el KDD manual solo toca las evaluaciones de esta prueba.
    const periodo = await pedir('post', '/periodos', admin, {
      nombre: marca,
      fechaInicio: '2033-01-10',
      fechaFin: '2033-06-10',
      activo: true,
    }).expect(201);
    periodoId = periodo.body.id;

    ana = await cuenta('ana', { rol: Rol.ESTUDIANTE, codigo: `${corta}-A` });
    beto = await cuenta('beto', { rol: Rol.ESTUDIANTE, codigo: `${corta}-B` });
    tardio = await cuenta('tar', { rol: Rol.ESTUDIANTE, codigo: `${corta}-T` });
    bueno = await docente('bue', 'Inglés');
    bajo = await docente('baj', 'Francés');

    for (const idioma of ['Inglés', 'Francés']) {
      const nivel = await pedir('post', '/niveles', admin, {
        codigo: `${corta}-RE-${idioma.slice(0, 3)}`,
        nombre: 'A1',
        idioma,
      }).expect(201);
      niveles.push(nivel.body.id);
      const curso = await pedir('post', '/cursos', admin, {
        nombre: `${idioma} A1 ${corta}`,
        nivelIdiomaId: nivel.body.id,
        intensidadHoraria: 4,
      }).expect(201);
      cursos.push(curso.body.id);
      const grupo = await pedir('post', '/grupos', admin, {
        codigo: `${corta}-RE-${idioma.slice(0, 3)}`,
        cursoId: curso.body.id,
        cupoMaximo: 10,
        jornada: 'MAÑANA',
      }).expect(201);
      grupos.push(grupo.body);
      for (const estudiante of [ana, beto]) {
        await pedir('post', '/estudiantes/yo/unirse', estudiante, {
          codigoAcceso: grupo.body.codigoAcceso,
        }).expect(201);
      }
    }

    // El horario se inserta directo: su generación se recorre en regresion-horario.
    await fuente.getRepository(Horario).save({
      periodo: { id: periodoId },
      asignaciones: [bueno, bajo].map((d, i) => ({
        grupoId: grupos[i].id,
        docenteId: d.docenteId,
        aulaId: UUID_AULA,
        franjaId: UUID_FRANJA,
      })),
      fitness: 10,
      generaciones: 12,
      tiempoEjecucionMs: 150,
      intentos: 1,
      validadoGemini: false,
      validacion: {
        estado: 'SIN_CONFIGURAR',
        modelo: 'gemini-3.1-pro-preview',
        tiempoMs: 0,
        detalle: null,
        observaciones: [],
        ajustesAplicados: [],
      },
      tiposAulaExcluidos: [],
      archivado: false,
    });
  }, 30_000);

  afterAll(async () => {
    if (periodoId) {
      await fuente
        .getRepository(Alerta)
        .delete({ periodoAcademico: { id: periodoId } });
      await fuente
        .getRepository(Formulario)
        .delete({ periodoAcademico: { id: periodoId } });
      await fuente
        .getRepository(Horario)
        .delete({ periodo: { id: periodoId } });
    }
    const idsGrupos = grupos.map((g) => g.id);
    if (idsGrupos.length) {
      await fuente
        .getRepository(EstudianteGrupo)
        .delete({ grupo: { id: In(idsGrupos) } });
      await fuente.getRepository(Grupo).delete({ id: In(idsGrupos) });
    }
    if (cursos.length) {
      await fuente.getRepository(Curso).delete({ id: In(cursos) });
    }
    if (niveles.length) {
      await fuente.getRepository(NivelIdioma).delete({ id: In(niveles) });
    }
    if (periodoId) {
      await fuente.getRepository(PeriodoAcademico).delete({ id: periodoId });
    }
    if (activoPrevio) {
      await fuente
        .getRepository(PeriodoAcademico)
        .update({ id: activoPrevio }, { activo: true });
    }
    const estudiantes = [ana, beto, tardio].filter(Boolean).map((s) => s.id);
    const docentes = [bueno, bajo].filter(Boolean);
    if (estudiantes.length) {
      await fuente
        .getRepository(Estudiante)
        .delete({ usuario: { id: In(estudiantes) } });
    }
    if (docentes.length) {
      const ids = docentes.map((d) => d.docenteId);
      await fuente
        .getRepository(Disponibilidad)
        .delete({ docente: { id: In(ids) } });
      await fuente.getRepository(Docente).delete({ id: In(ids) });
    }
    await borrarUsuarios(fuente, [
      admin.id,
      ...estudiantes,
      ...docentes.map((d) => d.id),
    ]);
    await app.close();
  });

  it('el Administrador crea el formulario y lo asigna: una evaluación PENDIENTE por docente', async () => {
    const dimension = (nombre: string, orden: number, peso: number) => ({
      nombre,
      orden,
      peso,
      preguntas: [1, 2].map((n) => ({
        texto: `Pregunta ${n} de ${nombre}`,
        orden: n,
      })),
    });
    const cuerpo = (pesoDominio: number) => ({
      nombre: `Evaluación ${marca}`,
      periodoAcademicoId: periodoId,
      dimensiones: [
        dimension('Metodología', 1, 60),
        dimension('Dominio del idioma', 2, pesoDominio),
      ],
    });
    const invalido = await pedir('post', '/formularios', admin, cuerpo(50));
    expect(invalido.status).toBe(400);
    expect(invalido.body.message).toContain('sumar 100');
    const formulario = await pedir(
      'post',
      '/formularios',
      admin,
      cuerpo(40),
    ).expect(201);
    formularioId = formulario.body.id;

    const asignacion = {
      formularioId,
      docenteIds: [bueno.docenteId, bajo.docenteId],
    };
    const primera = await pedir(
      'post',
      '/evaluaciones/masiva',
      admin,
      asignacion,
    ).expect(201);
    expect(primera.body).toEqual({ creadas: 2, omitidas: 0 });
    const repetida = await pedir(
      'post',
      '/evaluaciones/masiva',
      admin,
      asignacion,
    ).expect(201);
    expect(repetida.body).toEqual({ creadas: 0, omitidas: 2 });

    const lista = await pedir(
      'get',
      `/evaluaciones?formularioId=${formularioId}`,
      admin,
    ).expect(200);
    expect(lista.body.total).toBe(2);
    const porDocente = new Map<string, { id: string; estado: string }>(
      lista.body.datos.map(
        (e: { id: string; estado: string; docente: { id: string } }) => [
          e.docente.id,
          e,
        ],
      ),
    );
    expect([...porDocente.values()].map((e) => e.estado)).toEqual([
      'PENDIENTE',
      'PENDIENTE',
    ]);
    evaluacionBuena = porDocente.get(bueno.docenteId)!.id;
    evaluacionBaja = porDocente.get(bajo.docenteId)!.id;
  });

  it('cada estudiante ve solo las evaluaciones de los docentes de sus grupos', async () => {
    const deAna = await pedir(
      'get',
      '/estudiantes/yo/evaluaciones',
      ana,
    ).expect(200);
    expect(deAna.body.map((e: { id: string }) => e.id).sort()).toEqual(
      [evaluacionBuena, evaluacionBaja].sort(),
    );
    expect(
      deAna.body.find((e: { id: string }) => e.id === evaluacionBuena),
    ).toMatchObject({
      docente: { id: bueno.docenteId },
      grupos: [{ id: grupos[0].id }],
      totalPreguntas: 4,
      completada: false,
      abierta: true,
    });

    const sinGrupo = await pedir(
      'get',
      '/estudiantes/yo/evaluaciones',
      tardio,
    ).expect(200);
    expect(sinGrupo.body).toEqual([]);
    await pedir(
      'get',
      `/estudiantes/yo/evaluaciones/${evaluacionBuena}`,
      tardio,
    ).expect(404);
  });

  it('la primera respuesta se guarda anónima y la evaluación queda EN_PROGRESO sin resultado', async () => {
    const corto = await responder(ana, evaluacionBuena, [5, 5, 4, 4], 'Bien.');
    expect(corto.status).toBe(400);
    const incompleta = await responder(ana, evaluacionBuena, [5]);
    expect(incompleta.status).toBe(400);

    const envio = await responder(
      ana,
      evaluacionBuena,
      [5, 5, 4, 4],
      COMENTARIO_ANA,
    );
    expect(envio.status).toBe(201);
    expect(envio.body).toEqual({ id: evaluacionBuena, completada: true });
    const repetido = await responder(ana, evaluacionBuena, [1, 1, 1, 1]);
    expect(repetido.status).toBe(409);

    expect(await estadoDe(evaluacionBuena)).toBe('EN_PROGRESO');
    const deAna = await pedir(
      'get',
      '/estudiantes/yo/evaluaciones',
      ana,
    ).expect(200);
    expect(
      deAna.body.find((e: { id: string }) => e.id === evaluacionBuena)
        .completada,
    ).toBe(true);

    // RNF-10: ni la tabla de respuestas, ni la API, ni la auditoría dicen quién respondió.
    const columnas = fuente
      .getMetadata(Respuesta)
      .columns.map((c) => c.databaseName);
    expect(columnas.sort()).toEqual(
      ['evaluacion_id', 'id', 'pregunta_id', 'valor_numerico'].sort(),
    );
    expect(
      await fuente
        .getRepository(Respuesta)
        .countBy({ evaluacion: { id: evaluacionBuena } }),
    ).toBe(4);
    const perfilAna = await fuente
      .getRepository(Estudiante)
      .findOneByOrFail({ usuario: { id: ana.id } });
    const detalle = await pedir(
      'get',
      `/evaluaciones/${evaluacionBuena}`,
      admin,
    ).expect(200);
    const textoDetalle = JSON.stringify(detalle.body);
    expect(textoDetalle).not.toContain(perfilAna.id);
    expect(textoDetalle).not.toContain(ana.id);
    const auditoria = await pedir(
      'get',
      `/audit-log?usuarioId=${ana.id}&accion=RESPONDER_EVALUACION`,
      admin,
    ).expect(200);
    expect(auditoria.body.total).toBe(1);
    expect(JSON.parse(auditoria.body.datos[0].detalle)).toEqual({
      evaluacionId: evaluacionBuena,
    });

    // Falta Beto: el grupo no ha terminado y todavía no hay resultado.
    expect(await resultados()).toEqual([]);
    const dashboard = await pedir('get', '/kdd/mis-resultados', bueno).expect(
      200,
    );
    expect(dashboard.body.resultados).toEqual([]);
  });

  it('cuando responde todo el grupo el KDD se ejecuta solo y publica el resultado', async () => {
    const envio = await responder(beto, evaluacionBuena, [5, 4, 4, 5]);
    expect(envio.status).toBe(201);

    expect(await estadoDe(evaluacionBuena)).toBe('ANALIZADA');
    const [resultado, ...otros] = await resultados();
    expect(otros).toEqual([]);
    expect(resultado).toMatchObject({
      evaluacionId: evaluacionBuena,
      etiqueta: 'Excelente',
      parcial: false,
      participantes: 2,
      elegibles: 2,
    });
    // Metodología (60 %): 4,75. Dominio (40 %): 4,25. Global: 4,55.
    expect(resultado.puntajeGlobal).toBeCloseTo(4.55, 2);
    expect(resultado.puntajesPorDimension.map((d) => d.promedio)).toEqual([
      4.75, 4.25,
    ]);
    expect((await alertasCriticas()).total).toBe(0);
  });

  it('un puntaje bajo el umbral genera la alerta y deja la evaluación en ALERTA', async () => {
    const deAna = await responder(ana, evaluacionBaja, [2, 3, 2, 2]);
    expect(deAna.status).toBe(201);
    expect(await estadoDe(evaluacionBaja)).toBe('EN_PROGRESO');
    const deBeto = await responder(
      beto,
      evaluacionBaja,
      [3, 2, 3, 2],
      COMENTARIO_BETO,
    );
    expect(deBeto.status).toBe(201);

    expect(await estadoDe(evaluacionBaja)).toBe('ALERTA');
    const resultado = (await resultados()).find(
      (r) => r.evaluacionId === evaluacionBaja,
    )!;
    // Metodología (60 %): 2,5. Dominio (40 %): 2,25. Global: 2,4.
    expect(resultado.puntajeGlobal).toBeCloseTo(2.4, 2);
    expect(resultado.etiqueta).toBe('Crítico');

    const alertas = await alertasCriticas('&leida=false');
    expect(alertas.total).toBe(1);
    expect(alertas.datos[0]).toMatchObject({
      tipo: 'CRITICO',
      leida: false,
      docente: { id: bajo.docenteId },
      evaluacionId: evaluacionBaja,
    });
    alertaId = alertas.datos[0].id;
  });

  it('la reejecución manual recalcula sin duplicar resultados ni alertas', async () => {
    await pedir('post', '/kdd/ejecutar', bueno, { periodoId }).expect(403);

    const resumen = await pedir('post', '/kdd/ejecutar', admin, {
      periodoId,
    }).expect(200);
    expect(resumen.body).toMatchObject({
      periodo: { id: periodoId },
      evaluacionesProcesadas: 2,
      sinRespuestas: 0,
      alertas: { CRITICO: 1, ADVERTENCIA: 0 },
    });

    const tras = await resultados();
    expect(tras).toHaveLength(2);
    expect(
      tras.find((r) => r.evaluacionId === evaluacionBuena)!.puntajeGlobal,
    ).toBeCloseTo(4.55, 2);
    expect(await estadoDe(evaluacionBuena)).toBe('ANALIZADA');
    expect(await estadoDe(evaluacionBaja)).toBe('ALERTA');
    const alertas = await alertasCriticas();
    expect(alertas.total).toBe(1);
    alertaId = alertas.datos[0].id;
  });

  it('el Administrador revisa la alerta y la evaluación se cierra', async () => {
    await pedir('patch', `/alertas/${alertaId}`, admin, {
      leida: false,
    }).expect(400);
    const leida = await pedir('patch', `/alertas/${alertaId}`, admin, {
      leida: true,
    }).expect(200);
    expect(leida.body.leida).toBe(true);

    expect((await alertasCriticas('&leida=false')).total).toBe(0);
    expect(await estadoDe(evaluacionBaja)).toBe('CERRADA');
  });

  it('cada docente ve en su dashboard solo su resultado y los comentarios anónimos', async () => {
    const deBueno = await pedir('get', '/kdd/mis-resultados', bueno).expect(
      200,
    );
    expect(deBueno.body.periodo.id).toBe(periodoId);
    expect(deBueno.body.resultados).toHaveLength(1);
    expect(deBueno.body.resultados[0]).toMatchObject({
      evaluacionId: evaluacionBuena,
      etiqueta: 'Excelente',
      comentarios: [COMENTARIO_ANA],
    });

    const deBajo = await pedir('get', '/kdd/mis-resultados', bajo).expect(200);
    expect(deBajo.body.resultados).toHaveLength(1);
    expect(deBajo.body.resultados[0]).toMatchObject({
      evaluacionId: evaluacionBaja,
      estado: 'CERRADA',
      etiqueta: 'Crítico',
      comentarios: [COMENTARIO_BETO],
    });

    const historial = await pedir(
      'get',
      '/docentes/yo/evaluaciones',
      bajo,
    ).expect(200);
    expect(historial.body).toEqual([
      expect.objectContaining({ id: evaluacionBaja, respondieron: 2 }),
    ]);
    await pedir('get', `/kdd/resultados?periodoId=${periodoId}`, bajo).expect(
      403,
    );
    await pedir('get', '/kdd/mis-resultados', ana).expect(403);
  });

  it('al cierre las evaluaciones se archivan y dejan de recibir respuestas', async () => {
    const estado = (evaluacionId: string, nuevo: string) =>
      pedir('patch', `/evaluaciones/${evaluacionId}/estado`, admin, {
        estado: nuevo,
      });
    await estado(evaluacionBuena, 'ARCHIVADA').expect(409);
    await estado(evaluacionBuena, 'CERRADA').expect(200);

    // Un estudiante que entra al grupo después del cierre ya no puede responder.
    await pedir('post', '/estudiantes/yo/unirse', tardio, {
      codigoAcceso: grupos[0].codigoAcceso,
    }).expect(201);
    const tarde = await responder(tardio, evaluacionBuena, [1, 1, 1, 1]);
    expect(tarde.status).toBe(409);
    expect(tarde.body.message).toContain('ya no recibe respuestas');

    await estado(evaluacionBuena, 'ARCHIVADA').expect(200);
    await estado(evaluacionBaja, 'ARCHIVADA').expect(200);
    const deAna = await pedir(
      'get',
      '/estudiantes/yo/evaluaciones',
      ana,
    ).expect(200);
    expect(deAna.body).toEqual([]);
    expect(
      await fuente
        .getRepository(Respuesta)
        .countBy({ evaluacion: { id: In([evaluacionBuena, evaluacionBaja]) } }),
    ).toBe(16);
  });
});
