import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard.js';

const SECRETO = 'secreto-access-de-pruebas-0123456789';
const config = { getOrThrow: () => SECRETO } as unknown as ConfigService;
const jwt = new JwtService();
const guard = new JwtAuthGuard(jwt, config);

function contexto(authorization?: string) {
  const peticion: Record<string, unknown> = {
    headers: authorization ? { authorization } : {},
  };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => peticion }),
  } as unknown as ExecutionContext;
  return { ctx, peticion };
}

describe('JwtAuthGuard', () => {
  it('acepta un Access Token válido y deja el usuario en la petición', async () => {
    const token = jwt.sign(
      { sub: 'u1', email: 'a@b.co', rol: 'ADMIN' },
      { secret: SECRETO, expiresIn: 60 },
    );
    const { ctx, peticion } = contexto(`Bearer ${token}`);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(peticion.usuario).toMatchObject({ sub: 'u1', rol: 'ADMIN' });
  });

  it('rechaza la petición sin token', async () => {
    await expect(guard.canActivate(contexto().ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rechaza un token firmado con otro secreto', async () => {
    const token = jwt.sign(
      { sub: 'u1' },
      { secret: 'otro-secreto-cualquiera-0123456789xx' },
    );
    await expect(
      guard.canActivate(contexto(`Bearer ${token}`).ctx),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza un token vencido', async () => {
    const token = jwt.sign(
      { sub: 'u1', exp: Math.floor(Date.now() / 1000) - 10 },
      { secret: SECRETO },
    );
    await expect(
      guard.canActivate(contexto(`Bearer ${token}`).ctx),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
