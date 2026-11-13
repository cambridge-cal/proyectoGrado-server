import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeguridadModule } from '../seguridad/seguridad.module.js';
import { ENTIDADES_EVALUACION } from './entidades/index.js';
import { EvaluacionesEstudianteController } from './estudiante/evaluaciones-estudiante.controller.js';
import { EvaluacionesEstudianteService } from './estudiante/evaluaciones-estudiante.service.js';
import { EvaluacionesController } from './evaluaciones/evaluaciones.controller.js';
import { EvaluacionesService } from './evaluaciones/evaluaciones.service.js';
import { FormulariosController } from './formularios/formularios.controller.js';
import { FormulariosService } from './formularios/formularios.service.js';

/** Módulo de Evaluación: Formularios, evaluaciones anónimas, pipeline KDD y alertas (RF-28 a RF-44). */
@Module({
  imports: [TypeOrmModule.forFeature(ENTIDADES_EVALUACION), SeguridadModule],
  controllers: [
    FormulariosController,
    EvaluacionesController,
    EvaluacionesEstudianteController,
  ],
  providers: [
    FormulariosService,
    EvaluacionesService,
    EvaluacionesEstudianteService,
  ],
  exports: [FormulariosService, EvaluacionesService],
})
export class EvaluacionModule {}
