import { BadRequestException, HttpException, Inject, Injectable, Logger, NotFoundException, OnModuleInit, Optional, ServiceUnavailableException } from '@nestjs/common';
import { essayEvaluationSchema, gradeAnswer, transcriptionFirstPassSchema, transcriptionSchema, transcriptionVerificationSchema } from '@nexo/shared';
import { HandwritingPreprocessor } from './handwriting-preprocessor';
import { PrismaService } from './prisma.service';
import { EssayStorageService } from './essay-storage.service';
import { preAnalyzeEssay } from './essay-engine/pre-analysis';
import { validateEssayEvaluation } from './essay-engine/evaluation-validation';
import { ESSAY_AI_PROVIDER, type EssayAiProvider } from './essay-engine/provider';
import { buildStructuredTranscription } from './handwriting-normalizer';
import type { HandwritingAiProvider } from './essay-engine/provider';

type Option = { id: string; label: string; content: string };
type QuestionAsset = { id: string; url: string; placement: 'before_statement' | 'after_statement' | 'option'; optionLabel?: string | null; displayOrder: number; mimeType: string; altText: string };
type Question = { id: string; number?: number; area: string; statement: string; explanation: string; imageUrl?: string | null; assets: QuestionAsset[]; correctOptionId: string; options: Option[]; source: string };
type MemorySession = { userId?: string; examId?: string; questionIds: string[]; attempts: Map<string, { optionId: string; correct: boolean }>; createdAt: Date };
type StoredEssayImage = { id: string; storagePath: string; originalStoragePath?: string | null; mimeType: string; size: number; page: number };
type MemoryEssay = { id: string; userId: string; topic: string; transcription?: string; transcriptionResult?: unknown; confirmedText?: string; consentAt?: Date; status: string; createdAt: Date; evaluatedAt?: Date; images: StoredEssayImage[]; evaluation?: { payload: unknown } };

const maxImageBytes = 8 * 1024 * 1024;
const maxEssayImages = 5;

const demoQuestion: Question = {
  id: 'demo-mat-1', number: 1, area: 'Matemática', statement: 'Exemplo demonstrativo: qual é o resultado de 25% de 80?', explanation: '25% equivale a 1/4; portanto, 80 ÷ 4 = 20.', correctOptionId: 'demo-mat-1-b', source: 'Demonstração — não é questão do Inep',
  assets: [], options: [{ id: 'demo-mat-1-a', label: 'A', content: '15' }, { id: 'demo-mat-1-b', label: 'B', content: '20' }, { id: 'demo-mat-1-c', label: 'C', content: '25' }, { id: 'demo-mat-1-d', label: 'D', content: '30' }, { id: 'demo-mat-1-e', label: 'E', content: '35' }],
};

@Injectable()
export class QuizService implements OnModuleInit {
  private readonly sessions = new Map<string, MemorySession>();
  constructor(@Optional() private readonly prisma?: PrismaService) {}
  private get databaseEnabled() { return Boolean(this.prisma?.enabled); }

  async onModuleInit() { await this.seedDemoQuestion(); }

  private async seedDemoQuestion() {
    if (!this.databaseEnabled || !this.prisma) return;
    await this.prisma.exam.upsert({ where: { id: 'demo-2026' }, update: {}, create: { id: 'demo-2026', year: 2026, day: 1, color: 'demonstração', version: 'demo-v1', sourceVersion: 'Dados demonstrativos — não Inep' } });
    await this.prisma.question.upsert({
      where: { id: demoQuestion.id },
      update: { statement: demoQuestion.statement, explanation: demoQuestion.explanation, correctOptionId: demoQuestion.correctOptionId, options: { deleteMany: {}, create: demoQuestion.options.map((option) => ({ ...option })) } },
      create: { id: demoQuestion.id, examId: 'demo-2026', number: 1, area: demoQuestion.area, statement: demoQuestion.statement, explanation: demoQuestion.explanation, correctOptionId: demoQuestion.correctOptionId, options: { create: demoQuestion.options.map((option) => ({ ...option })) } },
    });
  }

