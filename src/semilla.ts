/**
 * Crea usuarios de prueba para desarrollo: un administrador, un docente y un estudiante.
 * Uso: npm run semilla  (requiere SEMILLA_CONTRASENA en .env y NODE_ENV=development)
 * Se puede ejecutar varias veces: si el email ya existe, no lo vuelve a crear.
 */
import { NestFactory } from '@nestjs/core';
import bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module.js';
import { SALT_ROUNDS } from './seguridad/autenticacion/autenticacion.service.js';
import {
  Docente,
  Estudiante,
  Rol,
  Usuario,
} from './seguridad/entidades/index.js';

const USUARIOS_PRUEBA = [
  {
    nombre: 'Administrador CAL',
    email: 'admin@cambridge.edu.co',
    rol: Rol.ADMIN,
  },
  {
    nombre: 'Docente de Prueba',
    email: 'docente@cambridge.edu.co',
    rol: Rol.DOCENTE,
  },
  {
    nombre: 'Estudiante de Prueba',
    email: 'estudiante@cambridge.edu.co',
    rol: Rol.ESTUDIANTE,
  },
];

async function sembrar() {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('La semilla solo se ejecuta con NODE_ENV=development.');
  }
  const contrasena = process.env.SEMILLA_CONTRASENA ?? '';
  if (contrasena.length < 8) {
    throw new Error(
      'Define SEMILLA_CONTRASENA en .env con al menos 8 caracteres.',
    );
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const fuente = app.get(DataSource);
    const hash = await bcrypt.hash(contrasena, SALT_ROUNDS);

    for (const datos of USUARIOS_PRUEBA) {
      await fuente.transaction(async (tx) => {
        if (await tx.existsBy(Usuario, { email: datos.email })) {
          console.log(`Ya existe ${datos.email}`);
          return;
        }
        const usuario = await tx.save(
          tx.create(Usuario, { ...datos, contrasenaHash: hash, activo: true }),
        );
        if (datos.rol === Rol.DOCENTE) {
          await tx.save(
            tx.create(Docente, {
              usuario,
              especialidad: 'Inglés',
              cargaMaximaSemanal: 20,
            }),
          );
        }
        if (datos.rol === Rol.ESTUDIANTE) {
          await tx.save(tx.create(Estudiante, { usuario, codigo: 'EST-0001' }));
        }
        console.log(`Creado ${datos.email} (${datos.rol})`);
      });
    }
  } finally {
    await app.close();
  }
}

sembrar().catch((error: Error) => {
  console.error(`Semilla: ${error.message}`);
  process.exitCode = 1;
});
