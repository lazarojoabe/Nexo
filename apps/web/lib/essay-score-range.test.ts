import { describe, expect, it } from 'vitest';
import { formatEssayScoreRange } from './essay-score-range';

describe('faixa estimada de redação', () => {
  it('apresenta uma faixa de estudo de 40 pontos para cada lado', () => {
    expect(formatEssayScoreRange(920)).toBe('880–960');
  });

  it('respeita os limites da escala do ENEM', () => {
    expect(formatEssayScoreRange(0)).toBe('0–40');
    expect(formatEssayScoreRange(1000)).toBe('960–1000');
  });

  it('não inventa uma faixa quando não há avaliação', () => {
    expect(formatEssayScoreRange(null)).toBe('—');
  });
});