  async listExams() {
    if (!this.databaseEnabled || !this.prisma) return [{ id: 'demo-2026', year: 2026, day: 1, color: 'demonstração', language: 'pt-BR', version: 'demo-v1', source: 'Dados demonstrativos — não Inep', questionCount: 1, areas: [{ name: 'Matemática', questionCount: 1 }] }];
    const exams = await this.prisma.exam.findMany({ include: { _count: { select: { questions: true } }, questions: { where: { isCancelled: false }, select: { area: true } } }, orderBy: [{ year: 'desc' }, { day: 'asc' }, { color: 'asc' }] });
    const published = exams.filter((exam) => exam.id !== 'demo-2026');
    return (published.length ? published : exams).map((exam) => {
      const areas = new Map<string, number>();
      exam.questions.forEach((question) => areas.set(question.area, (areas.get(question.area) ?? 0) + 1));
      return { id: exam.id, year: exam.year, day: exam.day, color: exam.color, language: exam.language, version: exam.version, source: exam.sourceVersion ?? 'Material importado', sourceUrl: exam.sourceUrl, questionCount: exam._count.questions, areas: [...areas.entries()].sort(([a], [b]) => a.localeCompare(b, 'pt-BR')).map(([name, questionCount]) => ({ name, questionCount })) };
    });
  }

  async listQuestions(area?: string, examId?: string) {
    if (!this.databaseEnabled || !this.prisma) return this.withoutAnswer(demoQuestion);
    const questions = await this.prisma.question.findMany({ where: { isCancelled: false, ...(area ? { area } : {}), ...(examId ? { examId } : {}) }, include: { options: true, exam: true, assets: { orderBy: [{ placement: 'asc' }, { displayOrder: 'asc' }] } }, orderBy: [{ examId: 'asc' }, { number: 'asc' }] });
    return questions.map((question) => ({ id: question.id, examId: question.examId, number: question.number, area: question.area, statement: question.statement, explanation: question.explanation ?? 'Explicação ainda não disponível.', imageUrl: question.imageUrl, assets: question.assets.map(presentQuestionAsset), source: question.exam.sourceVersion ?? 'Material importado', options: question.options.map((option) => ({ id: option.id, label: option.label, content: option.content })) }));
  }

  async question(id: string): Promise<Question> {
    if (!this.databaseEnabled || !this.prisma) {
      if (id !== demoQuestion.id) throw new NotFoundException('Questão não encontrada.');
      return demoQuestion;
    }
    const question = await this.prisma.question.findUnique({ where: { id }, include: { options: true, exam: true, assets: { orderBy: [{ placement: 'asc' }, { displayOrder: 'asc' }] } } });
    if (!question || question.isCancelled) throw new NotFoundException('Questão não encontrada.');
    return { id: question.id, number: question.number, area: question.area, statement: question.statement, explanation: question.explanation ?? 'Explicação ainda não disponível.', imageUrl: question.imageUrl, assets: question.assets.map(presentQuestionAsset), correctOptionId: question.correctOptionId, source: question.exam.sourceVersion ?? 'Material importado', options: question.options.map((option) => ({ id: option.id, label: option.label, content: option.content })) };
  }

  async createSession(questionIds?: string[], examId?: string, userId?: string, area?: string) {
    let ids = questionIds?.length ? questionIds : undefined;
    if (!ids && this.databaseEnabled && this.prisma && examId) {
      const selected = await this.prisma.question.findMany({ where: { examId, isCancelled: false, ...(area ? { area } : {}) }, select: { id: true }, orderBy: { number: 'asc' } });
      if (!selected.length) throw new NotFoundException(area ? 'Não há questões ativas nesse conteúdo.' : 'Não há questões ativas nessa prova.');
      ids = selected.map((question) => question.id);
    }
    const resolvedIds = ids?.length ? ids : [demoQuestion.id];
    await Promise.all(resolvedIds.map((id) => this.question(id)));
    if (!this.databaseEnabled || !this.prisma) {
      const id = crypto.randomUUID();
      this.sessions.set(id, { userId, examId, questionIds: resolvedIds, attempts: new Map(), createdAt: new Date() });
      return { id, questionIds: resolvedIds, examId };
    }
    if (userId) await this.prisma.userProfile.upsert({ where: { id: userId }, update: {}, create: { id: userId } });
    const session = await this.prisma.quizSession.create({ data: { examId, userId, questionIds: resolvedIds } });
    return { id: session.id, questionIds: resolvedIds, examId };
  }

