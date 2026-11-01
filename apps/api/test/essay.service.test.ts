import { describe, expect, it } from 'vitest';
import { EssayService } from '../src/services';

const validEvaluation = {
  competencies: [1, 2, 3, 4, 5].map((id) => ({ id, score: 120, level: 'regular', strengths: [], issues: ['Revisar este ponto.'], evidence: [], feedbackPoints: [{ category: 'clareza', severity: 'atencao', diagnosis: 'Há espaço para explicar melhor.', suggestion: 'Explique a relação entre a ideia e a tese.' }], actionableFeedback: ['Faça uma revisão guiada.'] })),
  generalFeedback: 'A redação possui uma estrutura inicial.',
  priorityActions: ['Aprofundar os argumentos.'],
};

function service() {
  const gemini = { transcribe: async () => ({ text: 'Texto transcrito com tamanho suficiente.', lowConfidenceSegments: [] }), evaluate: async () => validEvaluation };
  const preprocessor = { enhance: async () => ({ originalMimeType: 'image/jpeg' as const, mimeType: 'image/jpeg' as const, data: Buffer.from('processed').toString('base64'), enhanced: true }) };
  const storage = { save: async () => ({ originalPath: 'original.jpg', processedPath: 'processed.jpg' }), read: async () => Buffer.from('processed'), remove: async () => undefined };
  return new EssayService(gemini as never, preprocessor as never, storage as never);
}

