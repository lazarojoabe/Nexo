import { assertEvaluationGroundedInText, essayEvaluationSchema, type EssayAnalysisSignals } from '@nexo/shared';
import type { EssayAiProvider } from './provider';
import { ENEM_RUBRIC_VERSION } from './rubric';

export function validateEssayEvaluation(raw: unknown, text: string, signals: EssayAnalysisSignals, provider: Pick<EssayAiProvider, 'providerName' | 'modelName'>) {
  // A provider sometimes paraphrases an excerpt while otherwise returning a
  // valid assessment. Never show a paraphrase as if it came from the student:
  // remove only that optional citation and keep the independently valid
  // pedagogical feedback. This avoids discarding an entire evaluation for a
  // non-authoritative display field.
  const parsed = removeUngroundedExcerpts(essayEvaluationSchema.parse(normalizeProviderEvaluation(raw)), text);
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

/**
 * Gemini occasionally returns Portuguese display labels instead of the stable
 * machine labels requested by our contract. These are presentation aliases,
 * not changes to a student's text or to the score: normalize only known,
 * lossless variants before the strict schema validation runs.
 */
function normalizeProviderEvaluation(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  const competencies = Array.isArray(raw.competencies)
    ? raw.competencies.map(normalizeCompetency)
    : raw.competencies;
  return {
    ...raw,
    competencies,
    totalScore: asFiniteInteger(raw.totalScore) ?? raw.totalScore,
    generalFeedback: truncateLiteral(raw.generalFeedback, 1600),
    priorityActions: normalizeStringList(raw.priorityActions, 5, 360),
    limitations: normalizeStringList(raw.limitations, 10, 360),
    reviewReasons: normalizeStringList(raw.reviewReasons, 10, 240),
  };
}

function normalizeCompetency(value: unknown): unknown {
  if (!isRecord(value)) return value;
  return {
    ...value,
    id: asFiniteInteger(value.id) ?? value.id,
    score: asFiniteInteger(value.score) ?? value.score,
    level: normalizeEnum(value.level, validLevels, levelAliases),
    strengths: normalizeStringList(value.strengths, 4, 360),
    issues: normalizeStringList(value.issues, 4, 360),
    evidence: Array.isArray(value.evidence)
      ? value.evidence.slice(0, 3).map(normalizeEvidence)
      : value.evidence,
    feedbackPoints: Array.isArray(value.feedbackPoints)
      ? value.feedbackPoints.slice(0, 5).map(normalizeFeedbackPoint)
      : value.feedbackPoints,
  };
}

function normalizeEvidence(value: unknown): unknown {
  if (!isRecord(value)) return value;
  return {
    ...value,
    excerpt: truncateLiteral(value.excerpt, 300),
    explanation: truncateLiteral(value.explanation, 600),
  };
}

function normalizeFeedbackPoint(value: unknown): unknown {
  if (!isRecord(value)) return value;
  return {
    ...value,
    category: normalizeEnum(value.category, validCategories, categoryAliases),
    severity: normalizeEnum(value.severity, validSeverities, severityAliases),
    excerpt: truncateLiteral(value.excerpt, 300),
    diagnosis: truncateLiteral(value.diagnosis, 600),
    suggestion: truncateLiteral(value.suggestion, 600),
  };
}

function normalizeStringList(value: unknown, maximumItems: number, maximumCharacters: number): unknown {
  if (!Array.isArray(value)) return value;
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => truncateString(item, maximumCharacters))
    .filter((item) => item.trim().length > 0)
    .slice(0, maximumItems);
}

function asFiniteInteger(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value !== 'string' || !/^-?\d+$/.test(value.trim())) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function normalizeEnum<T extends string>(value: unknown, valid: ReadonlySet<T>, aliases: Record<string, T>): unknown {
  const canonical = canonicalLabel(value);
  if (valid.has(canonical as T)) return canonical;
  return aliases[canonical] ?? value;
}

function truncateLiteral(value: unknown, maximum: number): unknown {
  return typeof value === 'string' ? truncateString(value, maximum) : value;
}

function truncateString(value: string, maximum: number) {
  if (value.length <= maximum) return value;
  const boundary = value.lastIndexOf(' ', maximum);
  return value.slice(0, boundary > 0 ? boundary : maximum).trimEnd();
}

function canonicalLabel(value: unknown) {
  return typeof value === 'string'
    ? value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
    : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const levelAliases: Record<string, 'insuficiente' | 'regular' | 'bom' | 'excelente'> = {
  medio: 'regular',
  mediano: 'regular',
  satisfatorio: 'regular',
  otimo: 'excelente',
};

const validLevels = new Set(['insuficiente', 'regular', 'bom', 'excelente'] as const);

const categoryAliases: Record<string, 'norma_culta' | 'pontuacao' | 'coesao' | 'clareza' | 'repertorio' | 'argumentacao' | 'tema' | 'proposta_intervencao'> = {
  gramatica: 'norma_culta',
  ortografia: 'norma_culta',
  sintaxe: 'norma_culta',
  vocabulario: 'norma_culta',
  regencia: 'norma_culta',
  concordancia: 'norma_culta',
  coesao_textual: 'coesao',
  desenvolvimento: 'argumentacao',
  intervencao: 'proposta_intervencao',
  proposta_de_intervencao: 'proposta_intervencao',
  adequacao_ao_tema: 'tema',
};

const validCategories = new Set(['norma_culta', 'pontuacao', 'coesao', 'clareza', 'repertorio', 'argumentacao', 'tema', 'proposta_intervencao'] as const);

const severityAliases: Record<string, 'prioridade' | 'atencao' | 'evolucao'> = {
  alta: 'prioridade',
  media: 'atencao',
  baixa: 'evolucao',
};

const validSeverities = new Set(['prioridade', 'atencao', 'evolucao'] as const);

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
