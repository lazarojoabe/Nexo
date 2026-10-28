import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { essayEvaluationSchema } from '@nexo/shared';

type ImagePart = { mimeType: string; data: string };
const timeout = 25_000;

@Injectable()
export class GeminiProvider {
  private key = process.env.GEMINI_API_KEY;
  private model = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash';

  private async generate(parts: unknown[]) {
    if (!this.key) throw new ServiceUnavailableException('Serviço de IA indisponível. Configure GEMINI_API_KEY; seus dados foram preservados.');
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.key}`, { method: 'POST', signal: controller.signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2 } }) });
      if (response.status === 429) throw new ServiceUnavailableException('A cota gratuita de IA foi atingida. Tente novamente mais tarde; seus dados foram preservados.');
      if (!response.ok) throw new ServiceUnavailableException('Não foi possível consultar a IA agora. Tente novamente mais tarde.');
      const json = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new ServiceUnavailableException('A IA retornou uma resposta vazia. Tente novamente.');
      return JSON.parse(text) as unknown;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('A IA não respondeu a tempo. Tente novamente; seus dados foram preservados.');
    } finally { clearTimeout(timer); }
  }

  async transcribe(images: ImagePart[]) {
    return this.generate([{ text: 'Transcreva esta redação manuscrita em português. Preserve erros, parágrafos e pontuação; não complete palavras ilegíveis. Retorne JSON {"text":"...","lowConfidenceSegments":["..."]}.' }, ...images.map((image) => ({ inlineData: { mimeType: image.mimeType, data: image.data } }))]);
  }

  async evaluate(topic: string, text: string) {
    const raw = await this.generate([{ text: `Avalie de forma educacional e não oficial uma redação ENEM. Tema: ${topic}. Texto confirmado: ${text}. Retorne exclusivamente JSON com competencies.c1..c5, cada uma {score: 0|40|80|120|160|200, justification}; strengths, problems, improvementExamples e studyPlan. Não afirme ser nota oficial.` }]);
    return essayEvaluationSchema.parse(raw);
  }
}
