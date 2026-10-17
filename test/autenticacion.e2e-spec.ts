import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { hashRefreshToken } from '../src/seguridad/autenticacion/tokens.js';
import {
  AuditLog,
  Rol,
  Sesion,
  Usuario,
} from '../src/seguridad/entidades/index.js';

// Requiere la base de datos de docker compose en ejecución y un archivo .env (Figura 6.3).
describe('POST /api/auth/login (e2e)', () => {
  let app: INestApplication;
  let fuente: DataSource;
  const email = `e2e.${Date.now()}@cambridge.edu.co`;
  const contrasena = 'ClaveE2E-2026';
  let usuarioId: string;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    fuente = app.get(DataSource);
    // Vitest usa NODE_ENV=test, donde TypeORM no sincroniza solo: se hace aquí.
    await fuente.synchronize();
    const usuario = await fuente.getRepository(Usuario).save({
      nombre: 'Usuario E2E',
      email,
      contrasenaHash: await bcrypt.hash(contrasena, 10),
      rol: Rol.ADMIN,
      activo: true,
    });
    usuarioId = usuario.id;
  });

  afterAll(async () => {
    await fuente.getRepository(Sesion).delete({ usuario: { id: usuarioId } });
    await fuente.getRepository(AuditLog).delete({ usuario: { id: usuarioId } });
    await fuente.getRepository(Usuario).delete({ id: usuarioId });
    await app.close();
  });

  it('200 con credenciales válidas, guarda el hash del Refresh Token y audita la IP', async () => {
    const respuesta = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: email.toUpperCase(), contrasena })
      .expect(200);

    expect(respuesta.body).toMatchObject({
      tipoToken: 'Bearer',
      expiraEn: 28800,
      usuario: { email, rol: 'ADMIN' },
    });

    const sesion = await fuente
      .getRepository(Sesion)
      .findOneByOrFail({ usuario: { id: usuarioId } });
    expect(sesion.refreshTokenHash).toBe(
      hashRefreshToken(respuesta.body.refreshToken),
    );

    const registro = await fuente
      .getRepository(AuditLog)
      .findOneByOrFail({ usuario: { id: usuarioId }, accion: 'LOGIN' });
    expect(registro.ip).toBeTruthy();

    await request(app.getHttpServer())
      .get('/api/auth/perfil')
      .set('Authorization', `Bearer ${respuesta.body.accessToken}`)
      .expect(200)
      .expect({ sub: usuarioId, email, rol: 'ADMIN' });
  });

  it('refresh rota el Refresh Token y logout lo invalida (RF-02, RF-03)', async () => {
    const servidor = app.getHttpServer();
    const login = await request(servidor)
      .post('/api/auth/login')
      .send({ email, contrasena })
      .expect(200);
    const primero = login.body.refreshToken;

    const renovado = await request(servidor)
      .post('/api/auth/refresh')
      .send({ refreshToken: primero })
      .expect(200);
    expect(renovado.body.accessToken).toBeTruthy();
    expect(renovado.body.refreshToken).not.toBe(primero);

    // El token usado ya no sirve y, por seguridad, cierra las demás sesiones.
    await request(servidor)
      .post('/api/auth/refresh')
      .send({ refreshToken: primero })
      .expect(401);
    await request(servidor)
      .post('/api/auth/refresh')
      .send({ refreshToken: renovado.body.refreshToken })
      .expect(401);

    const otra = await request(servidor)
      .post('/api/auth/login')
      .send({ email, contrasena })
      .expect(200);
    await request(servidor)
      .post('/api/auth/logout')
      .send({ refreshToken: otra.body.refreshToken })
      .expect(204);
    await request(servidor)
      .post('/api/auth/refresh')
      .send({ refreshToken: otra.body.refreshToken })
      .expect(401);
  });

  it('401 con contraseña incorrecta', async () => {
    const respuesta = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, contrasena: 'incorrecta' })
      .expect(401);
    expect(respuesta.body.message).toBe('Email o contraseña incorrectos.');
  });

  it('400 si el email no tiene formato válido', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'no-es-email', contrasena })
      .expect(400);
  });

  it('401 en /auth/perfil sin token', async () => {
    await request(app.getHttpServer()).get('/api/auth/perfil').expect(401);
  });
});
