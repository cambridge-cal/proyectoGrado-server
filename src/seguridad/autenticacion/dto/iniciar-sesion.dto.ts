import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Cuerpo de POST /auth/login (RF-01). */
export class IniciarSesionDto {
  @ApiProperty({ example: 'admin@cambridge.edu.co' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'El email no tiene un formato válido.' })
  @MaxLength(160)
  email: string;

  @ApiProperty({ example: 'Contraseña de la cuenta', format: 'password' })
  @IsString()
  @IsNotEmpty({ message: 'La contraseña es obligatoria.' })
  // bcrypt solo considera los primeros 72 bytes.
  @MaxLength(72, { message: 'La contraseña no puede superar 72 caracteres.' })
  contrasena: string;
}
