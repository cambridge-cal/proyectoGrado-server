import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AutenticacionService } from './autenticacion.service.js';
import { IniciarSesionDto } from './dto/iniciar-sesion.dto.js';
import { RespuestaSesionDto } from './dto/respuesta-sesion.dto.js';
import { JwtAuthGuard, type PeticionAutenticada } from './jwt-auth.guard.js';
import type { PayloadAccess } from './tokens.js';

@ApiTags('Autenticación')
@Controller('auth')
export class AutenticacionController {
  constructor(private readonly autenticacion: AutenticacionService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  // Más estricto que el límite global (RNF-04) para frenar ataques de fuerza bruta.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Inicia sesión con email y contraseña (RF-01)' })
  @ApiOkResponse({ type: RespuestaSesionDto })
  @ApiUnauthorizedResponse({
    description: 'Email o contraseña incorrectos, o cuenta inactiva.',
  })
  @ApiTooManyRequestsResponse({
    description: 'Más de 10 intentos por minuto desde la misma IP.',
  })
  iniciarSesion(
    @Body() datos: IniciarSesionDto,
    @Req() peticion: Request,
  ): Promise<RespuestaSesionDto> {
    return this.autenticacion.iniciarSesion(
      datos.email,
      datos.contrasena,
      peticion.ip ?? null,
    );
  }

  @Get('perfil')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Datos del usuario dueño del Access Token' })
  @ApiUnauthorizedResponse({
    description: 'Token ausente, inválido o expirado.',
  })
  perfil(@Req() peticion: PeticionAutenticada): PayloadAccess {
    const { sub, email, rol } = peticion.usuario;
    return { sub, email, rol };
  }
}
