export type CalibrationPair = { aiScores: number[]; humanScores: number[]; rubricVersion: string; model: string };
export type EvaluationMetricRecord = {
  totalScore: number;
  competencyScores: number[];
  confidence: 'alta' | 'media' | 'baixa';
  needsHumanReview: boolean;
  rubricVersion: string;
  model: string;
  humanReview?: { totalScore: number; competencyScores: number[] };
};

/** Aggregate only anonymous score pairs. It does not claim the engine is calibrated. */
export function calculateCalibrationMetrics(pairs: CalibrationPair[]) {
  const valid = pairs.filter((pair) => pair.aiScores.length === 5 && pair.humanScores.length === 5);
  const byCompetency = [0, 1, 2, 3, 4].map((index) => average(valid.map((pair) => Math.abs(pair.aiScores[index] - pair.humanScores[index]))));
  const totalAbsoluteDifference = average(valid.map((pair) => Math.abs(sum(pair.aiScores) - sum(pair.humanScores))));
  return { reviewedEvaluations: valid.length, meanAbsoluteDifferenceByCompetency: byCompetency, meanAbsoluteTotalDifference: totalAbsoluteDifference };
}

/** Dashboard-ready aggregates; callers can source these records from persisted, authorized data. */
export function calculateEssayQualityMetrics(records: EvaluationMetricRecord[]) {
  const reviewedPairs = records.flatMap((record) => record.humanReview ? [{ aiScores: record.competencyScores, humanScores: record.humanReview.competencyScores, rubricVersion: record.rubricVersion, model: record.model }] : []);
  const byTotalScore = records.reduce<Record<string, number>>((distribution, record) => {
    const range = `${Math.floor(record.totalScore / 100) * 100}-${Math.floor(record.totalScore / 100) * 100 + 99}`;
    distribution[range] = (distribution[range] ?? 0) + 1;
    return distribution;
  }, {});
  const byRubricAndModel = records.reduce<Record<string, number>>((distribution, record) => {
    const key = `${record.rubricVersion}::${record.model}`;
    distribution[key] = (distribution[key] ?? 0) + 1;
    return distribution;
  }, {});
  return {
    totalEvaluations: records.length,
    lowConfidenceRate: rate(records.filter((record) => record.confidence === 'baixa').length, records.length),
    humanReviewRequestRate: rate(records.filter((record) => record.needsHumanReview).length, records.length),
    totalScoreDistribution: byTotalScore,
    byRubricAndModel,
    calibration: calculateCalibrationMetrics(reviewedPairs),
    reviewedTotalDifferences: records.flatMap((record) => record.humanReview ? [Math.abs(record.totalScore - record.humanReview.totalScore)] : []),
  };
}

function average(values: number[]) { return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null; }
function sum(values: number[]) { return values.reduce((total, value) => total + value, 0); }
function rate(numerator: number, denominator: number) { return denominator ? numerator / denominator : 0; }
