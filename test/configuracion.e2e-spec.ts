import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource, Like } from 'typeorm';
import {
  Curso,
  NivelIdioma,
  PeriodoAcademico,
} from '../src/horarios/entidades/index.js';
import { Rol } from '../src/seguridad/entidades/index.js';
import { borrarUsuarios, crearApp, usuarioConSesion } from './utilidades.js';

// Requiere la base de datos de docker compose en ejecución y un archivo .env.
describe('Configuración académica: períodos, niveles y cursos (e2e)', () => {
  let app: INestApplication;
  let fuente: DataSource;
  const marca = `e2ec${Date.now()}`;
  let admin: { id: string; token: string };
  let docente: { id: string; token: string };
  let activoPrevio: string | null = null;

  beforeAll(async () => {
    ({ app, fuente } = await crearApp());
    admin = await usuarioConSesion(app, fuente, marca, Rol.ADMIN);
    docente = await usuarioConSesion(app, fuente, marca, Rol.DOCENTE);
    activoPrevio =
      (await fuente.getRepository(PeriodoAcademico).findOneBy({ activo: true }))
        ?.id ?? null;
  });

  afterAll(async () => {
    await fuente.getRepository(Curso).delete({ nombre: Like(`${marca}%`) });
    await fuente
      .getRepository(NivelIdioma)
      .delete({ codigo: Like(`${marca.toUpperCase()}%`) });
    await fuente
      .getRepository(PeriodoAcademico)
      .delete({ nombre: Like(`${marca}%`) });
    if (activoPrevio)
      await fuente
        .getRepository(PeriodoAcademico)
        .update({ id: activoPrevio }, { activo: true });
    await borrarUsuarios(fuente, [admin.id, docente.id]);
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const comoAdmin = () => ({ Authorization: `Bearer ${admin.token}` });

  it('solo el Administrador gestiona la configuración (RF-07)', async () => {
    await http()
      .get('/api/periodos')
      .set('Authorization', `Bearer ${docente.token}`)
      .expect(403);
  });

  it('solo puede haber un período activo a la vez (RF-09)', async () => {
    const primero = await http()
      .post('/api/periodos')
      .set(comoAdmin())
      .send({
        nombre: `${marca}-1`,
        fechaInicio: '2027-01-20',
        fechaFin: '2027-06-10',
        activo: true,
      })
      .expect(201);
    const segundo = await http()
      .post('/api/periodos')
      .set(comoAdmin())
      .send({
        nombre: `${marca}-2`,
        fechaInicio: '2027-07-20',
        fechaFin: '2027-12-10',
        activo: true,
      })
      .expect(201);

    const recargado = await http()
      .get(`/api/periodos/${primero.body.id}`)
      .set(comoAdmin())
      .expect(200);
    expect(recargado.body.activo).toBe(false);
    const activos = await http()
      .get('/api/periodos')
      .query({ activo: true })
      .set(comoAdmin())
      .expect(200);
    expect(activos.body.total).toBe(1);
    expect(activos.body.datos[0].id).toBe(segundo.body.id);

    await http()
      .post('/api/periodos')
      .set(comoAdmin())
      .send({
        nombre: `${marca}-3`,
        fechaInicio: '2027-07-20',
        fechaFin: '2027-07-01',
      })
      .expect(400);
    await http()
      .post('/api/periodos')
      .set(comoAdmin())
      .send({
        nombre: `${marca}-1`,
        fechaInicio: '2028-01-20',
        fechaFin: '2028-06-10',
      })
      .expect(409);
  });

  it('niveles con código único y cursos que pertenecen a un nivel (RF-10, RF-11)', async () => {
    const nivel = await http()
      .post('/api/niveles')
      .set(comoAdmin())
      .send({ codigo: `${marca}-a1`, nombre: 'Inglés A1', idioma: 'Inglés' })
      .expect(201);
    expect(nivel.body.codigo).toBe(`${marca.toUpperCase()}-A1`);
    await http()
      .post('/api/niveles')
      .set(comoAdmin())
      .send({ codigo: `${marca}-A1`, nombre: 'Repetido', idioma: 'Inglés' })
      .expect(409);

    const curso = await http()
      .post('/api/cursos')
      .set(comoAdmin())
      .send({
        nombre: `${marca} Inglés A1`,
        nivelIdiomaId: nivel.body.id,
        intensidadHoraria: 4,
      })
      .expect(201);
    expect(curso.body.nivelIdioma.codigo).toBe(`${marca.toUpperCase()}-A1`);

    const lista = await http()
      .get('/api/cursos')
      .query({ busqueda: marca })
      .set(comoAdmin())
      .expect(200);
    expect(lista.body.total).toBe(1);

    // RNF-19: no se borra un nivel que tiene cursos.
    await http()
      .delete(`/api/niveles/${nivel.body.id}`)
      .set(comoAdmin())
      .expect(409);
    await http()
      .delete(`/api/cursos/${curso.body.id}`)
      .set(comoAdmin())
      .expect(204);
    await http()
      .delete(`/api/niveles/${nivel.body.id}`)
      .set(comoAdmin())
      .expect(204);
  });
});
