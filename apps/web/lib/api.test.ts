import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';

const originalFetch = globalThis.fetch;

afterEach(() => { globalThis.fetch = originalFetch; vi.restoreAllMocks(); });

describe('cliente HTTP', () => {
  it('inclui o cabeçalho temporário de demonstração e lê JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } }));
    globalThis.fetch = fetchMock;
    await expect(api.exams()).resolves.toEqual([]);
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(options.headers).get('x-user-id')).toBe('demo-user');
  });

  it('converte falha de rede em mensagem amigável', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(api.exams()).rejects.toMatchObject({ kind: 'network', message: expect.stringContaining('Não foi possível conectar à API.') });
  });
});
