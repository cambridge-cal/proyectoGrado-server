import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Publico } from './seguridad/autorizacion/decoradores.js';

@Publico()
@ApiTags('Sistema')
@Controller('salud')
export class AppController {
  @Get()
  @ApiOkResponse({ description: 'El servidor está en funcionamiento.' })
  verificarSalud(): { estado: string } {
    return { estado: 'ok' };
  }
}
