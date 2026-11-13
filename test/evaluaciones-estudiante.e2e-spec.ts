import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource, In } from 'typeorm';
import {
  Evaluacion,
  Formulario,
  Respuesta,
} from '../src/evaluacion/entidades/index.js';
import {
  Curso,
  EstudianteGrupo,
  Grupo,
  Horario,
  Jornada,
  NivelIdioma,
  PeriodoAcademico,
} from '../src/horarios/entidades/index.js';
import { Docente, Estudiante, Rol } from '../src/seguridad/entidades/index.js';
import { borrarUsuarios, crearApp, usuarioConSesion } from './utilidades.js';

const UUID_AULA = '00000000-0000-4000-8000-000000000003';
const UUID_FRANJA = '00000000-0000-4000-8000-000000000004';

// Requiere la base de datos de docker compose en ejecución y un archivo .env.
describe('Evaluaciones del estudiante (e2e, RF-33 a RF-36)', () => {
  let app: INestApplication;
  let fuente: DataSource;
  const marca = `e2ev${Date.now()}`;
  const corta = Date.now().toString(36).slice(-5).toUpperCase();
  type Sesion = { id: string; token: string };
  let admin: Sesion;
  let ana: Sesion;
  let beto: Sesion;
  let sinGrupo: Sesion;
  let profeA: Sesion;
  let profeB: Sesion;
  const estudiantes: string[] = [];
  const docentes: string[] = [];
  const grupos: string[] = [];
  let periodoId: string;
  let periodoCreado = false;
  let nivelId: string;
  let cursoId: string;
  let horarioId: string;
  let formularioId: string;
  let evaluacionA: string;
  let evaluacionB: string;
  const preguntas: string[] = [];

  const get = (ruta: string, s: Sesion) =>
    request(app.getHttpServer())
      .get(`/api${ruta}`)
      .set('Authorization', `Bearer ${s.token}`);

  beforeAll(async () => {
    ({ app, fuente } = await crearApp());
    admin = await usuarioConSesion(app, fuente, marca, Rol.ADMIN);
    ana = await usuarioConSesion(app, fuente, `${marca}a`, Rol.ESTUDIANTE);
    beto = await usuarioConSesion(app, fuente, `${marca}b`, Rol.ESTUDIANTE);
    sinGrupo = await usuarioConSesion(app, fuente, `${marca}c`, Rol.ESTUDIANTE);
    profeA = await usuarioConSesion(app, fuente, `${marca}d`, Rol.DOCENTE);
    profeB = await usuarioConSesion(app, fuente, `${marca}e`, Rol.DOCENTE);

    const perfiles = fuente.getRepository(Estudiante);
    for (const [sesion, sufijo] of [
      [ana, 'A'],
      [beto, 'B'],
      [sinGrupo, 'C'],
    ] as const) {
      const perfil =
        (await perfiles.findOneBy({ usuario: { id: sesion.id } })) ??
        (await perfiles.save({
          usuario: { id: sesion.id },
          codigo: `${marca}-${sufijo}`,
        }));
      estudiantes.push(perfil.id);
    }
    const repoDocentes = fuente.getRepository(Docente);
    for (const sesion of [profeA, profeB]) {
      const perfil =
        (await repoDocentes.findOneBy({ usuario: { id: sesion.id } })) ??
        (await repoDocentes.save({
          usuario: { id: sesion.id },
          especialidad: 'Inglés',
          cargaMaximaSemanal: 20,
        }));
      docentes.push(perfil.id);
    }

    const repoPeriodos = fuente.getRepository(PeriodoAcademico);
    let periodo = await repoPeriodos.findOneBy({ activo: true });
    if (!periodo) {
      periodo = await repoPeriodos.save({
        nombre: `P-${marca}`,
        fechaInicio: '2031-01-10',
        fechaFin: '2031-06-10',
        activo: true,
      });
      periodoCreado = true;
    }
    periodoId = periodo.id;

    const nivel = await fuente.getRepository(NivelIdioma).save({
      codigo: `${corta}-ING`,
      nombre: 'A1',
      idioma: `Inglés ${corta}`,
    });
    nivelId = nivel.id;
    const curso = await fuente.getRepository(Curso).save({
      nivelIdioma: nivel,
      nombre: `Inglés A1 ${corta}`,
      intensidadHoraria: 4,
    });
    cursoId = curso.id;
    for (const sufijo of ['G1', 'G2']) {
      const grupo = await fuente.getRepository(Grupo).save({
        curso: { id: cursoId },
        codigo: `${marca}-${sufijo}`,
        cupoMaximo: 10,
        jornada: Jornada.MANANA,
        codigoAcceso: `${corta}${sufijo}`,
      });
      grupos.push(grupo.id);
    }
    // Ana y Beto están en G1 (lo dicta profeA). G2 lo dicta profeB y no tiene a ninguno.
    for (const estudiante of estudiantes.slice(0, 2)) {
      await fuente.getRepository(EstudianteGrupo).save({
        estudiante: { id: estudiante },
        grupo: { id: grupos[0] },
      });
    }
    const horario = await fuente.getRepository(Horario).save({
      periodo: { id: periodoId },
      asignaciones: [
        {
          grupoId: grupos[0],
          docenteId: docentes[0],
          aulaId: UUID_AULA,
          franjaId: UUID_FRANJA,
        },
        {
          grupoId: grupos[1],
          docenteId: docentes[1],
          aulaId: UUID_AULA,
          franjaId: UUID_FRANJA,
        },
      ],
      fitness: 10,
      generaciones: 12,
      tiempoEjecucionMs: 150,
      intentos: 1,
      validadoGemini: false,
      validacion: {
        estado: 'SIN_CONFIGURAR',
        modelo: 'gemini-2.5-flash',
        tiempoMs: 0,
        detalle: null,
        observaciones: [],
        ajustesAplicados: [],
      },
      tiposAulaExcluidos: [],
      archivado: false,
    });
    horarioId = horario.id;

    const creado = await request(app.getHttpServer())
      .post('/api/formularios')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        nombre: `Formulario ${marca}`,
        periodoAcademicoId: periodoId,
        dimensiones: [
          {
            nombre: 'Metodología',
            orden: 1,
            peso: 60,
            preguntas: [
              { texto: '¿Explica los temas con claridad?', orden: 1 },
              { texto: '¿Resuelve las dudas del grupo?', orden: 2 },
            ],
          },
          {
            nombre: 'Puntualidad',
            orden: 2,
            peso: 40,
            preguntas: [{ texto: '¿Inicia la clase a tiempo?', orden: 1 }],
          },
        ],
      });
    expect(creado.status).toBe(201);
    formularioId = creado.body.id;
    for (const dimension of creado.body.dimensiones) {
      for (const pregunta of dimension.preguntas) preguntas.push(pregunta.id);
    }
    const masiva = await request(app.getHttpServer())
      .post('/api/evaluaciones/masiva')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ formularioId, docenteIds: docentes });
    expect(masiva.body.creadas).toBe(2);
    const creadas = await fuente.getRepository(Evaluacion).find({
      where: { formulario: { id: formularioId } },
      relations: { docente: true },
    });
    evaluacionA = creadas.find((e) => e.docente.id === docentes[0])!.id;
    evaluacionB = creadas.find((e) => e.docente.id === docentes[1])!.id;
  });

  afterAll(async () => {
    if (formularioId)
      await fuente.getRepository(Formulario).delete({ id: formularioId });
    if (horarioId)
      await fuente.getRepository(Horario).delete({ id: horarioId });
    await fuente
      .getRepository(EstudianteGrupo)
      .delete({ grupo: { id: In(grupos) } });
    await fuente.getRepository(Grupo).delete({ id: In(grupos) });
    if (cursoId) await fuente.getRepository(Curso).delete({ id: cursoId });
    if (nivelId)
      await fuente.getRepository(NivelIdioma).delete({ id: nivelId });
    await fuente.getRepository(Docente).delete({ id: In(docentes) });
    await fuente.getRepository(Estudiante).delete({ id: In(estudiantes) });
    if (periodoCreado)
      await fuente.getRepository(PeriodoAcademico).delete({ id: periodoId });
    await borrarUsuarios(fuente, [
      admin.id,
      ana.id,
      beto.id,
      sinGrupo.id,
      profeA.id,
      profeB.id,
    ]);
    await app.close();
  });

  describe('Filtrado por horario (RF-33)', () => {
    it('el estudiante solo ve la evaluación del docente que le dicta clase', async () => {
      const respuesta = await get('/estudiantes/yo/evaluaciones', ana);
      expect(respuesta.status).toBe(200);
      expect(respuesta.body.map((e: { id: string }) => e.id)).toEqual([
        evaluacionA,
      ]);
      const [evaluacion] = respuesta.body;
      expect(evaluacion.estado).toBeUndefined();
      expect(evaluacion.docente.id).toBe(docentes[0]);
      expect(evaluacion.grupos).toEqual([
        {
          id: grupos[0],
          codigo: `${marca}-G1`,
          curso: `Inglés A1 ${corta}`,
        },
      ]);
      expect(evaluacion.totalPreguntas).toBe(3);
    });

    it('sin grupos activos no ve ninguna evaluación', async () => {
      const respuesta = await get('/estudiantes/yo/evaluaciones', sinGrupo);
      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual([]);
    });

    it('entrega el formulario ordenado y sin los pesos', async () => {
      const respuesta = await get(
        `/estudiantes/yo/evaluaciones/${evaluacionA}`,
        ana,
      );
      expect(respuesta.status).toBe(200);
      expect(
        respuesta.body.dimensiones.map((d: { nombre: string }) => d.nombre),
      ).toEqual(['Metodología', 'Puntualidad']);
      expect(respuesta.body.dimensiones[0].preguntas).toHaveLength(2);
      expect(respuesta.body.dimensiones[0].peso).toBeUndefined();
    });

    it('responde 404 para la evaluación de un docente que no le dicta clase', async () => {
      const respuesta = await get(
        `/estudiantes/yo/evaluaciones/${evaluacionB}`,
        ana,
      );
      expect(respuesta.status).toBe(404);
    });

    it('solo los estudiantes consultan sus evaluaciones (RF-07)', async () => {
      const respuesta = await get('/estudiantes/yo/evaluaciones', profeA);
      expect(respuesta.status).toBe(403);
    });
  });

  describe('Respuestas anónimas y marcado de completada (RF-34 a RF-36)', () => {
    const responder = (s: Sesion, id: string, cuerpo: object) =>
      request(app.getHttpServer())
        .post(`/api/estudiantes/yo/evaluaciones/${id}/respuestas`)
        .set('Authorization', `Bearer ${s.token}`)
        .send(cuerpo);
    const todas = (valor: number) =>
      preguntas.map((preguntaId) => ({ preguntaId, valor }));
    const evaluacion = (id: string) =>
      fuente
        .getRepository(Evaluacion)
        .createQueryBuilder('e')
        .addSelect(['e.estudiantesCompletaron', 'e.comentariosAnonimos'])
        .where('e.id = :id', { id })
        .getOneOrFail();
    const COMENTARIO =
      'Explica con mucha claridad y siempre resuelve las dudas del grupo.';

    it('rechaza un comentario de menos de 30 caracteres (RF-35)', async () => {
      const respuesta = await responder(ana, evaluacionA, {
        respuestas: todas(5),
        comentario: 'Muy buen docente.',
      });
      expect(respuesta.status).toBe(400);
      expect(respuesta.body.message).toContain(
        'El comentario debe tener al menos 30 caracteres.',
      );
    });

    it('rechaza valores fuera de la escala de 1 a 5', async () => {
      const respuesta = await responder(ana, evaluacionA, {
        respuestas: todas(6),
      });
      expect(respuesta.status).toBe(400);
    });

    it('exige responder todas las preguntas una sola vez', async () => {
      const incompleta = await responder(ana, evaluacionA, {
        respuestas: todas(4).slice(1),
      });
      expect(incompleta.status).toBe(400);
      const repetida = await responder(ana, evaluacionA, {
        respuestas: [...todas(4).slice(1), todas(4)[1]],
      });
      expect(repetida.status).toBe(400);
      expect(
        await fuente
          .getRepository(Respuesta)
          .countBy({ evaluacion: { id: evaluacionA } }),
      ).toBe(0);
    });

    it('no deja responder la evaluación de un docente que no le dicta clase', async () => {
      const respuesta = await responder(ana, evaluacionB, {
        respuestas: todas(5),
      });
      expect(respuesta.status).toBe(404);
    });

    it('guarda las respuestas sin el estudiante y pasa a EN_PROGRESO', async () => {
      const respuesta = await responder(ana, evaluacionA, {
        respuestas: todas(4),
        comentario: `  ${COMENTARIO}  `,
      });
      expect(respuesta.status).toBe(201);
      expect(respuesta.body).toEqual({ id: evaluacionA, completada: true });

      const columnas = fuente
        .getMetadata(Respuesta)
        .columns.map((columna) => columna.databaseName)
        .sort();
      expect(columnas).toEqual([
        'evaluacion_id',
        'id',
        'pregunta_id',
        'valor_numerico',
      ]);
      const filas = await fuente
        .getRepository(Respuesta)
        .findBy({ evaluacion: { id: evaluacionA } });
      expect(filas.map((fila) => fila.valorNumerico)).toEqual([4, 4, 4]);

      const guardada = await evaluacion(evaluacionA);
      expect(guardada.estado).toBe('EN_PROGRESO');
      expect(guardada.estudiantesCompletaron).toEqual([estudiantes[0]]);
      expect(guardada.comentariosAnonimos).toEqual([COMENTARIO]);
    });

    it('impide el doble envío del mismo estudiante (RF-36)', async () => {
      const respuesta = await responder(ana, evaluacionA, {
        respuestas: todas(1),
      });
      expect(respuesta.status).toBe(409);
      expect(respuesta.body.message).toBe('Ya respondiste esta evaluación.');
      expect(
        await fuente
          .getRepository(Respuesta)
          .countBy({ evaluacion: { id: evaluacionA } }),
      ).toBe(3);
    });

    it('la lista del estudiante la muestra como completada', async () => {
      const deAna = await get('/estudiantes/yo/evaluaciones', ana);
      expect(deAna.body[0]).toMatchObject({
        id: evaluacionA,
        completada: true,
        abierta: true,
      });
      const deBeto = await get('/estudiantes/yo/evaluaciones', beto);
      expect(deBeto.body[0]).toMatchObject({
        id: evaluacionA,
        completada: false,
        abierta: true,
      });
    });

    it('pasa a COMPLETADA cuando responde el último estudiante del grupo', async () => {
      const respuesta = await responder(beto, evaluacionA, {
        respuestas: todas(5),
      });
      expect(respuesta.status).toBe(201);
      const guardada = await evaluacion(evaluacionA);
      expect(guardada.estado).toBe('COMPLETADA');
      expect([...guardada.estudiantesCompletaron].sort()).toEqual(
        estudiantes.slice(0, 2).sort(),
      );
      expect(guardada.comentariosAnonimos).toHaveLength(1);
    });

    it('la consulta del Administrador no expone quién respondió ni los comentarios', async () => {
      const respuesta = await get(
        `/evaluaciones?formularioId=${formularioId}`,
        admin,
      );
      expect(respuesta.status).toBe(200);
      const texto = JSON.stringify(respuesta.body);
      expect(texto).not.toContain('estudiantesCompletaron');
      expect(texto).not.toContain('comentariosAnonimos');
      expect(texto).not.toContain(estudiantes[0]);
    });

    it('deja de recibir respuestas cuando la evaluación se cierra', async () => {
      await fuente.getRepository(Evaluacion).update(evaluacionA, {
        estudiantesCompletaron: [],
        estado: 'CERRADA' as never,
      });
      const respuesta = await responder(ana, evaluacionA, {
        respuestas: todas(3),
      });
      expect(respuesta.status).toBe(409);
      expect(respuesta.body.message).toBe(
        'Esta evaluación ya no recibe respuestas.',
      );
      const lista = await get('/estudiantes/yo/evaluaciones', ana);
      expect(lista.body).toEqual([]);
    });
  });

  describe('Consulta y eliminación de evaluaciones (RF-37, RF-38)', () => {
    it('el Administrador filtra las evaluaciones por docente', async () => {
      const respuesta = await get(
        `/evaluaciones?docenteId=${docentes[1]}`,
        admin,
      );
      expect(respuesta.status).toBe(200);
      expect(respuesta.body.datos.map((e: { id: string }) => e.id)).toEqual([
        evaluacionB,
      ]);
    });

    it('el docente consulta su historial sin ver quién respondió', async () => {
      const respuesta = await get('/docentes/yo/evaluaciones', profeA);
      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toHaveLength(1);
      expect(respuesta.body[0]).toMatchObject({
        id: evaluacionA,
        formulario: { id: formularioId, periodo: { id: periodoId } },
        respondieron: 0,
      });
      expect(JSON.stringify(respuesta.body)).not.toContain('Completaron');
      const deOtro = await get('/docentes/yo/evaluaciones', ana);
      expect(deOtro.status).toBe(403);
    });

    it('eliminar una evaluación elimina sus respuestas (RF-38)', async () => {
      expect(
        await fuente
          .getRepository(Respuesta)
          .countBy({ evaluacion: { id: evaluacionA } }),
      ).toBe(6);
      const respuesta = await request(app.getHttpServer())
        .delete(`/api/evaluaciones/${evaluacionA}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(respuesta.status).toBe(204);
      expect(
        await fuente
          .getRepository(Respuesta)
          .countBy({ evaluacion: { id: evaluacionA } }),
      ).toBe(0);
      expect(
        await fuente.getRepository(Evaluacion).countBy({ id: evaluacionA }),
      ).toBe(0);
    });
  });
});
