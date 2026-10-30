export type QuestionText = { context?: string; prompt: string };

const promptStart = /^(?:ao\b|com base\b|considerando\b|de acordo\b|na\b|nas\b|no\b|nos\b|nesta\b|neste\b|nesse\b|nessa\b|esse\b|essa\b|esses\b|essas\b|o texto\b|os textos\b|a express[aã]o\b|o termo\b|a palavra\b|a finalidade\b|o objetivo\b|o uso\b|a ideia\b|a rela[cç][aã]o\b|a estrat[eé]gia\b|a cr[ií]tica\b|o efeito\b|o emprego\b|a originalidade\b|a utiliza[cç][aã]o\b|a compara[cç][aã]o\b|qual\b|a partir\b|para\b)/i;

/**
 * ENEM imports commonly keep the source text and the command in one field.
 * The command normally begins with one of the expressions above on the final
 * lines. This preserves the original text when that boundary is not certain.
 */
export function splitQuestionText(value: string): QuestionText {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return { prompt: value.trim() };
  let start = -1;
  for (let index = lines.length - 1; index > 0; index -= 1) {
    if (promptStart.test(lines[index])) {
      start = index;
      break;
    }
  }
  if (start < 1) return { prompt: value.trim() };
  return { context: lines.slice(0, start).join('\n'), prompt: lines.slice(start).join('\n') };
}
