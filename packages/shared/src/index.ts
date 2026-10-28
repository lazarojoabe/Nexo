import { z } from 'zod';

export const answerSchema = z.object({ optionId: z.string().min(1) });
export const essayTextSchema = z.string().trim().min(20, 'Escreva ao menos 20 caracteres.').max(8000);

export const transcriptionSchema = z.object({
  text: z.string().max(8000),
  lowConfidenceSegments: z.array(z.object({
    text: z.string().min(1).max(300),
    reason: z.string().max(240).optional(),
  })).max(50),
});

export const optionLabelSchema = z.enum(['A', 'B', 'C', 'D', 'E']);

const importedOptionSchema = z.object({
  label: optionLabelSchema,
  content: z.string().trim().min(1).max(6000),
});

export const examImportSchema = z.object({
  sourceUrl: z.string().url(),
  sourceVersion: z.string().trim().min(1).max(160),
  exam: z.object({
    id: z.string().trim().min(3).max(120).optional(),
    year: z.number().int().min(1998).max(2100),
    day: z.number().int().min(1).max(6),
    color: z.string().trim().min(1).max(40),
    language: z.string().trim().min(1).max(40).optional(),
    version: z.string().trim().min(1).max(80),
  }),
  questions: z.array(z.object({
    number: z.number().int().positive(),
    area: z.string().trim().min(1).max(80),
    statement: z.string().trim().min(1).max(20000),
    explanation: z.string().trim().max(12000).optional(),
    imageUrl: z.string().url().optional(),
    isCancelled: z.boolean().default(false),
    correctOptionLabel: optionLabelSchema.optional(),
    options: z.array(importedOptionSchema).length(5),
  })).min(1).max(300),
}).superRefine((payload, context) => {
  const numbers = new Set<number>();
  payload.questions.forEach((question, index) => {
    if (numbers.has(question.number)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['questions', index, 'number'], message: 'Número de questão duplicado.' });
    numbers.add(question.number);
    const labels = question.options.map((option) => option.label);
    if (new Set(labels).size !== 5 || !['A', 'B', 'C', 'D', 'E'].every((label) => labels.includes(label as never))) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['questions', index, 'options'], message: 'Cada questão deve conter exatamente as alternativas A, B, C, D e E.' });
    }
    if (!question.isCancelled && !question.correctOptionLabel) context.addIssue({ code: z.ZodIssueCode.custom, path: ['questions', index, 'correctOptionLabel'], message: 'Questão ativa precisa de gabarito.' });
    if (question.correctOptionLabel && !labels.includes(question.correctOptionLabel)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['questions', index, 'correctOptionLabel'], message: 'Gabarito não encontrado nas alternativas.' });
  });
});

export type ExamImport = z.infer<typeof examImportSchema>;

export const competencySchema = z.object({
  score: z.union([z.literal(0), z.literal(40), z.literal(80), z.literal(120), z.literal(160), z.literal(200)]),
  justification: z.string().min(1).max(1200),
  feedback: z.array(z.string().min(1).max(360)).min(1).max(4),
});

export const essayEvaluationSchema = z.object({
  competencies: z.object({ c1: competencySchema, c2: competencySchema, c3: competencySchema, c4: competencySchema, c5: competencySchema }),
  strengths: z.array(z.string()).max(5),
  problems: z.array(z.string()).max(5),
  improvementExamples: z.array(z.string()).max(5),
  studyPlan: z.array(z.string()).min(1).max(6),
}).transform((value) => ({ ...value, totalScore: Object.values(value.competencies).reduce((sum, competency) => sum + competency.score, 0) }));

export type EssayEvaluation = z.infer<typeof essayEvaluationSchema>;

export function gradeAnswer(correctOptionId: string, optionId: string) {
  return { correct: correctOptionId === optionId, correctOptionId };
}

export function calculateEssayTotal(scores: readonly number[]) {
  if (scores.length !== 5 || scores.some((score) => ![0, 40, 80, 120, 160, 200].includes(score))) {
    throw new Error('As cinco competências devem conter valores de 0 a 200 em incrementos de 40.');
  }
  return scores.reduce((sum, score) => sum + score, 0);
}
