import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../seguridad/autorizacion/decoradores.js';
import { Rol } from '../../seguridad/entidades/rol.enum.js';
import { EnviarRespuestasDto } from './respuesta.dto.js';
import { RespuestasService } from './respuestas.service.js';

/** Envío anónimo de respuestas de evaluación (RF-34, RNF-10). */
@ApiTags('Evaluación')
@ApiBearerAuth()
@Roles(Rol.ESTUDIANTE)
@Controller('respuestas')
export class RespuestasController {
  constructor(private readonly servicio: RespuestasService) {}

  @Post()
  @ApiOperation({ summary: 'Enviar respuestas anónimas a una evaluación (RF-34)' })
  enviar(@Body() datos: EnviarRespuestasDto) {
    return this.servicio.enviar(datos);
  }
}
