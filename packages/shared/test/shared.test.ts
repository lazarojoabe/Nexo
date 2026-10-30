import { describe, expect, it } from 'vitest';
import { assertEvaluationGroundedInText, calculateEssayTotal, essayEvaluationSchema, examImportSchema, gradeAnswer } from '../src/index';

describe('regras críticas', () => {
  it('corrige somente contra o gabarito persistido', () => {
    expect(gradeAnswer('b', 'b').correct).toBe(true);
    expect(gradeAnswer('b', 'a').correct).toBe(false);
  });

  it('soma a nota de redação', () => expect(calculateEssayTotal([200, 160, 120, 80, 40])).toBe(600));

  it('rejeita uma saída de IA fora da rubrica', () => {
    expect(() => essayEvaluationSchema.parse({ competencies: { c1: { score: 90, justification: 'x' } } })).toThrow();
  });

  it('aceita as cinco competências e calcula a nota total no servidor', () => {
    const competency = (id: 1 | 2 | 3 | 4 | 5, score: 0 | 40 | 80 | 120 | 160 | 200) => ({ id, score, level: 'bom' as const, strengths: ['Boa organização.'], issues: ['Aprofundar a análise.'], evidence: [{ excerpt: 'Trecho do texto', explanation: 'Sustenta o ponto de vista.' }], feedbackPoints: [{ category: 'argumentacao' as const, severity: 'atencao' as const, excerpt: 'Trecho do texto', diagnosis: 'O argumento precisa de explicação.', suggestion: 'Explique a relação de causa e consequência.' }], actionableFeedback: ['Revise este parágrafo.'] });
    const evaluation = essayEvaluationSchema.parse({ competencies: [competency(1, 200), competency(2, 160), competency(3, 120), competency(4, 80), competency(5, 40)], generalFeedback: 'Há uma linha argumentativa clara.', priorityActions: ['Fortalecer o repertório.'] });
    expect(evaluation.totalScore).toBe(600);
    expect(evaluation.disclaimer).toContain('não é nota oficial');
  });

  it('rejeita competência ausente ou repetida', () => {
    const competency = { score: 120, level: 'regular', strengths: [], issues: ['Revisar.'], evidence: [], feedbackPoints: [{ category: 'clareza', severity: 'atencao', diagnosis: 'Revise a frase.', suggestion: 'Torne a ideia explícita.' }], actionableFeedback: ['Reescrever.'] };
    expect(() => essayEvaluationSchema.parse({ competencies: [{ ...competency, id: 1 }, { ...competency, id: 1 }, { ...competency, id: 2 }, { ...competency, id: 3 }, { ...competency, id: 4 }], generalFeedback: 'x', priorityActions: ['y'] })).toThrow();
  });

  it('rejeita trechos de feedback que não estão na redação confirmada', () => {
    const competency = (id: 1 | 2 | 3 | 4 | 5) => ({ id, score: 120 as const, level: 'regular' as const, strengths: [], issues: ['Revisar.'], evidence: [], feedbackPoints: [{ category: 'clareza' as const, severity: 'atencao' as const, excerpt: 'trecho inventado', diagnosis: 'Há um salto lógico.', suggestion: 'Explique a conexão.' }], actionableFeedback: ['Revisar.'] });
    const evaluation = essayEvaluationSchema.parse({ competencies: [competency(1), competency(2), competency(3), competency(4), competency(5)], generalFeedback: 'Feedback.', priorityActions: ['Revisar.'] });
    expect(() => assertEvaluationGroundedInText(evaluation, 'Este texto não contém a citação usada.')).toThrow('não está no texto confirmado');
  });

  it('exige cinco alternativas distintas e gabarito para cada questão ativa', () => {
    const question = { number: 1, area: 'Matemática', statement: 'Quanto é 1 + 1?', options: ['A', 'B', 'C', 'D', 'E'].map((label) => ({ label, content: label })), correctOptionLabel: 'B' };
    const payload = { sourceUrl: 'https://www.gov.br/inep', sourceVersion: 'revisado', exam: { year: 2025, day: 1, color: 'azul', version: 'caderno-1' }, questions: [question] };
    expect(examImportSchema.parse(payload).questions).toHaveLength(1);
    expect(() => examImportSchema.parse({ ...payload, questions: [{ ...question, correctOptionLabel: 'Z' }] })).toThrow();
  });

  it('valida o posicionamento e a alternativa das imagens importadas', () => {
    const question = { number: 1, area: 'Matemática', statement: 'Observe a figura.', options: ['A', 'B', 'C', 'D', 'E'].map((label) => ({ label, content: label })), correctOptionLabel: 'B', assets: [{ url: 'https://cdn.example.test/q1.png', placement: 'option', optionLabel: 'B', displayOrder: 0, mimeType: 'image/png', altText: 'Gráfico da alternativa B.', sourcePage: 3 }] };
    const payload = { sourceUrl: 'https://www.gov.br/inep', sourceVersion: 'revisado', exam: { year: 2025, day: 1, color: 'azul', version: 'caderno-1' }, questions: [question] };
    expect(examImportSchema.parse(payload).questions[0].assets[0].optionLabel).toBe('B');
    expect(() => examImportSchema.parse({ ...payload, questions: [{ ...question, assets: [{ ...question.assets[0], optionLabel: 'Z' }] }] })).toThrow();
  });
});
