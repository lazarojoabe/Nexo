import { readFile } from 'node:fs/promises';

const file = process.argv[2];
if (!file) throw new Error('Uso: pnpm import:exams <arquivo-revisado.json>');
const content = JSON.parse(await readFile(file, 'utf8')) as { exam?: object; questions?: unknown[]; sourceUrl?: string; sourceVersion?: string };
if (!content.exam || !content.sourceUrl || !content.sourceVersion || !Array.isArray(content.questions)) throw new Error('JSON exige exam, sourceUrl, sourceVersion e questions.');
console.log(JSON.stringify({ status: 'validated-only', questions: content.questions.length, note: 'Revise e conecte Prisma antes de persistir.' }));
