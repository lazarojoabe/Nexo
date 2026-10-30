import {
  transcriptionSchema,
  type Transcription,
  type TranscriptionFirstPass,
  type TranscriptionVerification,
} from '@nexo/shared';

const automaticVisualCorrectionThreshold = 0.985;

// These are independent words frequently joined with a lexical hyphen in
// Portuguese. Keeping this small, explicit allowlist makes the normalizer
// conservative: an unknown hyphen stays untouched instead of "correcting" a
// student's writing. This is not a spelling checker.
const lexicalHyphenPrefixes = new Set([
  'arco', 'bem', 'ex', 'guarda', 'mal', 'pós', 'pré', 'recém', 'segunda',
  'sexta', 'sócio', 'vice', 'anti', 'auto', 'contra', 'extra', 'infra',
  'micro', 'mini', 'multi', 'pós', 'pré', 'semi', 'super', 'ultra',
]);

type NormalizationChange = { original: string; normalized: string };

/**
 * Applies only display/line-layout changes. It deliberately has no grammar,
 * spell-checking, agreement, or language-model step.
 */
export function normalizeVisualParagraph(rawText: string) {
  const { text: joinedText, changes } = joinVisualLineBreaks(rawText);
  return {
    normalizedText: joinedText
      .replace(/[\t ]*\r?\n[\t ]*/g, ' ')
      .replace(/[\t ]{2,}/g, ' ')
      .trim(),
    changes,
  };
}

/** Builds the public durable contract from two image-only reads. */
export function buildStructuredTranscription(firstPass: TranscriptionFirstPass, verification?: TranscriptionVerification): Transcription {
  const corrections: Array<{ original: string; normalized: string; type: 'line_break_join' | 'visual_ocr_correction'; confidence: number; requiresReview: boolean; reason: string }> = [];
  let paragraphs = firstPass.paragraphs.map((paragraph) => {
    const normalized = normalizeVisualParagraph(paragraph.rawText);
    normalized.changes.forEach((change) => corrections.push({
      ...change,
      type: 'line_break_join',
      confidence: 0.99,
      requiresReview: false,
      reason: change.normalized.includes('-') ? 'Hífen lexical preservado ao remover a quebra física de linha.' : 'Palavra dividida visualmente no fim da linha.',
    }));
    return { ...paragraph, normalizedText: normalized.normalizedText };
  });

  // Any term explicitly marked uncertain stays reviewable even if a provider
  // accidentally returns a false flag.
  const uncertainTerms = firstPass.uncertainTerms.map((term) => ({ ...term, requiresReview: true }));
  for (const divergence of verification?.divergences ?? []) {
    const canCorrect = divergence.visuallyConfirmed
      && divergence.confidence >= automaticVisualCorrectionThreshold
      && countOccurrences(paragraphs.map((paragraph) => paragraph.normalizedText).join('\n\n'), divergence.observed) === 1;

    if (!canCorrect) {
      addUncertainTerm(uncertainTerms, {
        observed: divergence.observed,
        suggestion: divergence.suggestion,
        confidence: divergence.confidence,
        requiresReview: true,
      });
      continue;
    }

    let corrected = false;
    paragraphs = paragraphs.map((paragraph) => {
      if (corrected || !paragraph.normalizedText.includes(divergence.observed)) return paragraph;
      corrected = true;
      return { ...paragraph, normalizedText: paragraph.normalizedText.replace(divergence.observed, divergence.suggestion) };
    });
    if (corrected) corrections.push({
      original: divergence.observed,
      normalized: divergence.suggestion,
      type: 'visual_ocr_correction',
      confidence: divergence.confidence,
      requiresReview: false,
      reason: divergence.reason,
    });
  }

  const overallConfidence = Math.min(firstPass.overallConfidence, verification?.overallConfidence ?? 1);
  const requiresReview = firstPass.requiresReview || uncertainTerms.some((term) => term.requiresReview) || overallConfidence < 0.85;
  return transcriptionSchema.parse({
    rawText: firstPass.rawText,
    normalizedText: paragraphs.map((paragraph) => paragraph.normalizedText).join('\n\n'),
    paragraphs,
    corrections,
    uncertainTerms,
    overallConfidence,
    requiresReview,
  });
}

function joinVisualLineBreaks(rawText: string): { text: string; changes: NormalizationChange[] } {
  const changes: NormalizationChange[] = [];
  const text = rawText.replace(/([\p{L}\p{M}]{2,})-\r?\n([\p{Ll}\p{M}]{2,})/gu, (original, prefix: string, continuation: string) => {
    const normalized = isClearlyVisualBreak(prefix, continuation) ? `${prefix}${continuation}` : `${prefix}-${continuation}`;
    changes.push({ original, normalized });
    return normalized;
  });
  return { text, changes };
}

function isClearlyVisualBreak(prefix: string, continuation: string) {
  const normalizedPrefix = prefix.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR');
  if (lexicalHyphenPrefixes.has(prefix.toLocaleLowerCase('pt-BR')) || lexicalHyphenPrefixes.has(normalizedPrefix)) return false;
  // A continuation beginning with a lowercase letter and a non-lexical first
  // fragment is the only pattern changed automatically. Uppercase, numbers,
  // symbols, and known compounds retain their hyphen exactly as written.
  return /^[\p{Ll}\p{M}]+$/u.test(continuation);
}

function countOccurrences(text: string, value: string) {
  if (!value) return 0;
  return text.split(value).length - 1;
}

function addUncertainTerm(terms: Array<{ observed: string; suggestion: string; confidence: number; requiresReview: boolean }>, term: { observed: string; suggestion: string; confidence: number; requiresReview: boolean }) {
  if (!terms.some((item) => item.observed === term.observed && item.suggestion === term.suggestion)) terms.push(term);
}
