import { describe, expect, it } from 'vitest';
import { calculateEssayTotal, essayEvaluationSchema, examImportSchema, gradeAnswer } from '../src/index';

describe('regras críticas', () => {
  it('corrige somente contra o gabarito persistido', () => {
    expect(gradeAnswer('b', 'b').correct).toBe(true);
    expect(gradeAnswer('b', 'a').correct).toBe(false);
  });

  it('soma a nota de redação', () => expect(calculateEssayTotal([200, 160, 120, 80, 40])).toBe(600));

  it('rejeita uma saída de IA fora da rubrica', () => {
    expect(() => essayEvaluationSchema.parse({ competencies: { c1: { score: 90, justification: 'x' } } })).toThrow();
  });

  it('exige cinco alternativas distintas e gabarito para cada questão ativa', () => {
    const question = { number: 1, area: 'Matemática', statement: 'Quanto é 1 + 1?', options: ['A', 'B', 'C', 'D', 'E'].map((label) => ({ label, content: label })), correctOptionLabel: 'B' };
    const payload = { sourceUrl: 'https://www.gov.br/inep', sourceVersion: 'revisado', exam: { year: 2025, day: 1, color: 'azul', version: 'caderno-1' }, questions: [question] };
    expect(examImportSchema.parse(payload).questions).toHaveLength(1);
    expect(() => examImportSchema.parse({ ...payload, questions: [{ ...question, correctOptionLabel: 'Z' }] })).toThrow();
  });
});
