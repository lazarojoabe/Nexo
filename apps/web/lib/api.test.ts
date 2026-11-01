import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, setApiAuthAdapterForTests } from './api';

const originalFetch = globalThis.fetch;

afterEach(() => { globalThis.fetch = originalFetch; setApiAuthAdapterForTests(); vi.restoreAllMocks(); });

describe('cliente HTTP', () => {
  it('não envia x-user-id em requisições públicas e lê JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } }));
    globalThis.fetch = fetchMock;
    await expect(api.exams()).resolves.toEqual([]);
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(options.headers).get('x-user-id')).toBeNull();
    expect(new Headers(options.headers).get('authorization')).toBeNull();
  });

  it('envia o Bearer token Supabase nas rotas privadas', async () => {
    setApiAuthAdapterForTests({ accessToken: async () => 'access-token', refreshAccessToken: async () => null, clearSession: async () => undefined });
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ examCount: 0, progress: null, lastSession: null, resumeSession: null }), { status: 200, headers: { 'content-type': 'application/json' } }));

    await api.dashboard();

    const [, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(new Headers(options.headers).get('authorization')).toBe('Bearer access-token');
    expect(new Headers(options.headers).get('x-user-id')).toBeNull();
  });

  it('atualiza a sessão uma vez após 401 e repete a requisição com o novo Bearer token', async () => {
    const refresh = vi.fn().mockResolvedValue('fresh-token');
    const clear = vi.fn().mockResolvedValue(undefined);
    setApiAuthAdapterForTests({ accessToken: async () => 'expired-token', refreshAccessToken: refresh, clearSession: clear });
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ examCount: 0, progress: null, lastSession: null, resumeSession: null }), { status: 200, headers: { 'content-type': 'application/json' } }));

    await expect(api.dashboard()).resolves.toMatchObject({ examCount: 0 });

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(clear).not.toHaveBeenCalled();
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    expect(new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers).get('authorization')).toBe('Bearer expired-token');
    expect(new Headers((fetchMock.mock.calls[1][1] as RequestInit).headers).get('authorization')).toBe('Bearer fresh-token');
  });

  it('encerra a sessão quando o refresh expira ou falha', async () => {
    const clear = vi.fn().mockResolvedValue(undefined);
    setApiAuthAdapterForTests({ accessToken: async () => 'expired-token', refreshAccessToken: async () => null, clearSession: clear });
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } }));

    await expect(api.dashboard()).rejects.toMatchObject({ status: 401 });

    expect(clear).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('converte falha de rede em mensagem amigável', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(api.exams()).rejects.toMatchObject({ kind: 'network', message: expect.stringContaining('Não foi possível conectar à API.') });
  });
});
