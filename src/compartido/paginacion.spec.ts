import { desplazamiento } from './paginacion.js';

describe('desplazamiento', () => {
  it('página 1 empieza en 0', () => {
    expect(desplazamiento({ page: 1, size: 20 })).toEqual({
      skip: 0,
      take: 20,
    });
  });

  it('página 3 con tamaño 10 empieza en 20', () => {
    expect(desplazamiento({ page: 3, size: 10 })).toEqual({
      skip: 20,
      take: 10,
    });
  });
});
