import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

/** RF-26: el estudiante se une con el código de acceso del grupo. */
export class UnirseGrupoDto {
  @ApiProperty({ example: 'K7M2Q9XA' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Length(4, 12, {
    message: 'El código de acceso tiene entre 4 y 12 caracteres.',
  })
  codigoAcceso: string;
}

/** RF-27: la baja solo admite activo = false; la fila se conserva en el historial. */
export class BajaGrupoDto {
  @ApiProperty({ example: false })
  @IsBoolean()
  @Equals(false, { message: 'Solo se puede dar de baja (activo = false).' })
  activo: boolean;
}

export class FiltrosInscripcionesDto {
  @ApiPropertyOptional({
    type: Boolean,
    description: 'true incluye las bajas (historial completo).',
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  historial?: boolean;
}