  async session(sessionId: string, userId?: string) {
    if (!this.databaseEnabled || !this.prisma) {
      const session = this.sessions.get(sessionId);
      if (!session || (userId && session.userId !== userId)) throw new NotFoundException('Sessão não encontrada.');
      return { id: sessionId, examId: session.examId, questionIds: session.questionIds, attempts: [...session.attempts.entries()].map(([questionId, attempt]) => ({ questionId, ...attempt })) };
    }
    const session = await this.prisma.quizSession.findUnique({ where: { id: sessionId }, include: { attempts: true } });
    if (!session || (userId && session.userId !== userId)) throw new NotFoundException('Sessão não encontrada.');
    const questionIds = Array.isArray(session.questionIds) ? session.questionIds.filter((id): id is string => typeof id === 'string') : [];
    return { id: session.id, examId: session.examId ?? undefined, questionIds, attempts: session.attempts.map((attempt) => ({ questionId: attempt.questionId, optionId: attempt.optionId, correct: attempt.correct })) };
  }

  async answer(sessionId: string, questionId: string, optionId: string, userId?: string) {
    const question = await this.question(questionId);
    if (!question.options.some((option) => option.id === optionId)) throw new BadRequestException('Alternativa inválida.');
    const result = gradeAnswer(question.correctOptionId, optionId);
    if (!this.databaseEnabled || !this.prisma) {
      const session = this.sessions.get(sessionId);
      if (!session || (userId && session.userId !== userId) || !session.questionIds.includes(questionId)) throw new NotFoundException('Sessão não encontrada.');
      session.attempts.set(questionId, { optionId, correct: result.correct });
    } else {
      const session = await this.prisma.quizSession.findUnique({ where: { id: sessionId } });
      const ids = Array.isArray(session?.questionIds) ? session.questionIds.filter((id): id is string => typeof id === 'string') : [];
      if (!session || (userId && session.userId !== userId) || !ids.includes(questionId)) throw new NotFoundException('Sessão não encontrada.');
      await this.prisma.questionAttempt.upsert({ where: { sessionId_questionId: { sessionId, questionId } }, update: { optionId, correct: result.correct, answeredAt: new Date() }, create: { sessionId, questionId, optionId, correct: result.correct } });
    }
    return { ...result, explanation: question.explanation };
  }

  async results(sessionId: string, userId?: string) {
    const session = await this.session(sessionId, userId);
    const attempts = session.attempts;
    const questions = await Promise.all(session.questionIds.map((id) => this.question(id)));
    const answers = new Map(attempts.map((attempt) => [attempt.questionId, attempt]));
    const grouped = new Map<string, { area: string; total: number; answered: number; correct: number }>();
    for (const question of questions) {
      const summary = grouped.get(question.area) ?? { area: question.area, total: 0, answered: 0, correct: 0 };
      const answer = answers.get(question.id);
      summary.total += 1;
      if (answer) {
        summary.answered += 1;
        if (answer.correct) summary.correct += 1;
      }
      grouped.set(question.area, summary);
    }
    const areas = [...grouped.values()].sort((a, b) => a.area.localeCompare(b.area, 'pt-BR')).map((area) => ({ ...area, accuracy: area.answered ? Math.round((area.correct / area.answered) * 100) : null }));
    return { total: session.questionIds.length, answered: attempts.length, correct: attempts.filter((attempt) => attempt.correct).length, attempts, areas };
  }

