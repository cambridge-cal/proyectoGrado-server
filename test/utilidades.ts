import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { DataSource, In } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import {
  AuditLog,
  Rol,
  Sesion,
  Usuario,
} from '../src/seguridad/entidades/index.js';

export const CLAVE_PRUEBA = 'ClaveE2E-2026';

/** Levanta la aplicación igual que main.ts y sincroniza el esquema (Vitest usa NODE_ENV=test). */
export async function crearApp(): Promise<{
  app: INestApplication;
  fuente: DataSource;
}> {
  const modulo = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = modulo.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();
  const fuente = app.get(DataSource);
  await fuente.synchronize();
  return { app, fuente };
}

/** Crea un usuario directo en la base, inicia sesión y devuelve su id y su Access Token. */
export async function usuarioConSesion(
  app: INestApplication,
  fuente: DataSource,
  marca: string,
  rol: Rol,
) {
  const usuario = await fuente.getRepository(Usuario).save({
    nombre: `${marca} ${rol}`,
    email: `${marca}.${rol.toLowerCase()}@cambridge.edu.co`,
    contrasenaHash: await bcrypt.hash(CLAVE_PRUEBA, 10),
    rol,
    activo: true,
  });
  const login = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email: usuario.email, contrasena: CLAVE_PRUEBA })
    .expect(200);
  return { id: usuario.id, token: login.body.accessToken as string };
}

/** Borra los usuarios de prueba con sus sesiones y registros de auditoría. */
export async function borrarUsuarios(fuente: DataSource, ids: string[]) {
  if (!ids.length) return;
  await fuente.getRepository(Sesion).delete({ usuario: { id: In(ids) } });
  await fuente.getRepository(AuditLog).delete({ usuario: { id: In(ids) } });
  await fuente.getRepository(Usuario).delete({ id: In(ids) });
}
