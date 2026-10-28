import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { normalizeExamImport, persistExamImport } from '../../apps/api/src/exam-importer';

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((argument) => !argument.startsWith('--'));
  const persist = args.includes('--persist');
  if (!file) throw new Error('Uso: pnpm import:exams <arquivo-revisado.json> [--persist]');

  const workspaceDir = process.env.INIT_CWD ?? resolve(process.cwd(), '../..');
  const apiDir = resolve(workspaceDir, 'apps/api');
  const requireApi = createRequire(resolve(apiDir, 'package.json'));
  const dotenv = requireApi('dotenv') as { config: (options?: { path?: string }) => void };
  dotenv.config({ path: resolve(apiDir, '.env') });
  const content = JSON.parse(await readFile(resolve(workspaceDir, file), 'utf8')) as unknown;
  const normalized = normalizeExamImport(content);

  if (!persist) {
    console.log(JSON.stringify({ status: 'validated', examId: normalized.exam.id, questions: normalized.questions.length, next: 'Use --persist para gravar no banco.' }, null, 2));
    return;
  }

  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada. Use apps/api/.env antes de importar.');
  const { PrismaClient } = requireApi('@prisma/client') as { PrismaClient: new () => any };
  const prisma = new PrismaClient();
  try {
    const result = await persistExamImport(prisma, normalized);
    console.log(JSON.stringify({ status: 'persisted', ...result }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
