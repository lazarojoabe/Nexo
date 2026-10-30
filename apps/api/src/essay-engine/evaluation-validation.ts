import { assertEvaluationGroundedInText, essayEvaluationSchema, type EssayAnalysisSignals } from '@nexo/shared';
import type { EssayAiProvider } from './provider';
import { ENEM_RUBRIC_VERSION } from './rubric';

export function validateEssayEvaluation(raw: unknown, text: string, signals: EssayAnalysisSignals, provider: Pick<EssayAiProvider, 'providerName' | 'modelName'>) {
  // A provider sometimes paraphrases an excerpt while otherwise returning a
  // valid assessment. Never show a paraphrase as if it came from the student:
  // remove only that optional citation and keep the independently valid
  // pedagogical feedback. This avoids discarding an entire evaluation for a
  // non-authoritative display field.
  const parsed = removeUngroundedExcerpts(essayEvaluationSchema.parse(raw), text);
  const reviewReasons = [...new Set([...signals.reviewReasons, ...parsed.reviewReasons])].slice(0, 10);
  const needsHumanReview = signals.needsHumanReview || parsed.needsHumanReview;
  const limitations = [...new Set([
    ...parsed.limitations,
    ...(signals.hasIllegibleExcerpt ? ['Partes marcadas como ilegíveis podem limitar a leitura de aspectos locais.'] : []),
    ...(signals.hasPromptInjectionAttempt ? ['Instruções presentes na redação foram ignoradas como comandos e tratadas somente como conteúdo.'] : []),
    ...(signals.isVeryShort ? ['A extensão reduzida do texto limita a segurança desta estimativa.'] : []),
  ])].slice(0, 10);
  const confidence = needsHumanReview ? 'baixa' : signals.hasApparentConclusion && signals.hasInterventionIndicators ? 'alta' : 'media';
  const evaluation = essayEvaluationSchema.parse({
    ...parsed,
    rubricVersion: ENEM_RUBRIC_VERSION,
    provider: provider.providerName,
    model: provider.modelName,
    confidence,
    needsHumanReview,
    reviewReasons,
    limitations,
    analysisSignals: signals,
    evaluatedAt: new Date().toISOString(),
  });
  return assertEvaluationGroundedInText(evaluation, text);
}

function removeUngroundedExcerpts(evaluation: ReturnType<typeof essayEvaluationSchema.parse>, text: string) {
  const normalizedText = normalizeExcerpt(text);
  return {
    ...evaluation,
    competencies: evaluation.competencies.map((competency) => ({
      ...competency,
      evidence: competency.evidence.filter((item) => normalizedText.includes(normalizeExcerpt(item.excerpt))),
      feedbackPoints: competency.feedbackPoints.map((point) => {
        if (!point.excerpt || normalizedText.includes(normalizeExcerpt(point.excerpt))) return point;
        const { excerpt: _excerpt, ...withoutExcerpt } = point;
        return withoutExcerpt;
      }),
    })),
  };
}

function normalizeExcerpt(value: string) {
  return value.normalize('NFC').replace(/\s+/g, ' ').trim();
}
