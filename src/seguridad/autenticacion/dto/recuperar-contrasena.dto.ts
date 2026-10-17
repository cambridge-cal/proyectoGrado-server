import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsJWT,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Cuerpo de POST /auth/recuperar-contrasena (RF-04). */
export class RecuperarContrasenaDto {
  @ApiProperty({ example: 'docente@cambridge.edu.co' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'El email no tiene un formato válido.' })
  @MaxLength(160)
  email: string;
}

/** Reglas de contraseña nueva: 8 a 72 caracteres con al menos una letra y un número. */
export const REGLA_CONTRASENA = /^(?=.*[A-Za-zÁÉÍÓÚÑáéíóúñ])(?=.*\d).+$/;
export const MENSAJE_REGLA_CONTRASENA =
  'La contraseña debe tener al menos una letra y un número.';

/** Cuerpo de POST /auth/restablecer-contrasena (RF-05). */
export class RestablecerContrasenaDto {
  @ApiProperty({ description: 'Token recibido en el enlace del correo.' })
  @IsJWT({ message: 'El enlace de restablecimiento no es válido.' })
  token: string;

  @ApiProperty({ format: 'password', minLength: 8, maxLength: 72 })
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  @MaxLength(72, { message: 'La contraseña no puede superar 72 caracteres.' })
  @Matches(REGLA_CONTRASENA, { message: MENSAJE_REGLA_CONTRASENA })
  nuevaContrasena: string;
}
