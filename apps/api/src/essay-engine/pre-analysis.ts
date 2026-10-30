import type { EssayAnalysisSignals } from '@nexo/shared';

const injectionPatterns = [
  /ignore\s+(todas?\s+)?(as\s+)?(instru[cç][õo]es|regras|orienta[cç][õo]es)/i,
  /ignore\s+(all|previous|the)\s+(instructions|rules|prompts)/i,
  /(d[eê]|atribua|retorne)\s+(uma\s+)?nota\s+(1000|mil)/i,
  /(system\s*prompt|prompt\s*injection|jailbreak|developer\s*message)/i,
  /(return|responda|retorne)\s+(only|apenas|somente)\s+(json|outro formato)/i,
];

const interventionPatterns = [/(governo|estado|prefeitura|minist[eé]rio|escola|m[ií]dia|sociedade civil|ong|empresa)/i, /(deve|devem|precisa|precisam|por meio|mediante|atrav[eé]s)/i, /(para que|a fim de|com o objetivo de|visando)/i];
const conclusionPattern = /(portanto|assim|desse modo|logo|em suma|conclui-se|diante disso|por fim)/i;

/** Non-pedagogical signals only; they inform the model and confidence, never a score. */
export function preAnalyzeEssay(text: string): EssayAnalysisSignals {
  const normalized = text.normalize('NFC').trim();
  const paragraphs = normalized ? normalized.split(/\n\s*\n|\r?\n/).map((paragraph) => paragraph.trim()).filter(Boolean) : [];
  const words = normalized.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [];
  const sentences = normalized.split(/[.!?]+(?:\s|$)/).map((sentence) => sentence.trim()).filter(Boolean);
  const hasIllegibleExcerpt = /\[\s*trecho\s+ileg[ií]vel\s*\]/i.test(normalized);
  const isVeryShort = words.length < 60 || normalized.length < 350;
  const hasIncompleteStructure = paragraphs.length < 3 || sentences.length < 5;
  const hasExcessiveRepetition = repeatedWordRatio(words) >= 0.18;
  const ending = normalized.slice(Math.floor(normalized.length * 0.65));
  const hasApparentConclusion = conclusionPattern.test(ending) || paragraphs.length >= 4;
  const hasInterventionIndicators = interventionPatterns.filter((pattern) => pattern.test(normalized)).length >= 2;
  const hasPromptInjectionAttempt = injectionPatterns.some((pattern) => pattern.test(normalized));
  const reviewReasons = [
    ...(hasIllegibleExcerpt ? ['Há trechos marcados como ilegíveis na transcrição.'] : []),
    ...(isVeryShort ? ['O texto é muito curto para uma estimativa pedagógica confiável.'] : []),
    ...(hasIncompleteStructure ? ['A estrutura aparente do texto está incompleta.'] : []),
    ...(hasExcessiveRepetition ? ['Há repetição elevada de palavras, que pode exigir confirmação humana.'] : []),
    ...(hasPromptInjectionAttempt ? ['O texto contém instruções dirigidas ao sistema de avaliação, tratadas apenas como conteúdo da redação.'] : []),
  ];

  return {
    characterCount: normalized.length,
    wordCount: words.length,
    sentenceCount: sentences.length,
    paragraphCount: paragraphs.length,
    hasIllegibleExcerpt,
    isVeryShort,
    hasIncompleteStructure,
    hasExcessiveRepetition,
    hasApparentConclusion,
    hasInterventionIndicators,
    hasPromptInjectionAttempt,
    needsHumanReview: reviewReasons.length > 0,
    reviewReasons,
  };
}

function repeatedWordRatio(words: string[]) {
  const meaningful = words.map((word) => word.toLocaleLowerCase('pt-BR')).filter((word) => word.length >= 5);
  if (meaningful.length < 12) return 0;
  const counts = new Map<string, number>();
  for (const word of meaningful) counts.set(word, (counts.get(word) ?? 0) + 1);
  return Math.max(...counts.values()) / meaningful.length;
}
