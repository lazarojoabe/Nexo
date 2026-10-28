import { describe, expect, it } from 'vitest';
import { QuizService } from '../src/services';

describe('fluxo de quiz', () => {
  it('inicia, responde e consolida uma sessão', async () => {
    const service = new QuizService();
    const session = await service.createSession(['demo-mat-1']);
    expect((await service.answer(session.id, 'demo-mat-1', 'demo-mat-1-b')).correct).toBe(true);
    await expect(service.results(session.id)).resolves.toMatchObject({ answered: 1, correct: 1 });
  });

  it('não permite que outro usuário responda a sessão', async () => {
    const service = new QuizService();
    const session = await service.createSession(['demo-mat-1'], undefined, 'user-a');
    await expect(service.answer(session.id, 'demo-mat-1', 'demo-mat-1-b', 'user-b')).rejects.toThrow('Sessão não encontrada.');
  });
});
