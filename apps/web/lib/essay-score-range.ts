const RANGE_MARGIN = 40;

/**
 * Presents the model score as a study-oriented interval, never as an exact
 * prediction of the official ENEM result.
 */
export function formatEssayScoreRange(score: number | null | undefined) {
  if (!Number.isFinite(score)) return '—';

  const estimatedScore = Math.round(Number(score));
  const lower = Math.max(0, estimatedScore - RANGE_MARGIN);
  const upper = Math.min(1000, estimatedScore + RANGE_MARGIN);
  return `${lower}–${upper}`;
}
