import { assertEvaluationGroundedInText, essayEvaluationSchema, type EssayAnalysisSignals } from '@nexo/shared';
import type { EssayAiProvider } from './provider';
import { ENEM_RUBRIC_VERSION } from './rubric';

export function validateEssayEvaluation(raw: unknown, text: string, signals: EssayAnalysisSignals, provider: Pick<EssayAiProvider, 'providerName' | 'modelName'>) {
  const parsed = essayEvaluationSchema.parse(raw);
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
