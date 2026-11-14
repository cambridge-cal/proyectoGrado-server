import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { Equals, IsBoolean, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginacionDto } from '../../compartido/paginacion.js';
import { TipoAlerta } from '../entidades/alerta.entity.js';

export class PeriodoKddDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'periodoId debe ser un identificador válido.' })
  periodoId: string;
}

export class MisResultadosDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Si no se indica, se usa el período activo (RF-43).',
  })
  @IsOptional()
  @IsUUID('4', { message: 'periodoId debe ser un identificador válido.' })
  periodoId?: string;
}

export class FiltrosAlertasDto extends PaginacionDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  periodoId?: string;

  @ApiPropertyOptional({ enum: TipoAlerta })
  @IsOptional()
  @IsEnum(TipoAlerta)
  tipo?: TipoAlerta;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  leida?: boolean;
}

/** RF-44: una alerta solo se puede marcar como leída. */
export class MarcarAlertaDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  @Equals(true, { message: 'Solo se puede marcar la alerta como leída.' })
  leida: boolean;
}
