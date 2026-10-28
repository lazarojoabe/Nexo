import { describe, expect, it } from 'vitest';
import { QuizService } from '../src/services';

describe('fluxo de quiz', () => {
  it('inicia, responde e consolida uma sessão', () => {
    const service = new QuizService();
    const session = service.createSession(['demo-mat-1']);
    expect(service.answer(session.id, 'demo-mat-1', 'b').correct).toBe(true);
    expect(service.results(session.id)).toMatchObject({ answered: 1, correct: 1 });
  });
});
