import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
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
import { ResponderEvaluacionDto } from './respuesta.dto.js';
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

  @Post(':id/respuestas')
  @ApiOperation({
    summary:
      'Envía las respuestas y el comentario anónimo, y marca la evaluación como completada (RF-34 a RF-36)',
  })
  @ApiConflictResponse({
    description: 'Ya la respondió o la evaluación ya no recibe respuestas.',
  })
  responder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResponderEvaluacionDto,
    @UsuarioActual() u: PayloadAccess,
    @Req() r: Request,
  ) {
    return this.servicio.responder(actorDe(u, r), id, dto);
  }
}
