import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginacionDto } from '../../compartido/paginacion.js';

const limpiar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CrearNivelDto {
  @ApiProperty({
    example: 'ING-A1',
    description: 'Único en todo el sistema (RF-10).',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z0-9-]{2,20}$/, {
    message: 'El código usa letras, números y guiones (2 a 20).',
  })
  codigo: string;

  @ApiProperty({ example: 'Inglés A1 - Principiante' })
  @Transform(limpiar)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  nombre: string;

  @ApiProperty({ example: 'Inglés' })
  @Transform(limpiar)
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  idioma: string;
}

export class ActualizarNivelDto extends PartialType(CrearNivelDto) {}

export class FiltrosNivelesDto extends PaginacionDto {
  @ApiPropertyOptional({ example: 'Inglés' })
  @IsOptional()
  @Transform(limpiar)
  @IsString()
  @MaxLength(40)
  idioma?: string;
}
