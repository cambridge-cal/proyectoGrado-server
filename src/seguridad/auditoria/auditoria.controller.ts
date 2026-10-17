import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Pagina } from '../../compartido/paginacion.js';
import { Roles } from '../autorizacion/decoradores.js';
import { Rol } from '../entidades/rol.enum.js';
import { AuditoriaService } from './auditoria.service.js';
import {
  FiltrosAuditoriaDto,
  OpcionesAuditoriaDto,
  PaginaAuditoriaDto,
  RegistroAuditoriaDto,
} from './dto/auditoria.dto.js';

/**
 * Consulta del registro de auditoría (RF-08). Solo el Administrador.
 * Solo lectura: no hay rutas para modificar ni eliminar registros (RNF-11).
 */
@ApiTags('Auditoría')
@ApiBearerAuth()
@ApiForbiddenResponse({
  description: 'El rol del usuario no es Administrador.',
})
@Roles(Rol.ADMIN)
@Controller('audit-log')
export class AuditoriaController {
  constructor(private readonly auditoria: AuditoriaService) {}

  @Get()
  @ApiOperation({
    summary:
      'Historial paginado con filtros por módulo, acción, usuario y fechas',
  })
  @ApiOkResponse({ type: PaginaAuditoriaDto })
  listar(
    @Query() filtros: FiltrosAuditoriaDto,
  ): Promise<Pagina<RegistroAuditoriaDto>> {
    return this.auditoria.listar(filtros);
  }

  @Get('opciones')
  @ApiOperation({ summary: 'Módulos y acciones disponibles para filtrar' })
  @ApiOkResponse({ type: OpcionesAuditoriaDto })
  opciones(): Promise<OpcionesAuditoriaDto> {
    return this.auditoria.opciones();
  }
}
