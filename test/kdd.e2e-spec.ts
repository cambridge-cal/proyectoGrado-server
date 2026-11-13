import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource, In } from 'typeorm';
import {
  Alerta,
  Evaluacion,
  Formulario,
  Respuesta,
  ResultadoKdd,
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
import { KddService } from '../src/evaluacion/kdd/kdd.service.js';
import { borrarUsuarios, crearApp, usuarioConSesion } from './utilidades.js';

// Requiere la base de datos de docker compose en ejecución y un archivo .env.
describe('Pipeline KDD, resultados y alertas (e2e, RF-39 a RF-44)', () => {
  let app: INestApplication;
  let fuente: DataSource;
  const marca = `e2ek${Date.now()}`;
  const corta = Date.now().toString(36).slice(-5).toUpperCase();
  type Sesion = { id: string; token: string };
  let admin: Sesion;
  let profe: Sesion;
  /** ana y beto están en el grupo 1 y caro en el grupo 2; dani no tiene grupo. */
  const alumnos: Record<'ana' | 'beto' | 'caro' | 'dani', Sesion> = {} as never;
  const perfiles: string[] = [];
  let periodoId: string;
  let docenteId: string;
  let nivelId: string;
  let cursoId: string;
  const grupos: string[] = [];
  let evaluacionId: string;
  let preguntas: string[] = [];
  const COMENTARIO = 'Explica muy bien pero llega tarde a la clase.';

  const pedir = (
    metodo: 'get' | 'post' | 'patch' | 'delete',
    ruta: string,
    sesion: Sesion,
    cuerpo?: object,
  ) => {
    const peticion = request(app.getHttpServer())
      [metodo](`/api${ruta}`)
      .set('Authorization', `Bearer ${sesion.token}`);
    return cuerpo ? peticion.send(cuerpo) : peticion;
  };
  /** Deja en la base lo mismo que el envío de un estudiante, sin pasar por el horario activo. */
  const simular = async (
    alumno: number,
    valor: number,
    comentario?: string,
  ) => {
    await fuente.getRepository(Respuesta).insert(
      preguntas.map((preguntaId) => ({
        evaluacion: { id: evaluacionId },
        pregunta: { id: preguntaId },
        valorNumerico: valor,
      })),
    );
    const repo = fuente.getRepository(Evaluacion);
    const actual = await repo
      .createQueryBuilder('evaluacion')
      .addSelect([
        'evaluacion.estudiantesCompletaron',
        'evaluacion.comentariosAnonimos',
      ])
      .where('evaluacion.id = :id', { id: evaluacionId })
      .getOneOrFail();
    const completaron = [...actual.estudiantesCompletaron, perfiles[alumno]];
    await repo.update(evaluacionId, {
      estudiantesCompletaron: completaron,
      comentariosAnonimos: comentario
        ? [...actual.comentariosAnonimos, comentario]
        : actual.comentariosAnonimos,
      estado: (completaron.length === 3
        ? 'COMPLETADA'
        : 'EN_PROGRESO') as Evaluacion['estado'],
    });
    await app.get(KddService).alResponder(evaluacionId);
  };
  const estado = async () =>
    (
      await fuente
        .getRepository(Evaluacion)
        .findOneByOrFail({ id: evaluacionId })
    ).estado;

  beforeAll(async () => {
    ({ app, fuente } = await crearApp());
    admin = await usuarioConSesion(app, fuente, marca, Rol.ADMIN);
    profe = await usuarioConSesion(app, fuente, marca, Rol.DOCENTE);
    docenteId = (
      await fuente.getRepository(Docente).save({
        usuario: { id: profe.id },
        especialidad: 'Inglés',
        cargaMaximaSemanal: 20,
      })
    ).id;
    for (const nombre of ['ana', 'beto', 'caro', 'dani'] as const) {
      alumnos[nombre] = await usuarioConSesion(
        app,
        fuente,
        `${marca}${nombre}`,
        Rol.ESTUDIANTE,
      );
      perfiles.push(
        (
          await fuente.getRepository(Estudiante).save({
            usuario: { id: alumnos[nombre].id },
            codigo: `${marca}-${nombre}`,
          })
        ).id,
      );
    }
    const periodo = await fuente.getRepository(PeriodoAcademico).save({
      nombre: `P-${marca}`,
      fechaInicio: '2032-01-10',
      fechaFin: '2032-06-10',
      activo: false,
    });
    periodoId = periodo.id;
    const nivel = await fuente
      .getRepository(NivelIdioma)
      .save({ codigo: `${corta}-K`, nombre: 'A1', idioma: 'Inglés' });
    nivelId = nivel.id;
    cursoId = (
      await fuente.getRepository(Curso).save({
        nivelIdioma: nivel,
        nombre: `Inglés A1 ${marca}`,
        intensidadHoraria: 4,
      })
    ).id;
    for (const sufijo of ['K1', 'K2']) {
      const grupo = await fuente.getRepository(Grupo).save({
        curso: { id: cursoId },
        codigo: `${marca}-${sufijo}`,
        cupoMaximo: 10,
        jornada: Jornada.MANANA,
        codigoAcceso: `${corta}${sufijo}`,
      });
      grupos.push(grupo.id);
    }
    const inscribir = (estudiante: number, grupo: number) =>
      fuente.getRepository(EstudianteGrupo).save({
        estudiante: { id: perfiles[estudiante] },
        grupo: { id: grupos[grupo] },
        activo: true,
      });
    await inscribir(0, 0);
    await inscribir(1, 0);
    await inscribir(2, 1);
    await fuente.getRepository(Horario).save({
      periodo,
      asignaciones: grupos.map((grupoId, indice) => ({
        grupoId,
        docenteId,
        aulaId: '00000000-0000-4000-8000-000000000003',
        franjaId: `00000000-0000-4000-8000-00000000001${indice}`,
      })),
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

    const dimension = (nombre: string, orden: number, peso: number) => ({
      nombre,
      orden,
      peso,
      preguntas: [
        { texto: `¿Cómo calificas ${nombre.toLowerCase()}?`, orden: 1 },
      ],
    });
    const formulario = await pedir('post', '/formularios', admin, {
      nombre: `Formulario ${marca}`,
      periodoAcademicoId: periodoId,
      dimensiones: [
        dimension('Metodología', 1, 60),
        dimension('Puntualidad', 2, 40),
      ],
    }).expect(201);
    preguntas = formulario.body.dimensiones.map(
      (d: { preguntas: Array<{ id: string }> }) => d.preguntas[0].id,
    );
    const evaluacion = await pedir('post', '/evaluaciones', admin, {
      formularioId: formulario.body.id,
      docenteId,
    }).expect(201);
    evaluacionId = evaluacion.body.id;
  });

  afterAll(async () => {
    await fuente
      .getRepository(Alerta)
      .delete({ periodoAcademico: { id: periodoId } });
    await fuente
      .getRepository(Formulario)
      .delete({ periodoAcademico: { id: periodoId } });
    await fuente.getRepository(Horario).delete({ periodo: { id: periodoId } });
    await fuente
      .getRepository(EstudianteGrupo)
      .delete({ grupo: { id: In(grupos) } });
    await fuente.getRepository(Grupo).delete({ id: In(grupos) });
    await fuente.getRepository(Curso).delete({ id: cursoId });
    await fuente.getRepository(NivelIdioma).delete({ id: nivelId });
    await fuente.getRepository(PeriodoAcademico).delete({ id: periodoId });
    await fuente.getRepository(Estudiante).delete({ id: In(perfiles) });
    await fuente.getRepository(Docente).delete({ id: docenteId });
    await borrarUsuarios(fuente, [
      admin.id,
      profe.id,
      ...Object.values(alumnos).map((a) => a.id),
    ]);
    await app.close();
  });

  it('sin respuestas no calcula nada y avisa del docente sin evaluaciones (RF-40)', async () => {
    const negado = await pedir('post', '/kdd/ejecutar', alumnos.ana, {
      periodoId,
    });
    expect(negado.status).toBe(403);
    const resumen = await pedir('post', '/kdd/ejecutar', admin, { periodoId });
    expect(resumen.status).toBe(200);
    expect(resumen.body).toMatchObject({
      evaluacionesProcesadas: 0,
      alertas: { CRITICO: 0, ADVERTENCIA: 0 },
    });
    const info = await pedir(
      'get',
      `/alertas?periodoId=${periodoId}&tipo=INFO&size=100`,
      admin,
    );
    expect(info.status).toBe(200);
    expect(info.body.datos).toContainEqual(
      expect.objectContaining({
        tipo: 'INFO',
        docente: expect.objectContaining({ id: docenteId }),
        puntajeGlobal: null,
      }),
    );
  });

  it('un solo envío no dispara el KDD; al terminar un grupo deja un resultado parcial (RF-39)', async () => {
    await simular(0, 2, COMENTARIO);
    const antes = await pedir(
      'get',
      `/kdd/resultados?periodoId=${periodoId}`,
      admin,
    );
    expect(antes.body).toEqual([]);

    await simular(1, 3);
    expect(await estado()).toBe('EN_PROGRESO');
    const resultados = await pedir(
      'get',
      `/kdd/resultados?periodoId=${periodoId}`,
      admin,
    );
    expect(resultados.status).toBe(200);
    expect(resultados.body).toEqual([
      expect.objectContaining({
        evaluacionId,
        parcial: true,
        participantes: 2,
        elegibles: 3,
        puntajeGlobal: 2.5,
      }),
    ]);
    const delDocente = await pedir(
      'get',
      `/kdd/mis-resultados?periodoId=${periodoId}`,
      profe,
    );
    expect(delDocente.body.resultados).toEqual([]);
  });

  it('cuando responden todos queda en ALERTA si el puntaje es bajo (RF-40)', async () => {
    await simular(2, 3);
    expect(await estado()).toBe('ALERTA');
    const alertas = await pedir(
      'get',
      `/alertas?periodoId=${periodoId}&leida=false&tipo=CRITICO`,
      admin,
    );
    expect(alertas.status).toBe(200);
    expect(alertas.body.datos).toEqual([
      expect.objectContaining({
        tipo: 'CRITICO',
        leida: false,
        evaluacionId,
        puntajeGlobal: 2.67,
      }),
    ]);
  });

  it('el docente ve su resultado definitivo y los comentarios anónimos (RF-42, RF-43)', async () => {
    const respuesta = await pedir(
      'get',
      `/kdd/mis-resultados?periodoId=${periodoId}`,
      profe,
    );
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.resultados).toEqual([
      expect.objectContaining({
        evaluacionId,
        puntajeGlobal: 2.67,
        etiqueta: 'Crítico',
        participantes: 3,
        parcial: false,
        comentarios: [COMENTARIO],
      }),
    ]);
    expect(respuesta.body.resultados[0].puntajesPorDimension).toEqual([
      expect.objectContaining({ nombre: 'Metodología', peso: 60 }),
      expect.objectContaining({ nombre: 'Puntualidad', peso: 40 }),
    ]);
    expect(JSON.stringify(respuesta.body)).not.toContain(alumnos.ana.id);
    const periodos = await pedir('get', '/kdd/mis-periodos', profe);
    expect(periodos.status).toBe(200);
    expect(periodos.body).toContainEqual({
      id: periodoId,
      nombre: `P-${marca}`,
      activo: false,
    });
    const ajeno = await pedir(
      'get',
      `/kdd/resultados?periodoId=${periodoId}`,
      profe,
    );
    expect(ajeno.status).toBe(403);
  });

  it('la reejecución manual recalcula sin duplicar alertas (RF-39)', async () => {
    const resumen = await pedir('post', '/kdd/ejecutar', admin, { periodoId });
    expect(resumen.status).toBe(200);
    expect(resumen.body).toMatchObject({
      evaluacionesProcesadas: 1,
      sinRespuestas: 0,
      alertas: { CRITICO: 1, ADVERTENCIA: 0 },
    });
    expect(resumen.body.tiempoMs).toBeLessThan(30000);
    const criticas = await pedir(
      'get',
      `/alertas?periodoId=${periodoId}&tipo=CRITICO`,
      admin,
    );
    expect(criticas.body.total).toBe(1);
    // El docente ya tiene resultado: su alerta INFO desaparece.
    const info = await pedir(
      'get',
      `/alertas?periodoId=${periodoId}&tipo=INFO&size=100`,
      admin,
    );
    expect(
      info.body.datos.filter(
        (alerta: { docente: { id: string } }) =>
          alerta.docente.id === docenteId,
      ),
    ).toEqual([]);
  });

  it('revisar la alerta cierra la evaluación y respeta la Figura 6.15 (RF-44)', async () => {
    const criticas = await pedir(
      'get',
      `/alertas?periodoId=${periodoId}&tipo=CRITICO`,
      admin,
    );
    const alertaId = criticas.body.datos[0].id;
    const invalido = await pedir('patch', `/alertas/${alertaId}`, admin, {
      leida: false,
    });
    expect(invalido.status).toBe(400);
    const leida = await pedir('patch', `/alertas/${alertaId}`, admin, {
      leida: true,
    });
    expect(leida.status).toBe(200);
    expect(leida.body.leida).toBe(true);
    const evaluacion = await pedir(
      'get',
      `/evaluaciones/${evaluacionId}`,
      admin,
    );
    expect(evaluacion.body.estado).toBe('CERRADA');
    const atras = await pedir(
      'patch',
      `/evaluaciones/${evaluacionId}/estado`,
      admin,
      { estado: 'PENDIENTE' },
    );
    expect(atras.status).toBe(409);
    const archivada = await pedir(
      'patch',
      `/evaluaciones/${evaluacionId}/estado`,
      admin,
      { estado: 'ARCHIVADA' },
    );
    expect(archivada.status).toBe(200);
    expect(archivada.body.estado).toBe('ARCHIVADA');
  });

  it('eliminar la evaluación elimina sus respuestas, su resultado y sus alertas (RF-38)', async () => {
    const eliminada = await pedir(
      'delete',
      `/evaluaciones/${evaluacionId}`,
      admin,
    );
    expect(eliminada.status).toBe(204);
    expect(
      await fuente
        .getRepository(Respuesta)
        .countBy({ evaluacion: { id: evaluacionId } }),
    ).toBe(0);
    expect(
      await fuente
        .getRepository(ResultadoKdd)
        .countBy({ evaluacion: { id: evaluacionId } }),
    ).toBe(0);
    expect(
      await fuente.getRepository(Alerta).countBy({
        periodoAcademico: { id: periodoId },
        docente: { id: docenteId },
      }),
    ).toBe(0);
  });
});
