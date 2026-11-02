import { describe, expect, it } from 'vitest';
import { AdminExamImportService, buildPreviewDraft, validateExamImportFile } from '../src/admin-exam-import.service';
import { normalizeExamImport, persistExamImport } from '../src/exam-importer';

const metadata = { year: 2025, day: 1, color: 'azul', language: 'en', version: 'caderno-1' };
const options = ['A', 'B', 'C', 'D', 'E'].map((label) => ({ label, content: `Alternativa ${label}` }));
type Extraction = Parameters<typeof buildPreviewDraft>[0]['extraction'];
const extraction = (overrides: Partial<Extraction> = {}): Extraction => ({
  questions: overrides.questions ?? [{ number: 1, area: 'Linguagens', statement: 'Enunciado oficial.', options, sourcePage: 2, confidence: 0.98 }],
  answerKey: overrides.answerKey ?? [{ number: 1, label: 'C', sourcePage: 1, confidence: 0.98 }],
  assets: overrides.assets ?? [],
  pageCounts: { exam: 10, answerKey: 1 },
});

describe('prévia administrativa de prova + gabarito', () => {
  it('valida a assinatura efetiva do PDF e rejeita extensão enganosa', () => {
    expect(() => validateExamImportFile({ originalname: 'prova.pdf', size: 9, buffer: Buffer.from('not a pdf') }, 'exam')).toThrow('PDF válido');
    const pdf = Buffer.from('%PDF-1.7\nconteúdo\n%%EOF');
    expect(validateExamImportFile({ originalname: 'prova.exe', size: pdf.length, buffer: pdf }, 'exam')).toMatchObject({ mimeType: 'application/pdf' });
  });

  it('monta uma prévia válida apenas combinando prova e gabarito separados', () => {
    const preview = buildPreviewDraft({ id: 'preview-1', metadata, proofHash: 'a'.repeat(64), extraction: extraction(), assetBaseUrl: 'http://localhost:3001/exam-assets' });
    expect(preview.valid).toBe(true);
    expect(preview.exceptions).toHaveLength(0);
    expect((preview.draft as { questions: Array<{ correctOptionLabel: string }> }).questions[0].correctOptionLabel).toBe('C');
  });

  it('coloca conflito de gabarito e duplicidade na fila bloqueante', () => {
    const preview = buildPreviewDraft({ id: 'preview-2', metadata, proofHash: 'b'.repeat(64), extraction: extraction({ answerKey: [{ number: 1, label: 'A', sourcePage: 1, confidence: 0.98 }, { number: 1, label: 'C', sourcePage: 1, confidence: 0.98 }] }), assetBaseUrl: 'http://localhost:3001/exam-assets' });
    expect(preview.exceptions.map((item) => item.code)).toContain('answer_key_conflict');
    expect(preview.exceptions.map((item) => item.code)).toContain('question_without_answer_key');
  });

  it('bloqueia questão com alternativas incompletas e número duplicado', () => {
    const incomplete = { number: 1, area: 'Linguagens', statement: 'Enunciado.', options: options.slice(0, 4), sourcePage: 2, confidence: 0.98 };
    const duplicate = { ...incomplete, statement: 'Leitura duplicada.', options };
    const preview = buildPreviewDraft({ id: 'preview-3', metadata, proofHash: 'c'.repeat(64), extraction: extraction({ questions: [incomplete, duplicate] }), assetBaseUrl: 'http://localhost:3001/exam-assets' });
    expect(preview.exceptions.map((item) => item.code)).toEqual(expect.arrayContaining(['missing_option', 'duplicate_question_number']));
  });

  it('marca ativo sem vínculo com uma questão', () => {
    const preview = buildPreviewDraft({ id: 'preview-4', metadata, proofHash: 'd'.repeat(64), extraction: extraction({ assets: [{ file: 'assets/orfao.png', sourcePage: 2, sourceHash: 'e'.repeat(64), mimeType: 'image/png', confidence: 0.98 }] }), assetBaseUrl: 'http://localhost:3001/exam-assets' });
    expect(preview.exceptions.some((item) => item.code === 'asset_without_link')).toBe(true);
  });

  it('bloqueia aprovação automática de recorte vetorial até revisão humana', () => {
    const preview = buildPreviewDraft({ id: 'preview-vector', metadata, proofHash: 'd'.repeat(64), extraction: extraction({ assets: [{ file: 'assets/grafico.png', questionNumber: 1, sourcePage: 2, sourceHash: 'e'.repeat(64), mimeType: 'image/png', confidence: 0.65, isVector: true }] }), assetBaseUrl: 'http://localhost:3001/exam-assets' });
    expect(preview.exceptions.some((item) => item.code === 'vector_asset_review' && item.severity === 'blocking')).toBe(true);
  });

  it('apresenta diff e exige confirmação para alteração de questão publicada', async () => {
    const preview = buildPreviewDraft({ id: 'preview-5', metadata, proofHash: 'f'.repeat(64), extraction: extraction(), assetBaseUrl: 'http://localhost:3001/exam-assets' });
    const prisma = {
      enabled: true,
      exam: {
        findUnique: async () => ({ questions: [{ number: 1, area: 'Linguagens', statement: 'Texto publicado anterior.', explanation: null, isCancelled: false, correctOptionId: 'enem-2025-1-azul-en-caderno-1-q1-c', sourcePage: 2, sourceDocumentHash: 'f'.repeat(64), publishedAt: new Date(), options, assets: [] }] }),
      },
    } as never;
    const diff = await (new AdminExamImportService(prisma) as unknown as { diff: (value: unknown) => Promise<{ publishedChanges: boolean; entries: Array<{ fields: string[] }> }> }).diff(preview.draft);
    expect(diff.publishedChanges).toBe(true);
    expect(diff.entries[0].fields).toContain('statement');
  });

  it('reimporta pelo mesmo identificador, usando upsert sem duplicar registros', async () => {
    const payload = normalizeExamImport({ sourceUrl: 'local-upload://exam/' + 'f'.repeat(64), sourceVersion: 'upload revisado', exam: metadata, questions: [{ number: 1, area: 'Linguagens', statement: 'Enunciado.', sourcePage: 2, sourceDocumentHash: 'f'.repeat(64), options, correctOptionLabel: 'C' }] });
    const calls = { exam: 0, question: 0 };
    const prisma = { exam: { upsert: async () => { calls.exam += 1; } }, question: { upsert: async () => { calls.question += 1; } } } as never;
    await persistExamImport(prisma, payload);
    await persistExamImport(prisma, payload);
    expect(calls).toEqual({ exam: 2, question: 2 });
    expect(payload.exam.id).toBe('enem-2025-1-azul-en-caderno-1');
  });
});
