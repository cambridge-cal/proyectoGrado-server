import { AuditoriaService, MODULOS_AUDITORIA } from './auditoria.service.js';

describe('AuditoriaService.registrar (RNF-11)', () => {
  it('inserta usuario, módulo, acción, detalle e IP', async () => {
    const registros = { insert: vi.fn().mockResolvedValue(undefined) };
    const servicio = new AuditoriaService(registros as never);
    await servicio.registrar({
      usuarioId: 'u-1',
      modulo: 'USUARIOS',
      accion: 'CREAR',
      detalle: '{"rol":"DOCENTE"}',
      ip: '10.0.0.1',
    });
    expect(registros.insert).toHaveBeenCalledWith({
      usuario: { id: 'u-1' },
      modulo: 'USUARIOS',
      accion: 'CREAR',
      detalle: '{"rol":"DOCENTE"}',
      ip: '10.0.0.1',
    });
  });

  it('si la base falla, no tumba la operación principal', async () => {
    const registros = { insert: vi.fn().mockRejectedValue(new Error('caída')) };
    const servicio = new AuditoriaService(registros as never);
    vi.spyOn(servicio['logger'], 'error').mockImplementation(() => undefined);
    await expect(
      servicio.registrar({
        usuarioId: 'u-1',
        modulo: 'SEGURIDAD',
        accion: 'LOGIN',
      }),
    ).resolves.toBeUndefined();
  });

  it('el servicio no ofrece operaciones para modificar o borrar', () => {
    const metodos = Object.getOwnPropertyNames(AuditoriaService.prototype);
    expect(
      metodos.filter((m) => /actualizar|modificar|eliminar|borrar/i.test(m)),
    ).toEqual([]);
    expect(MODULOS_AUDITORIA).toEqual([
      'SEGURIDAD',
      'USUARIOS',
      'HORARIOS',
      'EVALUACION',
    ]);
  });
});
