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
    sourcePage?: number;
    sourceDocumentHash?: string;
    explanation?: string;
    imageUrl?: string;
    assets: Array<{
      url: string;
      storagePath?: string;
      placement: 'before_statement' | 'after_statement' | 'option';
      optionLabel?: 'A' | 'B' | 'C' | 'D' | 'E';
      displayOrder: number;
      mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
      altText: string;
      sourcePage: number;
      sourceCrop?: { x: number; y: number; width: number; height: number };
      sourceHash?: string;
    }>;
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
  // Do not keep the whole import inside one interactive transaction. An exam
  // can contain 90 questions and each question also writes its five options;
  // with Supabase's pooler this can exceed Prisma's interactive transaction
  // timeout and leave the transaction closed midway through the import.
  // Each upsert is idempotent, so retrying after a network interruption is
  // safe and allows the pooler to use a fresh short-lived transaction per
  // question.
  const { id: _examId, ...examData } = payload.exam;
  await prisma.exam.upsert({ where: { id: payload.exam.id }, update: examData, create: payload.exam });

  for (const question of payload.questions) {
    const { options, assets, id, examId, correctOptionLabel: _correctOptionLabel, ...questionData } = question;
    await prisma.question.upsert({
      where: { examId_number: { examId, number: question.number } },
      update: { id, ...questionData, options: { deleteMany: {}, create: options }, assets: { deleteMany: {}, create: assets } },
      create: { id, examId, ...questionData, options: { create: options }, assets: { create: assets } },
    });
  }

  return { examId: payload.exam.id, questions: payload.questions.length };
}
