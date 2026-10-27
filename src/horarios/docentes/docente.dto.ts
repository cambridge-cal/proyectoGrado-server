import {
  ApiProperty,
  ApiPropertyOptional,
  PartialType,
  PickType,
} from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginacionDto } from '../../compartido/paginacion.js';

const limpiar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Vincula el perfil de docente a un usuario existente con rol DOCENTE (RF-15). */
export class CrearDocenteDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Usuario con rol DOCENTE que todavía no tiene perfil.',
  })
  @IsUUID('4')
  usuarioId: string;

  @ApiProperty({ example: 'Inglés' })
  @Transform(limpiar)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  especialidad: string;

  @ApiPropertyOptional({
    default: 40,
    description: 'Horas por semana (RF-15).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  cargaMaximaSemanal?: number;
}

export class ActualizarDocenteDto extends PartialType(
  PickType(CrearDocenteDto, ['especialidad', 'cargaMaximaSemanal']),
) {}

export class FiltrosDocentesDto extends PaginacionDto {
  @ApiPropertyOptional({
    description: 'Busca en nombre, email o especialidad.',
  })
  @IsOptional()
  @Transform(limpiar)
  @IsString()
  @MaxLength(100)
  busqueda?: string;
}

/** Reemplaza todas las franjas disponibles del docente (RF-16). */
export class DisponibilidadDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  franjaIds: string[];
}

export class DocenteRespuestaDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) usuarioId: string;
  @ApiProperty() nombre: string;
  @ApiProperty() email: string;
  @ApiProperty() activo: boolean;
  @ApiProperty() especialidad: string;
  @ApiProperty() cargaMaximaSemanal: number;
  @ApiProperty({
    description: 'Cantidad de franjas en las que está disponible.',
  })
  franjasDisponibles: number;
}
