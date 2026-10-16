import { ApiProperty } from '@nestjs/swagger';
import { Rol } from '../../entidades/rol.enum.js';

export class UsuarioSesionDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  nombre: string;

  @ApiProperty()
  email: string;

  @ApiProperty({ enum: Rol, enumName: 'Rol' })
  rol: Rol;
}

/** Respuesta de POST /auth/login (RF-01, Figura 6.3). */
export class RespuestaSesionDto {
  @ApiProperty({
    description: 'JWT firmado con HMAC-SHA256, vigencia de 8 horas (RNF-06).',
  })
  accessToken: string;

  @ApiProperty({
    description:
      'Token de renovación, vigencia de 7 días. En la base solo se guarda su hash.',
  })
  refreshToken: string;

  @ApiProperty({ example: 'Bearer' })
  tipoToken: 'Bearer';

  @ApiProperty({
    example: 28800,
    description: 'Segundos de vigencia del Access Token.',
  })
  expiraEn: number;

  @ApiProperty({ type: UsuarioSesionDto })
  usuario: UsuarioSesionDto;
}
