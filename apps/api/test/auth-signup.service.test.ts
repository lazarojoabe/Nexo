import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthSignupService } from '../src/auth-signup.service';

const originalFetch = globalThis.fetch;
const saved = Object.fromEntries(['NODE_ENV', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].map((key) => [key, process.env[key]]));

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('cadastro público via Supabase Auth', () => {
  it('aceita qualquer e-mail já confirmado, sem enviar mensagem de confirmação', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SUPABASE_URL = 'https://project.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));

    await expect(new AuthSignupService().signUp('novo.usuario@example.com', 'senha-segura-123')).resolves.toEqual({ readyToSignIn: true });

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock.mock.calls[0][0]).toBe('https://project.supabase.co/auth/v1/admin/users');
    expect(new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers).get('authorization')).toBe('Bearer service-role-key');
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toMatchObject({ email: 'novo.usuario@example.com', email_confirm: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
