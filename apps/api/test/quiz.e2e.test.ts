import { describe, expect, it, vi } from 'vitest';
import { QuizService } from '../src/services';

describe('fluxo de quiz', () => {
  it('inicia, responde e consolida uma sessão', async () => {
    const service = new QuizService();
    const session = await service.createSession(['demo-mat-1']);
    expect((await service.answer(session.id, 'demo-mat-1', 'demo-mat-1-b')).correct).toBe(true);
    await expect(service.results(session.id)).resolves.toMatchObject({ answered: 1, correct: 1, areas: [{ area: 'Matemática', total: 1, correct: 1, accuracy: 100 }] });
  });

  it('não permite que outro usuário responda a sessão', async () => {
    const service = new QuizService();
    const session = await service.createSession(['demo-mat-1'], undefined, 'user-a');
    await expect(service.answer(session.id, 'demo-mat-1', 'demo-mat-1-b', 'user-b')).rejects.toThrow('Sessão não encontrada.');
  });

  it('mantém o histórico de acertos isolado por usuário', async () => {
    const service = new QuizService();
    const completedByA = await service.createSession(['demo-mat-1'], undefined, 'user-a');
    const pendingByA = await service.createSession(['demo-mat-1'], undefined, 'user-a');
    const fromB = await service.createSession(['demo-mat-1'], undefined, 'user-b');
    await service.answer(completedByA.id, 'demo-mat-1', 'demo-mat-1-b', 'user-a');

    const history = await service.history('user-a');

    expect(history.summary).toMatchObject({ sessions: 2, completed: 1, answered: 1, correct: 1, percentage: 100 });
    expect(history.sessions.map((session) => session.id)).toEqual([pendingByA.id, completedByA.id]);
    expect(history.sessions.some((session) => session.id === fromB.id)).toBe(false);
  });

  it('monta as 45 questões de um conteúdo sem limitar a sessão a 10', async () => {
    const questions = Array.from({ length: 45 }, (_, index) => ({ id: `ling-${index + 1}`, number: index + 1, area: 'Linguagens', statement: `Questão ${index + 1}`, explanation: 'Explicação.', correctOptionId: `ling-${index + 1}-a`, options: [{ id: `ling-${index + 1}-a`, label: 'A', content: 'Resposta' }], assets: [], exam: { sourceVersion: 'ENEM de teste' } }));
    const prisma = {
      enabled: true,
      question: {
        findMany: vi.fn().mockResolvedValue(questions.map(({ id }) => ({ id }))),
        findUnique: vi.fn(({ where }: { where: { id: string } }) => Promise.resolve(questions.find((question) => question.id === where.id))),
      },
      userProfile: { upsert: vi.fn().mockResolvedValue({}) },
      quizSession: { create: vi.fn(({ data }: { data: { examId: string; questionIds: string[] } }) => Promise.resolve({ id: 'session-45', ...data })) },
    };
    const service = new QuizService(prisma as never);
    const session = await service.createSession(undefined, 'enem-teste', 'student', 'Linguagens');
    expect(session.questionIds).toHaveLength(45);
    expect(session.questionIds[0]).toBe('ling-1');
    expect(prisma.question.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ examId: 'enem-teste', area: 'Linguagens' }) }));
  });
});
