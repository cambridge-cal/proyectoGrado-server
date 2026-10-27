import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource, In, Like } from 'typeorm';
import {
  Aula,
  Curso,
  FranjaHoraria,
  Grupo,
  NivelIdioma,
} from '../src/horarios/entidades/index.js';
import { Rol } from '../src/seguridad/entidades/index.js';
import { borrarUsuarios, crearApp, usuarioConSesion } from './utilidades.js';

// Requiere la base de datos de docker compose en ejecución y un archivo .env.
describe('Grupos, aulas y franjas horarias (e2e)', () => {
  let app: INestApplication;
  let fuente: DataSource;
  const marca = `e2er${Date.now()}`;
  const MARCA = marca.toUpperCase();
  let admin: { id: string; token: string };
  let docente: { id: string; token: string };
  let cursoId: string;
  const franjasCreadas: string[] = [];

  beforeAll(async () => {
    ({ app, fuente } = await crearApp());
    admin = await usuarioConSesion(app, fuente, marca, Rol.ADMIN);
    docente = await usuarioConSesion(app, fuente, marca, Rol.DOCENTE);
    const nivel = await fuente
      .getRepository(NivelIdioma)
      .save({ codigo: `${MARCA}-A1`, nombre: 'A1', idioma: 'Inglés' });
    const curso = await fuente.getRepository(Curso).save({
      nombre: `${marca} curso`,
      intensidadHoraria: 4,
      nivelIdioma: nivel,
    });
    cursoId = curso.id;
  });

  afterAll(async () => {
    await fuente.getRepository(Grupo).delete({ codigo: Like(`${MARCA}%`) });
    await fuente.getRepository(Aula).delete({ codigo: Like(`${MARCA}%`) });
    if (franjasCreadas.length)
      await fuente
        .getRepository(FranjaHoraria)
        .delete({ id: In(franjasCreadas) });
    await fuente.getRepository(Curso).delete({ id: cursoId });
    await fuente.getRepository(NivelIdioma).delete({ codigo: `${MARCA}-A1` });
    await borrarUsuarios(fuente, [admin.id, docente.id]);
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const comoAdmin = () => ({ Authorization: `Bearer ${admin.token}` });

  it('crea un grupo con código de acceso único y lo puede regenerar (RF-12)', async () => {
    const grupo = await http()
      .post('/api/grupos')
      .set(comoAdmin())
      .send({
        codigo: `${MARCA}-G1`,
        cursoId,
        cupoMaximo: 20,
        jornada: 'MAÑANA',
      })
      .expect(201);
    expect(grupo.body.codigoAcceso).toMatch(/^[A-Z2-9]{8}$/);

    const nuevo = await http()
      .post(`/api/grupos/${grupo.body.id}/regenerar-codigo`)
      .set(comoAdmin())
      .expect(201);
    expect(nuevo.body.codigoAcceso).not.toBe(grupo.body.codigoAcceso);

    await http()
      .post('/api/grupos')
      .set(comoAdmin())
      .send({
        codigo: `${MARCA}-G1`,
        cursoId,
        cupoMaximo: 20,
        jornada: 'TARDE',
      })
      .expect(409);
    await http()
      .post('/api/grupos')
      .set(comoAdmin())
      .send({
        codigo: `${MARCA}-G2`,
        cursoId,
        cupoMaximo: 20,
        jornada: 'MADRUGADA',
      })
      .expect(400);
    // RNF-19: el curso con grupos no se puede borrar.
    await http().delete(`/api/cursos/${cursoId}`).set(comoAdmin()).expect(409);
  });

  it('aulas con tipo SALON, LAB o VIRTUAL que se pueden desactivar (RF-13)', async () => {
    const aula = await http()
      .post('/api/aulas')
      .set(comoAdmin())
      .send({ codigo: `${marca}-a1`, capacidad: 25, tipo: 'LAB' })
      .expect(201);
    expect(aula.body).toMatchObject({ codigo: `${MARCA}-A1`, activa: true });
    const editada = await http()
      .patch(`/api/aulas/${aula.body.id}`)
      .set(comoAdmin())
      .send({ activa: false })
      .expect(200);
    expect(editada.body.activa).toBe(false);
    await http()
      .post('/api/aulas')
      .set(comoAdmin())
      .send({ codigo: `${MARCA}-A2`, capacidad: 25, tipo: 'PATIO' })
      .expect(400);
  });

  it('franjas sin cruces en el mismo día y en lote (RF-14)', async () => {
    // Se usa el sábado a la noche para no chocar con franjas reales de la base de desarrollo.
    const lote = await http()
      .post('/api/franjas-horarias/lote')
      .set(comoAdmin())
      .send({
        dias: ['SAB'],
        desde: '22:00',
        hasta: '23:30',
        duracionMinutos: 45,
        bloqueInicial: 25,
      })
      .expect(201);
    franjasCreadas.push(...lote.body.map((f: { id: string }) => f.id));
    expect(lote.body.map((f: { horaInicio: string }) => f.horaInicio)).toEqual([
      '22:00',
      '22:45',
    ]);

    await http()
      .post('/api/franjas-horarias')
      .set(comoAdmin())
      .send({
        diaSemana: 'SAB',
        horaInicio: '22:30',
        horaFin: '23:00',
        bloque: 29,
      })
      .expect(409);
    await http()
      .post('/api/franjas-horarias')
      .set(comoAdmin())
      .send({
        diaSemana: 'SAB',
        horaInicio: '23:40',
        horaFin: '23:35',
        bloque: 29,
      })
      .expect(400);

    // El Docente consulta las franjas para registrar su disponibilidad, pero no las crea.
    const consulta = await http()
      .get('/api/franjas-horarias')
      .query({ diaSemana: 'SAB', size: 100 })
      .set('Authorization', `Bearer ${docente.token}`)
      .expect(200);
    expect(
      consulta.body.datos.some(
        (f: { id: string }) => f.id === franjasCreadas[0],
      ),
    ).toBe(true);
    await http()
      .post('/api/franjas-horarias')
      .set('Authorization', `Bearer ${docente.token}`)
      .send({
        diaSemana: 'SAB',
        horaInicio: '06:00',
        horaFin: '06:30',
        bloque: 28,
      })
      .expect(403);
  });
});
