import { z } from 'zod';

export const answerSchema = z.object({ optionId: z.string().min(1) });
export const essayTextSchema = z.string().trim().min(20, 'Escreva ao menos 20 caracteres.').max(8000);

const transcriptionLineRangeSchema = z.object({
  start: z.number().int().positive(),
  end: z.number().int().positive(),
}).refine((range) => range.end >= range.start, 'O fim da faixa de linhas deve ser maior ou igual ao início.');

export const transcriptionParagraphSchema = z.object({
  index: z.number().int().positive(),
  rawText: z.string().min(1).max(8000),
  normalizedText: z.string().min(1).max(8000),
  confidence: z.number().min(0).max(1),
  lineRange: transcriptionLineRangeSchema,
});

export const transcriptionCorrectionSchema = z.object({
  original: z.string().min(1).max(600),
  normalized: z.string().min(1).max(600),
  type: z.enum(['line_break_join', 'visual_ocr_correction']),
  confidence: z.number().min(0).max(1),
  requiresReview: z.boolean(),
  reason: z.string().min(1).max(240),
});

export const uncertainTermSchema = z.object({
  observed: z.string().min(1).max(300),
  suggestion: z.string().min(1).max(300),
  confidence: z.number().min(0).max(1),
  requiresReview: z.boolean(),
});

/**
 * The durable transcription contract. `text` and `lowConfidenceSegments` are
 * retained as derived aliases for older API clients; new code must use the
 * explicit raw/normalized fields.
 */
export const transcriptionSchema = z.object({
  rawText: z.string().max(8000),
  normalizedText: z.string().max(8000),
  paragraphs: z.array(transcriptionParagraphSchema).max(50),
  corrections: z.array(transcriptionCorrectionSchema).max(100),
  uncertainTerms: z.array(uncertainTermSchema).max(50),
  overallConfidence: z.number().min(0).max(1),
  requiresReview: z.boolean(),
}).superRefine((value, context) => {
  value.paragraphs.forEach((paragraph, index) => {
    if (paragraph.index !== index + 1) context.addIssue({ code: z.ZodIssueCode.custom, path: ['paragraphs', index, 'index'], message: 'Os parágrafos devem ser indexados em ordem a partir de 1.' });
  });
}).transform((value) => ({
  ...value,
  // Deprecated aliases preserve the previous HTTP response shape during the
  // client migration. They are generated, never accepted as provider input.
  text: value.normalizedText,
  lowConfidenceSegments: value.uncertainTerms.map((term) => ({ text: term.observed, reason: term.suggestion === term.observed ? 'Leitura visual incerta.' : `Possível leitura: ${term.suggestion}` })),
}));

/** First, faithful visual pass returned by a handwriting provider. */
export const transcriptionFirstPassSchema = z.object({
  rawText: z.string().min(1).max(8000),
  paragraphs: z.array(z.object({
    index: z.number().int().positive(),
    rawText: z.string().min(1).max(8000),
    confidence: z.number().min(0).max(1),
    lineRange: transcriptionLineRangeSchema,
  })).min(1).max(50),
  uncertainTerms: z.array(uncertainTermSchema).max(50).default([]),
  overallConfidence: z.number().min(0).max(1),
  requiresReview: z.boolean().default(false),
}).superRefine((value, context) => {
  value.paragraphs.forEach((paragraph, index) => {
    if (paragraph.index !== index + 1) context.addIssue({ code: z.ZodIssueCode.custom, path: ['paragraphs', index, 'index'], message: 'Os parágrafos devem ser indexados em ordem a partir de 1.' });
  });
});

/** Second, independent visual pass. It may report discrepancies, never rewrite the essay. */
export const transcriptionVerificationSchema = z.object({
  divergences: z.array(z.object({
    observed: z.string().min(1).max(300),
    suggestion: z.string().min(1).max(300),
    confidence: z.number().min(0).max(1),
    visuallyConfirmed: z.boolean(),
    reason: z.string().min(1).max(240),
  })).max(50),
  overallConfidence: z.number().min(0).max(1),
});

export type Transcription = z.infer<typeof transcriptionSchema>;
export type TranscriptionFirstPass = z.infer<typeof transcriptionFirstPassSchema>;
export type TranscriptionVerification = z.infer<typeof transcriptionVerificationSchema>;

