import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { assertEvaluationGroundedInText, essayEvaluationSchema, transcriptionSchema } from '@nexo/shared';
import { enemRubric } from './essay-rubric';

type ImagePart = { mimeType: string; data: string };
const timeout = 60_000;

@Injectable()
export class GeminiProvider {
  private readonly logger = new Logger(GeminiProvider.name);
  private key = process.env.GEMINI_API_KEY;
  private model = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash';

  private async generate(parts: unknown[], operation: 'transcription' | 'evaluation') {
    if (!this.key) throw new ServiceUnavailableException('Serviço de IA indisponível. Configure GEMINI_API_KEY; seus dados foram preservados.');
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.key}`, { method: 'POST', signal: controller.signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2 } }) });
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
      return JSON.parse(normalized) as unknown;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('A IA não respondeu a tempo. Tente novamente; seus dados foram preservados.');
    } finally { clearTimeout(timer); }
  }

  async transcribe(images: ImagePart[]) {
    const result = await this.generate([{ text: `Transcreva esta redação manuscrita em português brasileiro, respeitando a ordem das páginas. Preserve exatamente erros de ortografia, parágrafos, acentuação e pontuação visíveis. Não corrija, não resuma e não invente palavras: use [trecho ilegível] quando necessário. Retorne exclusivamente JSON no formato {"text":"...","pages":[{"page":1,"text":"...","confidence":0.0}],"lowConfidenceSegments":[{"text":"trecho", "reason":"por que a leitura é incerta", "page":1}]}. A lista deve conter apenas trechos realmente incertos.` }, ...images.map((image) => ({ inlineData: { mimeType: image.mimeType, data: image.data } }))], 'transcription');
    return transcriptionSchema.parse(result);
  }

  async evaluate(topic: string, text: string) {
    const raw = await this.generate([{ text: `${enemRubric}\nTema proposto: ${topic}\nTexto confirmado pelo estudante:\n${text}\n\nRetorne exclusivamente este JSON: {"competencies":[{"id":1,"score":0,"level":"insuficiente","strengths":["..."],"issues":["..."],"evidence":[{"excerpt":"citação curta e literal do texto","explanation":"..."}],"feedbackPoints":[{"category":"argumentacao","severity":"prioridade","excerpt":"citação literal opcional","diagnosis":"...","suggestion":"..."}],"actionableFeedback":["..."]}],"generalFeedback":"...","priorityActions":["..."],"interventionProposal":{"agent":"...","action":"...","means":"...","purpose":"...","detail":"..."}}. Inclua uma entrada para cada id de 1 a 5; score deve ser somente 0,40,80,120,160 ou 200. Não inclua excerpt se não puder copiá-lo literalmente do texto.` }], 'evaluation');
    try {
      return assertEvaluationGroundedInText(essayEvaluationSchema.parse(raw), text);
    } catch {
      throw new ServiceUnavailableException('A resposta da IA não passou na validação de trechos. Tente novamente; seu texto foi preservado.');
    }
  }
}
