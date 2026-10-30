import type { EssayAnalysisSignals } from '@nexo/shared';

export type EssayEvaluationRequest = {
  topic: string;
  text: string;
  signals: EssayAnalysisSignals;
};

/** Boundary for model vendors. Domain validation belongs outside this interface. */
export interface EssayAiProvider {
  readonly providerName: string;
  readonly modelName: string;
  evaluate(request: EssayEvaluationRequest): Promise<unknown>;
}

export const ESSAY_AI_PROVIDER = Symbol('ESSAY_AI_PROVIDER');
