import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource, In } from 'typeorm';
import {
  Disponibilidad,
  FranjaHoraria,
} from '../src/horarios/entidades/index.js';
import { Docente, Rol } from '../src/seguridad/entidades/index.js';
import { borrarUsuarios, crearApp, usuarioConSesion } from './utilidades.js';

// Requiere la base de datos de docker compose en ejecución y un archivo .env.
describe('Docentes y disponibilidades (e2e)', () => {
  let app: INestApplication;
  let fuente: DataSource;
  const marca = `e2ed${Date.now()}`;
  let admin: { id: string; token: string };
  let profe: { id: string; token: string };
  let otroProfe: { id: string; token: string };
  let estudiante: { id: string; token: string };
  let docenteId: string;
  const franjas: string[] = [];

  beforeAll(async () => {
    ({ app, fuente } = await crearApp());
    admin = await usuarioConSesion(app, fuente, marca, Rol.ADMIN);
    profe = await usuarioConSesion(app, fuente, marca, Rol.DOCENTE);
    otroProfe = await usuarioConSesion(app, fuente, `${marca}b`, Rol.DOCENTE);
    estudiante = await usuarioConSesion(app, fuente, marca, Rol.ESTUDIANTE);
    for (const bloque of [27, 28]) {
      const franja = await fuente.getRepository(FranjaHoraria).save({
        diaSemana: 'SAB' as FranjaHoraria['diaSemana'],
        horaInicio: bloque === 27 ? '05:00' : '05:30',
        horaFin: bloque === 27 ? '05:30' : '06:00',
        bloque,
      });
      franjas.push(franja.id);
    }
  });

  afterAll(async () => {
    const docentes = await fuente
      .getRepository(Docente)
      .findBy({ usuario: { id: In([profe.id, otroProfe.id]) } });
    if (docentes.length) {
      await fuente
        .getRepository(Disponibilidad)
        .delete({ docente: { id: In(docentes.map((d) => d.id)) } });
      await fuente
        .getRepository(Docente)
        .delete({ id: In(docentes.map((d) => d.id)) });
    }
    await fuente.getRepository(FranjaHoraria).delete({ id: In(franjas) });
    await borrarUsuarios(fuente, [
      admin.id,
      profe.id,
      otroProfe.id,
      estudiante.id,
    ]);
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const comoAdmin = () => ({ Authorization: `Bearer ${admin.token}` });

  it('el Administrador crea el perfil de docente con carga de 40 horas por defecto (RF-15)', async () => {
    const creado = await http()
      .post('/api/docentes')
      .set(comoAdmin())
      .send({ usuarioId: profe.id, especialidad: 'Inglés' })
      .expect(201);
    expect(creado.body).toMatchObject({
      especialidad: 'Inglés',
      cargaMaximaSemanal: 40,
      franjasDisponibles: 0,
    });
    docenteId = creado.body.id;

    await http()
      .post('/api/docentes')
      .set(comoAdmin())
      .send({ usuarioId: profe.id, especialidad: 'Inglés' })
      .expect(409);
    await http()
      .post('/api/docentes')
      .set(comoAdmin())
      .send({ usuarioId: estudiante.id, especialidad: 'Inglés' })
      .expect(400);

    const editado = await http()
      .patch(`/api/docentes/${docenteId}`)
      .set(comoAdmin())
      .send({ cargaMaximaSemanal: 24 })
      .expect(200);
    expect(editado.body.cargaMaximaSemanal).toBe(24);
  });

  it('el Administrador y el propio docente registran la disponibilidad (RF-16)', async () => {
    await http()
      .put(`/api/docentes/${docenteId}/disponibilidad`)
      .set(comoAdmin())
      .send({ franjaIds: [franjas[0]] })
      .expect(200);

    const mia = await http()
      .put('/api/docentes/yo/disponibilidad')
      .set('Authorization', `Bearer ${profe.token}`)
      .send({ franjaIds: franjas })
      .expect(200);
    expect(mia.body.map((f: { id: string }) => f.id).sort()).toEqual(
      [...franjas].sort(),
    );

    const lista = await http()
      .get('/api/docentes')
      .query({ busqueda: marca })
      .set(comoAdmin())
      .expect(200);
    expect(
      lista.body.datos.find((d: { id: string }) => d.id === docenteId)
        .franjasDisponibles,
    ).toBe(2);
  });

  it('un docente sin perfil no puede registrar disponibilidad y un estudiante no entra', async () => {
    await http()
      .get('/api/docentes/yo/disponibilidad')
      .set('Authorization', `Bearer ${otroProfe.token}`)
      .expect(403);
    await http()
      .get('/api/docentes/yo/disponibilidad')
      .set('Authorization', `Bearer ${estudiante.token}`)
      .expect(403);
    await http()
      .get('/api/docentes')
      .set('Authorization', `Bearer ${profe.token}`)
      .expect(403);
  });

  it('no acepta franjas inexistentes', async () => {
    await http()
      .put(`/api/docentes/${docenteId}/disponibilidad`)
      .set(comoAdmin())
      .send({ franjaIds: ['00000000-0000-4000-8000-000000000000'] })
      .expect(400);
  });
});
