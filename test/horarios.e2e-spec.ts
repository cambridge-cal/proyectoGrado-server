import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Horario, PeriodoAcademico } from '../src/horarios/entidades/index.js';
import { Rol } from '../src/seguridad/entidades/index.js';
import { borrarUsuarios, crearApp, usuarioConSesion } from './utilidades.js';

// Requiere la base de datos de docker compose en ejecución y un archivo .env.
// La generación completa se prueba en horarios.service.spec.ts: aquí solo la API.
// Los horarios de prueba se insertan directo en un período propio para no tocar otros datos.
describe('Horarios (e2e)', () => {
  let app: INestApplication;
  let fuente: DataSource;
  const marca = `e2eh${Date.now()}`;
  let admin: { id: string; token: string };
  let docente: { id: string; token: string };
  let periodo: PeriodoAcademico;

  const horarioDePrueba = (archivado: boolean) =>
    fuente.getRepository(Horario).save({
      periodo,
      asignaciones: [
        {
          grupoId: '00000000-0000-4000-8000-000000000001',
          docenteId: '00000000-0000-4000-8000-000000000002',
          aulaId: '00000000-0000-4000-8000-000000000003',
          franjaId: '00000000-0000-4000-8000-000000000004',
        },
      ],
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
      archivado,
    });

  beforeAll(async () => {
    ({ app, fuente } = await crearApp());
    admin = await usuarioConSesion(app, fuente, marca, Rol.ADMIN);
    docente = await usuarioConSesion(app, fuente, marca, Rol.DOCENTE);
    periodo = await fuente.getRepository(PeriodoAcademico).save({
      nombre: marca,
      fechaInicio: '2030-01-01',
      fechaFin: '2030-06-30',
      activo: false,
    });
  });

  afterAll(async () => {
    await fuente.getRepository(Horario).delete({ periodo: { id: periodo.id } });
    await fuente.getRepository(PeriodoAcademico).delete({ id: periodo.id });
    await borrarUsuarios(fuente, [admin.id, docente.id]);
    await app.close();
  });

  const post = (ruta: string, token: string, cuerpo: object = {}) =>
    request(app.getHttpServer())
      .post(`/api${ruta}`)
      .set('Authorization', `Bearer ${token}`)
      .send(cuerpo);
  const get = (ruta: string, token: string) =>
    request(app.getHttpServer())
      .get(`/api${ruta}`)
      .set('Authorization', `Bearer ${token}`);
  const borrar = (ruta: string, token: string) =>
    request(app.getHttpServer())
      .delete(`/api${ruta}`)
      .set('Authorization', `Bearer ${token}`);

  describe('POST /horarios/generar (RF-17, RF-19)', () => {
    it('solo el Administrador genera horarios', async () => {
      await post('/horarios/generar', docente.token).expect(403);
    });

    it('rechaza tipos de aula inválidos o excluirlos todos', async () => {
      await post('/horarios/generar', admin.token, {
        tiposAulaExcluidos: ['PISCINA'],
      }).expect(400);
      const todos = await post('/horarios/generar', admin.token, {
        tiposAulaExcluidos: ['SALON', 'LAB', 'VIRTUAL'],
      }).expect(400);
      expect(JSON.stringify(todos.body.message)).toContain(
        'al menos un tipo de aula',
      );
    });

    it('responde 404 si el período no existe', async () => {
      await post('/horarios/generar', admin.token, {
        periodoId: '00000000-0000-4000-8000-000000000000',
      }).expect(404);
    });
  });

  describe('Consulta, archivo y eliminación (RF-20 a RF-24, Figura 6.16)', () => {
    let activo1: Horario;
    let activo2: Horario;

    beforeAll(async () => {
      activo1 = await horarioDePrueba(false);
      activo2 = await horarioDePrueba(false);
      await horarioDePrueba(true);
    });

    it('cualquier usuario autenticado lista con filtro archivado (RF-20)', async () => {
      const activos = await get(
        `/horarios?archivado=false&periodoId=${periodo.id}`,
        docente.token,
      ).expect(200);
      expect(activos.body.total).toBe(2);
      expect(activos.body.datos[0]).toMatchObject({
        periodo: { id: periodo.id, nombre: marca },
        archivado: false,
        validadoGemini: false,
        estadoValidacion: 'SIN_CONFIGURAR',
        totalAsignaciones: 1,
      });
      const archivados = await get(
        `/horarios?archivado=true&periodoId=${periodo.id}`,
        admin.token,
      ).expect(200);
      expect(archivados.body.total).toBe(1);
    });

    it('detalle con las asignaciones; recursos eliminados llegan en null (RF-21)', async () => {
      const r = await get(`/horarios/${activo1.id}`, docente.token).expect(200);
      expect(r.body.asignaciones).toEqual([
        { posicion: 0, grupo: null, docente: null, aula: null, franja: null },
      ]);
      expect(r.body.validacion.estado).toBe('SIN_CONFIGURAR');
      await get(
        '/horarios/00000000-0000-4000-8000-000000000009',
        admin.token,
      ).expect(404);
      await get('/horarios/no-es-uuid', admin.token).expect(400);
    });

    it('el período con horarios no se puede eliminar (RNF-19)', async () => {
      await borrar(`/periodos/${periodo.id}`, admin.token).expect(409);
    });

    it('solo el Administrador archiva o elimina', async () => {
      await post('/horarios/archivar', docente.token, {
        periodoId: periodo.id,
      }).expect(403);
      await borrar(`/horarios/${activo1.id}`, docente.token).expect(403);
      await borrar(
        `/horarios/archivados?periodoId=${periodo.id}`,
        docente.token,
      ).expect(403);
    });

    it('elimina un horario individual (RF-24)', async () => {
      await borrar(`/horarios/${activo2.id}`, admin.token).expect(204);
      await get(`/horarios/${activo2.id}`, admin.token).expect(404);
    });

    it('archiva los activos del período y luego borra el historial (RF-22, RF-23)', async () => {
      const archivar = await post('/horarios/archivar', admin.token, {
        periodoId: periodo.id,
      }).expect(200);
      expect(archivar.body).toEqual({ archivados: 1 });
      const activos = await get(
        `/horarios?archivado=false&periodoId=${periodo.id}`,
        admin.token,
      ).expect(200);
      expect(activos.body.total).toBe(0);

      const historial = await borrar(
        `/horarios/archivados?periodoId=${periodo.id}`,
        admin.token,
      ).expect(200);
      expect(historial.body).toEqual({ eliminados: 2 });
      const quedan = await get(
        `/horarios?periodoId=${periodo.id}`,
        admin.token,
      ).expect(200);
      expect(quedan.body.total).toBe(0);
    });
  });
});
