import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { TipoAula } from '../entidades/enums.js';

/** Solicitud de generación (RF-17) con restricciones voluntarias (RF-19). */
export class GenerarHorarioDto {
  @ApiPropertyOptional({
    description: 'Período del horario. Si se omite, se usa el período activo.',
  })
  @IsOptional()
  @IsUUID()
  periodoId?: string;

  @ApiPropertyOptional({
    enum: TipoAula,
    isArray: true,
    description: 'Tipos de aula que no se usarán en esta generación (RF-19).',
    example: [TipoAula.VIRTUAL],
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(2, { message: 'Debe quedar al menos un tipo de aula.' })
  @IsEnum(TipoAula, { each: true })
  tiposAulaExcluidos?: TipoAula[];
}
