import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Rol } from '../src/seguridad/entidades/index.js';
import { borrarUsuarios, crearApp, usuarioConSesion } from './utilidades.js';

// Requiere la base de datos de docker compose en ejecución y un archivo .env.
// La generación completa se prueba en horarios.service.spec.ts: aquí solo la API.
describe('Horarios (e2e)', () => {
  let app: INestApplication;
  let fuente: DataSource;
  const marca = `e2eh${Date.now()}`;
  let admin: { id: string; token: string };
  let docente: { id: string; token: string };

  beforeAll(async () => {
    ({ app, fuente } = await crearApp());
    admin = await usuarioConSesion(app, fuente, marca, Rol.ADMIN);
    docente = await usuarioConSesion(app, fuente, marca, Rol.DOCENTE);
  });

  afterAll(async () => {
    await borrarUsuarios(fuente, [admin.id, docente.id]);
    await app.close();
  });

  const post = (ruta: string, token: string, cuerpo: object = {}) =>
    request(app.getHttpServer())
      .post(`/api${ruta}`)
      .set('Authorization', `Bearer ${token}`)
      .send(cuerpo);

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
});
