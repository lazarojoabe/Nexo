import { PrismaClient } from '@prisma/client';
import { examImportSchema } from '@nexo/shared';

export type NormalizedExamImport = {
  exam: {
    id: string;
    year: number;
    day: number;
    color: string;
    language?: string;
    version: string;
    sourceUrl: string;
    sourceVersion: string;
  };
  questions: Array<{
    id: string;
    examId: string;
    number: number;
    area: string;
    statement: string;
    explanation?: string;
    imageUrl?: string;
    isCancelled: boolean;
    correctOptionLabel?: string;
    correctOptionId: string;
    options: Array<{ id: string; label: string; content: string }>;
  }>;
};

function slug(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function normalizeExamImport(input: unknown): NormalizedExamImport {
  const payload = examImportSchema.parse(input);
  const examId = payload.exam.id ?? `enem-${payload.exam.year}-${payload.exam.day}-${slug(payload.exam.color)}-${slug(payload.exam.language ?? 'pt')}-${slug(payload.exam.version)}`;
  return {
    exam: { id: examId, ...payload.exam, sourceUrl: payload.sourceUrl, sourceVersion: payload.sourceVersion },
    questions: payload.questions.map((question) => {
      const questionId = `${examId}-q${question.number}`;
      const options = question.options.map((option) => ({ id: `${questionId}-${option.label.toLowerCase()}`, ...option }));
      const correctOptionId = question.isCancelled ? `${questionId}-cancelled` : `${questionId}-${question.correctOptionLabel!.toLowerCase()}`;
      return { id: questionId, examId, ...question, correctOptionId, options };
    }),
  };
}

export async function persistExamImport(prisma: PrismaClient, payload: NormalizedExamImport) {
  await prisma.$transaction(async (transaction) => {
    const { id: _examId, ...examData } = payload.exam;
    await transaction.exam.upsert({ where: { id: payload.exam.id }, update: examData, create: payload.exam });
    for (const question of payload.questions) {
      const { options, id, examId, correctOptionLabel: _correctOptionLabel, ...questionData } = question;
      await transaction.question.upsert({
        where: { examId_number: { examId, number: question.number } },
        update: { id, ...questionData, options: { deleteMany: {}, create: options } },
        create: { id, examId, ...questionData, options: { create: options } },
      });
    }
  });
  return { examId: payload.exam.id, questions: payload.questions.length };
}
