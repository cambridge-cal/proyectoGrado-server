import { calcularParticipacion } from './participacion.js';

const grupo = (...ids: string[]) => new Set(ids);

describe('Participación de una evaluación (RF-36, Figura 6.15)', () => {
  it('cuenta los elegibles sin repetir al estudiante que está en dos grupos', () => {
    const p = calcularParticipacion([grupo('a', 'b'), grupo('b', 'c')], ['a']);
    expect(p).toEqual({
      elegibles: 3,
      completaron: 1,
      todos: false,
      algunGrupoCompleto: false,
    });
  });

  it('detecta que un grupo terminó aunque falten los demás', () => {
    const p = calcularParticipacion(
      [grupo('a', 'b'), grupo('c', 'd')],
      ['a', 'b'],
    );
    expect(p.algunGrupoCompleto).toBe(true);
    expect(p.todos).toBe(false);
  });

  it('marca todos cuando respondieron los estudiantes de todos los grupos', () => {
    const p = calcularParticipacion([grupo('a'), grupo('b')], ['b', 'a']);
    expect(p.todos).toBe(true);
    expect(p.algunGrupoCompleto).toBe(true);
  });

  it('ignora a quien respondió y luego se dio de baja', () => {
    const p = calcularParticipacion([grupo('a')], ['a', 'x']);
    expect(p).toMatchObject({ elegibles: 1, completaron: 1, todos: true });
  });

  it('un docente sin grupos o con grupos vacíos nunca queda completo', () => {
    expect(calcularParticipacion([], ['a']).todos).toBe(false);
    const vacio = calcularParticipacion([grupo()], []);
    expect(vacio.todos).toBe(false);
    expect(vacio.algunGrupoCompleto).toBe(false);
  });
});
