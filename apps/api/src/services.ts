import { BadRequestException, Injectable, NotFoundException, OnModuleInit, Optional } from '@nestjs/common';
import { essayEvaluationSchema, gradeAnswer } from '@nexo/shared';
import { GeminiProvider } from './gemini.provider';
import { HandwritingPreprocessor } from './handwriting-preprocessor';
import { PrismaService } from './prisma.service';

type Option = { id: string; label: string; content: string };
type Question = { id: string; area: string; statement: string; explanation: string; correctOptionId: string; options: Option[]; source: string };
type MemorySession = { questionIds: string[]; attempts: Map<string, { optionId: string; correct: boolean }> };
type EssayImage = { mimeType: string; data: string; originalMimeType: string; originalData: string };
type MemoryEssay = { id: string; userId: string; topic: string; transcription?: string; confirmedText?: string; images: EssayImage[]; evaluation?: unknown };

const demoQuestion: Question = {
  id: 'demo-mat-1', area: 'Matemática', statement: 'Exemplo demonstrativo: qual é o resultado de 25% de 80?', explanation: '25% equivale a 1/4; portanto, 80 ÷ 4 = 20.', correctOptionId: 'demo-mat-1-b', source: 'Demonstração — não é questão do Inep',
  options: [{ id: 'demo-mat-1-a', label: 'A', content: '15' }, { id: 'demo-mat-1-b', label: 'B', content: '20' }, { id: 'demo-mat-1-c', label: 'C', content: '25' }, { id: 'demo-mat-1-d', label: 'D', content: '30' }, { id: 'demo-mat-1-e', label: 'E', content: '35' }],
};

@Injectable()
export class QuizService implements OnModuleInit {
  private readonly sessions = new Map<string, MemorySession>();
  constructor(@Optional() private readonly prisma?: PrismaService) {}
  private get databaseEnabled() { return Boolean(this.prisma?.enabled); }

  async onModuleInit() { await this.seedDemoQuestion(); }

  async seedDemoQuestion() {
    if (!this.databaseEnabled || !this.prisma) return;
    await this.prisma.exam.upsert({ where: { id: 'demo-2026' }, update: {}, create: { id: 'demo-2026', year: 2026, day: 1, color: 'demonstração', version: 'demo-v1', sourceVersion: 'Dados demonstrativos — não Inep' } });
    await this.prisma.question.upsert({
      where: { id: demoQuestion.id },
      update: { statement: demoQuestion.statement, explanation: demoQuestion.explanation, correctOptionId: demoQuestion.correctOptionId, options: { deleteMany: {}, create: demoQuestion.options.map((option) => ({ ...option })) } },
      create: { id: demoQuestion.id, examId: 'demo-2026', number: 1, area: demoQuestion.area, statement: demoQuestion.statement, explanation: demoQuestion.explanation, correctOptionId: demoQuestion.correctOptionId, options: { create: demoQuestion.options.map((option) => ({ ...option })) } },
    });
  }

  async listQuestions(area?: string) {
    if (!this.databaseEnabled || !this.prisma) return this.withoutAnswer(demoQuestion);
    const questions = await this.prisma.question.findMany({ where: { isCancelled: false, ...(area ? { area } : {}) }, include: { options: true, exam: true }, orderBy: { number: 'asc' } });
    return questions.map((question) => ({ id: question.id, area: question.area, statement: question.statement, explanation: question.explanation ?? 'Explicação ainda não disponível.', imageUrl: question.imageUrl, source: question.exam.sourceVersion ?? 'Material importado', options: question.options.map((option) => ({ id: option.id, label: option.label, content: option.content })) }));
  }

  async question(id: string): Promise<Question> {
    if (!this.databaseEnabled || !this.prisma) {
      if (id !== demoQuestion.id) throw new NotFoundException('Questão não encontrada.');
      return demoQuestion;
    }
    const question = await this.prisma.question.findUnique({ where: { id }, include: { options: true, exam: true } });
    if (!question || question.isCancelled) throw new NotFoundException('Questão não encontrada.');
    return { id: question.id, area: question.area, statement: question.statement, explanation: question.explanation ?? 'Explicação ainda não disponível.', correctOptionId: question.correctOptionId, source: question.exam.sourceVersion ?? 'Material importado', options: question.options.map((option) => ({ id: option.id, label: option.label, content: option.content })) };
  }

  async createSession(questionIds?: string[]) {
    const ids = questionIds?.length ? questionIds : [demoQuestion.id];
    await Promise.all(ids.map((id) => this.question(id)));
    if (!this.databaseEnabled || !this.prisma) { const id = crypto.randomUUID(); this.sessions.set(id, { questionIds: ids, attempts: new Map() }); return { id, questionIds: ids }; }
    const session = await this.prisma.quizSession.create({ data: { questionIds: ids } });
    return { id: session.id, questionIds: ids };
  }

