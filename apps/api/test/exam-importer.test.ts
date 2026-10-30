import { describe, expect, it } from 'vitest';
import { normalizeExamImport } from '../src/exam-importer';

describe('importação de provas', () => {
  it('gera identificadores estáveis para reimportação', () => {
    const payload = { sourceUrl: 'https://www.gov.br/inep', sourceVersion: 'revisado', exam: { year: 2025, day: 1, color: 'azul', version: 'caderno-1' }, questions: [{ number: 1, area: 'Matemática', statement: 'Quanto é 1 + 1?', assets: [{ url: 'https://cdn.example.test/enem/q1.png', placement: 'after_statement', displayOrder: 0, mimeType: 'image/png', altText: 'Representação visual da questão 1.', sourcePage: 2 }], options: ['A', 'B', 'C', 'D', 'E'].map((label) => ({ label, content: label })), correctOptionLabel: 'B' }] };
    const first = normalizeExamImport(payload);
    const second = normalizeExamImport(payload);
    expect(first.exam.id).toBe('enem-2025-1-azul-pt-caderno-1');
    expect(first.questions[0].id).toBe(second.questions[0].id);
    expect(first.questions[0].correctOptionId).toBe('enem-2025-1-azul-pt-caderno-1-q1-b');
    expect(first.questions[0].assets).toMatchObject([{ placement: 'after_statement', sourcePage: 2 }]);
  });

  it('não aceita duas questões com o mesmo número', () => {
    const question = { number: 1, area: 'Matemática', statement: 'x', options: ['A', 'B', 'C', 'D', 'E'].map((label) => ({ label, content: label })), correctOptionLabel: 'B' };
    expect(() => normalizeExamImport({ sourceUrl: 'https://www.gov.br/inep', sourceVersion: 'revisado', exam: { year: 2025, day: 1, color: 'azul', version: 'caderno-1' }, questions: [question, { ...question, statement: 'y' }] })).toThrow();
  });
});
