import { Controller, Get, Param, ParseUUIDPipe, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { actorDe } from '../../compartido/actor.js';
import type { PayloadAccess } from '../../seguridad/autenticacion/tokens.js';
import {
  Roles,
  UsuarioActual,
} from '../../seguridad/autorizacion/decoradores.js';
import { Rol } from '../../seguridad/entidades/index.js';
import { EvaluacionesEstudianteService } from './evaluaciones-estudiante.service.js';

/** Evaluaciones del estudiante autenticado (RF-33 a RF-36). */
@ApiTags('Evaluación')
@ApiBearerAuth()
@Roles(Rol.ESTUDIANTE)
@Controller('estudiantes/yo/evaluaciones')
export class EvaluacionesEstudianteController {
  constructor(private readonly servicio: EvaluacionesEstudianteService) {}

  @Get()
  @ApiOperation({
    summary:
      'Evaluaciones de los docentes que le dictan clase en el horario activo (RF-33)',
  })
  listar(@UsuarioActual() u: PayloadAccess, @Req() r: Request) {
    return this.servicio.listar(actorDe(u, r));
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Formulario de una evaluación con sus dimensiones y preguntas',
  })
  @ApiNotFoundResponse({
    description: 'No existe o no corresponde a sus docentes.',
  })
  obtener(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioActual() u: PayloadAccess,
    @Req() r: Request,
  ) {
    return this.servicio.obtener(actorDe(u, r), id);
  }
}
