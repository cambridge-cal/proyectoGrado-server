import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const limpiar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class RespuestaItemDto {
  @ApiProperty({ format: 'uuid', description: 'ID de la pregunta.' })
  @IsUUID('4')
  preguntaId: string;

  @ApiProperty({ example: 4, description: 'Valor de la escala 1-5 (RF-30).' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  valor: number;

  @ApiPropertyOptional({
    example: 'El docente maneja muy bien la metodología de enseñanza.',
    description: 'Comentario opcional, mínimo 30 caracteres (RF-35).',
  })
  @IsOptional()
  @Transform(limpiar)
  @IsString()
  @MinLength(30, { message: 'El comentario debe tener al menos 30 caracteres.' })
  comentario?: string;
}

export class EnviarRespuestasDto {
  @ApiProperty({ format: 'uuid', description: 'ID de la evaluación.' })
  @IsUUID('4')
  evaluacionId: string;

  @ApiProperty({ type: [RespuestaItemDto], description: 'Respuestas a cada pregunta.' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RespuestaItemDto)
  respuestas: RespuestaItemDto[];
}
