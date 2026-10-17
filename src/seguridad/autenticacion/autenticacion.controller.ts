import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AutenticacionService } from './autenticacion.service.js';
import { RecuperacionService } from './recuperacion.service.js';
import { IniciarSesionDto } from './dto/iniciar-sesion.dto.js';
import {
  RecuperarContrasenaDto,
  RestablecerContrasenaDto,
} from './dto/recuperar-contrasena.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { RespuestaSesionDto } from './dto/respuesta-sesion.dto.js';
import { Publico } from '../autorizacion/decoradores.js';
import { type PeticionAutenticada } from './jwt-auth.guard.js';
import type { PayloadAccess } from './tokens.js';

@ApiTags('Autenticación')
@Controller('auth')
export class AutenticacionController {
  constructor(
    private readonly autenticacion: AutenticacionService,
    private readonly recuperacion: RecuperacionService,
  ) {}

  @Publico()
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

  @Publico()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Renueva el Access Token con un Refresh Token válido (RF-02)',
    description:
      'El Refresh Token usado queda invalidado y la respuesta trae uno nuevo.',
  })
  @ApiOkResponse({ type: RespuestaSesionDto })
  @ApiUnauthorizedResponse({
    description: 'Refresh Token inválido, vencido o ya usado.',
  })
  renovar(
    @Body() datos: RefreshTokenDto,
    @Req() peticion: Request,
  ): Promise<RespuestaSesionDto> {
    return this.autenticacion.renovar(datos.refreshToken, peticion.ip ?? null);
  }

  @Publico()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Cierra la sesión e invalida el Refresh Token (RF-03)',
  })
  @ApiNoContentResponse({ description: 'Sesión cerrada.' })
  async cerrarSesion(
    @Body() datos: RefreshTokenDto,
    @Req() peticion: Request,
  ): Promise<void> {
    await this.autenticacion.cerrarSesion(
      datos.refreshToken,
      peticion.ip ?? null,
    );
  }

  @Publico()
  @Post('recuperar-contrasena')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Envía al correo un enlace para restablecer la contraseña (RF-04)',
    description:
      'Responde lo mismo exista o no la cuenta. El enlace vence en 30 minutos.',
  })
  @ApiOkResponse({ description: 'Mensaje genérico de confirmación.' })
  recuperarContrasena(
    @Body() datos: RecuperarContrasenaDto,
    @Req() peticion: Request,
  ): Promise<{ mensaje: string }> {
    return this.recuperacion.solicitar(datos.email, peticion.ip ?? null);
  }

  @Publico()
  @Post('restablecer-contrasena')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Define una contraseña nueva con el token del correo (RF-05)',
  })
  @ApiOkResponse({ description: 'Contraseña actualizada.' })
  @ApiBadRequestResponse({
    description:
      'Token inválido, vencido o ya usado, o contraseña que no cumple las reglas.',
  })
  restablecerContrasena(
    @Body() datos: RestablecerContrasenaDto,
    @Req() peticion: Request,
  ): Promise<{ mensaje: string }> {
    return this.recuperacion.restablecer(
      datos.token,
      datos.nuevaContrasena,
      peticion.ip ?? null,
    );
  }

  @Get('perfil')
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
