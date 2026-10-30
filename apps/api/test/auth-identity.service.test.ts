import { afterEach, describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { AuthIdentityService } from '../src/auth-identity.service';

const previousEnvironment = { nodeEnv: process.env.NODE_ENV, secret: process.env.SUPABASE_JWT_SECRET, audience: process.env.SUPABASE_JWT_AUDIENCE };

afterEach(() => {
  restoreEnv('NODE_ENV', previousEnvironment.nodeEnv);
  restoreEnv('SUPABASE_JWT_SECRET', previousEnvironment.secret);
  restoreEnv('SUPABASE_JWT_AUDIENCE', previousEnvironment.audience);
});

describe('identidade da requisição', () => {
  it('mantém identidade demonstrativa somente fora de produção', () => {
    process.env.NODE_ENV = 'development';
    expect(new AuthIdentityService().userId(undefined, 'student-demo')).toBe('student-demo');
  });

  it('recusa x-user-id isolado em produção', () => {
    process.env.NODE_ENV = 'production';
    expect(() => new AuthIdentityService().userId(undefined, 'forged-user')).toThrow('Autenticação é obrigatória');
  });

  it('aceita somente JWT HS256 assinado e com audiência autenticada', () => {
    process.env.NODE_ENV = 'production';
    process.env.SUPABASE_JWT_SECRET = 'test-secret';
    const token = signedToken({ sub: 'user-123', aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 60 });
    expect(new AuthIdentityService().userId(`Bearer ${token}`)).toBe('user-123');
    expect(() => new AuthIdentityService().userId(`Bearer ${token}tampered`)).toThrow('Token de acesso inválido');
  });
});

function signedToken(payload: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', process.env.SUPABASE_JWT_SECRET!).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