describe('fluxo de redação', () => {
  it('exige consentimento e imagem antes de transcrever', async () => {
    const essays = service();
    const essay = await essays.create('student', 'Tema de redação');
    await expect(essays.transcribe(essay.id, 'student', false)).rejects.toThrow('consentir');
    await expect(essays.transcribe(essay.id, 'student', true)).rejects.toThrow('ao menos uma imagem');
  });

  it('limita imagens, confirma texto e persiste uma avaliação validada', async () => {
    const essays = service();
    const essay = await essays.create('student', 'Tema de redação');
    const file = { mimetype: 'image/jpeg', size: 200, buffer: Buffer.from('original') } as Express.Multer.File;
    await essays.addImage(essay.id, 'student', file);
    await essays.setText(essay.id, 'student', 'Este é um texto confirmado com mais de vinte caracteres.');
    const evaluation = await essays.evaluate(essay.id, 'student', true);
    expect(evaluation.totalScore).toBe(600);
    const history = await essays.history('student');
    expect(history.summary).toMatchObject({ total: 1, evaluated: 1, latestScore: 600, bestScore: 600 });
    expect(history.essays[0].competencies).toHaveLength(5);
    await expect(essays.addImage(essay.id, 'another-student', file)).rejects.toThrow('não encontrada');
    await expect(essays.get(essay.id, 'another-student')).rejects.toThrow('não encontrada');
  });

  it('aplica limite diário sem apagar o texto confirmado', async () => {
    const previousLimit = process.env.AI_EVALUATIONS_PER_DAY;
    process.env.AI_EVALUATIONS_PER_DAY = '1';
    try {
      const essays = service();
      const first = await essays.create('student', 'Primeiro tema');
      const second = await essays.create('student', 'Segundo tema');
      await essays.setText(first.id, 'student', 'Este é o primeiro texto confirmado, suficientemente longo para avaliação.');
      await essays.setText(second.id, 'student', 'Este é o segundo texto confirmado, suficientemente longo para avaliação.');
      await essays.evaluate(first.id, 'student', true);
      await expect(essays.evaluate(second.id, 'student', true)).rejects.toThrow('limite diário');
      expect((await essays.get(second.id, 'student')).confirmedText).toContain('segundo texto');
    } finally {
      process.env.AI_EVALUATIONS_PER_DAY = previousLimit;
    }
  });

  it('aceita JPEG válido mesmo quando o navegador informa um MIME impreciso', async () => {
    const essays = service();
    const essay = await essays.create('student', 'Tema de redação');
    const file = { mimetype: 'application/octet-stream', size: 200, buffer: Buffer.from([0xff, 0xd8, 0xff]) } as Express.Multer.File;

    await expect(essays.addImage(essay.id, 'student', file)).resolves.toMatchObject({ accepted: true, images: 1 });
  });

  it('usa o MIME detectado da assinatura ao armazenar a imagem', async () => {
    let originalMimeType = '';
    const essays = new EssayService(
      { transcribe: async () => ({ text: 'Texto transcrito com tamanho suficiente.', lowConfidenceSegments: [] }), evaluate: async () => validEvaluation } as never,
      { enhance: async () => ({ originalMimeType: 'image/png' as const, mimeType: 'image/jpeg' as const, data: Buffer.from('processed').toString('base64'), enhanced: true }) } as never,
      { save: async (_essayId: string, _page: number, _original: Buffer, mimeType: string) => { originalMimeType = mimeType; return { originalPath: 'original.png', processedPath: 'processed.jpg' }; }, read: async () => Buffer.from('processed'), remove: async () => undefined } as never,
    );
    const essay = await essays.create('student', 'Tema de redação');
    const file = { mimetype: 'application/octet-stream', size: 200, buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]) } as Express.Multer.File;

    await essays.addImage(essay.id, 'student', file);

    expect(originalMimeType).toBe('image/png');
  });

  it('preserva as páginas quando a transcrição falha de forma inesperada', async () => {
    const essays = new EssayService(
      { transcribe: async () => { throw new Error('conteúdo privado não deve ser exposto'); }, evaluate: async () => validEvaluation } as never,
      { enhance: async () => ({ originalMimeType: 'image/jpeg' as const, mimeType: 'image/jpeg' as const, data: Buffer.from('processed').toString('base64'), enhanced: true }) } as never,
      { save: async () => ({ originalPath: 'original.jpg', processedPath: 'processed.jpg' }), read: async () => Buffer.from('processed'), remove: async () => undefined } as never,
    );
    const essay = await essays.create('student', 'Tema de redação');
    const file = { mimetype: 'image/jpeg', size: 200, buffer: Buffer.from('original') } as Express.Multer.File;
    await essays.addImage(essay.id, 'student', file);

    await expect(essays.transcribe(essay.id, 'student', true)).rejects.toThrow('Suas páginas foram preservadas');
    await expect(essays.get(essay.id, 'student')).resolves.toMatchObject({ status: 'draft', images: [{ page: 1 }] });
  });

  it('persiste a leitura fiel e a versão normalizada sem perder a estrutura', async () => {
    const essays = new EssayService(
      {
        transcribe: async () => ({ rawText: 'Há obs-\ntáculos.\n\nFim.', paragraphs: [{ index: 1, rawText: 'Há obs-\ntáculos.', confidence: 0.99, lineRange: { start: 1, end: 2 } }, { index: 2, rawText: 'Fim.', confidence: 0.99, lineRange: { start: 4, end: 4 } }], uncertainTerms: [], overallConfidence: 0.99, requiresReview: false }),
        verifyTranscription: async () => ({ divergences: [], overallConfidence: 0.99 }),
        evaluate: async () => validEvaluation,
      } as never,
      { enhance: async () => ({ originalMimeType: 'image/jpeg' as const, mimeType: 'image/jpeg' as const, data: Buffer.from('processed').toString('base64'), enhanced: true }) } as never,
      { save: async () => ({ originalPath: 'original.jpg', processedPath: 'processed.jpg' }), read: async () => Buffer.from('processed'), remove: async () => undefined } as never,
    );
    const essay = await essays.create('student', 'Tema de redação');
    const file = { mimetype: 'image/jpeg', size: 200, buffer: Buffer.from('original') } as Express.Multer.File;
    await essays.addImage(essay.id, 'student', file);

    await expect(essays.transcribe(essay.id, 'student', true)).resolves.toMatchObject({ rawText: 'Há obs-\ntáculos.\n\nFim.', normalizedText: 'Há obstáculos.\n\nFim.', paragraphs: [{ index: 1 }, { index: 2 }] });
    await expect(essays.get(essay.id, 'student')).resolves.toMatchObject({ transcription: 'Há obstáculos.\n\nFim.', transcriptionResult: { rawText: 'Há obs-\ntáculos.\n\nFim.', normalizedText: 'Há obstáculos.\n\nFim.' } });
  });

  it('apresenta registros antigos de transcrição como revisão necessária', async () => {
    const essays = service();
    const essay = await essays.create('student', 'Tema de redação');
    const memory = essays as unknown as { essays: Map<string, { transcription?: string }> };
    memory.essays.get(essay.id)!.transcription = 'Texto de uma transcrição antiga com tamanho suficiente.';

    await expect(essays.get(essay.id, 'student')).resolves.toMatchObject({ transcriptionResult: { rawText: 'Texto de uma transcrição antiga com tamanho suficiente.', requiresReview: true } });
  });
});
