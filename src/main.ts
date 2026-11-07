import { readFileSync } from 'node:fs';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { origenesCors } from './configuracion/entorno.js';

async function bootstrap() {
  const httpsOptions = opcionesHttps();
  const app = await NestFactory.create(AppModule, httpsOptions ? { httpsOptions } : {});
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.use(helmet()); // RNF-08
  app.enableCors({
    origin: origenesCors(config.get<string>('CORS_ORIGINS')),
    credentials: true,
  }); // RNF-09
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // RNF-22: documentación de la API en /api/docs
  const documento = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Sistema CAL')
      .setDescription(
        'API del sistema de generación de horarios con IA y evaluación docente de Cambridge Academy of Languages',
      )
      .setVersion('0.1.0')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup('api/docs', app, documento);

  const puerto = config.get<number>('PORT') ?? 3000;
  await app.listen(puerto);
  const protocolo = httpsOptions ? 'https' : 'http';
  console.log(`Servidor escuchando en ${protocolo}://localhost:${puerto}`);
}

/** RNF-07: TLS 1.2 o superior cuando se proveen certificado y clave. */
function opcionesHttps(): { cert: Buffer; key: Buffer; minVersion: string } | undefined {
  const certPath = process.env.TLS_CERT_PATH;
  const keyPath = process.env.TLS_KEY_PATH;
  if (!certPath || !keyPath) return undefined;
  return {
    cert: readFileSync(certPath),
    key: readFileSync(keyPath),
    minVersion: 'TLSv1.2',
  };
}

await bootstrap();