  async dashboard(userId: string) {
    const exams = await this.listExams();
    if (!this.databaseEnabled || !this.prisma) {
      const latest = [...this.sessions.entries()].reverse().find(([, session]) => session.userId === userId);
      return this.dashboardPayload(exams.length, latest ? { id: latest[0], ...latest[1] } : undefined);
    }
    const session = await this.prisma.quizSession.findFirst({ where: { userId }, include: { attempts: true }, orderBy: { createdAt: 'desc' } });
    if (!session) return this.dashboardPayload(exams.length);
    const ids = Array.isArray(session.questionIds) ? session.questionIds.filter((id): id is string => typeof id === 'string') : [];
    return this.dashboardPayload(exams.length, { id: session.id, examId: session.examId ?? undefined, questionIds: ids, attempts: new Map(session.attempts.map((attempt) => [attempt.questionId, { optionId: attempt.optionId, correct: attempt.correct }])) });
  }

  async history(userId: string) {
    if (!this.databaseEnabled || !this.prisma) {
      const sessions = [...this.sessions.entries()]
        .filter(([, session]) => session.userId === userId)
        .reverse()
        .map(([id, session]) => ({ id, examId: session.examId, questionIds: session.questionIds, attempts: [...session.attempts.values()], createdAt: session.createdAt }));
      return this.historyPayload(sessions);
    }
    const sessions = await this.prisma.quizSession.findMany({ where: { userId }, include: { attempts: true }, orderBy: { createdAt: 'desc' } });
    return this.historyPayload(sessions.map((session) => ({
      id: session.id,
      examId: session.examId ?? undefined,
      questionIds: Array.isArray(session.questionIds) ? session.questionIds.filter((id): id is string => typeof id === 'string') : [],
      attempts: session.attempts.map((attempt) => ({ correct: attempt.correct })),
      createdAt: session.createdAt,
    })));
  }

  private dashboardPayload(examCount: number, session?: { id: string; examId?: string; questionIds: string[]; attempts: Map<string, { optionId: string; correct: boolean }> }) {
    if (!session) return { examCount, progress: null, lastSession: null, resumeSession: null };
    const attempts = [...session.attempts.values()];
    const lastSession = { id: session.id, examId: session.examId, total: session.questionIds.length, answered: attempts.length, correct: attempts.filter((attempt) => attempt.correct).length, complete: attempts.length >= session.questionIds.length };
    const progress = attempts.length ? { answered: attempts.length, correct: lastSession.correct, percentage: Math.round((lastSession.correct / attempts.length) * 100) } : null;
    return { examCount, progress, lastSession, resumeSession: lastSession.complete ? null : lastSession };
  }

  private historyPayload(sessions: Array<{ id: string; examId?: string; questionIds: string[]; attempts: Array<{ correct: boolean }>; createdAt: Date }>) {
    const items = sessions.map((session) => {
      const answered = session.attempts.length;
      const correct = session.attempts.filter((attempt) => attempt.correct).length;
      const total = session.questionIds.length;
      return { id: session.id, examId: session.examId, createdAt: session.createdAt, total, answered, correct, percentage: answered ? Math.round((correct / answered) * 100) : null, complete: answered >= total };
    });
    const answered = items.reduce((total, session) => total + session.answered, 0);
    const correct = items.reduce((total, session) => total + session.correct, 0);
    return { summary: { sessions: items.length, completed: items.filter((session) => session.complete).length, answered, correct, percentage: answered ? Math.round((correct / answered) * 100) : null }, sessions: items };
  }

  private withoutAnswer(question: Question) { const { correctOptionId, ...safe } = question; return [safe]; }
}

@Injectable()
export class EssayService {
  private readonly essays = new Map<string, MemoryEssay>();
  private readonly activeEvaluations = new Set<string>();
  private readonly logger = new Logger(EssayService.name);
  constructor(
    @Inject(ESSAY_AI_PROVIDER) private readonly aiProvider: EssayAiProvider,
    private readonly preprocessor: HandwritingPreprocessor,
    private readonly storage: EssayStorageService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}
  private get databaseEnabled() { return Boolean(this.prisma?.enabled); }

