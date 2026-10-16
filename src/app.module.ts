import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller.js';
import { validarEntorno } from './configuracion/entorno.js';
import { EvaluacionModule } from './evaluacion/evaluacion.module.js';
import { HorariosModule } from './horarios/horarios.module.js';
import { SeguridadModule } from './seguridad/seguridad.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validarEntorno }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST'),
        port: config.get<number>('DB_PORT'),
        username: config.get<string>('DB_USER'),
        password: config.get<string>('DB_PASSWORD'),
        database: config.get<string>('DB_NAME'),
        autoLoadEntities: true,
        // RNF-28: sincronización automática del esquema solo en desarrollo.
        synchronize: config.get<string>('NODE_ENV') === 'development',
        // RNF-20: hasta 10 reintentos con 3 segundos de intervalo.
        retryAttempts: 10,
        retryDelay: 3000,
      }),
    }),
    // RNF-04: máximo 100 peticiones por minuto por IP; el exceso responde HTTP 429.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    SeguridadModule,
    HorariosModule,
    EvaluacionModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
