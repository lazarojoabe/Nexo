import { readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { buildStructuredTranscription } from '../apps/api/src/handwriting-normalizer';
import { GeminiProvider } from '../apps/api/src/gemini.provider';
import { calculateEssayQualityMetrics } from '../apps/api/src/essay-engine/metrics';
import { preAnalyzeEssay } from '../apps/api/src/essay-engine/pre-analysis';
import { validateEssayEvaluation } from '../apps/api/src/essay-engine/evaluation-validation';

type BenchmarkEntry = {
  id: string;
  author: string;
  sourcePage: number;
  inputImage: string;
  inputImageSha256: string;
  expected: { totalScore: number; competencyScores: number[] };
};

type BenchmarkManifest = {
  schemaVersion: number;
  collection: { name: string; topic: string; sourceSha256: string; usage: string };
  entries: BenchmarkEntry[];
};

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasFlag(name: string) {
  return process.argv.includes(name);
}

function usage(): never {
  throw new Error('Uso: pnpm essays:benchmark -- --manifest <manifest.json> [--limit 1|--all] [--output <report.json>]');
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 800) : 'Erro não identificado.';
}

function isSystemicProviderFailure(message: string) {
  return /cota gratuita de ia foi atingida|ia não respondeu a tempo|chave do gemini foi recusada|modelo gemini configurado não está disponível|serviço de ia indisponível/i.test(message);
}

function asImagePath(manifestPath: string, imagePath: string) {
  return isAbsolute(imagePath) ? imagePath : resolve(dirname(manifestPath), imagePath);
}

function average(values: number[]) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
}

async function main() {
  const manifestArgument = option('--manifest');
  if (!manifestArgument) usage();
  loadEnv({ path: resolve(repositoryRoot, 'apps/api/.env') });
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY ausente. Configure-a em apps/api/.env antes de executar o benchmark.');

  const manifestPath = resolve(repositoryRoot, manifestArgument);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as BenchmarkManifest;
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.entries) || !manifest.entries.length) throw new Error('Manifesto de benchmark inválido ou vazio.');
  if (manifest.collection.usage !== 'benchmark_local_regression_only') throw new Error('O manifesto não está marcado para benchmark local de regressão.');

  const limitInput = option('--limit');
  const requestedLimit = hasFlag('--all') ? manifest.entries.length : Number(limitInput ?? 1);
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1) throw new Error('--limit deve ser um inteiro positivo.');
  const entries = manifest.entries.slice(0, requestedLimit);
  const provider = new GeminiProvider();
  const results: Array<Record<string, unknown>> = [];
  let stoppedReason: string | undefined;

  for (const entry of entries) {
    try {
      const imagePath = asImagePath(manifestPath, entry.inputImage);
      const image = await readFile(imagePath);
      const images = [{ mimeType: 'image/png', data: image.toString('base64') }];
      const firstPass = await provider.transcribe(images);
      const verification = await provider.verifyTranscription(images, firstPass);
      const transcription = buildStructuredTranscription(firstPass, verification);
      const signals = preAnalyzeEssay(transcription.normalizedText);
      const request = {
        topic: manifest.collection.topic,
        text: transcription.normalizedText,
        paragraphs: transcription.paragraphs.map(({ index, normalizedText }) => ({ index, normalizedText })),
        signals,
      };
      const initialResponse = await provider.evaluate(request);
      let evaluation;
      try {
        evaluation = validateEssayEvaluation(initialResponse, request.text, signals, provider);
      } catch (error) {
        const repaired = await provider.repairEvaluation({
          ...request,
          invalidResponse: initialResponse,
          validationError: errorMessage(error),
        });
        evaluation = validateEssayEvaluation(repaired, request.text, signals, provider);
      }
      results.push({
        id: entry.id,
        author: entry.author,
        sourcePage: entry.sourcePage,
        inputImageSha256: entry.inputImageSha256,
        transcription: {
          overallConfidence: transcription.overallConfidence,
          requiresReview: transcription.requiresReview,
          uncertainTerms: transcription.uncertainTerms.length,
          characterCount: transcription.normalizedText.length,
        },
        evaluation: {
          accepted: true,
          totalScore: evaluation.totalScore,
          competencyScores: evaluation.competencies.map((competency) => competency.score),
          confidence: evaluation.confidence,
          needsHumanReview: evaluation.needsHumanReview,
          totalScoreDifference: Math.abs(evaluation.totalScore - entry.expected.totalScore),
        },
      });
    } catch (error) {
      const message = errorMessage(error);
      results.push({
        id: entry.id,
        author: entry.author,
        sourcePage: entry.sourcePage,
        inputImageSha256: entry.inputImageSha256,
        evaluation: { accepted: false, error: message },
      });
      if (isSystemicProviderFailure(message)) {
        stoppedReason = message;
        break;
      }
    }
  }

  const accepted = results.filter((result) => (result.evaluation as { accepted: boolean }).accepted);
  const metricRecords = accepted.map((result) => {
    const evaluation = result.evaluation as { totalScore: number; competencyScores: number[]; confidence: 'alta' | 'media' | 'baixa'; needsHumanReview: boolean };
    const expected = manifest.entries.find((entry) => entry.id === result.id)!.expected;
    return {
      totalScore: evaluation.totalScore,
      competencyScores: evaluation.competencyScores,
      confidence: evaluation.confidence,
      needsHumanReview: evaluation.needsHumanReview,
      rubricVersion: 'cartilha-2019-benchmark',
      model: provider.modelName,
      humanReview: { totalScore: expected.totalScore, competencyScores: expected.competencyScores },
    };
  });
  const transcriptionConfidence = accepted.map((result) => (result.transcription as { overallConfidence: number }).overallConfidence);
  const scoreDifferences = accepted.map((result) => (result.evaluation as { totalScoreDifference: number }).totalScoreDifference);
  const report = {
    generatedAt: new Date().toISOString(),
    collection: { name: manifest.collection.name, sourceSha256: manifest.collection.sourceSha256, topic: manifest.collection.topic },
    requested: entries.length,
    processed: results.length,
    notProcessed: entries.length - results.length,
    stoppedEarly: Boolean(stoppedReason),
    stoppedReason,
    accepted: accepted.length,
    validationPassRate: results.length ? accepted.length / results.length : null,
    averageTranscriptionConfidence: average(transcriptionConfidence),
    highConfidenceTranscriptionRate: accepted.filter((result) => {
      const transcription = result.transcription as { overallConfidence: number; requiresReview: boolean };
      return transcription.overallConfidence >= 0.85 && !transcription.requiresReview;
    }).length / (results.length || 1),
    averageTotalScoreDifference: average(scoreDifferences),
    calibration: calculateEssayQualityMetrics(metricRecords).calibration,
    results,
  };
  const output = resolve(repositoryRoot, option('--output') ?? `${dirname(manifestPath)}/benchmark-report.json`);
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ output, requested: report.requested, processed: report.processed, accepted: report.accepted, stoppedEarly: report.stoppedEarly, validationPassRate: report.validationPassRate, averageTotalScoreDifference: report.averageTotalScoreDifference }, null, 2));
}

main().catch((error: unknown) => {
  console.error(`Falha no benchmark: ${errorMessage(error)}`);
  process.exitCode = 1;
});
