import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource, In } from 'typeorm';
import { Evaluacion, Formulario } from '../src/evaluacion/entidades/index.js';
import { PeriodoAcademico } from '../src/horarios/entidades/index.js';
import { Docente, Rol } from '../src/seguridad/entidades/index.js';
import { borrarUsuarios, crearApp, usuarioConSesion } from './utilidades.js';

// Requiere la base de datos de docker compose en ejecución y un archivo .env.
describe('Formularios y asignación de evaluaciones (e2e)', () => {
  let app: INestApplication;
  let fuente: DataSource;
  const marca = `e2ef${Date.now()}`;
  let admin: { id: string; token: string };
  let profe: { id: string; token: string };
  let periodoId: string;
  let docenteId: string;
  let formularioId: string;

  const dimension = (nombre: string, orden: number, peso?: number) => ({
    nombre,
    orden,
    ...(peso === undefined ? {} : { peso }),
    preguntas: [{ texto: '¿Explica los temas con claridad?', orden: 1 }],
  });
  const crear = (dimensiones: object[]) =>
    request(app.getHttpServer())
      .post('/api/formularios')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        nombre: `Formulario ${marca}`,
        periodoAcademicoId: periodoId,
        dimensiones,
      });

  beforeAll(async () => {
    ({ app, fuente } = await crearApp());
    admin = await usuarioConSesion(app, fuente, marca, Rol.ADMIN);
    profe = await usuarioConSesion(app, fuente, marca, Rol.DOCENTE);
    const periodo = await fuente.getRepository(PeriodoAcademico).save({
      nombre: `P-${marca}`,
      fechaInicio: '2031-01-10',
      fechaFin: '2031-06-10',
      activo: false,
    });
    periodoId = periodo.id;
    const repoDocentes = fuente.getRepository(Docente);
    const docente =
      (await repoDocentes.findOneBy({ usuario: { id: profe.id } })) ??
      (await repoDocentes.save({
        usuario: { id: profe.id },
        especialidad: 'Inglés',
        cargaMaximaSemanal: 20,
      }));
    docenteId = docente.id;
  });

  afterAll(async () => {
    await fuente
      .getRepository(Evaluacion)
      .delete({ docente: { id: In([docenteId]) } });
    await fuente
      .getRepository(Formulario)
      .delete({ periodoAcademico: { id: periodoId } });
    await fuente.getRepository(Docente).delete({ id: docenteId });
    await fuente.getRepository(PeriodoAcademico).delete({ id: periodoId });
    await borrarUsuarios(fuente, [admin.id, profe.id]);
    await app.close();
  });

  it('exige el peso de cada dimensión (RF-29)', async () => {
    const respuesta = await crear([dimension('Metodología', 1)]);
    expect(respuesta.status).toBe(400);
  });

  it('rechaza pesos que no suman 100', async () => {
    const respuesta = await crear([
      dimension('Metodología', 1, 60),
      dimension('Puntualidad', 2, 30),
    ]);
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.message).toBe(
      'Los pesos de las dimensiones deben sumar 100 (suman 90).',
    );
  });

  it('crea el formulario y devuelve dimensiones con peso y preguntas', async () => {
    const respuesta = await crear([
      dimension('Metodología', 1, 60),
      dimension('Puntualidad', 2, 40),
    ]);
    expect(respuesta.status).toBe(201);
    formularioId = respuesta.body.id;
    expect(
      respuesta.body.dimensiones.map((d: { nombre: string; peso: number }) => [
        d.nombre,
        d.peso,
      ]),
    ).toEqual([
      ['Metodología', 60],
      ['Puntualidad', 40],
    ]);
    expect(respuesta.body.dimensiones[0].preguntas).toHaveLength(1);
    expect(respuesta.body.periodoAcademico.id).toBe(periodoId);
  });

  it('al editar las dimensiones vuelve a validar la suma', async () => {
    const mala = await request(app.getHttpServer())
      .patch(`/api/formularios/${formularioId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ dimensiones: [dimension('Metodología', 1, 80)] });
    expect(mala.status).toBe(400);
    const buena = await request(app.getHttpServer())
      .patch(`/api/formularios/${formularioId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        dimensiones: [
          dimension('Metodología', 1, 70),
          dimension('Trato', 2, 30),
        ],
      });
    expect(buena.status).toBe(200);
    expect(buena.body.dimensiones.map((d: { peso: number }) => d.peso)).toEqual(
      [70, 30],
    );
  });

  it('asigna el formulario a un docente y lo lista sin datos sensibles', async () => {
    const asignada = await request(app.getHttpServer())
      .post('/api/evaluaciones')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ formularioId, docenteId });
    expect(asignada.status).toBe(201);
    const lista = await request(app.getHttpServer())
      .get('/api/evaluaciones')
      .query({ formularioId, page: 1, size: 100 })
      .set('Authorization', `Bearer ${admin.token}`);
    expect(lista.status).toBe(200);
    expect(lista.body.datos).toHaveLength(1);
    const evaluacion = lista.body.datos[0];
    expect(evaluacion.estado).toBe('PENDIENTE');
    expect(evaluacion.docente.id).toBe(docenteId);
    expect(evaluacion.docente.usuario.nombre).toEqual(expect.any(String));
    expect(JSON.stringify(lista.body)).not.toContain('contrasena');
  });

  it('solo el Administrador gestiona formularios (RF-07)', async () => {
    const respuesta = await request(app.getHttpServer())
      .get('/api/formularios')
      .set('Authorization', `Bearer ${profe.token}`);
    expect(respuesta.status).toBe(403);
  });
});
