import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PaginacionDto } from '../../../compartido/paginacion.js';
import {
  MENSAJE_REGLA_CONTRASENA,
  REGLA_CONTRASENA,
} from '../../autenticacion/dto/recuperar-contrasena.dto.js';
import { Rol } from '../../entidades/rol.enum.js';

const limpiar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const limpiarEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/** Campos comunes de creación y edición (RF-06). */
class CamposUsuario {
  @ApiProperty({ example: 'María García' })
  @Transform(limpiar)
  @IsString()
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres.' })
  @MaxLength(120)
  nombre: string;

  @ApiProperty({ example: 'maria.garcia@cambridge.edu.co' })
  @Transform(limpiarEmail)
  @IsEmail({}, { message: 'El email no tiene un formato válido.' })
  @MaxLength(160)
  email: string;

  @ApiProperty({ format: 'password', minLength: 8, maxLength: 72 })
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  @MaxLength(72, { message: 'La contraseña no puede superar 72 caracteres.' })
  @Matches(REGLA_CONTRASENA, { message: MENSAJE_REGLA_CONTRASENA })
  contrasena: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class CrearUsuarioDto extends CamposUsuario {
  @ApiProperty({ enum: Rol, enumName: 'Rol' })
  @IsEnum(Rol, { message: 'El rol debe ser ADMIN, DOCENTE o ESTUDIANTE.' })
  rol: Rol;

  @ApiPropertyOptional({
    description: 'Obligatorio para ESTUDIANTE.',
    example: 'EST-2026-0042',
  })
  @ValidateIf(
    (o: CrearUsuarioDto) => o.rol === Rol.ESTUDIANTE || o.codigo !== undefined,
  )
  @Transform(limpiar)
  @IsString({ message: 'El código de estudiante es obligatorio.' })
  @MinLength(3)
  @MaxLength(30)
  codigo?: string;

  @ApiPropertyOptional({
    description: 'Obligatorio para DOCENTE.',
    example: 'Inglés',
  })
  @ValidateIf(
    (o: CrearUsuarioDto) =>
      o.rol === Rol.DOCENTE || o.especialidad !== undefined,
  )
  @Transform(limpiar)
  @IsString({ message: 'La especialidad del docente es obligatoria.' })
  @MinLength(2)
  @MaxLength(120)
  especialidad?: string;

  @ApiPropertyOptional({
    description: 'Solo DOCENTE. Horas por semana; 40 si no se envía (RF-15).',
    example: 20,
  })
  @ValidateIf((o: CrearUsuarioDto) => o.cargaMaximaSemanal !== undefined)
  @Type(() => Number)
  @IsInt({ message: 'La carga máxima semanal debe ser un número entero.' })
  @Min(1)
  @Max(60)
  cargaMaximaSemanal?: number;
}

/** Edición (RF-06). El rol no se cambia: para otro rol se crea otra cuenta. */
export class ActualizarUsuarioDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(limpiar)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nombre?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(limpiarEmail)
  @IsEmail({}, { message: 'El email no tiene un formato válido.' })
  @MaxLength(160)
  email?: string;

  @ApiPropertyOptional({
    format: 'password',
    description: 'Solo si se quiere cambiar.',
  })
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  @MaxLength(72)
  @Matches(REGLA_CONTRASENA, { message: MENSAJE_REGLA_CONTRASENA })
  contrasena?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(limpiar)
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  codigo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(limpiar)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  especialidad?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  cargaMaximaSemanal?: number;
}

/** Filtros del listado de usuarios (RNF-29). */
export class FiltrosUsuariosDto extends PaginacionDto {
  @ApiPropertyOptional({ enum: Rol, enumName: 'Rol' })
  @IsOptional()
  @IsEnum(Rol)
  rol?: Rol;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  activo?: boolean;

  @ApiPropertyOptional({
    description: 'Busca en nombre, email o código de estudiante.',
  })
  @IsOptional()
  @Transform(limpiar)
  @IsString()
  @MaxLength(100)
  busqueda?: string;
}

export class UsuarioRespuestaDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() nombre: string;
  @ApiProperty() email: string;
  @ApiProperty({ enum: Rol, enumName: 'Rol' }) rol: Rol;
  @ApiProperty() activo: boolean;
  @ApiPropertyOptional({ nullable: true }) codigo: string | null;
  @ApiPropertyOptional({ nullable: true }) especialidad: string | null;
  @ApiPropertyOptional({ nullable: true }) cargaMaximaSemanal: number | null;
}

export class PaginaUsuariosDto {
  @ApiProperty({ type: [UsuarioRespuestaDto] }) datos: UsuarioRespuestaDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() size: number;
}

export class ResultadoEliminacionDto {
  @ApiProperty({
    enum: ['ELIMINADO', 'ANONIMIZADO'],
    description:
      'ELIMINADO si la cuenta no tenía historial. ANONIMIZADO si tenía registros que deben conservarse (Audit Log, perfil académico): se borran sus datos personales y se desactiva (RNF-32, RNF-33).',
  })
  resultado: 'ELIMINADO' | 'ANONIMIZADO';
}
