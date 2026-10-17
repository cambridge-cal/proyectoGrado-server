import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { Pagina } from '../../compartido/paginacion.js';
import type { PayloadAccess } from '../autenticacion/tokens.js';
import { Roles, UsuarioActual } from '../autorizacion/decoradores.js';
import { Rol } from '../entidades/rol.enum.js';
import {
  ActualizarUsuarioDto,
  CrearUsuarioDto,
  FiltrosUsuariosDto,
  PaginaUsuariosDto,
  ResultadoEliminacionDto,
  UsuarioRespuestaDto,
} from './dto/usuario.dto.js';
import { UsuariosService } from './usuarios.service.js';

/** Gestión de usuarios (RF-06). Solo el Administrador (RF-07). */
@ApiTags('Usuarios')
@ApiBearerAuth()
@ApiForbiddenResponse({
  description: 'El rol del usuario no es Administrador.',
})
@Roles(Rol.ADMIN)
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuarios: UsuariosService) {}

  @Get()
  @ApiOperation({ summary: 'Lista paginada de usuarios con filtros (RNF-29)' })
  @ApiOkResponse({ type: PaginaUsuariosDto })
  listar(
    @Query() filtros: FiltrosUsuariosDto,
  ): Promise<Pagina<UsuarioRespuestaDto>> {
    return this.usuarios.listar(filtros);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un usuario' })
  @ApiOkResponse({ type: UsuarioRespuestaDto })
  @ApiNotFoundResponse({ description: 'El usuario no existe.' })
  obtener(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<UsuarioRespuestaDto> {
    return this.usuarios.obtener(id);
  }

  @Post()
  @ApiOperation({
    summary: 'Crea un usuario y su perfil de docente o estudiante',
  })
  @ApiCreatedResponse({ type: UsuarioRespuestaDto })
  @ApiConflictResponse({
    description: 'Email o código de estudiante repetido.',
  })
  crear(
    @Body() datos: CrearUsuarioDto,
    @UsuarioActual() actor: PayloadAccess,
    @Req() peticion: Request,
  ): Promise<UsuarioRespuestaDto> {
    return this.usuarios.crear(datos, {
      id: actor.sub,
      ip: peticion.ip ?? null,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edita datos, contraseña o estado de un usuario' })
  @ApiOkResponse({ type: UsuarioRespuestaDto })
  @ApiBadRequestResponse({
    description: 'Datos inválidos o regla de negocio incumplida.',
  })
  @ApiConflictResponse({
    description: 'Email o código de estudiante repetido.',
  })
  actualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() datos: ActualizarUsuarioDto,
    @UsuarioActual() actor: PayloadAccess,
    @Req() peticion: Request,
  ): Promise<UsuarioRespuestaDto> {
    return this.usuarios.actualizar(id, datos, {
      id: actor.sub,
      ip: peticion.ip ?? null,
    });
  }

  @Delete(':id')
  @ApiOperation({
    summary:
      'Elimina un usuario o, si tiene historial, borra sus datos personales (RNF-32)',
  })
  @ApiOkResponse({ type: ResultadoEliminacionDto })
  eliminar(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioActual() actor: PayloadAccess,
    @Req() peticion: Request,
  ): Promise<ResultadoEliminacionDto> {
    return this.usuarios.eliminar(id, {
      id: actor.sub,
      ip: peticion.ip ?? null,
    });
  }
}
