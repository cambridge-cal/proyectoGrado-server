import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
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
import { Rol } from '../../seguridad/entidades/rol.enum.js';
import {
  ActualizarNivelDto,
  CrearNivelDto,
  FiltrosNivelesDto,
} from './nivel.dto.js';
import { NivelesService } from './niveles.service.js';

/** Niveles de idioma (RF-10). Solo el Administrador. */
@ApiTags('Configuración académica')
@ApiBearerAuth()
@Roles(Rol.ADMIN)
@Controller('niveles')
export class NivelesController {
  constructor(private readonly servicio: NivelesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista paginada de niveles de idioma' })
  listar(@Query() filtros: FiltrosNivelesDto) {
    return this.servicio.listar(filtros);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consulta un nivel de idioma por su identificador' })
  obtener(@Param('id', ParseUUIDPipe) id: string) {
    return this.servicio.obtener(id);
  }

  @Post()
  @ApiOperation({ summary: 'Crea un nivel de idioma' })
  @ApiConflictResponse({ description: 'Dato único repetido.' })
  crear(
    @Body() datos: CrearNivelDto,
    @UsuarioActual() u: PayloadAccess,
    @Req() r: Request,
  ) {
    return this.servicio.crear(datos, actorDe(u, r));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualiza un nivel de idioma' })
  actualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() datos: ActualizarNivelDto,
    @UsuarioActual() u: PayloadAccess,
    @Req() r: Request,
  ) {
    return this.servicio.actualizar(id, datos, actorDe(u, r));
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Elimina un nivel de idioma' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiConflictResponse({ description: 'El nivel está en uso.' })
  async eliminar(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioActual() u: PayloadAccess,
    @Req() r: Request,
  ) {
    await this.servicio.eliminar(id, actorDe(u, r));
  }
}
