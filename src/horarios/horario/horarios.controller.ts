import { Body, Controller, Post, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { actorDe } from '../../compartido/actor.js';
import type { PayloadAccess } from '../../seguridad/autenticacion/tokens.js';
import {
  Roles,
  UsuarioActual,
} from '../../seguridad/autorizacion/decoradores.js';
import { Rol } from '../../seguridad/entidades/rol.enum.js';
import { GenerarHorarioDto } from './horario.dto.js';
import { HorariosService } from './horarios.service.js';

/** Horarios generados por el motor de IA (RF-17 a RF-24). */
@ApiTags('Horarios')
@ApiBearerAuth()
@Controller('horarios')
export class HorariosController {
  constructor(private readonly horarios: HorariosService) {}

  @Post('generar')
  @Roles(Rol.ADMIN)
  @ApiOperation({
    summary:
      'Genera un horario con el motor de IA (AG + Búsqueda Tabú) y lo valida con Gemini',
    description:
      'Usa el período activo si no se indica otro. Los tipos de aula excluidos no se usan en esta generación (RF-19). Si Gemini no está configurado, falla o rechaza la propuesta, el horario se guarda con validadoGemini = false (RNF-18).',
  })
  @ApiCreatedResponse({ description: 'Horario generado y guardado.' })
  @ApiUnprocessableEntityResponse({
    description:
      'Faltan datos para generar, o el motor no encontró un horario factible; incluye las restricciones no satisfechas.',
  })
  generar(
    @Body() dto: GenerarHorarioDto,
    @UsuarioActual() u: PayloadAccess,
    @Req() r: Request,
  ) {
    return this.horarios.generar(dto, actorDe(u, r));
  }
}