export const optionLabelSchema = z.enum(['A', 'B', 'C', 'D', 'E']);

const importedOptionSchema = z.object({
  label: optionLabelSchema,
  content: z.string().trim().min(1).max(6000),
});

export const questionAssetPlacementSchema = z.enum(['before_statement', 'after_statement', 'option']);
export const importedQuestionAssetSchema = z.object({
  url: z.string().url(),
  storagePath: z.string().trim().min(3).max(500).optional(),
  placement: questionAssetPlacementSchema,
  optionLabel: optionLabelSchema.optional(),
  displayOrder: z.number().int().min(0).max(99).default(0),
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  altText: z.string().trim().min(3).max(500),
  sourcePage: z.number().int().positive().max(500),
  sourceCrop: z.object({ x: z.number().min(0), y: z.number().min(0), width: z.number().positive(), height: z.number().positive() }).optional(),
  sourceHash: z.string().regex(/^[a-fA-F0-9]{64}$/, 'O hash da imagem deve ser SHA-256.').optional(),
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
    assets: z.array(importedQuestionAssetSchema).max(12).default([]),
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
    const assetKeys = new Set<string>();
    question.assets.forEach((asset, assetIndex) => {
      if (asset.placement === 'option' && !asset.optionLabel) context.addIssue({ code: z.ZodIssueCode.custom, path: ['questions', index, 'assets', assetIndex, 'optionLabel'], message: 'Imagem de alternativa deve informar a letra da alternativa.' });
      if (asset.placement !== 'option' && asset.optionLabel) context.addIssue({ code: z.ZodIssueCode.custom, path: ['questions', index, 'assets', assetIndex, 'optionLabel'], message: 'optionLabel só pode ser usado em imagem de alternativa.' });
      if (asset.optionLabel && !labels.includes(asset.optionLabel)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['questions', index, 'assets', assetIndex, 'optionLabel'], message: 'A alternativa vinculada à imagem não existe na questão.' });
      const key = `${asset.placement}:${asset.optionLabel ?? ''}:${asset.displayOrder}`;
      if (assetKeys.has(key)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['questions', index, 'assets', assetIndex], message: 'Duas imagens não podem ocupar a mesma posição.' });
      assetKeys.add(key);
    });
  });
});

export type ExamImport = z.infer<typeof examImportSchema>;

export const enemScoreSchema = z.union([
  z.literal(0), z.literal(40), z.literal(80), z.literal(120), z.literal(160), z.literal(200),
]);

export const essayConfidenceSchema = z.enum(['alta', 'media', 'baixa']);
export const essayAnalysisSignalsSchema = z.object({
  characterCount: z.number().int().nonnegative(),
  wordCount: z.number().int().nonnegative(),
  sentenceCount: z.number().int().nonnegative(),
  paragraphCount: z.number().int().nonnegative(),
  hasIllegibleExcerpt: z.boolean(),
  isVeryShort: z.boolean(),
  hasIncompleteStructure: z.boolean(),
  hasExcessiveRepetition: z.boolean(),
  hasApparentConclusion: z.boolean(),
  hasInterventionIndicators: z.boolean(),
  hasPromptInjectionAttempt: z.boolean(),
  needsHumanReview: z.boolean(),
  reviewReasons: z.array(z.string().min(1).max(240)).max(10),
});

export const feedbackPointSchema = z.object({
  category: z.enum(['norma_culta', 'pontuacao', 'coesao', 'clareza', 'repertorio', 'argumentacao', 'tema', 'proposta_intervencao']),
  severity: z.enum(['prioridade', 'atencao', 'evolucao']),
  excerpt: z.string().min(1).max(300).optional(),
  diagnosis: z.string().min(1).max(600),
  suggestion: z.string().min(1).max(600),
});

export const evaluationCompetencySchema = z.object({
  id: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  score: enemScoreSchema,
  level: z.enum(['insuficiente', 'regular', 'bom', 'excelente']),
  strengths: z.array(z.string().min(1).max(360)).max(4),
  issues: z.array(z.string().min(1).max(360)).max(4),
  evidence: z.array(z.object({
    excerpt: z.string().min(1).max(300),
    explanation: z.string().min(1).max(600),
  })).max(3),
  feedbackPoints: z.array(feedbackPointSchema).min(1).max(5),
  actionableFeedback: z.array(z.string().min(1).max(360)).min(1).max(4),
});

