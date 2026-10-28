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
