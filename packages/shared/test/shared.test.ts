import { describe, expect, it } from 'vitest';
import { calculateEssayTotal, essayEvaluationSchema, gradeAnswer } from '../src/index';

describe('regras críticas', () => {
  it('corrige somente contra o gabarito persistido', () => {
    expect(gradeAnswer('b', 'b').correct).toBe(true);
    expect(gradeAnswer('b', 'a').correct).toBe(false);
  });

  it('soma a nota de redação', () => expect(calculateEssayTotal([200, 160, 120, 80, 40])).toBe(600));

  it('rejeita uma saída de IA fora da rubrica', () => {
    expect(() => essayEvaluationSchema.parse({ competencies: { c1: { score: 90, justification: 'x' } } })).toThrow();
  });
});
