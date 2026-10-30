import type { EssayAnalysisSignals, TranscriptionFirstPass, TranscriptionVerification } from '@nexo/shared';

export type EssayEvaluationRequest = {
  topic: string;
  text: string;
  paragraphs: Array<{ index: number; normalizedText: string }>;
  signals: EssayAnalysisSignals;
};

export type HandwritingImage = { mimeType: string; data: string };

/** Boundary for model vendors. Domain validation belongs outside this interface. */
export interface EssayAiProvider {
  readonly providerName: string;
  readonly modelName: string;
  evaluate(request: EssayEvaluationRequest): Promise<unknown>;
}

export interface HandwritingAiProvider extends EssayAiProvider {
  transcribe(images: HandwritingImage[]): Promise<TranscriptionFirstPass>;
  verifyTranscription(images: HandwritingImage[], firstPass: TranscriptionFirstPass): Promise<TranscriptionVerification>;
}

export const ESSAY_AI_PROVIDER = Symbol('ESSAY_AI_PROVIDER');
