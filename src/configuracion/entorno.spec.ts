import { origenesCors, validarEntorno } from './entorno.js';

const base = {
  DB_HOST: 'localhost',
  DB_PORT: '5432',
  DB_USER: 'cal',
  DB_PASSWORD: 'secreto',
  DB_NAME: 'sistema_cal',
  CORS_ORIGINS: 'http://localhost:5173',
};

describe('validarEntorno', () => {
  it('acepta una configuración completa y convierte los puertos a número', () => {
    const resultado = validarEntorno(base);
    expect(resultado.DB_PORT).toBe(5432);
    expect(resultado.PORT).toBe(3000);
    expect(resultado.NODE_ENV).toBe('development');
  });

  it('rechaza la configuración si falta una variable obligatoria', () => {
    expect(() => validarEntorno({ ...base, DB_PASSWORD: '' })).toThrow(
      /DB_PASSWORD/,
    );
  });

  it('rechaza un NODE_ENV desconocido', () => {
    expect(() => validarEntorno({ ...base, NODE_ENV: 'staging' })).toThrow(
      /NODE_ENV/,
    );
  });
});

describe('origenesCors', () => {
  it('separa la lista por comas e ignora espacios y vacíos', () => {
    expect(origenesCors(' http://a.com , ,http://b.com')).toEqual([
      'http://a.com',
      'http://b.com',
    ]);
  });
});