  async create(userId: string, topic: string) {
    const safeTopic = cleanText(topic, 300);
    if (safeTopic.length < 3) throw new BadRequestException('Informe um tema com ao menos 3 caracteres.');
    if (!this.databaseEnabled || !this.prisma) {
      const essay: MemoryEssay = { id: crypto.randomUUID(), userId, topic: safeTopic, status: 'draft', images: [], createdAt: new Date() };
      this.essays.set(essay.id, essay);
      return this.memoryPayload(essay);
    }
    await this.prisma.userProfile.upsert({ where: { id: userId }, update: {}, create: { id: userId } });
    const essay = await this.prisma.essay.create({ data: { userId, topic: safeTopic } });
    return { id: essay.id, topic: essay.topic, status: essay.status, images: [], createdAt: essay.createdAt };
  }

  async addImage(id: string, userId: string, file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Envie uma imagem.');
    if (file.size > maxImageBytes) throw new BadRequestException('Use uma imagem de até 8 MB por página.');
    const essay = await this.owned(id, userId);
    if (essay.images.length >= maxEssayImages) throw new BadRequestException('Máximo de 5 imagens por redação.');
    const page = essay.images.length + 1;
    const processed = await this.runStage('validation', id, () => this.preprocessor.enhance(file.buffer), 'Não foi possível validar esta imagem. Envie uma foto em JPEG, PNG ou WebP.');
    const sanitizedOriginal = Buffer.from(processed.originalData ?? processed.data, 'base64');
    const stored = await this.runStage('storage', id, () => this.storage.save(id, page, sanitizedOriginal, processed.originalMimeType, Buffer.from(processed.data, 'base64'), processed.mimeType), 'Não foi possível armazenar a imagem com segurança. Tente novamente.');
    try {
      if (!this.databaseEnabled || !this.prisma) {
        const memoryEssay = essay.memory!;
        memoryEssay.images.push({ id: crypto.randomUUID(), storagePath: stored.processedPath, originalStoragePath: stored.originalPath, mimeType: processed.mimeType, size: file.size, page });
        return { accepted: true, images: memoryEssay.images.length, page, preprocessing: processed.enhanced ? 'rotação, redimensionamento, escala de cinza, contraste e nitidez' : 'imagem original preservada para transcrição' };
      }
      await this.prisma.essayImage.create({ data: { essayId: id, storagePath: stored.processedPath, originalStoragePath: stored.originalPath, mimeType: processed.mimeType, size: file.size, page } });
      await this.prisma.essay.update({ where: { id }, data: { status: 'images_uploaded' } });
      return { accepted: true, images: page, page, preprocessing: processed.enhanced ? 'rotação, redimensionamento, escala de cinza, contraste e nitidez' : 'imagem original preservada para transcrição' };
    } catch (error) {
      await this.storage.remove([stored.originalPath, stored.processedPath]);
      this.raiseStageFailure('persistence', id, error, 'Não foi possível salvar o envio da página. Tente novamente.');
    }
  }

  async setText(id: string, userId: string, text: string) {
    const safeText = cleanText(text, 8000);
    if (safeText.length < 20) throw new BadRequestException('O texto deve ter entre 20 e 8000 caracteres.');
    const essay = await this.owned(id, userId);
    if (!this.databaseEnabled || !this.prisma) {
      Object.assign(essay.memory!, { confirmedText: safeText, status: 'confirmed', evaluation: undefined, evaluatedAt: undefined });
      return this.memoryPayload(essay.memory!);
    }
    const [updated] = await this.prisma.$transaction([
      this.prisma.essay.update({ where: { id }, data: { confirmedText: safeText, status: 'confirmed', evaluatedAt: null } }),
      this.prisma.essayEvaluation.deleteMany({ where: { essayId: id } }),
    ]);
    return { id: updated.id, status: updated.status, confirmedText: updated.confirmedText };
  }

