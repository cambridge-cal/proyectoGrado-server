import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Esquema completo del Sistema CAL (Figuras 6.8 a 6.10), generado a partir de las entidades. */
export class Inicial1794861475363 implements MigrationInterface {
  name = 'Inicial1794861475363';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Los identificadores usan uuid_generate_v4().
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`
            CREATE TYPE "public"."tipo_alerta" AS ENUM('CRITICO', 'ADVERTENCIA', 'INFO')
        `);
    await queryRunner.query(`
            CREATE TABLE "alerta" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "tipo" "public"."tipo_alerta" NOT NULL,
                "mensaje" character varying(300) NOT NULL,
                "leida" boolean NOT NULL DEFAULT false,
                "creada_en" TIMESTAMP NOT NULL DEFAULT now(),
                "docente_id" uuid NOT NULL,
                "periodo_academico_id" uuid NOT NULL,
                "resultado_kdd_id" uuid,
                CONSTRAINT "PK_e60bfc27e2ae1b6bbdca11ac524" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_0ac9e28cdf136f7d24c9453ae2" ON "alerta" ("periodo_academico_id", "leida")
        `);
    await queryRunner.query(`
            CREATE TABLE "dimension" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "nombre" character varying(120) NOT NULL,
                "orden" integer NOT NULL,
                "peso" integer NOT NULL DEFAULT '0',
                "formulario_id" uuid NOT NULL,
                CONSTRAINT "CHK_237ff8e919476388c14651f5d7" CHECK (orden > 0),
                CONSTRAINT "PK_653e621826a32965348bd4faff4" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_cd6d10093a6555409e770d2b1e" ON "dimension" ("formulario_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "docente" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "especialidad" character varying(120) NOT NULL,
                "carga_maxima_semanal" integer NOT NULL DEFAULT '40',
                "usuario_id" uuid NOT NULL,
                CONSTRAINT "REL_08c9b5035edf75a6e788f25ce9" UNIQUE ("usuario_id"),
                CONSTRAINT "CHK_95a9010c175112e9f12dd9722a" CHECK (carga_maxima_semanal > 0),
                CONSTRAINT "PK_badad2b3623effea5d5d5b244c4" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."estado_evaluacion" AS ENUM(
                'PENDIENTE',
                'EN_PROGRESO',
                'COMPLETADA',
                'ANALIZADA',
                'ALERTA',
                'CERRADA',
                'ARCHIVADA'
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "evaluacion" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "estado" "public"."estado_evaluacion" NOT NULL DEFAULT 'PENDIENTE',
                "estudiantes_completaron" uuid array NOT NULL DEFAULT '{}',
                "comentarios_anonimos" text array NOT NULL DEFAULT '{}',
                "creado_en" TIMESTAMP NOT NULL DEFAULT now(),
                "formulario_id" uuid NOT NULL,
                "docente_id" uuid NOT NULL,
                CONSTRAINT "UQ_evaluacion_formulario_docente" UNIQUE ("formulario_id", "docente_id"),
                CONSTRAINT "PK_7dfbeff9d39651e98d382682f5e" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_d9d40e3455883347a35464c30c" ON "evaluacion" ("formulario_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_ae062fa8f843b500527a09e563" ON "evaluacion" ("docente_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "periodo_academico" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "nombre" character varying(80) NOT NULL,
                "fecha_inicio" date NOT NULL,
                "fecha_fin" date NOT NULL,
                "activo" boolean NOT NULL DEFAULT false,
                CONSTRAINT "UQ_a74c14868d00fd2c3b45e307c77" UNIQUE ("nombre"),
                CONSTRAINT "CHK_2fe253fbf0028b35d2964b9c06" CHECK (fecha_fin > fecha_inicio),
                CONSTRAINT "PK_03dfbed29918daed662c13d3946" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_periodo_academico_activo" ON "periodo_academico" ("activo")
            WHERE activo = true
        `);
    await queryRunner.query(`
            CREATE TABLE "formulario" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "nombre" character varying(160) NOT NULL,
                "activo" boolean NOT NULL DEFAULT true,
                "creado_en" TIMESTAMP NOT NULL DEFAULT now(),
                "periodo_academico_id" uuid NOT NULL,
                CONSTRAINT "PK_df4c9b155eb3a62815065cec3f9" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_483fff69e1864729ecaeaa279a" ON "formulario" ("periodo_academico_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "pregunta" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "texto" character varying(500) NOT NULL,
                "orden" integer NOT NULL,
                "dimension_id" uuid NOT NULL,
                CONSTRAINT "CHK_95831d31c783b262b9ba1fc878" CHECK (orden > 0),
                CONSTRAINT "PK_90682da4e7c7f84a4ed457589fb" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_6bb9182b663a382c6b922fe0c7" ON "pregunta" ("dimension_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "respuesta" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "valor_numerico" smallint NOT NULL,
                "evaluacion_id" uuid NOT NULL,
                "pregunta_id" uuid NOT NULL,
                CONSTRAINT "CHK_16cb9d665e50ca43fb22d81d8f" CHECK (
                    valor_numerico BETWEEN 1 AND 5
                ),
                CONSTRAINT "PK_2a9e51ddae583327feab154f3f1" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_d26852f31546147734e3307267" ON "respuesta" ("evaluacion_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_8bf15f198bc42bc6214e656473" ON "respuesta" ("pregunta_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "resultado_kdd" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "puntaje_global" double precision NOT NULL,
                "puntajes_por_dimension" jsonb NOT NULL,
                "participantes" integer NOT NULL,
                "elegibles" integer NOT NULL,
                "parcial" boolean NOT NULL DEFAULT false,
                "calculado_en" TIMESTAMP WITH TIME ZONE NOT NULL,
                "evaluacion_id" uuid NOT NULL,
                CONSTRAINT "REL_dc5afa47c92eb1bacb40d5d082" UNIQUE ("evaluacion_id"),
                CONSTRAINT "PK_9b422ffe9c21c88e1410ecc8ed0" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."tipo_aula" AS ENUM('SALON', 'LAB', 'VIRTUAL')
        `);
    await queryRunner.query(`
            CREATE TABLE "aula" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "codigo" character varying(30) NOT NULL,
                "capacidad" integer NOT NULL,
                "tipo" "public"."tipo_aula" NOT NULL,
                "activa" boolean NOT NULL DEFAULT true,
                CONSTRAINT "UQ_2e7307c63ef2d60f8753772c890" UNIQUE ("codigo"),
                CONSTRAINT "CHK_09bde6e500b10944ba3dfa1276" CHECK (capacidad > 0),
                CONSTRAINT "PK_f4b5d2e277c6146e2572c6ee76a" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "curso" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "nombre" character varying(120) NOT NULL,
                "intensidad_horaria" integer NOT NULL,
                "nivel_idioma_id" uuid NOT NULL,
                CONSTRAINT "CHK_8fcb1e7af97a7754f6e2822beb" CHECK (intensidad_horaria > 0),
                CONSTRAINT "PK_76073a915621326fb85f28ecc5d" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_7924834091d860d924fd3fe45a" ON "curso" ("nivel_idioma_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "disponibilidad" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "docente_id" uuid NOT NULL,
                "franja_horaria_id" uuid NOT NULL,
                CONSTRAINT "UQ_disponibilidad_docente_franja" UNIQUE ("docente_id", "franja_horaria_id"),
                CONSTRAINT "PK_cf70782622171aeff5a7825726a" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_0d2dcb32a12501dabbffc73191" ON "disponibilidad" ("docente_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "estudiante_grupo" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "activo" boolean NOT NULL DEFAULT true,
                "fecha_inscripcion" date NOT NULL DEFAULT ('now'::text)::date,
                "fecha_baja" date,
                "estudiante_id" uuid NOT NULL,
                "grupo_id" uuid NOT NULL,
                CONSTRAINT "PK_53984efaac60633ee9d1abdc957" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_c465a8a732a88bfe1cb6f4120c" ON "estudiante_grupo" ("estudiante_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_ea89b8e57a66648d68282b7af0" ON "estudiante_grupo" ("grupo_id")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_estudiante_grupo_activo" ON "estudiante_grupo" ("estudiante_id", "grupo_id")
            WHERE activo = true
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."dia_semana" AS ENUM('LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB')
        `);
    await queryRunner.query(`
            CREATE TABLE "franja_horaria" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "dia_semana" "public"."dia_semana" NOT NULL,
                "hora_inicio" TIME NOT NULL,
                "hora_fin" TIME NOT NULL,
                "bloque" integer NOT NULL,
                CONSTRAINT "UQ_franja_dia_bloque" UNIQUE ("dia_semana", "bloque"),
                CONSTRAINT "CHK_fb1477cb575590d5ae45cb4577" CHECK (bloque > 0),
                CONSTRAINT "CHK_76e3cd1eaec5970294260b2d94" CHECK (hora_fin > hora_inicio),
                CONSTRAINT "PK_4ae58a48f3049eb2322df9f7097" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."jornada_grupo" AS ENUM('MAÑANA', 'TARDE', 'NOCHE')
        `);
    await queryRunner.query(`
            CREATE TABLE "grupo" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "codigo" character varying(30) NOT NULL,
                "cupo_maximo" integer NOT NULL,
                "jornada" "public"."jornada_grupo" NOT NULL,
                "codigo_acceso" character varying(12) NOT NULL,
                "curso_id" uuid NOT NULL,
                CONSTRAINT "UQ_1bd5435d17bc8397afc836010c7" UNIQUE ("codigo"),
                CONSTRAINT "UQ_68f812d22fb38c6e1e09623f512" UNIQUE ("codigo_acceso"),
                CONSTRAINT "CHK_7a5cfe28001ff9f651111aa837" CHECK (cupo_maximo > 0),
                CONSTRAINT "PK_dc8777104b615fea76db518334f" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_649630a8ea21aa1924d0c42dfc" ON "grupo" ("curso_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "horario" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "asignaciones" jsonb NOT NULL,
                "fitness" double precision NOT NULL,
                "generaciones" integer NOT NULL,
                "tiempo_ejecucion_ms" integer NOT NULL,
                "intentos" integer NOT NULL DEFAULT '1',
                "validado_gemini" boolean NOT NULL DEFAULT false,
                "validacion" jsonb NOT NULL,
                "tipos_aula_excluidos" text array NOT NULL DEFAULT '{}',
                "archivado" boolean NOT NULL DEFAULT false,
                "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "periodo_academico_id" uuid NOT NULL,
                CONSTRAINT "PK_3c89ff4250bf835ce1f861313c7" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_e9702c2b848790d57a779aecf7" ON "horario" ("periodo_academico_id", "archivado")
        `);
    await queryRunner.query(`
            CREATE TABLE "nivel_idioma" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "codigo" character varying(20) NOT NULL,
                "nombre" character varying(80) NOT NULL,
                "idioma" character varying(40) NOT NULL,
                CONSTRAINT "UQ_143470c4a453834ec2864ee1034" UNIQUE ("codigo"),
                CONSTRAINT "PK_28b975d7bf665a9c1a98188cb14" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "audit_log" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "modulo" character varying(40) NOT NULL,
                "accion" character varying(60) NOT NULL,
                "detalle" text,
                "ip" character varying(45),
                "fecha_hora" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "usuario_id" uuid NOT NULL,
                CONSTRAINT "PK_07fefa57f7f5ab8fc3f52b3ed0b" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_745b5d166e855fee53398be201" ON "audit_log" ("usuario_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_8c73b811db490104a8f37da676" ON "audit_log" ("fecha_hora")
        `);
    await queryRunner.query(`
            CREATE TABLE "estudiante" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "codigo" character varying(30) NOT NULL,
                "usuario_id" uuid NOT NULL,
                CONSTRAINT "UQ_13ef92e00f9bc471b927c431231" UNIQUE ("codigo"),
                CONSTRAINT "REL_8e18a9cefbd560324d29285640" UNIQUE ("usuario_id"),
                CONSTRAINT "PK_c7507c4641e36b102952aefc33b" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "sesion" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "refresh_token_hash" character varying(72) NOT NULL,
                "creada_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "expira_en" TIMESTAMP WITH TIME ZONE NOT NULL,
                "usuario_id" uuid NOT NULL,
                CONSTRAINT "PK_387b737518873760846bfd886f7" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_393c4bb28097127f5d2f60b78b" ON "sesion" ("usuario_id")
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."rol_usuario" AS ENUM('ADMIN', 'DOCENTE', 'ESTUDIANTE')
        `);
    await queryRunner.query(`
            CREATE TABLE "usuario" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "nombre" character varying(120) NOT NULL,
                "email" character varying(160) NOT NULL,
                "contrasena_hash" character varying(72) NOT NULL,
                "rol" "public"."rol_usuario" NOT NULL,
                "activo" boolean NOT NULL DEFAULT true,
                CONSTRAINT "UQ_2863682842e688ca198eb25c124" UNIQUE ("email"),
                CONSTRAINT "PK_a56c58e5cabaa04fb2c98d2d7e2" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            ALTER TABLE "alerta"
            ADD CONSTRAINT "FK_5644cdc4ed69fae839431752cc1" FOREIGN KEY ("docente_id") REFERENCES "docente"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "alerta"
            ADD CONSTRAINT "FK_5cb3d362c4c61745ea1c0dc9464" FOREIGN KEY ("periodo_academico_id") REFERENCES "periodo_academico"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "alerta"
            ADD CONSTRAINT "FK_bdafa765ab1a42f499a8b215eba" FOREIGN KEY ("resultado_kdd_id") REFERENCES "resultado_kdd"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "dimension"
            ADD CONSTRAINT "FK_cd6d10093a6555409e770d2b1ec" FOREIGN KEY ("formulario_id") REFERENCES "formulario"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "docente"
            ADD CONSTRAINT "FK_08c9b5035edf75a6e788f25ce9a" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "evaluacion"
            ADD CONSTRAINT "FK_d9d40e3455883347a35464c30c2" FOREIGN KEY ("formulario_id") REFERENCES "formulario"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "evaluacion"
            ADD CONSTRAINT "FK_ae062fa8f843b500527a09e5637" FOREIGN KEY ("docente_id") REFERENCES "docente"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "formulario"
            ADD CONSTRAINT "FK_483fff69e1864729ecaeaa279a7" FOREIGN KEY ("periodo_academico_id") REFERENCES "periodo_academico"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "pregunta"
            ADD CONSTRAINT "FK_6bb9182b663a382c6b922fe0c70" FOREIGN KEY ("dimension_id") REFERENCES "dimension"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "respuesta"
            ADD CONSTRAINT "FK_d26852f31546147734e33072676" FOREIGN KEY ("evaluacion_id") REFERENCES "evaluacion"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "respuesta"
            ADD CONSTRAINT "FK_8bf15f198bc42bc6214e6564732" FOREIGN KEY ("pregunta_id") REFERENCES "pregunta"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "resultado_kdd"
            ADD CONSTRAINT "FK_dc5afa47c92eb1bacb40d5d0828" FOREIGN KEY ("evaluacion_id") REFERENCES "evaluacion"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "curso"
            ADD CONSTRAINT "FK_7924834091d860d924fd3fe45a6" FOREIGN KEY ("nivel_idioma_id") REFERENCES "nivel_idioma"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "disponibilidad"
            ADD CONSTRAINT "FK_0d2dcb32a12501dabbffc731915" FOREIGN KEY ("docente_id") REFERENCES "docente"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "disponibilidad"
            ADD CONSTRAINT "FK_be8c0fcd6d3914735051178543d" FOREIGN KEY ("franja_horaria_id") REFERENCES "franja_horaria"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "estudiante_grupo"
            ADD CONSTRAINT "FK_c465a8a732a88bfe1cb6f4120c8" FOREIGN KEY ("estudiante_id") REFERENCES "estudiante"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "estudiante_grupo"
            ADD CONSTRAINT "FK_ea89b8e57a66648d68282b7af0f" FOREIGN KEY ("grupo_id") REFERENCES "grupo"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "grupo"
            ADD CONSTRAINT "FK_649630a8ea21aa1924d0c42dfc0" FOREIGN KEY ("curso_id") REFERENCES "curso"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "horario"
            ADD CONSTRAINT "FK_f61475f6711dc82afdfb24c2faf" FOREIGN KEY ("periodo_academico_id") REFERENCES "periodo_academico"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "audit_log"
            ADD CONSTRAINT "FK_745b5d166e855fee53398be201b" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "estudiante"
            ADD CONSTRAINT "FK_8e18a9cefbd560324d292856406" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "sesion"
            ADD CONSTRAINT "FK_393c4bb28097127f5d2f60b78b6" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "sesion" DROP CONSTRAINT "FK_393c4bb28097127f5d2f60b78b6"
        `);
    await queryRunner.query(`
            ALTER TABLE "estudiante" DROP CONSTRAINT "FK_8e18a9cefbd560324d292856406"
        `);
    await queryRunner.query(`
            ALTER TABLE "audit_log" DROP CONSTRAINT "FK_745b5d166e855fee53398be201b"
        `);
    await queryRunner.query(`
            ALTER TABLE "horario" DROP CONSTRAINT "FK_f61475f6711dc82afdfb24c2faf"
        `);
    await queryRunner.query(`
            ALTER TABLE "grupo" DROP CONSTRAINT "FK_649630a8ea21aa1924d0c42dfc0"
        `);
    await queryRunner.query(`
            ALTER TABLE "estudiante_grupo" DROP CONSTRAINT "FK_ea89b8e57a66648d68282b7af0f"
        `);
    await queryRunner.query(`
            ALTER TABLE "estudiante_grupo" DROP CONSTRAINT "FK_c465a8a732a88bfe1cb6f4120c8"
        `);
    await queryRunner.query(`
            ALTER TABLE "disponibilidad" DROP CONSTRAINT "FK_be8c0fcd6d3914735051178543d"
        `);
    await queryRunner.query(`
            ALTER TABLE "disponibilidad" DROP CONSTRAINT "FK_0d2dcb32a12501dabbffc731915"
        `);
    await queryRunner.query(`
            ALTER TABLE "curso" DROP CONSTRAINT "FK_7924834091d860d924fd3fe45a6"
        `);
    await queryRunner.query(`
            ALTER TABLE "resultado_kdd" DROP CONSTRAINT "FK_dc5afa47c92eb1bacb40d5d0828"
        `);
    await queryRunner.query(`
            ALTER TABLE "respuesta" DROP CONSTRAINT "FK_8bf15f198bc42bc6214e6564732"
        `);
    await queryRunner.query(`
            ALTER TABLE "respuesta" DROP CONSTRAINT "FK_d26852f31546147734e33072676"
        `);
    await queryRunner.query(`
            ALTER TABLE "pregunta" DROP CONSTRAINT "FK_6bb9182b663a382c6b922fe0c70"
        `);
    await queryRunner.query(`
            ALTER TABLE "formulario" DROP CONSTRAINT "FK_483fff69e1864729ecaeaa279a7"
        `);
    await queryRunner.query(`
            ALTER TABLE "evaluacion" DROP CONSTRAINT "FK_ae062fa8f843b500527a09e5637"
        `);
    await queryRunner.query(`
            ALTER TABLE "evaluacion" DROP CONSTRAINT "FK_d9d40e3455883347a35464c30c2"
        `);
    await queryRunner.query(`
            ALTER TABLE "docente" DROP CONSTRAINT "FK_08c9b5035edf75a6e788f25ce9a"
        `);
    await queryRunner.query(`
            ALTER TABLE "dimension" DROP CONSTRAINT "FK_cd6d10093a6555409e770d2b1ec"
        `);
    await queryRunner.query(`
            ALTER TABLE "alerta" DROP CONSTRAINT "FK_bdafa765ab1a42f499a8b215eba"
        `);
    await queryRunner.query(`
            ALTER TABLE "alerta" DROP CONSTRAINT "FK_5cb3d362c4c61745ea1c0dc9464"
        `);
    await queryRunner.query(`
            ALTER TABLE "alerta" DROP CONSTRAINT "FK_5644cdc4ed69fae839431752cc1"
        `);
    await queryRunner.query(`
            DROP TABLE "usuario"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."rol_usuario"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_393c4bb28097127f5d2f60b78b"
        `);
    await queryRunner.query(`
            DROP TABLE "sesion"
        `);
    await queryRunner.query(`
            DROP TABLE "estudiante"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_8c73b811db490104a8f37da676"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_745b5d166e855fee53398be201"
        `);
    await queryRunner.query(`
            DROP TABLE "audit_log"
        `);
    await queryRunner.query(`
            DROP TABLE "nivel_idioma"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_e9702c2b848790d57a779aecf7"
        `);
    await queryRunner.query(`
            DROP TABLE "horario"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_649630a8ea21aa1924d0c42dfc"
        `);
    await queryRunner.query(`
            DROP TABLE "grupo"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."jornada_grupo"
        `);
    await queryRunner.query(`
            DROP TABLE "franja_horaria"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."dia_semana"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."UQ_estudiante_grupo_activo"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_ea89b8e57a66648d68282b7af0"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_c465a8a732a88bfe1cb6f4120c"
        `);
    await queryRunner.query(`
            DROP TABLE "estudiante_grupo"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_0d2dcb32a12501dabbffc73191"
        `);
    await queryRunner.query(`
            DROP TABLE "disponibilidad"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_7924834091d860d924fd3fe45a"
        `);
    await queryRunner.query(`
            DROP TABLE "curso"
        `);
    await queryRunner.query(`
            DROP TABLE "aula"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."tipo_aula"
        `);
    await queryRunner.query(`
            DROP TABLE "resultado_kdd"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_8bf15f198bc42bc6214e656473"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_d26852f31546147734e3307267"
        `);
    await queryRunner.query(`
            DROP TABLE "respuesta"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_6bb9182b663a382c6b922fe0c7"
        `);
    await queryRunner.query(`
            DROP TABLE "pregunta"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_483fff69e1864729ecaeaa279a"
        `);
    await queryRunner.query(`
            DROP TABLE "formulario"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."UQ_periodo_academico_activo"
        `);
    await queryRunner.query(`
            DROP TABLE "periodo_academico"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_ae062fa8f843b500527a09e563"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_d9d40e3455883347a35464c30c"
        `);
    await queryRunner.query(`
            DROP TABLE "evaluacion"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."estado_evaluacion"
        `);
    await queryRunner.query(`
            DROP TABLE "docente"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_cd6d10093a6555409e770d2b1e"
        `);
    await queryRunner.query(`
            DROP TABLE "dimension"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_0ac9e28cdf136f7d24c9453ae2"
        `);
    await queryRunner.query(`
            DROP TABLE "alerta"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."tipo_alerta"
        `);
  }
}
