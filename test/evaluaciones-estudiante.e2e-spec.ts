import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource, In } from 'typeorm';
import { Evaluacion, Formulario } from '../src/evaluacion/entidades/index.js';
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
});