export const essayEvaluationSchema = z.object({
  competencies: z.array(evaluationCompetencySchema).length(5),
  generalFeedback: z.string().min(1).max(1600),
  priorityActions: z.array(z.string().min(1).max(360)).min(1).max(5),
  interventionProposal: z.object({
    agent: z.string().min(1).max(240),
    action: z.string().min(1).max(360),
    means: z.string().min(1).max(360),
    purpose: z.string().min(1).max(360),
    detail: z.string().min(1).max(360).optional(),
  }).optional(),
  // These fields are supplied by the application after the provider response is
  // validated. Defaults preserve safe reads of evaluations persisted before v3.
  rubricVersion: z.string().min(1).max(120).default('enem-2026-simulation-v2'),
  provider: z.string().min(1).max(80).default('gemini'),
  model: z.string().min(1).max(160).default('unknown'),
  confidence: essayConfidenceSchema.default('media'),
  needsHumanReview: z.boolean().default(false),
  reviewReasons: z.array(z.string().min(1).max(240)).max(10).default([]),
  limitations: z.array(z.string().min(1).max(360)).max(10).default([]),
  analysisSignals: essayAnalysisSignalsSchema.optional(),
  evaluatedAt: z.string().datetime().optional(),
  totalScore: z.number().int().min(0).max(1000).optional(),
}).superRefine((value, context) => {
  const ids = value.competencies.map((competency) => competency.id).sort();
  if (ids.join(',') !== '1,2,3,4,5') {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['competencies'], message: 'A avaliação deve conter exatamente as cinco competências do ENEM.' });
  }
  const calculatedTotal = value.competencies.reduce((sum, competency) => sum + competency.score, 0);
  if (value.totalScore !== undefined && value.totalScore !== calculatedTotal) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['totalScore'], message: 'A nota total deve ser a soma das cinco competências.' });
  }
}).transform((value) => ({
  ...value,
  totalScore: value.competencies.reduce((sum, competency) => sum + competency.score, 0),
  disclaimer: 'Estimativa educacional por IA; não é nota oficial nem garantia de desempenho.',
}));

export type EssayEvaluation = z.infer<typeof essayEvaluationSchema>;
export type EssayAnalysisSignals = z.infer<typeof essayAnalysisSignalsSchema>;

export const essayReferenceImportSchema = z.object({
  topic: z.string().trim().min(3).max(300),
  year: z.number().int().min(1998).max(2100).optional(),
  source: z.string().trim().min(3).max(300),
  sourceUrl: z.string().url().optional(),
  license: z.string().trim().min(3).max(300),
  authorizationConfirmed: z.literal(true),
  reviewStatus: z.enum(['pending', 'approved', 'rejected']).default('pending'),
  competencyAnnotations: z.record(z.string(), z.string().max(1600)).default({}),
  tags: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  authorizedExcerpt: z.string().trim().min(20).max(8000),
});

export type EssayReferenceImport = z.infer<typeof essayReferenceImportSchema>;

/** Keeps feedback anchored to the student's actual draft, allowing only whitespace changes. */
export function assertEvaluationGroundedInText(evaluation: EssayEvaluation, text: string) {
  const normalizedText = normalizeExcerpt(text);
  for (const competency of evaluation.competencies) {
    const excerpts = [
      ...competency.evidence.map((item) => item.excerpt),
      ...competency.feedbackPoints.flatMap((item) => item.excerpt ? [item.excerpt] : []),
    ];
    for (const excerpt of excerpts) {
      if (!normalizedText.includes(normalizeExcerpt(excerpt))) {
        throw new Error(`A devolutiva da competência ${competency.id} contém um trecho que não está no texto confirmado.`);
      }
    }
  }
  return evaluation;
}

function normalizeExcerpt(value: string) {
  return value.normalize('NFC').replace(/\s+/g, ' ').trim();
}

export function gradeAnswer(correctOptionId: string, optionId: string) {
  return { correct: correctOptionId === optionId, correctOptionId };
}

export function calculateEssayTotal(scores: readonly number[]) {
  if (scores.length !== 5 || scores.some((score) => ![0, 40, 80, 120, 160, 200].includes(score))) {
    throw new Error('As cinco competências devem conter valores de 0 a 200 em incrementos de 40.');
  }
  return scores.reduce((sum, score) => sum + score, 0);
}
