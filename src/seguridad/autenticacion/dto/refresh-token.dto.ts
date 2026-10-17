import { ApiProperty } from '@nestjs/swagger';
import { IsJWT } from 'class-validator';

/** Cuerpo de POST /auth/refresh (RF-02) y POST /auth/logout (RF-03). */
export class RefreshTokenDto {
  @ApiProperty({
    description: 'Refresh Token entregado por /auth/login o /auth/refresh.',
  })
  @IsJWT({ message: 'El Refresh Token no tiene un formato válido.' })
  refreshToken: string;
}
