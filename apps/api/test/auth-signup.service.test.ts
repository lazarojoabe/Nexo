import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthSignupService } from '../src/auth-signup.service';

const originalFetch = globalThis.fetch;
const saved = Object.fromEntries(['NODE_ENV', 'ALLOWED_SIGNUP_EMAILS', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'WEB_ORIGIN'].map((key) => [key, process.env[key]]));

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('cadastro fechado via Supabase Auth', () => {
  it('bloqueia cadastro em produção quando a allowlist está vazia', async () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOWED_SIGNUP_EMAILS = '';
    await expect(new AuthSignupService().signUp('convidada@example.com', 'senha-segura-123')).rejects.toThrow('cadastros estão desativados');
  });

  it('recusa um endereço fora da allowlist antes de chamar o Supabase', async () => {
    process.env.ALLOWED_SIGNUP_EMAILS = 'convidada@example.com';
    globalThis.fetch = vi.fn();
    await expect(new AuthSignupService().signUp('fora@example.com', 'senha-segura-123')).rejects.toThrow('não está autorizado');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('cria somente pelo endpoint admin e solicita confirmação sem expor a conta', async () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOWED_SIGNUP_EMAILS = 'convidada@example.com';
    process.env.SUPABASE_URL = 'https://project.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
    process.env.WEB_ORIGIN = 'https://app.example.com';
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));

    await expect(new AuthSignupService().signUp('Convidada@Example.com', 'senha-segura-123')).resolves.toEqual({ confirmationRequired: true });

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock.mock.calls[0][0]).toBe('https://project.supabase.co/auth/v1/admin/users');
    expect(new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers).get('authorization')).toBe('Bearer service-role-key');
    expect(fetchMock.mock.calls[1][0]).toBe('https://project.supabase.co/auth/v1/resend');
    expect(new Headers((fetchMock.mock.calls[1][1] as RequestInit).headers).get('authorization')).toBe('Bearer anon-key');
  });
});