  async answer(sessionId: string, questionId: string, optionId: string) {
    const question = await this.question(questionId);
    if (!question.options.some((option) => option.id === optionId)) throw new BadRequestException('Alternativa inválida.');
    const result = gradeAnswer(question.correctOptionId, optionId);
    if (!this.databaseEnabled || !this.prisma) {
      const session = this.sessions.get(sessionId); if (!session || !session.questionIds.includes(questionId)) throw new NotFoundException('Sessão não encontrada.');
      session.attempts.set(questionId, { optionId, correct: result.correct });
    } else {
      const session = await this.prisma.quizSession.findUnique({ where: { id: sessionId } });
      const ids = Array.isArray(session?.questionIds) ? session.questionIds.filter((id): id is string => typeof id === 'string') : [];
      if (!session || !ids.includes(questionId)) throw new NotFoundException('Sessão não encontrada.');
      await this.prisma.questionAttempt.upsert({ where: { sessionId_questionId: { sessionId, questionId } }, update: { optionId, correct: result.correct, answeredAt: new Date() }, create: { sessionId, questionId, optionId, correct: result.correct } });
    }
    return { ...result, explanation: question.explanation };
  }

  async results(sessionId: string) {
    if (!this.databaseEnabled || !this.prisma) {
      const session = this.sessions.get(sessionId); if (!session) throw new NotFoundException('Sessão não encontrada.');
      const attempts = [...session.attempts.entries()].map(([questionId, value]) => ({ questionId, ...value })); return { answered: attempts.length, correct: attempts.filter((item) => item.correct).length, attempts };
    }
    const session = await this.prisma.quizSession.findUnique({ where: { id: sessionId }, include: { attempts: true } });
    if (!session) throw new NotFoundException('Sessão não encontrada.');
    const attempts = session.attempts.map((attempt) => ({ questionId: attempt.questionId, optionId: attempt.optionId, correct: attempt.correct }));
    return { answered: attempts.length, correct: attempts.filter((attempt) => attempt.correct).length, attempts };
  }

  private withoutAnswer(question: Question) { const { correctOptionId, ...safe } = question; return [safe]; }
}

@Injectable()
export class EssayService {
  constructor(private readonly gemini: GeminiProvider, private readonly preprocessor: HandwritingPreprocessor) {}
  private essays = new Map<string, MemoryEssay>();
  create(userId: string, topic: string) { const id = crypto.randomUUID(); const essay: MemoryEssay = { id, userId, topic, images: [] }; this.essays.set(id, essay); return { ...essay, images: 0 }; }
  private owned(id: string, userId: string) { const essay = this.essays.get(id); if (!essay) throw new NotFoundException('Redação não encontrada.'); if (essay.userId !== userId) throw new NotFoundException('Redação não encontrada.'); return essay; }
  async addImage(id: string, userId: string, file?: Express.Multer.File) { const essay = this.owned(id, userId); if (!file) throw new BadRequestException('Envie uma imagem.'); if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype) || file.size > 8 * 1024 * 1024) throw new BadRequestException('Use JPEG, PNG ou WebP de até 8 MB.'); if (essay.images.length >= 5) throw new BadRequestException('Máximo de 5 imagens.'); const processed = await this.preprocessor.enhance(file.buffer); essay.images.push({ mimeType: processed.mimeType, data: processed.data, originalMimeType: file.mimetype, originalData: file.buffer.toString('base64') }); return { accepted: true, images: essay.images.length, preprocessing: 'rotate, resize, grayscale, normalize, sharpen' }; }
  setText(id: string, userId: string, text: string) { const essay = this.owned(id, userId); if (text.trim().length < 20 || text.length > 8000) throw new BadRequestException('O texto deve ter entre 20 e 8000 caracteres.'); essay.confirmedText = text; return essay; }
  async transcribe(id: string, userId: string, consent: boolean) { const essay = this.owned(id, userId); if (!consent) throw new BadRequestException('É necessário consentir com o envio da imagem ao provedor de IA.'); if (!essay.images.length) throw new BadRequestException('Envie ao menos uma imagem antes de transcrever.'); const result = await this.gemini.transcribe(essay.images); essay.transcription = result.text; return result; }
  async evaluate(id: string, userId: string, consent: boolean) { const essay = this.owned(id, userId); if (!consent) throw new BadRequestException('É necessário consentir com o envio ao provedor de IA.'); if (!essay.confirmedText) throw new BadRequestException('Confirme ou digite a transcrição antes de avaliar.'); const evaluation = await this.gemini.evaluate(essay.topic, essay.confirmedText); essay.evaluation = evaluation; return { ...evaluation, disclaimer: 'Estimativa educacional por IA; não é nota oficial nem garantia de desempenho.' }; }
  get(id: string, userId: string) { const essay = this.owned(id, userId); return { ...essay, images: essay.images.length }; }
  validateProviderPayload(payload: unknown) { return essayEvaluationSchema.parse(payload); }
}
