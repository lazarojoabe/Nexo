import { describe, expect, it } from 'vitest';
import { splitQuestionText } from './question-text';

describe('separação de texto e enunciado', () => {
  it('destaca o comando final sem perder a fonte do texto-base', () => {
    const result = splitQuestionText('Primeiro parágrafo do texto.\nFonte: material adaptado.\nNesse texto, o autor busca');
    expect(result).toEqual({ context: 'Primeiro parágrafo do texto.\nFonte: material adaptado.', prompt: 'Nesse texto, o autor busca' });
  });

  it('mantém uma questão direta integralmente como enunciado', () => {
    expect(splitQuestionText('Qual é o resultado de 25% de 80?')).toEqual({ prompt: 'Qual é o resultado de 25% de 80?' });
  });

  it('mantém no enunciado as linhas de continuação do comando', () => {
    const result = splitQuestionText('Texto de apoio.\nEsse texto apresenta diferenças\nem que aponta uma ideia.');
    expect(result).toEqual({ context: 'Texto de apoio.', prompt: 'Esse texto apresenta diferenças\nem que aponta uma ideia.' });
  });
});