  async transcribe(id: string, userId: string, consent: boolean) {
    if (!consent) throw new BadRequestException('É necessário consentir com o envio da imagem ao provedor de IA.');
    const essay = await this.owned(id, userId);
    if (!essay.images.length) throw new BadRequestException('Envie ao menos uma imagem antes de transcrever.');
    const images = await this.runStage('storage_access', id, () => Promise.all(essay.images.sort((a, b) => a.page - b.page).map(async (image) => ({ mimeType: image.mimeType, data: (await this.storage.read(image.storagePath)).toString('base64') }))), 'Não foi possível acessar uma página enviada. Envie-a novamente.');
    const transcriptionProvider = this.aiProvider as Partial<HandwritingAiProvider>;
    if (!transcriptionProvider.transcribe) throw new ServiceUnavailableException('O provedor de transcrição não está disponível. Suas páginas foram preservadas.');
    const firstPass = await this.runStage('ai_transcription', id, async () => transcriptionFirstPassSchema.parse(await transcriptionProvider.transcribe!(images)), 'Não foi possível transcrever a redação agora. Suas páginas foram preservadas; tente novamente em instantes.');
    const verification = transcriptionProvider.verifyTranscription
      ? await this.runStage('ai_verification', id, async () => transcriptionVerificationSchema.parse(await transcriptionProvider.verifyTranscription!(images, firstPass)), 'Não foi possível conferir visualmente a transcrição agora. Suas páginas foram preservadas; tente novamente em instantes.')
      // A legacy provider cannot silently skip the independent check: retain
      // compatibility, but force review through a conservative confidence.
      : { divergences: [], overallConfidence: Math.min(firstPass.overallConfidence, 0.5) };
    const result = buildStructuredTranscription(firstPass, verification);
    const now = new Date();
    if (!this.databaseEnabled || !this.prisma) Object.assign(essay.memory!, { transcription: result.normalizedText, transcriptionResult: result, consentAt: now, status: 'transcribed' });
    else await this.prisma.essay.update({ where: { id }, data: {
      transcription: result.normalizedText,
      transcriptionResult: result,
      rawTranscription: result.rawText,
      normalizedTranscription: result.normalizedText,
      transcriptionParagraphs: result.paragraphs,
      transcriptionCorrections: result.corrections,
      transcriptionUncertainTerms: result.uncertainTerms,
      transcriptionConfidence: result.overallConfidence,
      transcriptionRequiresReview: result.requiresReview,
      consentAt: now,
      status: 'transcribed',
    } });
    return result;
  }

  async evaluate(id: string, userId: string, consent: boolean) {
    if (!consent) throw new BadRequestException('É necessário consentir com o envio ao provedor de IA.');
    const essay = await this.owned(id, userId);
    const confirmedText = essay.confirmedText;
    if (!confirmedText) throw new BadRequestException('Confirme ou digite a transcrição antes de avaliar.');
    const existing = essay.evaluation?.payload ? essayEvaluationSchema.safeParse(essay.evaluation.payload) : undefined;
    if (existing?.success) return existing.data;
    if (this.activeEvaluations.has(id)) throw new BadRequestException('Uma avaliação desta redação já está em andamento. Aguarde alguns instantes.');
    await this.assertDailyEvaluationLimit(userId);
    this.activeEvaluations.add(id);
    try {
      const signals = preAnalyzeEssay(confirmedText);
      const paragraphs = confirmedTextToParagraphs(confirmedText);
      const raw = await this.runStage('ai_evaluation', id, () => this.aiProvider.evaluate({ topic: essay.topic, text: confirmedText, paragraphs, signals }), 'Não foi possível avaliar a redação agora. Seu texto confirmado foi preservado; tente novamente em instantes.');
      const evaluation = await this.runStage('ai_evaluation', id, async () => validateEssayEvaluation(raw, confirmedText, signals, this.aiProvider), 'A resposta da IA não passou na validação pedagógica. Seu texto foi preservado; tente novamente em instantes.');
      const evaluatedAt = new Date();
      if (!this.databaseEnabled || !this.prisma) Object.assign(essay.memory!, { evaluation: { payload: evaluation }, status: 'evaluated', evaluatedAt, consentAt: evaluatedAt });
      else await this.prisma.$transaction([
        this.prisma.essay.update({ where: { id }, data: { status: 'evaluated', evaluatedAt, consentAt: evaluatedAt } }),
        this.prisma.essayEvaluation.upsert({ where: { essayId: id }, update: { totalScore: evaluation.totalScore, payload: evaluation, provider: evaluation.provider, model: evaluation.model, rubricVersion: evaluation.rubricVersion, confidence: evaluation.confidence, needsHumanReview: evaluation.needsHumanReview }, create: { essayId: id, totalScore: evaluation.totalScore, payload: evaluation, provider: evaluation.provider, model: evaluation.model, rubricVersion: evaluation.rubricVersion, confidence: evaluation.confidence, needsHumanReview: evaluation.needsHumanReview } }),
      ]);
      return evaluation;
    } finally {
      this.activeEvaluations.delete(id);
    }
  }

