import { DataSource } from 'typeorm';
import {
  AuditLog,
  Docente,
  ENTIDADES_SEGURIDAD,
  Estudiante,
  Rol,
  Sesion,
  Usuario,
} from './index.js';
import { emailNormalizado } from './transformadores.js';

// Construye los metadatos de TypeORM sin conectarse a la base de datos.
async function metadatos() {
  const fuente = new DataSource({
    type: 'postgres',
    entities: ENTIDADES_SEGURIDAD,
  });
  await (
    fuente as unknown as { buildMetadatas(): Promise<void> }
  ).buildMetadatas();
  return fuente;
}

const columnasUnicas = (fuente: DataSource, entidad: Function) => {
  const meta = fuente.getMetadata(entidad);
  return [
    ...meta.uniques.flatMap((u) => u.columns.map((c) => c.databaseName)),
    ...meta.indices
      .filter((i) => i.isUnique)
      .flatMap((i) => i.columns.map((c) => c.databaseName)),
  ];
};

describe('Entidades de seguridad (Figura 6.8)', () => {
  let fuente: DataSource;
  beforeAll(async () => {
    fuente = await metadatos();
  });

  it('usa los nombres de tabla del modelo', () => {
    expect(
      ENTIDADES_SEGURIDAD.map((e) => fuente.getMetadata(e).tableName),
    ).toEqual(['usuario', 'estudiante', 'docente', 'sesion', 'audit_log']);
  });

  it('el email del usuario y el código del estudiante son únicos', () => {
    expect(columnasUnicas(fuente, Usuario)).toContain('email');
    expect(columnasUnicas(fuente, Estudiante)).toContain('codigo');
  });

  it('cada perfil pertenece a un único usuario', () => {
    expect(columnasUnicas(fuente, Estudiante)).toContain('usuario_id');
    expect(columnasUnicas(fuente, Docente)).toContain('usuario_id');
  });

  it('las llaves foráneas usan ON DELETE RESTRICT (RNF-19)', () => {
    for (const entidad of [Estudiante, Docente, Sesion, AuditLog]) {
      const claves = fuente.getMetadata(entidad).foreignKeys;
      expect(claves).toHaveLength(1);
      expect(claves[0].onDelete).toBe('RESTRICT');
      expect(claves[0].columnNames).toEqual(['usuario_id']);
    }
  });

  it('el hash de la contraseña no se selecciona por defecto', () => {
    const columna = fuente
      .getMetadata(Usuario)
      .findColumnWithPropertyName('contrasenaHash');
    expect(columna?.isSelect).toBe(false);
  });

  it('el rol solo admite ADMIN, DOCENTE o ESTUDIANTE', () => {
    const columna = fuente
      .getMetadata(Usuario)
      .findColumnWithPropertyName('rol');
    expect(columna?.enum).toEqual(['ADMIN', 'DOCENTE', 'ESTUDIANTE']);
    expect(Object.values(Rol)).toEqual(['ADMIN', 'DOCENTE', 'ESTUDIANTE']);
  });

  it('normaliza el email a minúsculas y sin espacios', () => {
    expect(emailNormalizado.to('  Ana.Perez@CAL.edu.co ')).toBe(
      'ana.perez@cal.edu.co',
    );
  });
});

describe('Nombres de columnas', () => {
  it('las columnas de varias palabras usan snake_case en la base de datos', async () => {
    const fuente = await metadatos();
    const nombres = (e: Function) =>
      fuente.getMetadata(e).columns.map((c) => c.databaseName);
    expect(nombres(Usuario)).toContain('contrasena_hash');
    expect(nombres(Docente)).toContain('carga_maxima_semanal');
    expect(nombres(Sesion)).toEqual(
      expect.arrayContaining(['refresh_token_hash', 'creada_en', 'expira_en']),
    );
    expect(nombres(AuditLog)).toContain('fecha_hora');
  });
});
