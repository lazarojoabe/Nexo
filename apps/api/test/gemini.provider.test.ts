import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiProvider } from '../src/gemini.provider';

describe('provedor Gemini', () => {
  const previousKey = process.env.GEMINI_API_KEY;
  const previousTimeout = process.env.AI_PROVIDER_TIMEOUT_MS;

  afterEach(() => {
    process.env.GEMINI_API_KEY = previousKey;
    process.env.AI_PROVIDER_TIMEOUT_MS = previousTimeout;
    vi.unstubAllGlobals();
  });

  it('explica uma chave rejeitada sem expor detalhes da resposta do provedor', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 403 })));

    await expect(new GeminiProvider().evaluate('Tema técnico', 'Este é um texto de teste confirmado e com tamanho suficiente para a avaliação.'))
      .rejects.toThrow('A chave do Gemini foi recusada');
  });

  it('identifica uma chave inválida devolvida pelo Gemini em vez de reportar tempo esgotado', async () => {
    process.env.GEMINI_API_KEY = 'invalid-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'API key not valid. Please pass a valid API key.' } }), { status: 400 })));

    await expect(new GeminiProvider().evaluate('Tema técnico', 'Este é um texto de teste confirmado e com tamanho suficiente para a avaliação.'))
      .rejects.toThrow('A chave do Gemini foi recusada');
  });

  it('só informa tempo esgotado quando a chamada é realmente abortada', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError')));

    await expect(new GeminiProvider().evaluate('Tema técnico', 'Este é um texto de teste confirmado e com tamanho suficiente para a avaliação.'))
      .rejects.toThrow('não respondeu a tempo');
  });

  it('diferencia uma falha de conexão de um tempo esgotado', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

    await expect(new GeminiProvider().evaluate('Tema técnico', 'Este é um texto de teste confirmado e com tamanho suficiente para a avaliação.'))
      .rejects.toThrow('Não foi possível conectar ao serviço de IA');
  });

  it('rejeita JSON truncado sem expor a resposta do provedor', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"competencies":[' }] } }] }), { status: 200 })));

    await expect(new GeminiProvider().evaluate('Tema técnico', 'Texto confirmado com extensão suficiente para a avaliação.'))
      .rejects.toThrow('avaliação incompleta');
  });

  it('rejeita resposta de transcrição incompleta do provedor', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"rawText":"leitura sem estrutura"}' }] } }] }), { status: 200 })));

    await expect(new GeminiProvider().transcribe([{ mimeType: 'image/jpeg', data: 'base64' }]))
      .rejects.toThrow();
  });

  it('instrui a leitura de texto digitado sem reduzir a confiança por causa do suporte', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({
      rawText: 'Texto digitado.',
      paragraphs: [{ index: 1, rawText: 'Texto digitado.', confidence: 0.99, lineRange: { start: 1, end: 1 } }],
      uncertainTerms: [],
      overallConfidence: 0.99,
      requiresReview: false,
    }) }] } }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(new GeminiProvider().transcribe([{ mimeType: 'image/png', data: 'base64' }]))
      .resolves.toMatchObject({ overallConfidence: 0.99, requiresReview: false });

    const payload = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as { contents: Array<{ parts: Array<{ text: string }> }> };
    expect(payload.contents[0].parts[0].text).toContain('digitada, impressa ou uma captura de tela');
    expect(payload.contents[0].parts[0].text).toContain('nunca pelo fato de o texto ser manuscrito ou digitado');
  });
});
