import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { transcriptionSchema } from '@nexo/shared';
import { buildEvaluationPrompt } from './essay-engine/evaluation-context';
import { preAnalyzeEssay } from './essay-engine/pre-analysis';
import type { EssayAiProvider, EssayEvaluationRequest } from './essay-engine/provider';

type ImagePart = { mimeType: string; data: string };

@Injectable()
export class GeminiProvider implements EssayAiProvider {
  private readonly logger = new Logger(GeminiProvider.name);
  private key = process.env.GEMINI_API_KEY;
  private model = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash';
  readonly providerName = 'gemini';
  get modelName() { return this.model; }
  private get timeout() {
    const configured = Number(process.env.AI_PROVIDER_TIMEOUT_MS ?? 60_000);
    return Number.isFinite(configured) ? Math.min(Math.max(configured, 5_000), 120_000) : 60_000;
  }
  private get temperature() {
    const configured = Number(process.env.GEMINI_TEMPERATURE ?? 0.2);
    return Number.isFinite(configured) ? Math.min(Math.max(configured, 0), 0.3) : 0.2;
  }

  private async generate(parts: unknown[], operation: 'transcription' | 'evaluation') {
    if (!this.key) throw new ServiceUnavailableException('Serviço de IA indisponível. Configure GEMINI_API_KEY; seus dados foram preservados.');
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.key}`, { method: 'POST', signal: controller.signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', temperature: this.temperature } }) });
      if (response.status === 429) throw new ServiceUnavailableException('A cota gratuita de IA foi atingida. Tente novamente mais tarde; seus dados foram preservados.');
      if (!response.ok) {
        this.logger.warn(`gemini_request_failure operation=${operation} status=${response.status}`);
        if (response.status === 401 || response.status === 403) throw new ServiceUnavailableException('A chave do Gemini foi recusada. Confira GEMINI_API_KEY e habilite a Generative Language API no projeto da chave; seus dados foram preservados.');
        if (response.status === 404) throw new ServiceUnavailableException('O modelo Gemini configurado não está disponível. Confira GEMINI_MODEL e tente novamente; seus dados foram preservados.');
        throw new ServiceUnavailableException('Não foi possível consultar a IA agora. Tente novamente mais tarde; seus dados foram preservados.');
      }
      const json = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new ServiceUnavailableException('A IA retornou uma resposta vazia. Tente novamente.');
      const normalized = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      try { return JSON.parse(normalized) as unknown; } catch { throw new ServiceUnavailableException('A IA retornou uma avaliação incompleta. Tente novamente; seu texto foi preservado.'); }
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('A IA não respondeu a tempo. Tente novamente; seus dados foram preservados.');
    } finally { clearTimeout(timer); }
  }

  async transcribe(images: ImagePart[]) {
    const result = await this.generate([{ text: `Transcreva esta redação manuscrita em português brasileiro, respeitando a ordem das páginas. Preserve exatamente erros de ortografia, parágrafos, acentuação e pontuação visíveis. Não corrija, não resuma e não invente palavras: use [trecho ilegível] quando necessário. Retorne exclusivamente JSON no formato {"text":"...","pages":[{"page":1,"text":"...","confidence":0.0}],"lowConfidenceSegments":[{"text":"trecho", "reason":"por que a leitura é incerta", "page":1}]}. A lista deve conter apenas trechos realmente incertos.` }, ...images.map((image) => ({ inlineData: { mimeType: image.mimeType, data: image.data } }))], 'transcription');
    return transcriptionSchema.parse(result);
  }

  async evaluate(request: EssayEvaluationRequest): Promise<unknown>;
  /** Compatibility overload for direct provider callers; domain validation remains in EssayService. */
  async evaluate(topic: string, text: string): Promise<unknown>;
  async evaluate(requestOrTopic: EssayEvaluationRequest | string, legacyText?: string) {
    const request = typeof requestOrTopic === 'string'
      ? { topic: requestOrTopic, text: legacyText ?? '', signals: preAnalyzeEssay(legacyText ?? '') }
      : requestOrTopic;
    return this.generate([{ text: buildEvaluationPrompt(request) }], 'evaluation');
  }
}
