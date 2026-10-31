import { origenesCors, validarEntorno } from './entorno.js';

const base = {
  DB_HOST: 'localhost',
  DB_PORT: '5432',
  DB_USER: 'cal',
  DB_PASSWORD: 'secreto',
  DB_NAME: 'sistema_cal',
  CORS_ORIGINS: 'http://localhost:5173',
  JWT_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
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

  it('exige secretos JWT de al menos 32 caracteres y distintos entre sí', () => {
    expect(() => validarEntorno({ ...base, JWT_SECRET: 'corto' })).toThrow(
      /JWT_SECRET/,
    );
    expect(() =>
      validarEntorno({ ...base, JWT_REFRESH_SECRET: base.JWT_SECRET }),
    ).toThrow(/distintos/);
  });

  it('en producción exige correo y Gemini', () => {
    expect(() => validarEntorno({ ...base, NODE_ENV: 'production' })).toThrow(
      /SMTP_USER, SMTP_PASS, URL_CLIENTE, GEMINI_API_KEY/,
    );
    expect(() =>
      validarEntorno({
        ...base,
        NODE_ENV: 'production',
        SMTP_USER: 'cal@gmail.com',
        SMTP_PASS: 'clave-de-aplicacion',
        URL_CLIENTE: 'https://cal.example.com',
        GEMINI_API_KEY: 'AIzaSyFakeKey12345',
      }),
    ).not.toThrow();
  });

  it('en producción valida que TLS_CERT_PATH y TLS_KEY_PATH vengan en par', () => {
    const produccion = {
      ...base,
      NODE_ENV: 'production',
      SMTP_USER: 'cal@gmail.com',
      SMTP_PASS: 'clave-de-aplicacion',
      URL_CLIENTE: 'https://cal.example.com',
      GEMINI_API_KEY: 'AIzaSyFakeKey12345',
    };
    expect(() =>
      validarEntorno({ ...produccion, TLS_CERT_PATH: '/cert.pem' }),
    ).toThrow(/TLS_CERT_PATH y TLS_KEY_PATH deben definirse ambos/);
    expect(() =>
      validarEntorno({
        ...produccion,
        TLS_CERT_PATH: '/cert.pem',
        TLS_KEY_PATH: '/key.pem',
      }),
    ).not.toThrow();
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
