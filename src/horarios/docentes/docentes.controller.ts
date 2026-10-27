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
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
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
  ActualizarDocenteDto,
  CrearDocenteDto,
  DisponibilidadDto,
  FiltrosDocentesDto,
} from './docente.dto.js';
import { DocentesService } from './docentes.service.js';

/** Docentes (RF-15) y disponibilidades (RF-16). */
@ApiTags('Configuración académica')
@ApiBearerAuth()
@Roles(Rol.ADMIN)
@Controller('docentes')
export class DocentesController {
  constructor(private readonly docentes: DocentesService) {}

  // Rutas del propio docente: van antes de ':id' para que "yo" no se lea como un id.
  @Get('yo/disponibilidad')
  @Roles(Rol.DOCENTE)
  @ApiOperation({
    summary:
      'Franjas en las que el docente que inició sesión está disponible (RF-16)',
  })
  @ApiForbiddenResponse({
    description: 'La cuenta no tiene perfil de docente.',
  })
  async miDisponibilidad(@UsuarioActual() u: PayloadAccess) {
    return this.docentes.disponibilidad(
      await this.docentes.idDelUsuario(u.sub),
    );
  }

  @Put('yo/disponibilidad')
  @Roles(Rol.DOCENTE)
  @ApiOperation({
    summary: 'El docente registra sus propias franjas disponibles (RF-16)',
  })
  async actualizarMiDisponibilidad(
    @Body() datos: DisponibilidadDto,
    @UsuarioActual() u: PayloadAccess,
    @Req() r: Request,
  ) {
    const id = await this.docentes.idDelUsuario(u.sub);
    return this.docentes.reemplazarDisponibilidad(
      id,
      datos.franjaIds,
      actorDe(u, r),
    );
  }

  @Get()
  @ApiOperation({
    summary: 'Lista paginada de docentes con su carga y franjas disponibles',
  })
  listar(@Query() filtros: FiltrosDocentesDto) {
    return this.docentes.listar(filtros);
  }

  @Get(':id')
  obtener(@Param('id', ParseUUIDPipe) id: string) {
    return this.docentes.obtener(id);
  }

  @Post()
  @ApiOperation({
    summary:
      'Crea el perfil de docente de un usuario con rol DOCENTE (carga por defecto 40 h)',
  })
  crear(
    @Body() datos: CrearDocenteDto,
    @UsuarioActual() u: PayloadAccess,
    @Req() r: Request,
  ) {
    return this.docentes.crear(datos, actorDe(u, r));
  }

  @Patch(':id')
  actualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() datos: ActualizarDocenteDto,
    @UsuarioActual() u: PayloadAccess,
    @Req() r: Request,
  ) {
    return this.docentes.actualizar(id, datos, actorDe(u, r));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async eliminar(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioActual() u: PayloadAccess,
    @Req() r: Request,
  ) {
    await this.docentes.eliminar(id, actorDe(u, r));
  }

  @Get(':id/disponibilidad')
  @ApiOperation({
    summary: 'Franjas en las que el docente está disponible (RF-16)',
  })
  disponibilidad(@Param('id', ParseUUIDPipe) id: string) {
    return this.docentes.disponibilidad(id);
  }

  @Put(':id/disponibilidad')
  @ApiOperation({
    summary:
      'El Administrador reemplaza las franjas disponibles del docente (RF-16)',
  })
  actualizarDisponibilidad(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() datos: DisponibilidadDto,
    @UsuarioActual() u: PayloadAccess,
    @Req() r: Request,
  ) {
    return this.docentes.reemplazarDisponibilidad(
      id,
      datos.franjaIds,
      actorDe(u, r),
    );
  }
}