  async get(id: string, userId: string) {
    const essay = await this.owned(id, userId);
    if (!this.databaseEnabled || !this.prisma) return this.memoryPayload(essay.memory!);
    return { id: essay.id, topic: essay.topic, transcription: essay.transcription, transcriptionResult: this.presentTranscription(essay.transcriptionResult, essay.transcription), confirmedText: essay.confirmedText, status: essay.status, createdAt: essay.createdAt, evaluatedAt: essay.evaluatedAt, images: essay.images.map(({ id: imageId, mimeType, size, page }) => ({ id: imageId, mimeType, size, page })), evaluation: this.presentEvaluation(essay.evaluation?.payload) };
  }

  async history(userId: string) {
    const entries = !this.databaseEnabled || !this.prisma
      ? [...this.essays.values()].filter((essay) => essay.userId === userId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map((essay) => ({
        id: essay.id, topic: essay.topic, status: essay.status, createdAt: essay.createdAt, evaluatedAt: essay.evaluatedAt, evaluation: essay.evaluation,
      }))
      : await this.prisma.essay.findMany({ where: { userId }, include: { evaluation: true }, orderBy: { createdAt: 'desc' } });

    const essays = entries.map((essay) => {
      const parsed = essay.evaluation?.payload ? essayEvaluationSchema.safeParse(essay.evaluation.payload) : undefined;
      const fallbackScore = essay.evaluation && 'totalScore' in essay.evaluation ? essay.evaluation.totalScore : null;
      return {
        id: essay.id,
        topic: essay.topic,
        status: essay.status,
        createdAt: essay.createdAt,
        evaluatedAt: essay.evaluatedAt,
        totalScore: parsed?.success ? parsed.data.totalScore : fallbackScore,
        competencies: parsed?.success ? parsed.data.competencies.map(({ id, score }) => ({ id, score })) : [],
      };
    });
    const scored = essays.filter((essay): essay is typeof essay & { totalScore: number } => typeof essay.totalScore === 'number');
    const latest = scored[0];
    const previous = scored[1];
    const competencyTrend = [1, 2, 3, 4, 5].map((id) => {
      const latestScore = latest?.competencies.find((item) => item.id === id)?.score ?? null;
      const previousScore = previous?.competencies.find((item) => item.id === id)?.score ?? null;
      return { id, latestScore, previousScore, delta: latestScore !== null && previousScore !== null ? latestScore - previousScore : null };
    });
    return {
      summary: {
        total: essays.length,
        evaluated: scored.length,
        latestScore: latest?.totalScore ?? null,
        bestScore: scored.length ? Math.max(...scored.map((essay) => essay.totalScore)) : null,
        delta: latest && previous ? latest.totalScore - previous.totalScore : null,
        competencyTrend,
      },
      essays,
    };
  }

  async evaluation(id: string, userId: string) {
    const essay = await this.get(id, userId);
    return essay.evaluation ?? { status: 'pending' };
  }

  validateProviderPayload(payload: unknown) { return essayEvaluationSchema.parse(payload); }

  private async assertDailyEvaluationLimit(userId: string) {
    const configured = Number(process.env.AI_EVALUATIONS_PER_DAY ?? 3);
    const limit = Number.isFinite(configured) ? Math.min(Math.max(Math.floor(configured), 1), 100) : 3;
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const used = !this.databaseEnabled || !this.prisma
      ? [...this.essays.values()].filter((essay) => essay.userId === userId && essay.evaluatedAt && essay.evaluatedAt >= start).length
      : await this.prisma.essayEvaluation.count({ where: { createdAt: { gte: start }, essay: { userId } } });
    if (used >= limit) throw new ServiceUnavailableException('O limite diário de avaliações foi atingido. Tente novamente amanhã; seu texto foi preservado.');
  }

  private async runStage<T>(stage: 'validation' | 'storage' | 'storage_access' | 'ai_transcription' | 'ai_verification' | 'ai_evaluation', essayId: string, action: () => Promise<T>, message: string): Promise<T> {
    try {
      return await action();
    } catch (error) {
      this.raiseStageFailure(stage, essayId, error, message);
    }
  }

  private raiseStageFailure(stage: 'validation' | 'storage' | 'storage_access' | 'ai_transcription' | 'ai_verification' | 'ai_evaluation' | 'persistence', essayId: string, error: unknown, message: string): never {
    const errorType = error instanceof Error ? error.constructor.name : typeof error;
    this.logger.warn(`essay_workflow_failure stage=${stage} essayId=${essayId} error=${errorType}`);
    if (error instanceof HttpException) throw error;
    throw new ServiceUnavailableException(message);
  }

  private async owned(id: string, userId: string): Promise<{ id: string; userId: string; topic: string; transcription?: string | null; transcriptionResult?: unknown; confirmedText?: string | null; status: string; createdAt: Date; evaluatedAt?: Date | null; images: StoredEssayImage[]; evaluation?: { payload: unknown } | null; memory?: MemoryEssay }> {
    if (!this.databaseEnabled || !this.prisma) {
      const essay = this.essays.get(id);
      if (!essay || essay.userId !== userId) throw new NotFoundException('Redação não encontrada.');
      return { ...essay, memory: essay };
    }
    const essay = await this.prisma.essay.findFirst({ where: { id, userId }, include: { images: { orderBy: { page: 'asc' } }, evaluation: true } });
    if (!essay) throw new NotFoundException('Redação não encontrada.');
    return essay;
  }

  private memoryPayload(essay: MemoryEssay) {
    return { id: essay.id, topic: essay.topic, transcription: essay.transcription, transcriptionResult: this.presentTranscription(essay.transcriptionResult, essay.transcription), confirmedText: essay.confirmedText, status: essay.status, createdAt: essay.createdAt, evaluatedAt: essay.evaluatedAt, images: essay.images.map(({ id, mimeType, size, page }) => ({ id, mimeType, size, page })), evaluation: this.presentEvaluation(essay.evaluation?.payload) };
  }

  private presentTranscription(payload: unknown, legacyText?: string | null) {
    const parsed = transcriptionSchema.safeParse(payload);
    if (parsed.success) return parsed.data;
    if (!legacyText) return null;
    const paragraphs = confirmedTextToParagraphs(legacyText).map((paragraph, index) => ({
      index: paragraph.index,
      rawText: paragraph.normalizedText,
      normalizedText: paragraph.normalizedText,
      confidence: 0.5,
      lineRange: { start: index + 1, end: index + 1 },
    }));
    return transcriptionSchema.parse({
      rawText: legacyText,
      normalizedText: legacyText,
      paragraphs,
      corrections: [],
      uncertainTerms: [],
      overallConfidence: 0.5,
      requiresReview: true,
    });
  }

  private presentEvaluation(payload: unknown) {
    if (!payload) return null;
    const parsed = essayEvaluationSchema.safeParse(payload);
    return parsed.success ? parsed.data : null;
  }
}

function cleanText(value: string, maximum: number) {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, maximum);
}

function confirmedTextToParagraphs(text: string) {
  return text
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.replace(/\s*\r?\n\s*/g, ' ').trim())
    .filter(Boolean)
    .map((normalizedText, index) => ({ index: index + 1, normalizedText }));
}

function presentQuestionAsset(asset: { id: string; url: string; placement: string; optionLabel: string | null; displayOrder: number; mimeType: string; altText: string }): QuestionAsset {
  const placement = asset.placement === 'before_statement' || asset.placement === 'after_statement' || asset.placement === 'option' ? asset.placement : 'after_statement';
  return { id: asset.id, url: asset.url, placement, optionLabel: asset.optionLabel, displayOrder: asset.displayOrder, mimeType: asset.mimeType, altText: asset.altText };
}
