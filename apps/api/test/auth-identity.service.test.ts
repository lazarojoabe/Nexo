import { afterEach, describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { AuthIdentityService } from '../src/auth-identity.service';
import { QuizController } from '../src/controllers';
import { QuizService } from '../src/services';

const previousEnvironment = { nodeEnv: process.env.NODE_ENV, secret: process.env.SUPABASE_JWT_SECRET, audience: process.env.SUPABASE_JWT_AUDIENCE, demo: process.env.DEMO_AUTH_ENABLED, issuer: process.env.SUPABASE_JWT_ISSUER };

afterEach(() => {
  restoreEnv('NODE_ENV', previousEnvironment.nodeEnv);
  restoreEnv('SUPABASE_JWT_SECRET', previousEnvironment.secret);
  restoreEnv('SUPABASE_JWT_AUDIENCE', previousEnvironment.audience);
  restoreEnv('SUPABASE_JWT_ISSUER', previousEnvironment.issuer);
  restoreEnv('DEMO_AUTH_ENABLED', previousEnvironment.demo);
});

describe('identidade da requisição', () => {
  it('mantém identidade demonstrativa somente quando development/test a habilita explicitamente', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.DEMO_AUTH_ENABLED;
    expect(() => new AuthIdentityService().userId()).toThrow('Autenticação é obrigatória');
    process.env.DEMO_AUTH_ENABLED = 'true';
    expect(new AuthIdentityService().userId()).toBe('demo-user');
  });

  it('recusa uma rota protegida sem Bearer token em produção', async () => {
    process.env.NODE_ENV = 'production';
    const controller = new QuizController(new QuizService(), new AuthIdentityService(), { ensure: async () => undefined } as never);
    await expect(controller.dashboard(undefined)).rejects.toThrow('Autenticação é obrigatória');
  });

  it('aceita somente JWT HS256 assinado, não expirado, com audiência, role e issuer configurado', () => {
    process.env.NODE_ENV = 'production';
    process.env.SUPABASE_JWT_SECRET = 'test-secret';
    process.env.SUPABASE_JWT_ISSUER = 'https://project.supabase.co/auth/v1';
    const token = signedToken({ sub: 'user-123', aud: 'authenticated', role: 'authenticated', iss: process.env.SUPABASE_JWT_ISSUER, exp: Math.floor(Date.now() / 1000) + 60 });
    expect(new AuthIdentityService().userId(`Bearer ${token}`)).toBe('user-123');
    expect(() => new AuthIdentityService().userId(`Bearer ${token}tampered`)).toThrow('Token de acesso inválido');
    const expired = signedToken({ sub: 'user-123', aud: 'authenticated', role: 'authenticated', iss: process.env.SUPABASE_JWT_ISSUER, exp: Math.floor(Date.now() / 1000) - 1 });
    expect(() => new AuthIdentityService().userId(`Bearer ${expired}`)).toThrow('expirado ou inválido');
    const noRole = signedToken({ sub: 'user-123', aud: 'authenticated', iss: process.env.SUPABASE_JWT_ISSUER, exp: Math.floor(Date.now() / 1000) + 60 });
    expect(() => new AuthIdentityService().userId(`Bearer ${noRole}`)).toThrow('sem permissão');
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
