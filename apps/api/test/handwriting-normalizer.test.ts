import { describe, expect, it } from 'vitest';
import type { TranscriptionFirstPass, TranscriptionVerification } from '@nexo/shared';
import { buildStructuredTranscription, normalizeVisualParagraph } from '../src/handwriting-normalizer';

function firstPass(rawText: string, blocks: string[]): TranscriptionFirstPass {
  let line = 1;
  return {
    rawText,
    paragraphs: blocks.map((rawParagraph, index) => {
      const lines = rawParagraph.split('\n').length;
      const paragraph = { index: index + 1, rawText: rawParagraph, confidence: 0.98, lineRange: { start: line, end: line + lines - 1 } };
      line += lines + 1;
      return paragraph;
    }),
    uncertainTerms: [],
    overallConfidence: 0.98,
    requiresReview: false,
  };
}

describe('normalização visual de manuscrito', () => {
  it('reconstrói palavra dividida fisicamente por hífen no fim da linha', () => {
    const transcription = buildStructuredTranscription(firstPass('Havia obs-\ntáculos.', ['Havia obs-\ntáculos.']));
    expect(transcription.normalizedText).toBe('Havia obstáculos.');
    expect(transcription.corrections).toContainEqual(expect.objectContaining({ original: 'obs-\ntáculos', normalized: 'obstáculos', type: 'line_break_join' }));
  });

  it('preserva hífen de palavra composta legítima', () => {
    const normalized = normalizeVisualParagraph('O guarda-\nchuva ficou esquecido.');
    expect(normalized.normalizedText).toBe('O guarda-chuva ficou esquecido.');
    expect(normalized.changes).toEqual([{ original: 'guarda-\nchuva', normalized: 'guarda-chuva' }]);
  });

  it('não corrige erros gramaticais do estudante', () => {
    const transcription = buildStructuredTranscription(firstPass('Há poucos escolas e afim de mudar.', ['Há poucos escolas e afim de mudar.']));
    expect(transcription.normalizedText).toBe('Há poucos escolas e afim de mudar.');
    expect(transcription.corrections).toEqual([]);
  });

  it('mantém divergência sem evidência visual como termo incerto', () => {
    const verification: TranscriptionVerification = { divergences: [{ observed: 'diminuição', suggestion: 'discriminação', confidence: 0.74, visuallyConfirmed: false, reason: 'Traços iniciais pouco nítidos.' }], overallConfidence: 0.74 };
    const transcription = buildStructuredTranscription(firstPass('A diminuição racial persiste.', ['A diminuição racial persiste.']), verification);
    expect(transcription.normalizedText).toContain('diminuição racial');
    expect(transcription.uncertainTerms).toContainEqual(expect.objectContaining({ observed: 'diminuição', suggestion: 'discriminação', requiresReview: true }));
    expect(transcription.requiresReview).toBe(true);
  });

  it('preserva a quantidade de parágrafos detectada visualmente, seja quatro, menor ou maior', () => {
    const four = buildStructuredTranscription(firstPass('um\n\ndois\n\ntrês\n\nquatro', ['um', 'dois', 'três', 'quatro']));
    const two = buildStructuredTranscription(firstPass('um\n\ndois', ['um', 'dois']));
    const five = buildStructuredTranscription(firstPass('um\n\ndois\n\ntrês\n\nquatro\n\ncinco', ['um', 'dois', 'três', 'quatro', 'cinco']));
    expect(four.paragraphs).toHaveLength(4);
    expect(two.paragraphs).toHaveLength(2);
    expect(five.paragraphs).toHaveLength(5);
    expect(four.normalizedText).toBe('um\n\ndois\n\ntrês\n\nquatro');
  });
});
