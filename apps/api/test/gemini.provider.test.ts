import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiProvider } from '../src/gemini.provider';

describe('provedor Gemini', () => {
  const previousKey = process.env.GEMINI_API_KEY;

  afterEach(() => {
    process.env.GEMINI_API_KEY = previousKey;
    vi.unstubAllGlobals();
  });

  it('explica uma chave rejeitada sem expor detalhes da resposta do provedor', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 403 })));

    await expect(new GeminiProvider().evaluate('Tema técnico', 'Este é um texto de teste confirmado e com tamanho suficiente para a avaliação.'))
      .rejects.toThrow('A chave do Gemini foi recusada');
  });
});
