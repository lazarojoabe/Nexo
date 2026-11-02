import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHmac, generateKeyPairSync, sign as signToken } from 'node:crypto';
import { AuthIdentityService } from '../src/auth-identity.service';
import { QuizController } from '../src/controllers';
import { QuizService } from '../src/services';

const previousEnvironment = { nodeEnv: process.env.NODE_ENV, secret: process.env.SUPABASE_JWT_SECRET, audience: process.env.SUPABASE_JWT_AUDIENCE, demo: process.env.DEMO_AUTH_ENABLED, issuer: process.env.SUPABASE_JWT_ISSUER, url: process.env.SUPABASE_URL };
const originalFetch = globalThis.fetch;

afterEach(() => {
  restoreEnv('NODE_ENV', previousEnvironment.nodeEnv);
  restoreEnv('SUPABASE_JWT_SECRET', previousEnvironment.secret);
  restoreEnv('SUPABASE_JWT_AUDIENCE', previousEnvironment.audience);
  restoreEnv('SUPABASE_JWT_ISSUER', previousEnvironment.issuer);
  restoreEnv('SUPABASE_URL', previousEnvironment.url);
  restoreEnv('DEMO_AUTH_ENABLED', previousEnvironment.demo);
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('identidade da requisição', () => {
  it('mantém identidade demonstrativa somente quando development/test a habilita explicitamente', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.DEMO_AUTH_ENABLED;
    await expect(new AuthIdentityService().userId()).rejects.toThrow('Autenticação é obrigatória');
    process.env.DEMO_AUTH_ENABLED = 'true';
    await expect(new AuthIdentityService().userId()).resolves.toBe('demo-user');
  });

  it('recusa uma rota protegida sem Bearer token em produção', async () => {
    process.env.NODE_ENV = 'production';
    const controller = new QuizController(new QuizService(), new AuthIdentityService(), { ensure: async () => undefined } as never);
    await expect(controller.dashboard(undefined)).rejects.toThrow('Autenticação é obrigatória');
  });

  it('aceita JWT HS256 legado assinado, não expirado, com audiência, role e issuer configurado', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SUPABASE_JWT_SECRET = 'test-secret';
    process.env.SUPABASE_JWT_ISSUER = 'https://project.supabase.co/auth/v1';
    const token = signedToken({ sub: 'user-123', aud: 'authenticated', role: 'authenticated', iss: process.env.SUPABASE_JWT_ISSUER, exp: Math.floor(Date.now() / 1000) + 60 });
    await expect(new AuthIdentityService().userId(`Bearer ${token}`)).resolves.toBe('user-123');
    await expect(new AuthIdentityService().userId(`Bearer ${token}tampered`)).rejects.toThrow('Token de acesso inválido');
    const expired = signedToken({ sub: 'user-123', aud: 'authenticated', role: 'authenticated', iss: process.env.SUPABASE_JWT_ISSUER, exp: Math.floor(Date.now() / 1000) - 1 });
    await expect(new AuthIdentityService().userId(`Bearer ${expired}`)).rejects.toThrow('expirado ou inválido');
    const noRole = signedToken({ sub: 'user-123', aud: 'authenticated', iss: process.env.SUPABASE_JWT_ISSUER, exp: Math.floor(Date.now() / 1000) + 60 });
    await expect(new AuthIdentityService().userId(`Bearer ${noRole}`)).rejects.toThrow('sem permissão');
  });

  it('aceita JWT ES256 usando a chave pública JWKS do Supabase', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SUPABASE_URL = 'https://project.supabase.co';
    process.env.SUPABASE_JWT_ISSUER = 'https://project.supabase.co/auth/v1';
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const jwk = publicKey.export({ format: 'jwk' });
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ keys: [{ ...jwk, kid: 'nexo-test-key', alg: 'ES256', use: 'sig' }] }), { status: 200 }));
    const token = signedEs256Token(privateKey, { sub: 'user-es256', aud: 'authenticated', role: 'authenticated', iss: process.env.SUPABASE_JWT_ISSUER, exp: Math.floor(Date.now() / 1000) + 60 });

    await expect(new AuthIdentityService().userId(`Bearer ${token}`)).resolves.toBe('user-es256');
    expect(globalThis.fetch).toHaveBeenCalledWith('https://project.supabase.co/auth/v1/.well-known/jwks.json', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });
});

function signedToken(payload: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', process.env.SUPABASE_JWT_SECRET!).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

function signedEs256Token(privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'], payload: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT', kid: 'nexo-test-key' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = signToken('sha256', Buffer.from(`${header}.${body}`), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `${header}.${body}.${signature}`;
}

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
