import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { essayEvaluationSchema, gradeAnswer } from '@nexo/shared';
import { GeminiProvider } from './gemini.provider';

type Option = { id: string; label: string; content: string };
type Question = { id: string; area: string; statement: string; explanation: string; correctOptionId: string; options: Option[]; source: string };
const questions: Question[] = [{ id: 'demo-mat-1', area: 'Matemática', statement: 'Exemplo demonstrativo: qual é o resultado de 25% de 80?', explanation: '25% equivale a 1/4; portanto, 80 ÷ 4 = 20.', correctOptionId: 'b', source: 'Demonstração — não é questão do Inep', options: [{ id: 'a', label: 'A', content: '15' }, { id: 'b', label: 'B', content: '20' }, { id: 'c', label: 'C', content: '25' }, { id: 'd', label: 'D', content: '30' }, { id: 'e', label: 'E', content: '35' }] }];

@Injectable()
export class QuizService {
  private sessions = new Map<string, { questionIds: string[]; attempts: Map<string, { optionId: string; correct: boolean }> }>();
  listQuestions(area?: string) { return questions.filter((q) => !area || q.area === area).map(({ correctOptionId, ...q }) => q); }
  question(id: string) { const question = questions.find((item) => item.id === id); if (!question) throw new NotFoundException('Questão não encontrada.'); return question; }
  createSession(questionIds?: string[]) { const id = crypto.randomUUID(); const ids = questionIds?.length ? questionIds : questions.map((q) => q.id); this.sessions.set(id, { questionIds: ids, attempts: new Map() }); return { id, questionIds: ids }; }
  answer(sessionId: string, questionId: string, optionId: string) { const session = this.sessions.get(sessionId); if (!session || !session.questionIds.includes(questionId)) throw new NotFoundException('Sessão não encontrada.'); const question = this.question(questionId); if (!question.options.some((option) => option.id === optionId)) throw new BadRequestException('Alternativa inválida.'); const result = gradeAnswer(question.correctOptionId, optionId); session.attempts.set(questionId, { optionId, correct: result.correct }); return { ...result, explanation: question.explanation }; }
  results(sessionId: string) { const session = this.sessions.get(sessionId); if (!session) throw new NotFoundException('Sessão não encontrada.'); const attempts = [...session.attempts.entries()].map(([questionId, value]) => ({ questionId, ...value })); return { answered: attempts.length, correct: attempts.filter((item) => item.correct).length, attempts }; }
}

@Injectable()
export class EssayService {
  constructor(private readonly gemini: GeminiProvider) {}
  private essays = new Map<string, { id: string; userId: string; topic: string; transcription?: string; confirmedText?: string; images: { mimeType: string; data: string }[]; evaluation?: unknown }>();
  create(userId: string, topic: string) { const id = crypto.randomUUID(); const essay = { id, userId, topic, images: [] as { mimeType: string; data: string }[] }; this.essays.set(id, essay); return { ...essay, images: 0 }; }
  private owned(id: string, userId: string) { const essay = this.essays.get(id); if (!essay) throw new NotFoundException('Redação não encontrada.'); if (essay.userId !== userId) throw new NotFoundException('Redação não encontrada.'); return essay; }
  addImage(id: string, userId: string, file?: Express.Multer.File) { const essay = this.owned(id, userId); if (!file) throw new BadRequestException('Envie uma imagem.'); if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype) || file.size > 8 * 1024 * 1024) throw new BadRequestException('Use JPEG, PNG ou WebP de até 8 MB.'); if (essay.images.length >= 5) throw new BadRequestException('Máximo de 5 imagens.'); essay.images.push({ mimeType: file.mimetype, data: file.buffer.toString('base64') }); return { accepted: true, images: essay.images.length }; }
  setText(id: string, userId: string, text: string) { const essay = this.owned(id, userId); if (text.trim().length < 20 || text.length > 8000) throw new BadRequestException('O texto deve ter entre 20 e 8000 caracteres.'); essay.confirmedText = text; return essay; }
  async transcribe(id: string, userId: string) { const essay = this.owned(id, userId); if (!essay.images.length) throw new BadRequestException('Envie ao menos uma imagem antes de transcrever.'); const transcription = await this.gemini.transcribe(essay.images); return transcription; }
  async evaluate(id: string, userId: string, consent: boolean) { const essay = this.owned(id, userId); if (!consent) throw new BadRequestException('É necessário consentir com o envio ao provedor de IA.'); if (!essay.confirmedText) throw new BadRequestException('Confirme ou digite a transcrição antes de avaliar.'); const evaluation = await this.gemini.evaluate(essay.topic, essay.confirmedText); essay.evaluation = evaluation; return { ...evaluation, disclaimer: 'Estimativa educacional por IA; não é nota oficial nem garantia de desempenho.' }; }
  get(id: string, userId: string) { const essay = this.owned(id, userId); return { ...essay, images: essay.images.length }; }
  validateProviderPayload(payload: unknown) { return essayEvaluationSchema.parse(payload); }
}
